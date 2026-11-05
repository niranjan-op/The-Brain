import base64
from types import SimpleNamespace

import pytest

from src.kc.modules.ingestion import images


class FakeInteractions:
    def __init__(self, responses):
        self.responses = list(responses) if isinstance(responses, (list, tuple)) else [responses]
        self.calls: list[dict] = []
        self.kwargs: dict = {}

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        self.kwargs = kwargs
        resp = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(resp, Exception):
            raise resp
        return SimpleNamespace(output_text=resp)


def fake_client(monkeypatch, responses):
    fake = FakeInteractions(responses)
    monkeypatch.setattr(images, "_client", lambda: SimpleNamespace(aio=SimpleNamespace(interactions=fake)))
    return fake


async def test_describe_image_sends_image_and_schema(monkeypatch):
    fake = fake_client(
        monkeypatch,
        '{"doc_kind": "architecture_diagram", "description": "API -> DB", "mermaid": "flowchart LR\\n  API --> DB"}',
    )

    label = await images.describe_image(b"\x89PNG", "image/png", "arch.png")

    assert label == images.ImageLabel(
        doc_kind="architecture_diagram",
        description="API -> DB",
        mermaid="flowchart LR\n  API --> DB",
    )
    image_part = fake.kwargs["input"][1]
    assert image_part == {"type": "image", "data": base64.b64encode(b"\x89PNG").decode(), "mime_type": "image/png"}
    assert fake.kwargs["response_format"]["schema"] == images.ImageLabel.model_json_schema()
    assert fake.kwargs["store"] is False
    assert fake.kwargs["system_instruction"] == images.SYSTEM_INSTRUCTION
    assert "arch.png" in fake.kwargs["input"][0]["text"]


async def test_describe_image_clears_mermaid_for_non_architecture_diagram(monkeypatch):
    fake_client(
        monkeypatch,
        '{"doc_kind": "screenshot", "description": "IDE error", "mermaid": "flowchart LR\\n  A --> B"}',
    )

    label = await images.describe_image(b"\x89PNG", "image/png", "screen.png")

    assert label.doc_kind == "screenshot"
    assert label.mermaid is None


async def test_describe_image_rejects_unknown_kind_and_falls_back(monkeypatch):
    # First call returns invalid kind 'meme'; retry call also returns invalid -> safe fallback with needs_raw_image
    fake = fake_client(monkeypatch, '{"doc_kind": "meme", "description": "x"}')
    label = await images.describe_image(b"x", "image/jpeg", "x.jpg")
    assert len(fake.calls) == 2
    assert label.doc_kind == "other"
    assert label.needs_raw_image is True
    assert label.description == ""


async def test_describe_image_retries_when_first_call_has_no_description(monkeypatch):
    fake = fake_client(
        monkeypatch,
        [
            '{"doc_kind": "architecture_diagram", "description": "   ", "mermaid": null}',
            '{"doc_kind": "architecture_diagram", "description": "Recovered prose description of API -> DB."}',
        ],
    )
    label = await images.describe_image(b"\x89PNG", "image/png", "blurry.png")
    assert len(fake.calls) == 2
    assert label.doc_kind == "architecture_diagram"
    assert label.description == "Recovered prose description of API -> DB."
    assert label.mermaid is None
    assert label.needs_raw_image is True


def test_architecture_diagram_with_invalid_mermaid_sets_needs_raw_image():
    label = images.ImageLabel(
        doc_kind="architecture_diagram",
        description="API talks to DB.",
        mermaid="flowchart TD\n  subgraph Unclosed\n    A --> B",
    )
    assert label.mermaid is None
    assert label.needs_raw_image is True

    chunk = images.image_chunk("doc-1", "arch.png", label, storage_path="proj-1/doc-1.png")
    assert chunk["payload"] == {
        "doc_kind": "architecture_diagram",
        "mermaid_status": "failed",
        "needs_raw_image": True,
        "storage_path": "proj-1/doc-1.png",
    }


