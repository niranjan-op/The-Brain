"""Cloud Run Job entrypoint: `python -m src.kc.worker`. Drains the queue, then exits."""
import asyncio
import socket

from src.kc.core.config import settings
from src.kc.modules.ingestion.parsers.parse import reap
from src.kc.worker.runner import run_worker


async def main():
    await reap()
    host = socket.gethostname()
    await asyncio.gather(*(run_worker(f"{host}-{i}", exit_when_empty=True) for i in range(settings.worker_concurrency)))


asyncio.run(main())
