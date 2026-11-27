"""Conversational follow-up query rewriter using Flash-Lite (T058)."""
from __future__ import annotations

import logging
from typing import Any

from src.kc.core.llm import call_with_retries
from src.kc.modules.chat.byok import _managed_client, resolve_model_name

logger = logging.getLogger(__name__)

REWRITE_SYSTEM_PROMPT = """\
Rewrite the user's latest follow-up question into a single standalone search query that resolves pronouns
and implicit references using the conversation history. Preserve technical identifiers, UUIDs, file names,
and decision codes (e.g., D017) verbatim. Output ONLY the rewritten query text, with no quotes or preamble.
"""


async def rewrite_followup_query(
    query: str,
    history: list[dict[str, Any]] | None,
    *,
    llm_client: Any = None,
    model: str | None = None,
) -> str:
    """Rewrite a follow-up question with recent history into a standalone retrieval query."""
    clean_query = query.strip()
    if not clean_query or not history:
        return clean_query

    turns = history[-6:]
    lines: list[str] = []
    for item in turns:
        role = str(item.get("type") or item.get("role") or "user").lower()
        label = "User" if role in ("human", "user") else "Assistant"
        content = str(item.get("content") or "").strip().replace("\n", " ")
        if content:
            lines.append(f"{label}: {content[:400]}")

    if not lines:
        return clean_query

    prompt = (
        "Conversation History:\n"
        + "\n".join(lines)
        + f"\n\nLatest Question: {clean_query}\n\nStandalone Search Query:"
    )
    client_to_use = llm_client or _managed_client()
    resolved_model = resolve_model_name(model)

    try:
        async def _call() -> Any:
            return await client_to_use.aio.interactions.create(
                model=resolved_model,
                system_instruction=REWRITE_SYSTEM_PROMPT,
                input=[{"type": "text", "text": prompt}],
                store=False,
                stream=False,
            )

        interaction = await call_with_retries(_call)
        rewritten = (getattr(interaction, "output_text", "") or "").strip()
        if rewritten:
            single_line = " ".join(rewritten.splitlines()).strip().strip('"').strip("'")
            if single_line:
                return single_line[:500]
    except Exception as exc:  # noqa: BLE001
        logger.debug("Follow-up query rewrite failed, falling back to raw query: %s", exc)

    return clean_query