def test_completely_failed_image_chunk_marks_describe_failed():
    label = images.ImageLabel(doc_kind="other", description="", mermaid=None, needs_raw_image=True)
    chunk = images.image_chunk("doc-1", "broken.png", label, storage_path="proj-1/doc-1.png")
    assert "needs visual inspection" in chunk["embed_text"]
    assert chunk["payload"] == {
        "doc_kind": "other",
        "describe_failed": True,
        "needs_raw_image": True,
        "storage_path": "proj-1/doc-1.png",
    }


def test_image_chunk_is_self_describing_and_stable():
    label = images.ImageLabel(doc_kind="screenshot", description="Terminal view.")

    c1 = images.image_chunk("doc-1", "term.png", label)
    c2 = images.image_chunk("doc-1", "term.png", label)

    assert c1["text"] == "[Image: term.png (screenshot)]\nTerminal view."
    assert c1["embed_text"] == c1["text"]
    assert c1["payload"] == {"doc_kind": "screenshot"}
    assert c1["kind"] == "image" and c1["ordinal"] == 0
    assert c1["chunk_id"] == c2["chunk_id"]  # retries replace, not duplicate
    assert images.image_chunk("doc-2", "term.png", label)["chunk_id"] != c1["chunk_id"]


def test_image_chunk_includes_mermaid_for_architecture_diagram():
    label = images.ImageLabel(
        doc_kind="architecture_diagram",
        description="API calls Postgres.",
        mermaid="```mermaid\nflowchart LR\n  API --> Postgres\n```",
    )

    chunk = images.image_chunk("doc-1", "arch.png", label)

    assert chunk["embed_text"] == "[Image: arch.png (architecture_diagram)]\nAPI calls Postgres."
    assert chunk["text"] == (
        "[Image: arch.png (architecture_diagram)]\nAPI calls Postgres.\n\n"
        "```mermaid\nflowchart LR\n  API --> Postgres\n```"
    )
    assert chunk["payload"] == {
        "doc_kind": "architecture_diagram",
        "mermaid": "flowchart LR\n  API --> Postgres",
    }


@pytest.mark.parametrize(
    "valid_mermaid",
    [
        "flowchart TD\n  subgraph VPC[\"Private VPC\"]\n    A[\"API Gateway (v2)\"] -->|gRPC| B[(Postgres)]\n  end",
        "sequenceDiagram\n  participant C as Client\n  participant S as Server\n  C->>S: POST /upload\n  S-->>C: 200 OK",
        "erDiagram\n  PROJECT ||--o{ DOCUMENT : contains",
        "stateDiagram-v2\n  [*] --> Pending\n  Pending --> Ready",
    ],
)
def test_validate_mermaid_accepts_valid_diagrams(valid_mermaid):
    assert images.validate_mermaid(valid_mermaid) is True
    label = images.ImageLabel(
        doc_kind="architecture_diagram",
        description="Valid diagram.",
        mermaid=valid_mermaid,
    )
    assert label.mermaid == valid_mermaid


@pytest.mark.parametrize(
    "invalid_mermaid",
    [
        "not a mermaid diagram at all",
        "flowchart LR",  # header only, no body/statements
        "flowchart TD\n  subgraph VPC\n    A --> B",  # unclosed subgraph (missing end)
        "flowchart TD\n  A --> B\n  end",  # stray end without subgraph
        "flowchart LR\n  A[\"Unclosed quote] --> B",  # unbalanced quote
        "flowchart LR\n  A[Unclosed bracket --> B",  # unbalanced bracket
        "pie title Pets\n  \"Dogs\" : 10",  # unsupported diagram type
    ],
)
def test_validate_mermaid_drops_invalid_ast_to_none(invalid_mermaid):
    assert images.validate_mermaid(invalid_mermaid) is False
    label = images.ImageLabel(
        doc_kind="architecture_diagram",
        description="Diagram with broken mermaid.",
        mermaid=invalid_mermaid,
    )
    assert label.mermaid is None



