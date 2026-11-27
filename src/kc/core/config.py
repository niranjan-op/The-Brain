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
    graph_read_backend: Literal["postgres", "aura"] = "postgres"
    query_rate_limit_per_minute: int = 10

    # Quotas & Deep Research defaults (D018, D020, D021)
    user_daily_llm_calls: int = 50
    project_default_daily_llm_calls: int = 150
    global_daily_llm_calls: int = 1000
    user_daily_uploads: int = 10
    project_default_daily_uploads: int = 25
    user_daily_web_searches: int = 15
    global_daily_web_searches: int = 150
    research_max_searches_per_run: int = 8
    research_max_steps_per_run: int = 6
    research_heartbeat_timeout_seconds: int = 60
    research_lease_seconds: int = 90
    llm_max_concurrency: int = 8

    # LLM & Local Embeddings (google-genai reads its auth from env itself; see .env.example)
    image_model: str = "gemini-3.1-flash-lite"
    embed_model: str = "BAAI/bge-base-en-v1.5"
    chat_model: str = "gemini-3.1-flash-lite"
    # Output cap for the chat agent's final answer (thinking + answer on Gemini; completion on OpenRouter).
    chat_max_output_tokens: int = 40000
    # Optional directory holding DejaVuSans*.ttf + DejaVuSansMono.ttf for Unicode PDF exports.
    export_pdf_font_dir: str | None = None
    openrouter_api_key: str | None = None
    openrouter_model: str = "nvidia/nemotron-3-ultra-550b-a55b:free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    # Neo4j AuraDB (Graph projection from Postgres source-of-truth)
    neo4j_uri: str | None = None
    neo4j_username: str | None = None
    neo4j_password: str | None = None
    neo4j_database: str = "neo4j"

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
