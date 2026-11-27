"""Upload conflict detector comparing a document's chunks against agreed project Decisions/Constraints (T100)."""
from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.kc.core.llm import call_with_retries, client as _managed_client
from src.kc.modules.chat.byok import resolve_model_name

logger = logging.getLogger(__name__)

_NEGATION_RE = re.compile(r"\b(not|never|no|avoid|replace|deprecate|instead of|without|disable|drop)\b", re.IGNORECASE)
_STOPWORDS = frozenset({"the", "a", "an", "and", "or", "for", "with", "to", "of", "in", "on", "is", "are", "use", "using"})


class ConflictFinding(BaseModel):
    node_uuid: str
    node_name: str
    chunk_id: str
    severity: str = Field(default="warning", description="'high' or 'warning'")
    explanation: str


class ConflictReport(BaseModel):
    conflicts: list[ConflictFinding] = Field(default_factory=list)


def _significant_terms(text_val: str) -> set[str]:
    tokens = re.findall(r"[a-z0-9_-]{3,}", text_val.lower())
    return {t for t in tokens if t not in _STOPWORDS}


async def check_document_conflicts(
    session: AsyncSession,
    *,
    project_uuid: str,
    doc_uuid: str,
    use_llm: bool = True,
    llm_client: Any = None,
    model: str | None = None,
) -> dict[str, Any]:
    """Inspect a document's chunks against agreed Decision/Constraint nodes WITHOUT mutating the graph."""
    node_rows = (
        await session.execute(
            text(
                """
                SELECT node_uuid, type, name, summary, text, status
                FROM nodes
                WHERE project_uuid = :p
                  AND type IN ('Decision', 'Constraint')
                  AND coalesce(status, 'agreed') = 'agreed'
                ORDER BY created_at DESC
                LIMIT 30
                """
            ),
            {"p": str(project_uuid)},
        )
    ).mappings().all()

    chunk_rows = (
        await session.execute(
            text(
                """
                SELECT chunk_id, heading_path, text
                FROM chunks
                WHERE project_uuid = :p AND doc_uuid = :d
                ORDER BY ordinal ASC
                LIMIT 40
                """
            ),
            {"p": str(project_uuid), "d": str(doc_uuid)},
        )
    ).mappings().all()

    if not node_rows or not chunk_rows:
        return {"project_uuid": str(project_uuid), "doc_uuid": str(doc_uuid), "conflicts": []}

    nodes = [dict(r, node_uuid=str(r["node_uuid"])) for r in node_rows]
    chunks = [dict(c) for c in chunk_rows]

    # Try structured LLM conflict analysis first when enabled
    if use_llm:
        try:
            client_to_use = llm_client or _managed_client()
            resolved_model = resolve_model_name(model)
            nodes_block = "\n".join(
                f"- [{n['node_uuid']}] ({n['type']}: {n['name']}): {n.get('summary') or n.get('text') or ''}"
                for n in nodes[:20]
            )
            chunks_block = "\n".join(
                f"- [{c['chunk_id']}] ({c.get('heading_path') or 'root'}): {str(c['text'])[:500]}"
                for c in chunks[:15]
            )

            async def _call() -> Any:
                return await client_to_use.aio.interactions.create(
                    model=resolved_model,
                    system_instruction=(
                        "Compare the document chunks against the agreed project Decisions and Constraints. "
                        "Report ONLY clear contradictions or policy/architecture conflicts."
                    ),
                    input=[
                        {
                            "type": "text",
                            "text": f"Agreed Project Nodes:\n{nodes_block}\n\nDocument Chunks:\n{chunks_block}",
                        }
                    ],
                    response_format={
                        "type": "text",
                        "mime_type": "application/json",
                        "schema": ConflictReport.model_json_schema(),
                    },
                    store=False,
                    stream=False,
                )

            interaction = await call_with_retries(_call)
            raw = getattr(interaction, "output_text", "") or ""
            if raw:
                report = ConflictReport.model_validate_json(raw)
                valid_node_ids = {n["node_uuid"] for n in nodes}
                valid_chunk_ids = {c["chunk_id"] for c in chunks}
                filtered = [
                    c.model_dump()
                    for c in report.conflicts
                    if c.node_uuid in valid_node_ids and c.chunk_id in valid_chunk_ids
                ]
                return {"project_uuid": str(project_uuid), "doc_uuid": str(doc_uuid), "conflicts": filtered}
        except Exception as exc:  # noqa: BLE001
            logger.debug("LLM conflict check unavailable, falling back to heuristic check: %s", exc)

    # Deterministic heuristic fallback for offline/unit verification
    conflicts: list[dict[str, Any]] = []
    for n in nodes:
        n_terms = _significant_terms(f"{n['name']} {n.get('summary') or ''} {n.get('text') or ''}")
        if not n_terms:
            continue
        for c in chunks:
            c_text = str(c["text"] or "")
            if not _NEGATION_RE.search(c_text):
                continue
            overlap = n_terms & _significant_terms(c_text)
            if len(overlap) >= 2:
                conflicts.append(
                    {
                        "node_uuid": n["node_uuid"],
                        "node_name": n["name"],
                        "chunk_id": c["chunk_id"],
                        "severity": "warning",
                        "explanation": (
                            f"Passage mentions negation terms alongside {sorted(overlap)[:4]} "
                            f"which may conflict with agreed {n['type']} '{n['name']}'."
                        ),
                    }
                )
                break

    return {"project_uuid": str(project_uuid), "doc_uuid": str(doc_uuid), "conflicts": conflicts}
