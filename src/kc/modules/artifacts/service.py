"""Versioned workspace artifacts (architecture_plan, adr, prd, report, diagram, other) grounded in chunks & graph (T099)."""
from __future__ import annotations

from datetime import UTC, datetime
import hashlib
import json
import logging
import re
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.kc.core.config import settings
from src.kc.core.llm import call_with_retries, scrub_secrets
from src.kc.modules.chat.byok import get_turn_llm_client, resolve_model_name
from src.kc.modules.graph.read_tools import invalidate_allowed_nodes_cache
from src.kc.modules.ingestion.embedder import EMBED_DIMS
from src.kc.modules.search import graph_rag
from src.kc.modules.usage.service import check_and_consume_quota

logger = logging.getLogger(__name__)

ARTIFACT_TYPE_MAP: dict[str, str] = {
    "architecture_plan": "architecture_plan",
    "adr": "adr",
    "prd": "prd",
    "report": "report",
    "diagram": "diagram",
    "mermaid": "diagram",
    "markdown": "other",
    "other": "other",
}


def normalize_artifact_type(artifact_type: str) -> str:
    key = artifact_type.strip().lower()
    if key not in ARTIFACT_TYPE_MAP:
        raise ValueError(f"Unsupported artifact_type: {artifact_type!r}")
    return ARTIFACT_TYPE_MAP[key]


