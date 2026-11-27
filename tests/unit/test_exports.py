"""Agent answer parsing, Markdown -> DOCX/PDF export, and the export endpoint."""
from __future__ import annotations

import io
import uuid

import pytest
from docx import Document
from fastapi.testclient import TestClient

from src.kc.modules.chat import agent
from src.kc.modules.exports import (
    MessageNotExportableError,
    build_message_export,
    export_filename,
    render_docx,
    render_pdf,
)
from src.kc.modules.exports.markdown_model import (
    CodeBlock,
    Heading,
    ListBlock,
    Paragraph,
    Quote,
    Table,
    parse_markdown,
)

RICH_MARKDOWN = """\
**Cloud SQL** replaced the VM-hosted Postgres in `D026` — it cut ops work “significantly”.

## Trade-offs

| Option | Cost / month | Ops load |
|:--|--:|:-:|
| VM Postgres | 18 | High |
| Cloud SQL | 42 | Low |

### Migration steps

1. Export with `pg_dump`
2. Restore:
   ```bash
   pg_restore -d kc dump.sql
   ```
3. Cut over → verify

- Nested parent
  - Nested child with a [link](https://cloud.google.com/sql) and ~~old~~ text

> Cloud SQL is the current decision.

<script>alert(1)</script>

---

Final line.
"""

ANSWER_ID = str(uuid.uuid4())


def _detail(status: str = "answered", msg_type: str = "ai", content: str = RICH_MARKDOWN) -> dict:
    return {
        "title": "Database choices",
        "messages": [
            {"message_uuid": str(uuid.uuid4()), "type": "human", "status": "answered",
             "content": "Why did we move to Cloud SQL?", "citations": []},
            {
                "message_uuid": ANSWER_ID,
                "type": msg_type,
                "status": status,
                "content": content,
                "model": "gemini-3.1-flash-lite",
                "citations": [
                    {"source_kind": "chunk", "source_id": "c1", "filename": "arch.md",
                     "heading_path": "Infra > DB", "page_label": "p. 3"},
                    {"source_kind": "node", "source_id": "n1", "filename": "Decision: D026",
                     "heading_path": "Knowledge Graph > Why > Decision", "page_label": "agreed"},
                    {"source_kind": "url", "source_id": "https://cloud.google.com/sql",
                     "filename": "https://cloud.google.com/sql"},
                ],
            },
        ],
    }


# --- answer contract -----------------------------------------------------------------------


def test_parse_answer_with_valid_citation_block():
    parsed = agent.parse_answer_with_citations(
        '## Answer\n\nBody text.\n\n<citations>{"chunk_ids": ["c1"], "node_uuids": ["n1"], '
        '"urls": ["https://x.example"]}</citations>\n'
    )
    assert parsed.answer == "## Answer\n\nBody text."
    assert parsed.cited_chunk_ids == ["c1"]
    assert parsed.cited_node_uuids == ["n1"]
    assert parsed.cited_urls == ["https://x.example"]


def test_parse_answer_without_block_keeps_everything():
    parsed = agent.parse_answer_with_citations("Just an answer with `code`.")
    assert parsed.answer == "Just an answer with `code`."
    assert parsed.cited_chunk_ids == []


@pytest.mark.parametrize(
    "tail",
    [
        "<citations>{not json}</citations>",
        '<citations>{"chunk_ids": ["c1"]',  # cut off at the output token cap
        "<citations>[1, 2]</citations>",
    ],
)
def test_parse_answer_with_broken_block_drops_citations_not_answer(tail):
    parsed = agent.parse_answer_with_citations(f"Long answer.\n\n{tail}")
    assert parsed.answer == "Long answer."
    assert parsed.cited_chunk_ids == [] and parsed.cited_urls == []


def test_parse_answer_ignores_non_string_ids():
    parsed = agent.parse_answer_with_citations(
        'A.\n<citations>{"chunk_ids": ["c1", null, {"x": 1}, "  "], "node_uuids": "n1"}</citations>'
    )
    assert parsed.cited_chunk_ids == ["c1"]
    assert parsed.cited_node_uuids == []


def test_tool_budget_raised_to_eight():
    assert agent.MAX_TOOL_CALLS_PER_TURN == 8


