import asyncio
import json

from sqlalchemy import text

from src.kc.core.config import settings
from src.kc.core.db import SessionLocal
from src.kc.core.storage import download_file
from src.kc.modules.graph.extractor import extract_and_sync_document_graph
from src.kc.modules.ingestion.embedder import EMBED_DIMS, embed_document
from src.kc.modules.ingestion.images import describe_image, image_chunk
from src.kc.modules.ingestion.parsers.docling_parser import parse_and_chunk

EMBED_CONCURRENCY = 8


async def _embed_chunks(chunks: list[dict]) -> list[list[float]]:
    sem = asyncio.Semaphore(EMBED_CONCURRENCY)

    async def _one(c: dict) -> list[float]:
        async with sem:
            return await embed_document(c["embed_text"])

    return list(await asyncio.gather(*(_one(c) for c in chunks)))


async def chunker(row):
    # row: job_id, project_uuid, user_uuid, doc_uuid, type, payload, attempts, max_attempts
    async with SessionLocal() as session:
        doc = (
            await session.execute(
                text(
                    """
                    SELECT filename, mime_type, size_bytes, storage_path FROM documents
                    WHERE doc_uuid = :d AND deleted_at IS NULL
                    """
                ),
                {"d": row["doc_uuid"]},
            )
        ).mappings().first()
        if doc is None:
            raise ValueError("Document missing or deleted!")

        await session.execute(
            text("UPDATE documents SET status = 'processing' WHERE doc_uuid = :d"),
            {"d": row["doc_uuid"]},
        )
        await session.commit()

    data = await download_file(doc["storage_path"])
    doc_uuid_str = str(row["doc_uuid"])

    if doc["mime_type"].startswith("image/"):
        label = await describe_image(data, doc["mime_type"], doc["filename"])
        chunks = [image_chunk(doc_uuid_str, doc["filename"], label, storage_path=doc["storage_path"])]
        doc_kind = label.doc_kind
        description = label.description or "Image requires visual inspection at chat time."
        page_count = 1
    else:
        parsed = await parse_and_chunk(
            data,
            doc["filename"],
            doc["mime_type"],
            doc_uuid_str,
            storage_path=doc["storage_path"],
        )
        chunks = parsed["chunks"]
        doc_kind = parsed.get("doc_kind", "other")
        description = parsed.get("description", "")
        page_count = parsed.get("page_count", 1)

    embeddings = await _embed_chunks(chunks) if chunks else []

    # One transaction: replace this doc's chunks, then mark the doc ready (a retry never leaves duplicates).
    async with SessionLocal() as session:
        ids = {"p": row["project_uuid"], "d": row["doc_uuid"]}
        await session.execute(text("DELETE FROM chunks WHERE project_uuid = :p AND doc_uuid = :d"), ids)
        for chunk, embedding in zip(chunks, embeddings, strict=True):
            await session.execute(
                text(
                    """
                    INSERT INTO chunks (chunk_id, project_uuid, doc_uuid, ordinal, kind, heading_path,
                                        page_start, page_end, text, embed_text, text_hash,
                                        payload, embedding, embed_model, dims)
                    VALUES (:chunk_id, :p, :d, :ordinal, :kind, :heading_path,
                            :page_start, :page_end, :text, :embed_text, :text_hash,
                            CAST(:payload AS jsonb), CAST(:embedding AS vector), :embed_model, :dims)
                    """
                ),
                {
                    **ids,
                    "chunk_id": chunk["chunk_id"],
                    "ordinal": chunk["ordinal"],
                    "kind": chunk["kind"],
                    "heading_path": chunk.get("heading_path", ""),
                    "page_start": chunk.get("page_start", 1),
                    "page_end": chunk.get("page_end", 1),
                    "text": chunk["text"],
                    "embed_text": chunk["embed_text"],
                    "text_hash": chunk["text_hash"],
                    "payload": json.dumps(chunk["payload"]),
                    "embedding": str(embedding),
                    "embed_model": settings.embed_model,
                    "dims": EMBED_DIMS,
                },
            )
        await session.execute(
            text(
                """
                UPDATE documents
                SET doc_kind = :k, description = :desc, page_count = :page_count, status = 'ready', error = NULL
                WHERE doc_uuid = :d
                """
            ),
            {"k": doc_kind, "desc": description, "page_count": page_count, "d": row["doc_uuid"]},
        )
        await session.commit()

    # Extract knowledge graph nodes/edges from chunks and sync to Neo4j AuraDB
    if chunks:
        await extract_and_sync_document_graph(
            project_uuid=str(row["project_uuid"]),
            doc_uuid=doc_uuid_str,
            user_uuid=str(row["user_uuid"]) if row.get("user_uuid") else None,
            filename=doc["filename"],
            chunks=chunks,
        )
