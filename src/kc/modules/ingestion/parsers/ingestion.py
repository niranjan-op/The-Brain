from sqlalchemy import text
from src.kc.core.db import SessionLocal


async def chunker(row):
    # row: job_id, project_uuid, user_uuid, doc_uuid, type, payload, attempts, max_attempts
    async with SessionLocal() as session:
        doc = (await session.execute(text(
            """
                SELECT filename, mime_type, size_bytes, storage_path FROM documents
                WHERE doc_uuid = :d AND deleted_at IS NULL
            """),
            {"d": row["doc_uuid"]}
        )).mappings().first()
        if doc is None:
            raise ValueError("Document missing or deleted!")
        
        await session.execute(text(
            "UPDATE documents SET status = 'processing' WHERE doc_uuid = :d"),
            {"d": row["doc_uuid"]}
        )
        await session.commit()

    # next: download doc["storage_path"], then convert by doc["mime_type"]