async def test_openrouter_forwards_max_output_tokens(monkeypatch):
    from src.kc.core import openrouter

    captured: dict = {}

    class FakeResp:
        status_code = 200

        def json(self):
            return {"choices": [{"message": {"content": "ok"}}], "usage": {}}

    class FakeHttp:
        def __init__(self, **_kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

        async def post(self, _url, headers=None, json=None):
            captured.update(json or {})
            return FakeResp()

    monkeypatch.setattr(openrouter.httpx, "AsyncClient", FakeHttp)
    client = openrouter.OpenRouterClient(api_key="sk-or-test", default_model="a/b")
    await client.aio.interactions.create(
        model="a/b", input="hi", generation_config={"max_output_tokens": 40000}
    )
    assert captured["max_tokens"] == 40000


async def test_openrouter_enforces_wall_clock_timeout(monkeypatch):
    import asyncio

    from src.kc.core import openrouter

    closed = False

    class StallingHttp:
        def __init__(self, **_kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            nonlocal closed
            closed = True
            return False

        async def post(self, _url, headers=None, json=None):
            await asyncio.sleep(5)

    monkeypatch.setattr(openrouter.httpx, "AsyncClient", StallingHttp)
    client = openrouter.OpenRouterClient(
        api_key="sk-or-test", default_model="a/b", timeout_seconds=0.02
    )
    with pytest.raises(TimeoutError):
        await client.aio.interactions.create(model="a/b", input="hi")
    assert closed


# --- markdown model ------------------------------------------------------------------------


def test_parse_markdown_builds_expected_blocks():
    blocks = parse_markdown(RICH_MARKDOWN)
    kinds = [type(b).__name__ for b in blocks]
    assert kinds[:3] == ["Paragraph", "Heading", "Table"]
    table = next(b for b in blocks if isinstance(b, Table))
    assert table.aligns == ["left", "right", "center"]
    assert len(table.rows) == 2 and table.column_count == 3
    ordered = next(b for b in blocks if isinstance(b, ListBlock) and b.ordered)
    assert any(isinstance(child, CodeBlock) for child in ordered.items[1])
    nested = next(b for b in blocks if isinstance(b, ListBlock) and not b.ordered)
    inner = next(c for c in nested.items[0] if isinstance(c, ListBlock))
    inner_first = inner.items[0][0]
    assert isinstance(inner_first, Paragraph)
    link_runs = [r for r in inner_first.runs if r.link]
    assert link_runs and link_runs[0].link == "https://cloud.google.com/sql"
    assert any(isinstance(b, Quote) for b in blocks)
    assert any(isinstance(b, Heading) and b.level == 3 for b in blocks)


def test_parse_markdown_drops_unsafe_links_and_keeps_html_as_text():
    blocks = parse_markdown("[click](javascript:alert(1))\n\n<b>bold?</b>")
    first, second = blocks[0], blocks[1]
    assert isinstance(first, Paragraph) and isinstance(second, Paragraph)
    assert all(r.link is None for r in first.runs)
    assert "<b>bold?</b>" in "".join(r.text for r in second.runs)


# --- export building + rendering -----------------------------------------------------------


def test_build_message_export_uses_question_as_title_and_maps_sources():
    doc = build_message_export(_detail(), ANSWER_ID)
    assert doc.title == "Why did we move to Cloud SQL?"
    assert "Database choices" in doc.meta and "gemini-3.1-flash-lite" in doc.meta
    assert [s.label for s in doc.sources] == ["arch.md", "Decision: D026", "https://cloud.google.com/sql"]
    assert doc.sources[0].detail == "Infra > DB, p. 3"
    assert doc.sources[2].url == "https://cloud.google.com/sql"


@pytest.mark.parametrize("status,msg_type", [("pending", "ai"), ("failed", "ai"), ("answered", "human")])
def test_build_message_export_rejects_unfinished_messages(status, msg_type):
    with pytest.raises(MessageNotExportableError):
        build_message_export(_detail(status=status, msg_type=msg_type), ANSWER_ID)


def test_build_message_export_unknown_message():
    with pytest.raises(LookupError):
        build_message_export(_detail(), str(uuid.uuid4()))


def test_export_filename_slug():
    assert export_filename("Why did we move to Cloud SQL?", "pdf") == "kc-why-did-we-move-to-cloud-sql.pdf"
    assert export_filename("???", "docx") == "kc-answer.docx"


def test_render_docx_round_trip():
    data = render_docx(build_message_export(_detail(), ANSWER_ID))
    doc = Document(io.BytesIO(data))
    text = "\n".join(p.text for p in doc.paragraphs)
    headings = [
        p.text for p in doc.paragraphs if p.style is not None and (p.style.name or "").startswith("Heading")
    ]
    assert "Trade-offs" in headings and "Migration steps" in headings and "Sources" in headings
    assert "pg_restore -d kc dump.sql" in text
    assert "<script>alert(1)</script>" in text  # literal text, never markup
    assert len(doc.tables) == 1
    assert [c.text for c in doc.tables[0].rows[0].cells] == ["Option", "Cost / month", "Ops load"]
    assert "[1] arch.md — Infra > DB, p. 3" in text


def test_render_pdf_produces_valid_document():
    data = render_pdf(build_message_export(_detail(), ANSWER_ID))
    assert data.startswith(b"%PDF")
    assert data.rstrip().endswith(b"%%EOF")
    assert len(data) > 2000


def test_render_pdf_handles_long_and_wide_content():
    wide = "| " + " | ".join(f"c{i}" for i in range(14)) + " |\n|" + "--|" * 14 + "\n| " + " | ".join(
        "x" * 30 for _ in range(14)
    ) + " |\n"
    long_body = "\n\n".join(f"Paragraph {i} " + "lorem ipsum " * 40 for i in range(60))
    data = render_pdf(build_message_export(_detail(content=wide + "\n" + long_body), ANSWER_ID))
    assert data.startswith(b"%PDF")


def test_render_pdf_latin1_fallback(monkeypatch):
    from src.kc.modules.exports import pdf_renderer

    monkeypatch.setattr(pdf_renderer, "_unicode_font_files", lambda: None)
    data = render_pdf(build_message_export(_detail(), ANSWER_ID))
    assert data.startswith(b"%PDF")


# --- endpoint ------------------------------------------------------------------------------


@pytest.fixture
def export_client(monkeypatch):
    import main
    from src.kc.core.auth import get_current_user
    from src.kc.core.db import get_session

    state: dict = {"detail": _detail(), "member": True}

    async def fake_member(_session, *, project_uuid, user_uuid, require_write=False):
        if not state["member"]:
            raise main.HTTPException(403, "Not a project member")
        return "owner"

    async def fake_detail(_session, **_kw):
        if isinstance(state["detail"], Exception):
            raise state["detail"]
        return state["detail"]

    async def override_user():
        return {"user_uuid": str(uuid.uuid4())}

    async def override_session():
        yield object()

    monkeypatch.setattr(main, "_ensure_member", fake_member)
    monkeypatch.setattr(main, "get_conversation_detail", fake_detail)
    main.app.dependency_overrides[get_current_user] = override_user
    main.app.dependency_overrides[get_session] = override_session
    try:
        yield TestClient(main.app), state
    finally:
        main.app.dependency_overrides.clear()


def _url(message_id: str = ANSWER_ID, fmt: str = "pdf") -> str:
    return f"/projects/{uuid.uuid4()}/conversations/{uuid.uuid4()}/messages/{message_id}/export?format={fmt}"


def test_export_endpoint_pdf_and_docx(export_client):
    client, _ = export_client
    pdf = client.get(_url(fmt="pdf"))
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert 'filename="kc-why-did-we-move-to-cloud-sql.pdf"' in pdf.headers["content-disposition"]
    assert pdf.content.startswith(b"%PDF")

    docx = client.get(_url(fmt="docx"))
    assert docx.status_code == 200
    assert docx.headers["content-type"].startswith("application/vnd.openxmlformats")
    assert Document(io.BytesIO(docx.content)).tables


def test_export_endpoint_errors(export_client):
    client, state = export_client
    assert client.get(_url(fmt="txt")).status_code == 422
    assert client.get(_url(message_id=str(uuid.uuid4()))).status_code == 404

    state["detail"] = _detail(status="pending")
    assert client.get(_url()).status_code == 409

    state["detail"] = PermissionError("Private conversation belongs to another user")
    assert client.get(_url()).status_code == 403

    state["member"] = False
    assert client.get(_url()).status_code == 403
