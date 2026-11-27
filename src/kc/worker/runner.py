import asyncio

from src.kc.modules.ingestion.parsers.ingestion import chunker
from src.kc.modules.ingestion.parsers.parse import claim, complete, fail, reap

HANDLERS = {"ingest": chunker}


async def run_worker(
    worker_id: str,
    exit_when_empty: bool = False,
    stop: asyncio.Event | None = None,
):
    """Claim and run jobs one at a time. Local dev: poll forever. Cloud Run Job: exit once the queue is empty."""
    while not (stop and stop.is_set()):
        if exit_when_empty:
            job = await claim(worker_id)
        else:
            try:
                await reap()
                job = await claim(worker_id)
            except Exception:  # noqa: BLE001
                await asyncio.sleep(3)
                continue
        if job is None:
            if exit_when_empty:
                return
            await asyncio.sleep(2)
            continue
        try:
            await HANDLERS[job["type"]](job)
            await complete(job["job_id"])
        except Exception as e:
            await fail(job["job_id"], repr(e))
