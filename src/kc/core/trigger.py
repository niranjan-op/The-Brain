import asyncio
import logging

import google.auth
from google.auth.transport.requests import AuthorizedSession

from src.kc.core.config import settings


def _run_job():
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    AuthorizedSession(creds).post(f"https://run.googleapis.com/v2/{settings.cloud_run_job}:run", json={}).raise_for_status()


async def trigger_worker():
    """Start a Cloud Run Job execution. Best effort: the job row is already committed, so a missed trigger is swept up by the scheduler."""
    if not settings.cloud_run_job:
        return
    try:
        await asyncio.to_thread(_run_job)
    except Exception:
        logging.exception("could not start Cloud Run Job")
