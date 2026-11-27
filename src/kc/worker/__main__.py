"""Cloud Run Job entrypoint: `python -m src.kc.worker`. Drains the queue, then exits."""
import asyncio
import logging
import signal
import socket

from src.kc.core.config import settings
from src.kc.core.db import engine
from src.kc.modules.ingestion.parsers.parse import reap
from src.kc.worker.runner import run_worker

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")


async def main():
    stop = asyncio.Event()
    try:
        asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, stop.set)
    except NotImplementedError:
        pass

    await reap()
    host = socket.gethostname()
    try:
        await asyncio.gather(
            *(
                run_worker(f"{host}-{i}", exit_when_empty=True, stop=stop)
                for i in range(settings.worker_concurrency)
            )
        )
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
