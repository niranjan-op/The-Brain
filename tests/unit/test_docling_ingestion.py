from types import SimpleNamespace

import pandas as pd

from src.kc.modules.ingestion import images
from src.kc.modules.ingestion.parsers import docling_parser, ingestion


def test_parse_txt_splits_paragraphs_and_deduplicates():
    raw = b"# Overview\nFirst paragraph about Auth.\n\nSecond paragraph about Postgres.\n\n# Overview\nFirst paragraph about Auth."
    parsed = docling_parser.parse_txt(raw, "notes.txt", "doc-txt", max_chars=40)

    assert parsed["page_count"] == 1
    chunks = parsed["chunks"]
    assert len(chunks) == 2
    assert chunks[0]["kind"] == "text"
    assert "First paragraph about Auth." in chunks[0]["text"]
    assert chunks[0]["ordinal"] == 0
    assert chunks[1]["ordinal"] == 1


def test_parse_csv_repeats_headers_and_stores_table_payload():
    csv_lines = ["service,port,protocol"] + [f"svc-{i},{8000 + i},grpc" for i in range(65)]
    raw = "\n".join(csv_lines).encode("utf-8")

    parsed = docling_parser.parse_csv(raw, "services.csv", "doc-csv", rows_per_chunk=30)

    chunks = parsed["chunks"]
    assert len(chunks) == 3  # 30 + 30 + 5 rows
    for c in chunks:
        assert c["kind"] == "table"
        assert "service | port | protocol" in c["text"]
        assert c["payload"]["table"]["columns"] == ["service", "port", "protocol"]
    assert len(chunks[0]["payload"]["table"]["rows"]) == 30
    assert len(chunks[2]["payload"]["table"]["rows"]) == 5


async def test_parse_docling_extracts_tables_skips_toc_and_describes_figures(monkeypatch):
    # Fake Docling document with 1 table, 1 decorative logo picture, 1 architecture figure, and 1 TOC chunk
    df = pd.DataFrame([["Auth", "Postgres", "5432"]], columns=["Service", "Target", "Port"])

    fake_table = SimpleNamespace(
        self_ref="#/tables/0",
        prov=[SimpleNamespace(page_no=2)],
        caption_text=lambda doc=None: "Table 1: DB connections",
        export_to_dataframe=lambda doc=None: df,
        export_to_markdown=lambda doc=None: "| Service | Target | Port |\n|---|---|---|\n| Auth | Postgres | 5432 |",
    )

    class FakePilImage:
        def save(self, buf, format="PNG"):
            buf.write(b"\x89PNG\r\n\x1a\nfakecrop")

    fake_logo_pic = SimpleNamespace(
        self_ref="#/pictures/0",
        prov=[SimpleNamespace(page_no=1)],
        caption_text=lambda doc=None: "Company Logo",
        meta=SimpleNamespace(
            classification=SimpleNamespace(
                get_main_prediction=lambda: SimpleNamespace(class_name="logo", confidence=0.95)
            )
        ),
        get_image=lambda doc: FakePilImage(),
    )

    fake_arch_pic = SimpleNamespace(
        self_ref="#/pictures/1",
        prov=[SimpleNamespace(page_no=3)],
        caption_text=lambda doc=None: "Figure 2: System Topology",
        meta=SimpleNamespace(
            classification=SimpleNamespace(
                get_main_prediction=lambda: SimpleNamespace(class_name="flow_chart", confidence=0.91)
            )
        ),
        get_image=lambda doc: FakePilImage(),
    )

    fake_doc = SimpleNamespace(
        pages={1: {}, 2: {}, 3: {}},
        tables=[fake_table],
        pictures=[fake_logo_pic, fake_arch_pic],
    )

    # 3 chunks from HybridChunker: 1 TOC (should be skipped), 1 table chunk, 1 figure chunk
    toc_item = SimpleNamespace(self_ref="#/texts/0", label="document_index", prov=[SimpleNamespace(page_no=1)])
    table_item = SimpleNamespace(self_ref="#/tables/0", label="table", prov=[SimpleNamespace(page_no=2)])
    pic_item = SimpleNamespace(self_ref="#/pictures/1", label="picture", prov=[SimpleNamespace(page_no=3)])

    raw_chunks = [
        SimpleNamespace(
            text="1. Intro ..... 1",
            meta=SimpleNamespace(doc_items=[toc_item], headings=["Contents"], captions=[]),
        ),
        SimpleNamespace(
            text="| Service | Target | Port |\n|---|---|---|\n| Auth | Postgres | 5432 |",
            meta=SimpleNamespace(doc_items=[table_item], headings=["Architecture", "Database"], captions=["Table 1"]),
        ),
        SimpleNamespace(
            text="See Figure 2 for topology.",
            meta=SimpleNamespace(doc_items=[pic_item], headings=["Architecture", "Topology"], captions=["Figure 2"]),
        ),
    ]

    class FakeChunker:
        def chunk(self, dl_doc):
            return raw_chunks

        def contextualize(self, chunk):
            return chunk.text

    monkeypatch.setattr(
        docling_parser,
        "_get_converter",
        lambda: SimpleNamespace(convert=lambda stream: SimpleNamespace(document=fake_doc, status="success")),
    )
    monkeypatch.setattr(docling_parser, "_get_chunker", lambda: FakeChunker())

    described_calls = []

    async def fake_describe_image(data: bytes, mime_type: str, filename: str):
        described_calls.append((data, mime_type, filename))
        return images.ImageLabel(
            doc_kind="architecture_diagram",
            description="Gateway routes to Auth and Postgres.",
            mermaid="flowchart LR\n  Gateway --> Auth\n  Auth --> Postgres",
        )

    monkeypatch.setattr(docling_parser, "describe_image", fake_describe_image)

    result = await docling_parser.parse_and_chunk(
        b"%PDF-1.7 fake", "design.pdf", "application/pdf", "doc-pdf-1", storage_path="p1/doc-pdf-1.pdf"
    )

    assert result["page_count"] == 3
    # Logo was skipped; only the flow_chart picture called describe_image
    assert len(described_calls) == 1
    chunks = result["chunks"]
    assert len(chunks) == 2  # TOC chunk was skipped

    tbl_chunk = chunks[0]
    assert tbl_chunk["kind"] == "table"
    assert tbl_chunk["heading_path"] == "Architecture > Database"
    assert tbl_chunk["page_start"] == 2 and tbl_chunk["page_end"] == 2
    assert tbl_chunk["payload"]["table"]["columns"] == ["Service", "Target", "Port"]
    assert tbl_chunk["payload"]["table"]["rows"] == [["Auth", "Postgres", "5432"]]

    fig_chunk = chunks[1]
    assert fig_chunk["kind"] == "figure_context"
    assert "Gateway routes to Auth and Postgres." in fig_chunk["embed_text"]
    assert "```mermaid" not in fig_chunk["embed_text"]
    assert "```mermaid\nflowchart LR" in fig_chunk["text"]
    assert fig_chunk["payload"]["figures"][0]["mermaid"] == "flowchart LR\n  Gateway --> Auth\n  Auth --> Postgres"


