import asyncio
import logging

import google.auth
from google.auth.transport.requests import AuthorizedSession

from src.kc.core.config import settings


def _run_job():
    creds, adc_project = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    name = f"projects/{settings.cloud_run_project or adc_project}/locations/{settings.cloud_run_region}/jobs/{settings.cloud_run_job_name}"
    AuthorizedSession(creds).post(f"https://run.googleapis.com/v2/{name}:run", json={}).raise_for_status()


async def trigger_worker():
    """Start a Cloud Run Job execution. Best effort: the job row is already committed, so a missed trigger is swept up by the scheduler."""
    if settings.queue_dispatcher != "cloudrun":
        return
    try:
        await asyncio.to_thread(_run_job)
    except Exception:
        logging.exception("could not start Cloud Run Job")
