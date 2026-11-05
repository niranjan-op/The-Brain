"""Local 768-dim text embeddings via BAAI/bge-base-en-v1.5 (matches chunks.embedding vector(768)).

Runs locally on CPU/GPU via HuggingFace `transformers` + `torch` with CLS pooling and L2 normalisation.
"""
from __future__ import annotations

import asyncio
import math
import threading
from typing import Any

from src.kc.core.config import settings

EMBED_DIMS = 768
BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

_MODEL_LOCK = threading.Lock()
_INFER_LOCK = threading.Lock()
_LOADED_MODELS: dict[str, tuple[Any, Any, str]] = {}


def _get_local_embedder(model_name: str) -> tuple[Any, Any, str]:
    with _MODEL_LOCK:
        cached = _LOADED_MODELS.get(model_name)
        if cached is not None:
            return cached

        import torch
        from transformers import AutoModel, AutoTokenizer

        device = "cuda" if torch.cuda.is_available() else "cpu"
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModel.from_pretrained(model_name).to(device)
        model.eval()

        _LOADED_MODELS[model_name] = (tokenizer, model, device)
        return tokenizer, model, device


def _encode_texts_sync(texts: list[str], model_name: str) -> list[list[float]]:
    if not texts:
        return []

    import torch
    import torch.nn.functional as F

    tokenizer, model, device = _get_local_embedder(model_name)
    with _INFER_LOCK, torch.no_grad():
        encoded = tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        )
        encoded = {k: v.to(device) for k, v in encoded.items()}
        outputs = model(**encoded)
        # BGE models use CLS pooling (first token of last_hidden_state)
        pooled = outputs.last_hidden_state[:, 0]
        normalized = F.normalize(pooled, p=2, dim=1)

    return normalized.cpu().tolist()


def _normalise_vec(values: list[float]) -> list[float]:
    if not values:
        raise ValueError("embedding model returned no vector")
    norm = math.hypot(*values)
    if norm == 0.0:
        raise ValueError("embedding model returned zero-norm vector")
    return [v / norm for v in values]


async def embed_documents(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    raw_vecs = await asyncio.to_thread(_encode_texts_sync, texts, settings.embed_model)
    return [_normalise_vec(v) for v in raw_vecs]


async def embed_document(text: str) -> list[float]:
    vecs = await embed_documents([text])
    return vecs[0]


async def embed_query(text: str) -> list[float]:
    model_name = settings.embed_model
    query_input = f"{BGE_QUERY_PREFIX}{text}" if "bge" in model_name.lower() else text
    raw_vecs = await asyncio.to_thread(_encode_texts_sync, [query_input], model_name)
    return _normalise_vec(raw_vecs[0])
