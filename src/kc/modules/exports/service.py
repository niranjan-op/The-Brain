"""Build a downloadable document from one answered agent message."""
from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any, Literal

from src.kc.modules.exports.markdown_model import (
    ExportDocument,
    SourceRef,
    parse_markdown,
    safe_link,
)

ExportFormat = Literal["pdf", "docx"]

MEDIA_TYPES: dict[str, str] = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_DEFAULT_TITLE = "Knowledge Cartographer answer"
_TITLE_MAX = 120


class MessageNotExportableError(Exception):
    """The message exists but is not a finished AI answer (pending, failed, or a human turn)."""


def build_message_export(detail: dict[str, Any], message_uuid: str) -> ExportDocument:
    """Turn a conversation detail payload (see `get_conversation_detail`) into an ExportDocument.

    The title is the question that prompted the answer, which names the document far better
    than the answer's first sentence."""
    messages: list[dict[str, Any]] = list(detail.get("messages") or [])
    index = next((i for i, m in enumerate(messages) if str(m.get("message_uuid")) == str(message_uuid)), None)
    if index is None:
        raise LookupError("Message not found in this conversation")
    message = messages[index]
    if message.get("type") != "ai" or message.get("status") != "answered" or not (message.get("content") or "").strip():
        raise MessageNotExportableError("Only completed agent answers can be exported")

    question = next(
        (str(m.get("content") or "") for m in reversed(messages[:index]) if m.get("type") == "human"),
        "",
    )
    title = " ".join(question.split())
    if len(title) > _TITLE_MAX:
        title = title[: _TITLE_MAX - 1].rstrip() + "…"

    exported = datetime.now(UTC).strftime("%d %b %Y")
    convo_title = str(detail.get("title") or "Untitled conversation")
    meta = f"Conversation: {convo_title}    Exported {exported}    Model: {message.get('model') or 'unknown'}"

    return ExportDocument(
        title=title or _DEFAULT_TITLE,
        meta=meta,
        blocks=parse_markdown(str(message["content"])),
        sources=[_source_ref(c) for c in message.get("citations") or []],
    )


def _source_ref(citation: dict[str, Any]) -> SourceRef:
    kind = citation.get("source_kind")
    label = str(citation.get("filename") or citation.get("source_id") or "Source")
    if kind == "url":
        return SourceRef(label=label, detail="Web", url=safe_link(str(citation.get("source_id") or "")))
    parts = [str(citation.get(k)) for k in ("heading_path", "page_label") if citation.get(k)]
    return SourceRef(label=label, detail=", ".join(parts))


def export_filename(title: str, fmt: ExportFormat) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60].rstrip("-")
    return f"kc-{slug or 'answer'}.{fmt}"