async def test_ingestion_chunker_routes_non_image_to_docling_and_stores_chunks(monkeypatch):
    executed_sql: list[tuple[str, dict]] = []

    class FakeResult:
        def __init__(self, row=None):
            self._row = row

        def mappings(self):
            return self

        def first(self):
            return self._row

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def execute(self, stmt, params=None):
            sql = str(stmt).strip()
            executed_sql.append((sql, params or {}))
            if "SELECT filename" in sql:
                return FakeResult(
                    {
                        "filename": "spec.pdf",
                        "mime_type": "application/pdf",
                        "size_bytes": 1024,
                        "storage_path": "p1/d1.pdf",
                    }
                )
            return FakeResult()

        async def commit(self):
            executed_sql.append(("COMMIT", {}))

    monkeypatch.setattr(ingestion, "SessionLocal", lambda: FakeSession())
    monkeypatch.setattr(ingestion, "download_file", lambda path: _async_val(b"%PDF-1.7"))
    monkeypatch.setattr(
        ingestion,
        "parse_and_chunk",
        lambda data, fn, mt, doc_uuid, storage_path=None: _async_val(
            {
                "page_count": 4,
                "doc_kind": "other",
                "description": "Parsed spec.pdf (2 chunks)",
                "chunks": [
                    {
                        "chunk_id": "c1",
                        "ordinal": 0,
                        "kind": "text",
                        "heading_path": "Intro",
                        "page_start": 1,
                        "page_end": 1,
                        "text": "Hello world",
                        "embed_text": "Hello world",
                        "text_hash": "h1",
                        "payload": {},
                    },
                    {
                        "chunk_id": "c2",
                        "ordinal": 1,
                        "kind": "table",
                        "heading_path": "Limits",
                        "page_start": 2,
                        "page_end": 2,
                        "text": "| A | B |",
                        "embed_text": "Limits: A is B",
                        "text_hash": "h2",
                        "payload": {"table": {"columns": ["A"], "rows": [["B"]]}},
                    },
                ],
            }
        ),
    )
    monkeypatch.setattr(ingestion, "embed_document", lambda text: _async_val([0.1] * 768))
    graph_synced = []

    async def fake_extract_graph(**kwargs):
        graph_synced.append(kwargs["doc_uuid"])
        return {"nodes_processed": 1, "edges_processed": 0, "synced": 1}

    monkeypatch.setattr(ingestion, "extract_and_sync_document_graph", fake_extract_graph)

    await ingestion.chunker({"job_id": 1, "project_uuid": "p1", "user_uuid": "u1", "doc_uuid": "d1"})

    inserts = [p for sql, p in executed_sql if "INSERT INTO chunks" in sql]
    assert len(inserts) == 2
    updates = [p for sql, p in executed_sql if "UPDATE documents" in sql and "status = 'ready'" in sql]
    assert len(updates) == 1
    assert updates[0]["page_count"] == 4
    assert graph_synced == ["d1"]


async def _async_val(v):
    return v

