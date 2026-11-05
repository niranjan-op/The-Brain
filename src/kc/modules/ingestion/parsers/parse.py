from sqlalchemy import text
from src.kc.core.db import SessionLocal

async def claim(worker_id: str):
    async with SessionLocal() as session:
        row = (await session.execute(text("""
              UPDATE jobs
              SET status = 'running', locked_by = :w,
                  locked_until = now() + interval '5 minutes',
                  attempts = attempts + 1,
                  started_at = coalesce(started_at, now())
              WHERE job_id = (
                  SELECT job_id FROM jobs
                  WHERE status = 'queued' AND run_after <= now()
                  ORDER BY run_after
                  LIMIT 1
                  FOR UPDATE SKIP LOCKED
              )
              RETURNING job_id, project_uuid, user_uuid, doc_uuid, type, payload, attempts, max_attempts
          """), {"w": worker_id})).mappings().first()
        await session.commit()
        return row          # None when the queue is empty


async def complete(job_id):
    async with SessionLocal() as session:
        await session.execute(text("""
            UPDATE jobs SET status = 'succeeded', finished_at = now(),
                            locked_by = NULL, locked_until = NULL
            WHERE job_id = :j
        """), {"j": job_id})
        await session.commit()


async def _mark_docs_failed(session, rows):
    # rows: (doc_uuid, error) of jobs that just went 'dead'
    for doc_uuid, error in rows:
        await session.execute(text(
            "UPDATE documents SET status = 'failed', error = :e WHERE doc_uuid = :d"),
            {"e": error, "d": doc_uuid})


async def fail(job_id, error: str):
    """Retry with backoff while attempts remain, otherwise mark the job dead and the document failed."""
    async with SessionLocal() as session:
        row = (await session.execute(text("""
            UPDATE jobs SET
                status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'dead' END,
                run_after = now() + interval '30 seconds' * attempts,
                finished_at = CASE WHEN attempts < max_attempts THEN NULL ELSE now() END,
                locked_by = NULL, locked_until = NULL, error = :e
            WHERE job_id = :j
            RETURNING status, doc_uuid
        """), {"e": error, "j": job_id})).first()
        if row and row.status == "dead" and row.doc_uuid:
            await _mark_docs_failed(session, [(row.doc_uuid, error)])
        await session.commit()


async def reap():
    """Requeue jobs whose worker died (lease expired); jobs out of attempts go dead."""
    async with SessionLocal() as session:
        rows = (await session.execute(text("""
            UPDATE jobs SET
                status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'dead' END,
                finished_at = CASE WHEN attempts < max_attempts THEN NULL ELSE now() END,
                locked_by = NULL, locked_until = NULL, error = 'lease expired'
            WHERE status = 'running' AND locked_until < now()
            RETURNING status, doc_uuid
        """))).all()
        await _mark_docs_failed(session, [(r.doc_uuid, "lease expired") for r in rows if r.status == "dead" and r.doc_uuid])
        await session.commit()