async def generate_project_artifact(
    session: AsyncSession,
    *,
    project_uuid: str,
    user_uuid: str,
    artifact_type: str,
    title: str,
    instructions: str = "",
    convo_uuid: str | None = None,
    artifact_uuid: str | None = None,
    mode: Literal["managed", "byok"] = "managed",
    byok_api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    consume_quota: bool = True,
) -> dict[str, Any]:
    """Generate a structured Markdown artifact citing retrieved chunks and graph nodes,
    and persist it as v1 or the next incremented version in `artifacts` + `artifact_versions`."""
    norm_type = normalize_artifact_type(artifact_type)
    clean_title = title.strip()
    if not clean_title:
        raise ValueError("Artifact title must not be empty")

    llm_client = get_turn_llm_client(mode=mode, byok_api_key=byok_api_key, base_url=base_url)
    resolved_model = resolve_model_name(model)

    if consume_quota and mode == "managed":
        await check_and_consume_quota(
            session,
            user_uuid=str(user_uuid),
            project_uuid=str(project_uuid),
            kind="llm_call",
            amount=1,
        )

    search_q = f"{clean_title} {instructions}".strip()
    ctx = await graph_rag.retrieve_context(
        project_uuid=str(project_uuid),
        query=search_q,
        convo_uuid=str(convo_uuid) if convo_uuid else None,
        k_chunks=10,
        k_nodes=8,
        search_mode="hybrid",
        use_graph=True,
    )
    chunks = list(ctx.get("chunks") or [])
    graph = dict(ctx.get("graph") or {})
    chunk_ids = [str(c["chunk_id"]) for c in chunks if c.get("chunk_id")]
    node_uuids = [str(n["node_uuid"]) for n in (graph.get("nodes") or []) if n.get("node_uuid")]

    formatted_ctx = graph_rag.format_context_within_budget(chunks, graph)
    prompt = (
        f"Artifact Type: {norm_type}\nTitle: {clean_title}\n"
        + (f"Instructions: {instructions.strip()}\n\n" if instructions.strip() else "\n")
        + formatted_ctx
    )

    content = ""
    try:
        async def _call() -> Any:
            return await llm_client.aio.interactions.create(
                model=resolved_model,
                system_instruction=(
                    "Generate a crisp, comprehensive, production-grade Markdown technical artifact grounded "
                    "strictly in the provided document chunks and architectural context. Reference source "
                    "documents naturally with their section, page, and paragraph numbers (e.g., `(p. 2, ¶ 1)`) "
                    "and never expose raw internal UUIDs or say 'Knowledge Graph'. Include a Mermaid diagram "
                    "when appropriate for architecture_plan or diagram artifacts."
                ),
                input=[{"type": "text", "text": prompt}],
                store=False,
                stream=False,
            )

        interaction = await call_with_retries(_call)
        content = (getattr(interaction, "output_text", "") or "").strip()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Artifact LLM call fell back to deterministic template: %s", scrub_secrets(str(exc)))

    if not content:
        node_lines = "\n".join(
            f"- **{n.get('type')}: {n.get('name')}** ({n.get('status')}) — {n.get('summary') or ''}"
            for n in (graph.get("nodes") or [])[:8]
        )
        content = (
            f"# {clean_title}\n\n"
            f"_Type: `{norm_type}`_\n\n"
            + (f"## Context\n{instructions.strip()}\n\n" if instructions.strip() else "")
            + f"## Grounded Graph Elements\n{node_lines or '- No graph nodes retrieved'}\n"
        )

    source_refs = {"chunk_ids": chunk_ids, "node_uuids": node_uuids}

    if artifact_uuid is None:
        art_row = (
            await session.execute(
                text(
                    """
                    INSERT INTO artifacts (project_uuid, convo_uuid, created_by, type, title, current_version)
                    VALUES (:p, :c, :u, :t, :title, 1)
                    RETURNING artifact_uuid, project_uuid, convo_uuid, type, title, status, current_version, created_at, updated_at
                    """
                ),
                {
                    "p": str(project_uuid),
                    "c": str(convo_uuid) if convo_uuid else None,
                    "u": str(user_uuid),
                    "t": norm_type,
                    "title": clean_title,
                },
            )
        ).mappings().one()
        resolved_art_uuid = str(art_row["artifact_uuid"])
        version = 1
    else:
        art_row = (
            await session.execute(
                text(
                    """
                    UPDATE artifacts
                    SET current_version = current_version + 1,
                        title = :title,
                        updated_at = now()
                    WHERE artifact_uuid = :a AND project_uuid = :p AND deleted_at IS NULL
                    RETURNING artifact_uuid, project_uuid, convo_uuid, type, title, status, current_version, created_at, updated_at
                    """
                ),
                {"a": str(artifact_uuid), "p": str(project_uuid), "title": clean_title},
            )
        ).mappings().first()
        if art_row is None:
            raise LookupError("Artifact not found in project")
        resolved_art_uuid = str(art_row["artifact_uuid"])
        version = int(art_row["current_version"])

    await session.execute(
        text(
            """
            INSERT INTO artifact_versions (artifact_uuid, version, content, source_refs, model, mode)
            VALUES (:a, :v, :content, CAST(:refs AS jsonb), :model, :mode)
            """
        ),
        {
            "a": resolved_art_uuid,
            "v": version,
            "content": content,
            "refs": json.dumps(source_refs),
            "model": resolved_model,
            "mode": mode,
        },
    )

    return {
        "artifact_uuid": resolved_art_uuid,
        "project_uuid": str(art_row["project_uuid"]),
        "convo_uuid": str(art_row["convo_uuid"]) if art_row.get("convo_uuid") else None,
        "type": art_row["type"],
        "title": art_row["title"],
        "status": art_row["status"],
        "version": version,
        "current_version": int(art_row["current_version"]),
        "content": content,
        "source_refs": source_refs,
        "model": resolved_model,
        "mode": mode,
    }


async def list_project_artifacts(session: AsyncSession, *, project_uuid: str) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(
                """
                SELECT artifact_uuid, project_uuid, convo_uuid, created_by, type, title,
                       status, current_version, created_at, updated_at
                FROM artifacts
                WHERE project_uuid = :p AND deleted_at IS NULL
                ORDER BY updated_at DESC
                """
            ),
            {"p": str(project_uuid)},
        )
    ).mappings().all()
    return [
        {
            "artifact_uuid": str(r["artifact_uuid"]),
            "project_uuid": str(r["project_uuid"]),
            "convo_uuid": str(r["convo_uuid"]) if r["convo_uuid"] else None,
            "created_by": str(r["created_by"]),
            "type": r["type"],
            "title": r["title"],
            "status": r["status"],
            "current_version": int(r["current_version"]),
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        }
        for r in rows
    ]


