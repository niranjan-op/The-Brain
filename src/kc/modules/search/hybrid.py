"""Hybrid chunk retrieval combining pgvector HNSW, pg_textsearch BM25 (with savepoint tsvector fallback),
and Reciprocal Rank Fusion (RRF, D007, D012, D022)."""
from __future__ import annotations

import logging
import uuid
from typing import Any, Literal

from sqlalchemy import text

from src.kc.core.config import settings
from src.kc.modules.ingestion.embedder import embed_query
from src.kc.modules.search.keyword import Bm25Search, TsvectorSearch

logger = logging.getLogger(__name__)


def _is_missing_bm25_extension_error(exc: Exception) -> bool:
    """Return True ONLY when `exc` indicates `pg_textsearch` (`to_bm25query` / `<@>` / `bm25query`) is missing.
    Never swallow missing partition (`42P01`) or syntax/connection errors."""
    msg = str(exc).lower()
    if "42p01" in msg or ("relation" in msg and "does not exist" in msg):
        return False
    markers = (
        "to_bm25query",
        "bm25query",
        "operator does not exist: text <@>",
        "pg_textsearch",
        "42883",
        "42704",
    )
    return any(m in msg for m in markers)


async def keyword_chunk_search(
    session: Any,
    project_uuid: str,
    query: str,
    k: int,
    excluded_docs: list[str] | None = None,
) -> tuple[list[tuple[str, float]], str]:
    """Run configured keyword search. When `settings.keyword_engine == 'bm25'`, runs inside a savepoint
    (`session.begin_nested()`) so a missing `pg_textsearch` extension rolls back cleanly to `TsvectorSearch`."""
    if settings.keyword_engine != "bm25":
        rows = await TsvectorSearch().search(session, project_uuid, query, k, excluded_docs=excluded_docs)
        return rows, "tsvector"

    try:
        async with session.begin_nested():
            rows = await Bm25Search().search(session, project_uuid, query, k, excluded_docs=excluded_docs)
            return rows, "bm25"
    except Exception as exc:
        if not _is_missing_bm25_extension_error(exc):
            raise
        logger.warning("BM25 extension/operator unavailable (%s); falling back to tsvector", exc)
        rows = await TsvectorSearch().search(session, project_uuid, query, k, excluded_docs=excluded_docs)
        return rows, "tsvector"


async def vector_chunk_search(
    session: Any,
    project_uuid: str,
    query_embedding: list[float],
    k: int,
    excluded_docs: list[str] | None = None,
) -> list[tuple[str, float]]:
    """Run cosine-distance HNSW vector search on `chunks` for `project_uuid`.
    When `excluded_docs` is non-empty, sets `SET LOCAL hnsw.iterative_scan = 'relaxed_order'` inside a
    savepoint and re-sorts the materialized candidate pool by exact distance (`ORDER BY dist ASC`) so
    `relaxed_order` distance inversions never distort RRF ranks."""
    if k <= 0:
        return []
    p_str = str(uuid.UUID(str(project_uuid)))
    excluded_list = [str(uuid.UUID(str(d))) for d in (excluded_docs or [])]
    has_excluded = bool(excluded_list)
    vec_str = str(query_embedding)

    if has_excluded:
        async with session.begin_nested():
            await session.execute(text("SET LOCAL hnsw.iterative_scan = 'relaxed_order'"))
            rows = (
                await session.execute(
                    text(
                        """
                        WITH relaxed AS MATERIALIZED (
                            SELECT chunk_id, (embedding <=> CAST(:vec AS vector)) AS dist
                            FROM chunks
                            WHERE project_uuid = :p
                              AND embedding IS NOT NULL
                              AND (:has_excluded = FALSE OR doc_uuid <> ALL(CAST(:excluded AS uuid[])))
                            ORDER BY embedding <=> CAST(:vec AS vector) ASC
                            LIMIT :k
                        )
                        SELECT chunk_id, 1 - dist AS similarity
                        FROM relaxed
                        ORDER BY dist ASC
                        """
                    ),
                    {
                        "p": p_str,
                        "vec": vec_str,
                        "has_excluded": has_excluded,
                        "excluded": excluded_list,
                        "k": int(k),
                    },
                )
            ).all()
    else:
        rows = (
            await session.execute(
                text(
                    """
                    SELECT chunk_id, 1 - (embedding <=> CAST(:vec AS vector)) AS similarity
                    FROM chunks
                    WHERE project_uuid = :p
                      AND embedding IS NOT NULL
                    ORDER BY embedding <=> CAST(:vec AS vector) ASC
                    LIMIT :k
                    """
                ),
                {"p": p_str, "vec": vec_str, "k": int(k)},
            )
        ).all()

    return [(str(r.chunk_id), float(r.similarity)) for r in rows]


