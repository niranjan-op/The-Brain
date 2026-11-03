from typing import Literal

from pydantic import model_validator
from pydantic_settings import SettingsConfigDict

from src.kc.core.dbconfig import DbSettings


class Settings(DbSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    db_pool_size: int = 5
    db_max_overflow: int = 2

    firebase_project_id: str
    firebase_auth_emulator_host: str | None = None

    # S3 API: MinIO locally, GCS (HMAC keys) now, Supabase/Oracle later.
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    s3_bucket: str
    s3_region: str = "us-east-1"

    keyword_engine: Literal["bm25", "tsvector"] = "bm25"

    # Workers
    run_local_workers: bool = False
    worker_concurrency: int = 1
    worker_lease_seconds: int = 900

    # Dispatch
    queue_dispatcher: Literal["local", "cloudrun", "none"] = "local"
    cloud_run_project: str | None = None   # None -> project from ADC
    cloud_run_region: str | None = None
    cloud_run_job_name: str | None = None

    @model_validator(mode="after")
    def _check_dispatch(self):
        if self.queue_dispatcher == "cloudrun" and not (self.cloud_run_region and self.cloud_run_job_name):
            raise ValueError("QUEUE_DISPATCHER=cloudrun needs CLOUD_RUN_REGION and CLOUD_RUN_JOB_NAME")
        if self.run_local_workers and self.queue_dispatcher == "cloudrun":
            raise ValueError("RUN_LOCAL_WORKERS must be off when QUEUE_DISPATCHER=cloudrun")
        return self


settings = Settings()  # pyright: ignore[reportCallIssue]  # fields come from env
