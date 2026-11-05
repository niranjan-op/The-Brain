"""Project-scoped keyword search (`pg_textsearch` BM25 and `tsvector` fallback) over partitioned `chunks`."""
from __future__ import annotations

import uuid
from typing import Any, Protocol

from sqlalchemy import text

from src.kc.core.config import settings


def partition_table_name(project_uuid: str | uuid.UUID) -> tuple[str, str]:
    """Return `(partition_table_name, bm25_index_name)` matching the `create_project_partition()` trigger
    (`'chunks_' || replace(NEW.project_uuid::text, '-', '')`). Strict UUID validation prevents SQL injection."""
    parsed = uuid.UUID(str(project_uuid))
    hex_id = parsed.hex
    table_name = f"chunks_{hex_id}"
    bm25_idx_name = f"chunks_{hex_id}_embed_text_idx"
    return table_name, bm25_idx_name


class KeywordSearch(Protocol):
    async def search(
        self,
        session: Any,
        project_uuid: str,
        query: str,
        k: int,
        excluded_docs: list[str] | None = None,
    ) -> list[tuple[str, float]]:
        """Return `(chunk_id, score)` ordered best-first (`score > 0`)."""


class Bm25Search:
    """BM25 keyword search via `pg_textsearch` on the project's partition table (`chunks_<uuid_hex>`).

    Empirically verified via `asyncpg`:
    - Querying the parent `chunks` table binds `to_bm25query` to the empty parent index and returns `-0`.
    - 1-arg `to_bm25query(:q)` fails under `asyncpg` prepared statements (`text <@> tpquery operator requires index`).
    - 2-arg `to_bm25query(:q, :idx)` on `FROM chunks_<uuid_hex>` uses `Index Scan using chunks_<uuid_hex>_embed_text_idx`
      and computes positive negated BM25 scores (`-(embed_text <@> to_bm25query(:q, :idx))`).
    """

    async def search(
        self,
        session: Any,
        project_uuid: str,
        query: str,
        k: int,
        excluded_docs: list[str] | None = None,
    ) -> list[tuple[str, float]]:
        clean_q = query.strip()
        if not clean_q or k <= 0:
            return []
        part_table, bm25_idx = partition_table_name(project_uuid)
        excluded_list = [str(uuid.UUID(str(d))) for d in (excluded_docs or [])]
        has_excluded = bool(excluded_list)

        stmt = text(
            f"""
            SELECT chunk_id, -(embed_text <@> to_bm25query(:q, :idx)) AS score
            FROM {part_table}
            WHERE (:has_excluded = FALSE OR doc_uuid <> ALL(CAST(:excluded AS uuid[])))
            ORDER BY embed_text <@> to_bm25query(:q, :idx) ASC
            LIMIT :k
            """
        )
        rows = (
            await session.execute(
                stmt,
                {
                    "q": clean_q,
                    "idx": bm25_idx,
                    "has_excluded": has_excluded,
                    "excluded": excluded_list,
                    "k": int(k),
                },
            )
        ).all()
        return [(str(r.chunk_id), float(r.score)) for r in rows if float(r.score) > 0.0]


class TsvectorSearch:
    """Portable PostgreSQL full-text search fallback using `ts_rank_cd` and `websearch_to_tsquery`."""

    async def search(
        self,
        session: Any,
        project_uuid: str,
        query: str,
        k: int,
        excluded_docs: list[str] | None = None,
    ) -> list[tuple[str, float]]:
        clean_q = query.strip()
        if not clean_q or k <= 0:
            return []
        p_str = str(uuid.UUID(str(project_uuid)))
        excluded_list = [str(uuid.UUID(str(d))) for d in (excluded_docs or [])]
        has_excluded = bool(excluded_list)

        stmt = text(
            """
            SELECT chunk_id,
                   ts_rank_cd(to_tsvector('english', embed_text), websearch_to_tsquery('english', :q)) AS score
            FROM chunks
            WHERE project_uuid = :p
              AND (:has_excluded = FALSE OR doc_uuid <> ALL(CAST(:excluded AS uuid[])))
              AND to_tsvector('english', embed_text) @@ websearch_to_tsquery('english', :q)
            ORDER BY score DESC
            LIMIT :k
            """
        )
        rows = (
            await session.execute(
                stmt,
                {
                    "p": p_str,
                    "q": clean_q,
                    "has_excluded": has_excluded,
                    "excluded": excluded_list,
                    "k": int(k),
                },
            )
        ).all()
        return [(str(r.chunk_id), float(r.score)) for r in rows if float(r.score) > 0.0]


def get_keyword_search() -> KeywordSearch:
    return Bm25Search() if settings.keyword_engine == "bm25" else TsvectorSearch()

