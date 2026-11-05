import asyncio

from src.kc.modules.ingestion.parsers.ingestion import chunker
from src.kc.modules.ingestion.parsers.parse import claim, complete, fail

HANDLERS = {"ingest": chunker}


async def run_worker(worker_id: str, exit_when_empty: bool = False):
    """Claim and run jobs one at a time. Local dev: poll forever. Cloud Run Job: exit once the queue is empty."""
    while True:
        job = await claim(worker_id)
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
