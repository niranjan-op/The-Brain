import math

from src.kc.core.config import settings
from src.kc.modules.ingestion import embedder


async def test_embed_document_uses_local_model_and_normalises_to_unit_vector(monkeypatch):
    calls: list[list[str]] = []

    def fake_encode_sync(texts: list[str], model_name: str) -> list[list[float]]:
        calls.append(texts)
        return [[3.0, 4.0] + [0.0] * (embedder.EMBED_DIMS - 2) for _ in texts]

    monkeypatch.setattr(embedder, "_encode_texts_sync", fake_encode_sync)

    vec = await embedder.embed_document("hello world")

    assert len(vec) == embedder.EMBED_DIMS == 768
    assert math.isclose(vec[0], 0.6, rel_tol=1e-6)
    assert math.isclose(vec[1], 0.8, rel_tol=1e-6)
    assert math.isclose(math.hypot(*vec), 1.0, rel_tol=1e-6)
    assert calls == [["hello world"]]


async def test_embed_query_adds_bge_instruction_prefix(monkeypatch):
    captured: list[str] = []

    def fake_encode_sync(texts: list[str], model_name: str) -> list[list[float]]:
        captured.extend(texts)
        return [[1.0] + [0.0] * (embedder.EMBED_DIMS - 1) for _ in texts]

    monkeypatch.setattr(embedder, "_encode_texts_sync", fake_encode_sync)
    monkeypatch.setattr(settings, "embed_model", "BAAI/bge-base-en-v1.5")

    vec = await embedder.embed_query("how do links work?")

    assert len(vec) == 768
    assert math.isclose(math.hypot(*vec), 1.0, rel_tol=1e-6)
    assert captured[0].startswith("Represent this sentence for searching relevant passages: ")
    assert captured[0].endswith("how do links work?")


def test_default_models_use_local_bge_and_gemini_3_1_flash_lite():
    assert settings.embed_model == "BAAI/bge-base-en-v1.5"
    assert settings.image_model == "gemini-3.1-flash-lite"
    assert settings.chat_model == "gemini-3.1-flash-lite"