def fuse_rrf(
    ranked_lists: list[list[str]],
    k: int = 8,
    rrf_k: int = 60,
) -> list[tuple[str, float]]:
    """Reciprocal Rank Fusion: score(c) = sum(1 / (rrf_k + rank + 1)) for 0-based `rank`."""
    if k <= 0:
        return []
    scores: dict[str, float] = {}
    first_seen: dict[str, int] = {}
    counter = 0
    for ranked in ranked_lists:
        seen_in_list: set[str] = set()
        for rank, cid in enumerate(ranked):
            cid_str = str(cid)
            if cid_str in seen_in_list:
                continue
            seen_in_list.add(cid_str)
            if cid_str not in first_seen:
                first_seen[cid_str] = counter
                counter += 1
            scores[cid_str] = scores.get(cid_str, 0.0) + 1.0 / (rrf_k + rank + 1)

    ordered = sorted(
        scores.items(),
        key=lambda item: (-item[1], first_seen[item[0]]),
    )
    return ordered[:k]


async def search_chunks(
    session: Any,
    project_uuid: str,
    query: str,
    query_embedding: list[float] | None = None,
    k: int = 8,
    rrf_k: int = 60,
    excluded_docs: list[str] | None = None,
    search_mode: Literal["hybrid", "vector", "keyword"] = "hybrid",
) -> list[dict[str, Any]]:
    """Retrieve top-`k` chunks for `project_uuid` under `search_mode` ('hybrid', 'vector', or 'keyword')
    and hydrate `text` (never `embed_text`, per D007) plus provenance metadata."""
    clean_q = query.strip()
    if not clean_q or k <= 0:
        return []
    p_str = str(uuid.UUID(str(project_uuid)))
    candidate_pool = max(k * 3, 15)

    vec_hits: list[tuple[str, float]] = []
    kw_hits: list[tuple[str, float]] = []
    kw_engine_used = settings.keyword_engine

    if search_mode in ("hybrid", "vector"):
        q_emb = query_embedding if query_embedding is not None else await embed_query(clean_q)
        vec_hits = await vector_chunk_search(
            session,
            p_str,
            q_emb,
            candidate_pool if search_mode == "hybrid" else k,
            excluded_docs=excluded_docs,
        )

    if search_mode in ("hybrid", "keyword"):
        kw_hits, kw_engine_used = await keyword_chunk_search(
            session,
            p_str,
            clean_q,
            candidate_pool if search_mode == "hybrid" else k,
            excluded_docs=excluded_docs,
        )

    vec_rank_map = {cid: idx + 1 for idx, (cid, _) in enumerate(vec_hits)}
    kw_rank_map = {cid: idx + 1 for idx, (cid, _) in enumerate(kw_hits)}

    if search_mode == "vector":
        top_scored = vec_hits[:k]
    elif search_mode == "keyword":
        top_scored = kw_hits[:k]
    else:
        top_scored = fuse_rrf(
            [[cid for cid, _ in vec_hits], [cid for cid, _ in kw_hits]],
            k=k,
            rrf_k=rrf_k,
        )

    if not top_scored:
        return []

    top_ids = [cid for cid, _ in top_scored]
    rows = (
        await session.execute(
            text(
                """
                SELECT chunk_id, doc_uuid, ordinal, kind, heading_path,
                       page_start, page_end, text, payload, node_uuid
                FROM chunks
                WHERE project_uuid = :p
                  AND chunk_id = ANY(:cids)
                """
            ),
            {"p": p_str, "cids": top_ids},
        )
    ).mappings().all()

    by_id = {str(r["chunk_id"]): r for r in rows}
    hydrated: list[dict[str, Any]] = []
    for cid, score in top_scored:
        row = by_id.get(cid)
        if row is None:
            continue
        hydrated.append(
            {
                "chunk_id": cid,
                "doc_uuid": str(row["doc_uuid"]),
                "ordinal": row["ordinal"],
                "kind": row["kind"],
                "heading_path": row["heading_path"],
                "page_start": row["page_start"],
                "page_end": row["page_end"],
                "text": row["text"],
                "payload": row["payload"] or {},
                "node_uuid": str(row["node_uuid"]) if row.get("node_uuid") else None,
                "score": float(score),
                "vec_rank": vec_rank_map.get(cid),
                "kw_rank": kw_rank_map.get(cid),
                "keyword_engine": kw_engine_used if search_mode in ("hybrid", "keyword") else None,
            }
        )
    return hydrated