async def get_artifact_detail(
    session: AsyncSession,
    *,
    project_uuid: str,
    artifact_uuid: str,
) -> dict[str, Any]:
    art = (
        await session.execute(
            text(
                """
                SELECT artifact_uuid, project_uuid, convo_uuid, created_by, type, title,
                       status, current_version, created_at, updated_at
                FROM artifacts
                WHERE artifact_uuid = :a AND project_uuid = :p AND deleted_at IS NULL
                """
            ),
            {"a": str(artifact_uuid), "p": str(project_uuid)},
        )
    ).mappings().first()
    if art is None:
        raise LookupError("Artifact not found in project")

    ver_rows = (
        await session.execute(
            text(
                """
                SELECT version, content, source_refs, model, mode, created_at
                FROM artifact_versions
                WHERE artifact_uuid = :a
                ORDER BY version DESC
                """
            ),
            {"a": str(artifact_uuid)},
        )
    ).mappings().all()

    return {
        "artifact_uuid": str(art["artifact_uuid"]),
        "project_uuid": str(art["project_uuid"]),
        "convo_uuid": str(art["convo_uuid"]) if art["convo_uuid"] else None,
        "type": art["type"],
        "title": art["title"],
        "status": art["status"],
        "current_version": int(art["current_version"]),
        "versions": [
            {
                "version": int(v["version"]),
                "content": v["content"],
                "source_refs": v["source_refs"],
                "model": v["model"],
                "mode": v["mode"],
                "created_at": v["created_at"].isoformat() if v["created_at"] else None,
            }
            for v in ver_rows
        ],
    }


async def delete_project_artifact(
    session: AsyncSession,
    *,
    project_uuid: str,
    artifact_uuid: str,
) -> dict[str, Any]:
    """Soft-delete an artifact in `project_uuid`."""
    deleted = (
        await session.execute(
            text(
                """
                UPDATE artifacts
                SET deleted_at = now(), updated_at = now()
                WHERE artifact_uuid = :a AND project_uuid = :p AND deleted_at IS NULL
                RETURNING artifact_uuid
                """
            ),
            {"a": str(artifact_uuid), "p": str(project_uuid)},
        )
    ).scalar_one_or_none()
    if deleted is None:
        raise LookupError("Artifact not found in project")
    return {"deleted": True, "artifact_uuid": str(deleted)}


def build_artifact_export(detail: dict[str, Any]) -> Any:
    """Convert an artifact detail payload into an `ExportDocument` for PDF or DOCX rendering."""
    from src.kc.modules.exports.markdown_model import ExportDocument, parse_markdown

    versions = list(detail.get("versions") or [])
    if not versions:
        raise LookupError("Artifact has no versions to export")
    latest = versions[0]
    content = str(latest.get("content") or "").strip()
    title = str(detail.get("title") or "Project Artifact")
    art_type = str(detail.get("type") or "other")
    ver_num = int(latest.get("version") or detail.get("current_version") or 1)
    exported = datetime.now(UTC).strftime("%d %b %Y")
    meta = f"Artifact ({art_type}) · v{ver_num} · Exported {exported} · Model: {latest.get('model') or 'managed'}"
    return ExportDocument(
        title=title,
        meta=meta,
        blocks=parse_markdown(content),
        sources=[],
    )


