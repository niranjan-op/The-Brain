"""Standalone image -> LLM label + description -> one searchable text chunk.

The image itself is never re-sent at chat time: retrieval returns this chunk's text.
"""
import base64
import hashlib
import re
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from src.kc.core.config import settings
from src.kc.core.llm import client as _client

SYSTEM_INSTRUCTION = """\
You index images for a software-architecture knowledge base. Engineers upload diagrams, screenshots,
tables and photos about the systems they build. Your output replaces the image everywhere downstream:
- it is embedded for semantic search and indexed for keyword search, and
- at chat time an assistant reads ONLY your description, never the image.
So anything you leave out is lost, and anything you invent becomes a false fact.

Return the schema fields.

doc_kind - pick exactly one, using the first rule that matches:
1. architecture_diagram: boxes/shapes joined by lines or arrows showing parts of a system - architecture,
   component, deployment, network, data-flow, sequence, ER, state or flow diagrams. Hand-drawn or whiteboard
   versions count.
2. table: the image is mainly a grid of rows and columns (including a screenshot or photo of a table).
3. screenshot: a capture of a software UI, terminal, IDE, dashboard, web page or document that is not
   mainly a table or diagram.
4. photo: a camera picture of real-world objects or people that is not a whiteboard diagram or table.
5. other: charts/graphs, logos, icons, illustrations, memes, anything else.

description - plain text written for retrieval, following the rules for the chosen kind:
- architecture_diagram: first sentence states the diagram type and what system it shows. Then list every
  labelled component with its label copied exactly, its type (service, database, queue, cache, client,
  external API, etc.) and any grouping (boundary, VPC, cluster, layer). Then list every connection as
  "A -> B: label/protocol"; mark it bidirectional if it is. End with notable notes or legends.
- table: say what the table is about, give the column headers exactly, then reproduce the rows
  (Markdown table if it has 20 rows or fewer, otherwise headers plus a summary of the contents and ranges).
- screenshot: name the application or tool and the screen/view, then transcribe the important visible
  text (titles, error messages, code, config, log lines, field values) exactly.
- photo: say what is shown and transcribe any legible text.
- other: say what it is; for charts give the title, axes, series and the main trend or values.

mermaid - populate ONLY when doc_kind is "architecture_diagram"; for all other kinds return null:
- Output valid Mermaid.js code (e.g. flowchart TD/LR, sequenceDiagram, erDiagram, stateDiagram-v2) that
  faithfully represents every component, subgraph/boundary, and labelled edge in the diagram.
- Quote node labels containing spaces, parentheses, or special characters (e.g. A["API Gateway (v2)"]).
- Return raw Mermaid syntax only, with no markdown code fences.

Rules for every kind:
- Copy names, identifiers, versions, numbers and code exactly as written. Never correct or expand them.
- Describe only what is visible. If something is unreadable, write [illegible] - do not guess.
- No preamble ("This image shows...", "Sure"), no opinions, no advice.
- Be complete but not padded: a simple image needs a few sentences; a dense diagram may need many lines.
"""

TASK = "Index this image. The filename is a hint only and may be meaningless: {filename}"
RETRY_TASK = (
    "Describe all visible components, text, labels, and connections in this image in plain prose for search retrieval. "
    "Leave mermaid as null. Filename hint: {filename}"
)

_FENCE_RE = re.compile(r"^```(?:mermaid)?\s*\n|\n```\s*$", re.MULTILINE)
_HEADER_RE = re.compile(
    r"^(?:(?:flowchart|graph)\s+(?:TD|TB|BT|RL|LR)|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram)\b"
)
_BLOCK_OPEN_RE = re.compile(
    r"^(?:subgraph|loop|alt|opt|par|critical|break|rect|box)\b"
)
_BLOCK_CLOSE_RE = re.compile(r"^end\b")
_ARROW_STRIP_RE = re.compile(
    r"<-->|-->|--o|--x|<-->|-\.->|==>|-->>|->>|--\)|-\)|--x|-x|\|\|--o\{|\}o--\|\||\|\|--\|\||\}[|o]--[|o]\{"
)


def _strip_mermaid_fences(code: str) -> str:
    return _FENCE_RE.sub("", code.strip()).strip()


def _has_balanced_delimiters(line: str) -> bool:
    """Verify quotes are closed on the line and node brackets outside quotes are balanced."""
    sanitized = _ARROW_STRIP_RE.sub(" ", line)
    in_quote = False
    stack: list[str] = []
    matching = {"]": "[", ")": "(", "}": "{"}
    for i, ch in enumerate(sanitized):
        if ch == '"' and (i == 0 or sanitized[i - 1] != "\\"):
            in_quote = not in_quote
            continue
        if in_quote:
            continue
        if ch in "[(":
            stack.append(ch)
        elif ch in "])":
            if not stack or stack[-1] != matching[ch]:
                return False
            stack.pop()
    return not in_quote and not stack