async def add_artifact_to_knowledge_base(
    session: AsyncSession,
    *,
    project_uuid: str,
    artifact_uuid: str,
    user_uuid: str,
) -> dict[str, Any]:
    """Promote a generated artifact into the project's Knowledge Base (`documents` + `chunks` RAG + Graph)."""
    detail = await get_artifact_detail(
        session,
        project_uuid=str(project_uuid),
        artifact_uuid=str(artifact_uuid),
    )
    versions = list(detail.get("versions") or [])
    if not versions:
        raise LookupError("Artifact has no content to add to Knowledge Base")

    latest = versions[0]
    content = str(latest.get("content") or "").strip()
    title = str(detail.get("title") or "Artifact")
    art_type = str(detail.get("type") or "other")
    ver_num = int(latest.get("version") or detail.get("current_version") or 1)

    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:48].rstrip("-") or "artifact"
    filename = f"{slug}-v{ver_num}.md"
    full_md = content if content.startswith("#") else f"# {title}\n\n{content}"
    data_bytes = full_md.encode("utf-8")
    doc_hash = hashlib.sha256(data_bytes).hexdigest()
    size_bytes = len(data_bytes)
    description = f"Generated {art_type} artifact (v{ver_num}): {title}"

    doc_row = (
        await session.execute(
            text(
                """
                INSERT INTO documents (
                    project_uuid, filename, doc_hash, mime_type, size_bytes,
                    uploaded_by, status, doc_kind, description, page_count
                )
                VALUES (:p, :fn, :doc_hash, 'text/markdown', :size, :u, 'ready', 'other', :desc, 1)
                ON CONFLICT (project_uuid, doc_hash) DO UPDATE
                SET deleted_at = NULL,
                    status = 'ready',
                    filename = EXCLUDED.filename,
                    description = EXCLUDED.description,
                    error = NULL
                RETURNING doc_uuid, project_uuid, filename, doc_hash, uploaded_by, mime_type,
                          size_bytes, storage_path, status, doc_kind, description, page_count,
                          error, created_at
                """
            ),
            {
                "p": str(project_uuid),
                "fn": filename,
                "doc_hash": doc_hash,
                "size": size_bytes,
                "u": str(user_uuid),
                "desc": description,
            },
        )
    ).mappings().one()

    doc_uuid_str = str(doc_row["doc_uuid"])
    from src.kc.modules.ingestion.parsers.docling_parser import parse_txt

    parsed_txt = parse_txt(data_bytes, filename, doc_uuid_str)
    chunks = parsed_txt.get("chunks", []) if isinstance(parsed_txt, dict) else parsed_txt

    if chunks:
        from src.kc.modules.ingestion.parsers.ingestion import _embed_chunks

        try:
            embeddings = await _embed_chunks(chunks)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Artifact KB embedding fallback used: %s", scrub_secrets(str(exc)))
            embeddings = [[0.01] * EMBED_DIMS for _ in chunks]

        await session.execute(
            text("DELETE FROM chunks WHERE project_uuid = :p AND doc_uuid = :d"),
            {"p": str(project_uuid), "d": doc_uuid_str},
        )
        for chunk, embedding in zip(chunks, embeddings, strict=True):
            await session.execute(
                text(
                    """
                    INSERT INTO chunks (chunk_id, project_uuid, doc_uuid, ordinal, kind, heading_path,
                                        page_start, page_end, text, embed_text, text_hash,
                                        payload, embedding, embed_model, dims)
                    VALUES (:chunk_id, :p, :d, :ordinal, :kind, :heading_path,
                            :page_start, :page_end, :text, :embed_text, :text_hash,
                            CAST(:payload AS jsonb), CAST(:embedding AS vector), :embed_model, :dims)
                    """
                ),
                {
                    "p": str(project_uuid),
                    "d": doc_uuid_str,
                    "chunk_id": chunk["chunk_id"],
                    "ordinal": chunk["ordinal"],
                    "kind": chunk["kind"],
                    "heading_path": chunk.get("heading_path", ""),
                    "page_start": chunk.get("page_start", 1),
                    "page_end": chunk.get("page_end", 1),
                    "text": chunk["text"],
                    "embed_text": chunk["embed_text"],
                    "text_hash": chunk["text_hash"],
                    "payload": json.dumps(chunk["payload"]),
                    "embedding": str(embedding),
                    "embed_model": settings.embed_model,
                    "dims": EMBED_DIMS,
                },
            )

    invalidate_allowed_nodes_cache(str(project_uuid))
    created_at_val = doc_row.get("created_at")
    return {
        "doc_uuid": doc_uuid_str,
        "project_uuid": str(doc_row.get("project_uuid") or project_uuid),
        "filename": str(doc_row.get("filename") or filename),
        "doc_hash": str(doc_row.get("doc_hash") or doc_hash),
        "uploaded_by": str(doc_row.get("uploaded_by") or user_uuid),
        "mime_type": str(doc_row.get("mime_type") or "text/markdown"),
        "size_bytes": int(doc_row.get("size_bytes") or size_bytes),
        "storage_path": doc_row.get("storage_path"),
        "status": str(doc_row.get("status") or "ready"),
        "doc_kind": str(doc_row.get("doc_kind") or "other"),
        "description": str(doc_row.get("description") or description),
        "page_count": int(doc_row.get("page_count") or 1),
        "error": doc_row.get("error"),
        "created_at": created_at_val.isoformat() if hasattr(created_at_val, "isoformat") else None,
        "chunks_indexed": len(chunks),
    }