def validate_mermaid(code: str) -> bool:
    """Validate Mermaid diagram header, block structure (subgraph/end), and node delimiter balance."""
    cleaned = _strip_mermaid_fences(code)
    lines = [
        line.strip()
        for line in cleaned.splitlines()
        if line.strip() and not line.strip().startswith("%%")
    ]
    if len(lines) < 2 or not _HEADER_RE.match(lines[0]):
        return False

    block_depth = 0
    statement_count = 0
    for line in lines[1:]:
        if not _has_balanced_delimiters(line):
            return False
        if _BLOCK_OPEN_RE.match(line):
            block_depth += 1
        elif _BLOCK_CLOSE_RE.match(line):
            block_depth -= 1
            if block_depth < 0:
                return False
        else:
            statement_count += 1

    return block_depth == 0 and statement_count > 0


class ImageLabel(BaseModel):
    doc_kind: Literal["architecture_diagram", "table", "photo", "screenshot", "other"] = Field(
        description="Image category; apply the rules in order and pick the first match"
    )
    description: str = Field(description="Retrieval text that fully replaces the image; follow the per-kind rules")
    mermaid: str | None = Field(
        default=None,
        description="Valid Mermaid.js diagram syntax ONLY when doc_kind == 'architecture_diagram', else null",
    )
    needs_raw_image: bool = Field(
        default=False,
        description="True when Mermaid AST failed/missing on an architecture_diagram or description failed",
    )

    @model_validator(mode="after")
    def _normalize_mermaid(self):
        self.description = self.description.strip()
        if self.doc_kind != "architecture_diagram":
            self.mermaid = None
            if not self.description:
                self.needs_raw_image = True
        else:
            cleaned = _strip_mermaid_fences(self.mermaid) if self.mermaid else ""
            if cleaned and validate_mermaid(cleaned):
                self.mermaid = cleaned
            else:
                self.mermaid = None
                self.needs_raw_image = True
        return self


async def _call_image_llm(data: bytes, mime_type: str, prompt_text: str) -> ImageLabel:
    interaction = await _client().aio.interactions.create(
        model=settings.image_model,
        system_instruction=SYSTEM_INSTRUCTION,
        input=[
            {"type": "text", "text": prompt_text},
            {"type": "image", "data": base64.b64encode(data).decode(), "mime_type": mime_type},
        ],
        response_format={"type": "text", "mime_type": "application/json", "schema": ImageLabel.model_json_schema()},
        store=False,  # user documents: don't retain on Google's side
        stream=False,
    )
    # stream=False returns an Interaction; the SDK's overloads don't narrow for dict-literal inputs.
    raw = interaction.output_text  # pyright: ignore[reportAttributeAccessIssue]
    if not raw:
        raise ValueError("image model returned no text")
    label = ImageLabel.model_validate_json(raw)
    if not label.description:
        raise ValueError("image model returned empty description")
    return label


async def describe_image(data: bytes, mime_type: str, filename: str) -> ImageLabel:
    try:
        return await _call_image_llm(data, mime_type, TASK.format(filename=filename))
    except Exception:  # noqa: BLE001
        try:
            label = await _call_image_llm(data, mime_type, RETRY_TASK.format(filename=filename))
            label.needs_raw_image = True
            return label
        except Exception:  # noqa: BLE001
            return ImageLabel(doc_kind="other", description="", mermaid=None, needs_raw_image=True)


def image_chunk(doc_uuid: str, filename: str, label: ImageLabel, storage_path: str | None = None) -> dict:
    """The single chunk row for an image (minus project_uuid/doc_uuid/embedding, which the store adds).

    Filename + kind go into the text so both BM25 and the chat model know what it is.
    Mermaid code (for architecture_diagram) is attached to `text` and `payload` while `embed_text` stays prose.
    If Mermaid AST validation failed or description failed, `needs_raw_image=True` tells chat to pass the raw image.
    """
    if label.description:
        embed_body = f"[Image: {filename} ({label.doc_kind})]\n{label.description}"
    else:
        embed_body = f"[Image: {filename} (needs visual inspection)]"

    text_body = f"{embed_body}\n\n```mermaid\n{label.mermaid}\n```" if label.mermaid else embed_body
    text_hash = hashlib.sha256(embed_body.encode()).hexdigest()
    payload: dict[str, str | bool | int] = {
        "doc_kind": label.doc_kind,
        "para_start": 1,
        "para_end": 1,
    }
    if label.mermaid:
        payload["mermaid"] = label.mermaid
    elif label.doc_kind == "architecture_diagram":
        payload["mermaid_status"] = "failed"

    if not label.description:
        payload["describe_failed"] = True

    if label.needs_raw_image:
        payload["needs_raw_image"] = True
        if storage_path:
            payload["storage_path"] = storage_path

    return {
        # content-derived (D012): same doc + same text -> same id, so a retry replaces instead of duplicating
        "chunk_id": hashlib.sha256(f"{doc_uuid}||{text_hash}".encode()).hexdigest()[:32],
        "ordinal": 0,
        "kind": "image",
        "heading_path": "",
        "page_start": 1,
        "page_end": 1,
        "text": text_body,
        "embed_text": embed_body,
        "text_hash": text_hash,
        "payload": payload,
    }
