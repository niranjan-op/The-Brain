# Portability Guide: Cloud SQL now, Supabase / Oracle later (D026)

You write all the code; this document says what to change, where, and why, with
code to copy. Every SQL snippet marked **[verified]** was run against the local
Postgres 17.11 + pgvector 0.8.7 + pg_textsearch 1.5.1 container in a scratch
database (since dropped). Anything marked **[unverified]** was not run.

---

## 0. What I checked

| Check | Result |
|---|---|
| `alembic upgrade head` -> `downgrade base` -> `upgrade head`, empty DB, PG 17.11 | **Clean** (b00f -> c1a...07 both ways) |
| D024 columns (drop `fingerprint_hash`, add `last_login_at`) | Already done by migrations `06`/`07`. Nothing pending there. |
| BM25 index on the partitioned `chunks` table | Works. Each per-project partition gets its own bm25 index, created automatically by the trigger. **[verified]** |
| `pytest tests` | **Fails at collection**: `ModuleNotFoundError: boto3`. The venv has no dependency manifest (see 1). |
| `ruff check` | 69 findings (mostly style: `Optional[X]`, import order, `B008` on FastAPI `Depends`). Pre-existing. |
| pyright | Not installed. Not run. |
| Cloud SQL socket URL | Both drivers accept `?host=...&port=...` in the URL **[verified over TCP only]**; a real `/cloudsql/...` socket is **[unverified]**. |
| `pg_textsearch` absent (plain `pgvector/pgvector:pg17`) | **[unverified]**, I did not start a second container. Section 3 explains the guard; test it when you build the integration test. |

Things in the repo that will bite you, independent of the hosting change:

- **No `pyproject.toml` / lockfile / `.env.example`.** The Dockerfiles in section 7 cannot be built until a manifest exists.
- **`main.py` upload inserts into `documents` without `doc_hash`**, which is `NOT NULL` in the schema, so `/upload` will fail with a NOT NULL violation. Compute a sha256 of the file and pass it.
- **Job lease is 5 minutes with no heartbeat** (`parse.py:claim`). A long Docling run gets reaped by the next execution and re-run in parallel. See 8.
- `migrations/env.py` reads `os.environ["DATABASE_URL"]` directly (rule 8 says settings only via `core/config.py`).
- Stray files at the root: `test.py`, `neo_test.py`, `test_openrouter.py`, `local-dev-setup/DB_scratchpad.py` (doesn't even parse). `.env` contains Neo4j Aura credentials; that's a non-Postgres store, outside this plan.

---

## 1. Dependency manifest (do this first, everything else needs it)

Create `pyproject.toml`. API deps stay slim; Docling/torch only in the `worker` group.

```toml
[project]
name = "knowledge-cartographer"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = [
  "fastapi", "uvicorn[standard]", "python-multipart",
  "pydantic-settings",
  "sqlalchemy[asyncio]", "asyncpg", "psycopg[binary]", "alembic", "python-dotenv",
  "firebase-admin",
  "boto3",
  "google-auth", "requests",        # CloudRunJobDispatcher uses ADC + AuthorizedSession
]

[dependency-groups]
worker = ["docling"]                 # + CPU torch, see section 7
dev = ["pytest", "pytest-asyncio", "httpx", "ruff", "pyright"]
```

Run `uv sync --group dev --group worker` locally, `uv sync --no-dev` in the API image.
Check `uv pip list` in your venv against this; add anything I missed (e.g. the Gemini/Vertex SDK when you reach it).

---

## 2. Config: `src/kc/core/config.py`

Today `Settings()` requires firebase + S3 fields at import, so even Alembic would need them.
Add the new fields, and make migrations independent.

```python
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # One URL for every host. Cloud SQL: postgresql+psycopg://u:p@/db?host=/cloudsql/<project:region:instance>
    # (password URL-encoded). The socket path lives in deploy env only, never in code.
    database_url: str
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


settings = Settings()
```

For `migrations/env.py`: simplest way to satisfy rule 8 without requiring S3/Firebase vars is a
tiny DB-only settings class in the same file `config.py`:

```python
class DbSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str
```

then in `env.py` replace `os.environ[...]` / `load_dotenv()` with:

```python
from src.kc.core.config import DbSettings
config.set_main_option("sqlalchemy.url", DbSettings().database_url.replace("%", "%%"))
```

Caveat: importing `src.kc.core.config` also executes `settings = Settings()` at the bottom. Either
move that line behind a `get_settings()` (`@lru_cache`) or keep `DbSettings` in its own small module
(e.g. `core/dbconfig.py`). The second is less work.

Add `validators` only where a wrong combination is a footgun, e.g. `queue_dispatcher="cloudrun"`
requires `cloud_run_region` and `cloud_run_job_name`:

```python
from pydantic import model_validator

    @model_validator(mode="after")
    def _cloudrun_needs_job(self):
        if self.queue_dispatcher == "cloudrun" and not (self.cloud_run_region and self.cloud_run_job_name):
            raise ValueError("QUEUE_DISPATCHER=cloudrun needs CLOUD_RUN_REGION and CLOUD_RUN_JOB_NAME")
        return self
```

### `.env.example` (create it; no secrets)

```dotenv
# Postgres. Local docker is on 5433 (Windows Postgres owns 5432).
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@127.0.0.1:5433/appdb
POSTGRES_DB=appdb
POSTGRES_USER=
POSTGRES_PASSWORD=
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=2
# Cloud Run (deploy env only): postgresql+psycopg://USER:ENCODED_PW@/appdb?host=/cloudsql/PROJECT:REGION:INSTANCE

KEYWORD_ENGINE=bm25            # bm25 | tsvector

FIREBASE_PROJECT_ID=demo-local-app
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

S3_ENDPOINT=http://127.0.0.1:9000
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=
S3_REGION=us-east-1

RUN_LOCAL_WORKERS=true         # never true in production
WORKER_CONCURRENCY=1
WORKER_LEASE_SECONDS=900

QUEUE_DISPATCHER=local         # local | cloudrun | none
CLOUD_RUN_PROJECT=
CLOUD_RUN_REGION=
CLOUD_RUN_JOB_NAME=
```

(Do not add LLM / SerpApi keys. BYOK stays request-scoped.)

### `src/kc/core/db.py`

Same code, plus pool sizing (Cloud SQL has a connection cap, and `worker_concurrency` x pool adds up):

```python
engine = create_async_engine(
    settings.database_url.replace("+psycopg", "+asyncpg"),
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
)
```

`asyncpg` and `psycopg` both understand `?host=/cloudsql/...`, so no code change is needed for the socket.
Do **not** use the Cloud SQL Python Connector or IAM DB auth (rule 1).

---

## 3. Migrations: make `pg_textsearch` optional

Two migrations assume the extension. Edit both **in place** (nothing is deployed, revision IDs stay),
or add a new guard migration if you prefer not to touch history. In-place is my recommendation.

Guard helper (put it in each file, or in a shared `migrations/_ext.py`):

```python
def has_textsearch(conn) -> bool:
    return conn.exec_driver_sql(
        "SELECT 1 FROM pg_available_extensions WHERE name = 'pg_textsearch'"
    ).scalar() is not None
```

### `b00f24e4b40a_enable_extensions.py`

```python
def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    if has_textsearch(op.get_bind()):
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_textsearch")
```

`downgrade` already uses `DROP EXTENSION IF EXISTS`, so it is safe as is.

On Cloud SQL you must first set the flag `cloudsql.enable_pg_textsearch=on` on the instance
(deploy step, not code), otherwise `pg_available_extensions` won't list it and the guard skips it.
Remember to run `CREATE EXTENSION` there after enabling the flag, or re-run the migration.

### `c1a000000002_documents_graph_chunks.py`

The bm25 index line (`CREATE INDEX chunks_embed_text_bm25 ... USING bm25 ...`) is in a big `op.execute("""...""")`.
Remove just that line from the string and add after it:

```python
    if has_textsearch(op.get_bind()):
        op.execute("""
            CREATE INDEX chunks_embed_text_bm25 ON chunks USING bm25 (embed_text)
            WITH (text_config = 'english')
        """)
```

The `create_project_partition()` trigger stays plain PL/pgSQL, untouched. **[verified]** that a bm25 index
created on the partitioned parent is materialised per partition (index names look like
`chunks_<uuid>_embed_text_idx`) for partitions created later by the trigger.

### New migration `c1a000000008_chunks_fts_gin.py` (always runs, any Postgres)

```python
"""GIN index for the tsvector keyword fallback"""
from alembic import op

revision = "c1a000000008"
down_revision = "c1a000000007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE INDEX chunks_embed_text_fts ON chunks
        USING gin (to_tsvector('english', embed_text))
    """)


def downgrade() -> None:
    op.execute("DROP INDEX chunks_embed_text_fts")
```

**[verified]** that GIN can be created on the partitioned parent. Your queries must use the *exact*
expression `to_tsvector('english', embed_text)` or Postgres won't use the index.

Confirm the real head before you set `down_revision`: run `alembic heads`.

---

## 4. Keyword search interface

New package `src/kc/modules/search/` (nothing like it exists today).

`keyword.py`:

```python
from typing import Protocol

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.kc.core.config import settings


class KeywordSearch(Protocol):
    async def search(self, session: AsyncSession, project_uuid: str, query: str, k: int) -> list[tuple[str, float]]:
        """Return (chunk_id, score) best first; higher score = better for BOTH engines."""


class Bm25Search:
    async def search(self, session, project_uuid, query, k):
        # pg_textsearch: smaller (more negative) <@> value = better, non-matches score 0.
        rows = (await session.execute(text("""
            SELECT chunk_id, -(embed_text <@> to_bm25query(:q)) AS score
            FROM chunks
            WHERE project_uuid = :p
            ORDER BY embed_text <@> to_bm25query(:q)
            LIMIT :k
        """), {"q": query, "p": project_uuid, "k": k})).all()
        return [(r.chunk_id, r.score) for r in rows if r.score > 0]   # drop zero-score non-matches


class TsvectorSearch:
    async def search(self, session, project_uuid, query, k):
        rows = (await session.execute(text("""
            SELECT chunk_id,
                   ts_rank_cd(to_tsvector('english', embed_text), websearch_to_tsquery('english', :q)) AS score
            FROM chunks
            WHERE project_uuid = :p
              AND to_tsvector('english', embed_text) @@ websearch_to_tsquery('english', :q)
            ORDER BY score DESC
            LIMIT :k
        """), {"q": query, "p": project_uuid, "k": k})).all()
        return [(r.chunk_id, r.score) for r in rows]


def get_keyword_search() -> KeywordSearch:
    return Bm25Search() if settings.keyword_engine == "bm25" else TsvectorSearch()
```

Facts behind this, from the local run **[verified]**:

- `embed_text <@> to_bm25query('bm25 ranking')` returned `-1.69` for the matching chunk and `0` for non-matches. So bm25 sorts ascending, and you must filter out zeros. I negate it so both engines return "higher is better".
- `to_bm25query(:q)` without an index name worked on the partitioned table. Passing `project_uuid` as a bound parameter (not a subquery) lets the planner prune to one partition at plan time.
- On a 3-row table the planner did a seq scan rather than the bm25 index. That is normal for tiny tables; re-check with `EXPLAIN` on real volume.
- Bound `:q` text is user input; `websearch_to_tsquery` is safe for arbitrary text (never throws on syntax). bm25's query text is also passed as a parameter, never interpolated.

Semantics differ (BM25 scores are corpus-relative; `ts_rank_cd` is not), which is why fusion should be rank-based, not score-based:

`hybrid.py` (reciprocal rank fusion, the minimum needed to test "hybrid"):

```python
async def hybrid_search(session, project_uuid, query, query_embedding, k=10, rrf_k=60):
    vec_rows = (await session.execute(text("""
        SELECT chunk_id FROM chunks
        WHERE project_uuid = :p
        ORDER BY embedding <=> CAST(:e AS vector)
        LIMIT :k
    """), {"p": project_uuid, "e": str(query_embedding), "k": k * 3})).scalars().all()
    kw_rows = [cid for cid, _ in await get_keyword_search().search(session, project_uuid, query, k * 3)]

    scores: dict[str, float] = {}
    for ranked in (vec_rows, kw_rows):
        for rank, cid in enumerate(ranked):
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (rrf_k + rank + 1)
    return sorted(scores, key=scores.get, reverse=True)[:k]
```

Vector search itself (pgvector HNSW, `<=>`) is unchanged.

---

## 5. Dispatcher: replace `src/kc/core/trigger.py`

Create `src/kc/core/dispatch.py` and delete `trigger.py`.

```python
import asyncio
import logging
from typing import Protocol

import google.auth
from google.auth.transport.requests import AuthorizedSession

from src.kc.core.config import settings


class Dispatcher(Protocol):
    async def dispatch(self) -> None: ...


class NoopDispatcher:
    """Relies on Cloud Scheduler (or polling) to pick jobs up."""
    async def dispatch(self) -> None:
        return None


class LocalDispatcher:
    """Dev: the in-process polling loops (RUN_LOCAL_WORKERS) already claim jobs, nothing to start."""
    async def dispatch(self) -> None:
        return None


class CloudRunJobDispatcher:
    """Best effort. The job row is already committed, so a missed trigger is swept up by the scheduler."""

    def _run(self) -> None:
        creds, adc_project = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        project = settings.cloud_run_project or adc_project
        url = (f"https://run.googleapis.com/v2/projects/{project}/locations/{settings.cloud_run_region}"
               f"/jobs/{settings.cloud_run_job_name}:run")
        AuthorizedSession(creds).post(url, json={}, timeout=10).raise_for_status()

    async def dispatch(self) -> None:
        try:
            await asyncio.to_thread(self._run)
        except Exception:
            logging.exception("could not start Cloud Run Job")


def get_dispatcher() -> Dispatcher:
    return {"local": LocalDispatcher, "cloudrun": CloudRunJobDispatcher, "none": NoopDispatcher}[settings.queue_dispatcher]()
```

In `main.py`: replace `from src.kc.core.trigger import trigger_worker` with
`from src.kc.core.dispatch import get_dispatcher`, create `dispatcher = get_dispatcher()` once at module level, and at the end of `/upload`
use `await dispatcher.dispatch()` where `trigger_worker()` is today (keep it *after* the job-row commit).

Notes:
- The Cloud Run service's runtime service account needs `run.jobs.run` (role "Cloud Run Invoker" on the job, or `roles/run.developer`). Cloud Scheduler needs the same. Deploy config, not code.
- Overlapping executions are safe: `claim()` uses `FOR UPDATE SKIP LOCKED`.
- Rule 7 is already satisfied in `main.py` lifespan: loops only start when `RUN_LOCAL_WORKERS`. Keep it. Add a startup guard so a misconfig fails loudly:

```python
if settings.run_local_workers and settings.queue_dispatcher == "cloudrun":
    raise RuntimeError("RUN_LOCAL_WORKERS and QUEUE_DISPATCHER=cloudrun are mutually exclusive")
```

---

## 6. Storage: small Protocol around the existing S3 client

`core/storage.py` is already S3-API (MinIO now, GCS HMAC, Supabase/Oracle/S3 later). I'd not write a GCS-native
class. Just add the missing `download` the worker needs next (`ingestion.py` stops at "download storage_path"):

```python
from typing import Protocol


class Storage(Protocol):
    async def put(self, file: UploadFile, path: str) -> None: ...
    async def get(self, path: str, dest: str) -> None: ...


class S3Storage:
    async def put(self, file, path):
        await asyncio.to_thread(s3.upload_fileobj, file.file, settings.s3_bucket, path,
                                ExtraArgs={"ContentType": file.content_type})

    async def get(self, path, dest):
        await asyncio.to_thread(s3.download_file, settings.s3_bucket, path, dest)


storage: Storage = S3Storage()
```

Keep `upload_file()` as a thin wrapper (or switch `main.py` to `storage.put`). On GCS, enable HMAC keys for the service
account and use endpoint `https://storage.googleapis.com`; those go in env only, never committed.
**GCS caveat:** its S3 interop doesn't support every S3 feature, so keep to plain get/put and test against it before relying on anything fancier. **[unverified]**

---

## 7. Two Dockerfiles

`docker/api.Dockerfile` (slim, reads `$PORT`):

```dockerfile
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
COPY main.py alembic.ini ./
COPY migrations ./migrations
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
```

`docker/worker.Dockerfile` (Docling + models baked in, no port; Jobs don't listen):

```dockerfile
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
# CPU-only torch: set the index in pyproject ([tool.uv.sources]) or install it first here.
RUN uv sync --frozen --no-dev --group worker --no-install-project
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 HF_HOME=/models
RUN python -c "from docling.utils.model_downloader import download_models; download_models()"
COPY src ./src
CMD ["python", "-m", "src.kc.worker"]
```

Notes:
- The exact Docling model-download entry point has changed between versions (you have 2.137); check `docling --help` / the docs for your version rather than trusting the line above. **[unverified]**
- `python -m src.kc.worker` runs `asyncio.run(main())` at import time. Fine for `-m`, but wrap it in `if __name__ == "__main__":` so tests can import the module.
- Add a `.dockerignore` (`.venv`, `DUMP`, `reference_code`, `.env`, `*.pdf`, `*.xlsx`, `__pycache__`). Without it you will ship `.env` (with credentials) into the image.
- Migrations run from the **API image** (it contains alembic + `migrations/`): in prod use a one-off command/Job with the same `DATABASE_URL`, not on API startup.
- Your Docker Desktop crashes under memory pressure (see memory note); a torch+docling worker build may not survive locally. Building the worker image in CI is more reliable. Building anywhere on GCP is a deploy action, so I haven't suggested running it.
- Cloud Run Job settings worth setting at deploy time (config, not code): task timeout above your longest ingest, `maxRetries=0` (the queue handles retries), parallelism 1 initially.

---

## 8. Job lease

`claim()` hardcodes `interval '5 minutes'` and nothing renews it. Minimum fix, config-driven:

```python
# parse.py claim(): use a bound parameter instead of the literal
locked_until = now() + make_interval(secs => :lease)
# ...and pass {"w": worker_id, "lease": settings.worker_lease_seconds}
```

Set `WORKER_LEASE_SECONDS` above your slowest conversion plus margin (the default I put in config is 15 min).
A heartbeat that extends `locked_until` every ~60 s is the robust fix; skip it until you see real durations.

Also in `runner.py` / `worker/__main__.py`: `except Exception` on a failed job is intentional (ruff `BLE001` will complain; add `# noqa: BLE001`).

---

## 9. In-memory state (rule 6)

Rate limiter, LLM concurrency limiter and deep-research leases do not exist yet. Don't create interfaces now.
When you write each one, make it a class with 2-3 methods (e.g. `RateLimiter.allow(user_uuid) -> bool`) constructed in one place, so a Postgres-backed twin can replace it later.
Remember: this is only correct while Cloud Run `max-instances=1`; if that ever changes, these need a shared store.

---

## 10. Tests

Layout: `tests/unit/`, `tests/integration/`. Add `pytest-asyncio` (`asyncio_mode = "auto"` in `pyproject.toml`).

**Unit**
- `test_config.py`: `QUEUE_DISPATCHER=cloudrun` without region/job name raises; defaults are `bm25` / `local`.
- `test_dispatch.py`: `get_dispatcher()` returns the right class per setting (monkeypatch `settings`); `CloudRunJobDispatcher` builds the expected URL and swallows errors (mock `google.auth.default` and `AuthorizedSession`).
- `test_keyword.py`: `get_keyword_search()` returns the right class per `KEYWORD_ENGINE`.
- Existing `test_upload_validation.py` imports `main`, which builds `Settings()` and initialises Firebase at import. Set env vars in `tests/conftest.py` before the import, or the tests depend on your `.env`.

**Integration** (needs the compose Postgres; read `TEST_DATABASE_URL`)

Fixture: create a throwaway database, run `alembic upgrade head` against it, yield a session, drop it. Then:

```python
async def test_hybrid_tsvector(session, seeded_project):
    settings.keyword_engine = "tsvector"
    hits = await hybrid_search(session, seeded_project, "bm25 ranking", EMB, k=3)
    assert hits[0] == "c1"

async def test_hybrid_bm25(session, seeded_project):
    pytest.importorskip  # or: skip if pg_textsearch not in pg_extension
    settings.keyword_engine = "bm25"
    hits = await hybrid_search(session, seeded_project, "bm25 ranking", EMB, k=3)
    assert hits[0] == "c1"

async def test_bm25_index_on_partition(session, seeded_project):
    n = (await session.execute(text(
        "SELECT count(*) FROM pg_indexes WHERE indexdef LIKE '%bm25%' AND tablename LIKE 'chunks\\_%'"))).scalar_one()
    assert n >= 1
```

Seed with: a user, a project (the trigger creates the partition), a document **with `doc_hash`**, and three chunks as in the scratch run (needs a 768-dim `embedding`).
Also run the whole suite once against plain `pgvector/pgvector:pg17` (no pg_textsearch) to prove the guarded migrations apply and tsvector works there. **[unverified]**

---

## 11. Suggested order (one commit each; ruff + pyright + pytest first)

0. Baseline commit of your untracked `src/`, `main.py`, migrations `04`-`07`, `tests/` (leave out `DUMP/`, `reference_code/`, `.xlsx`, `.pdf`, scratch scripts).
1. `pyproject.toml`, ruff/pyright config, `.env.example`, `.dockerignore`. Fix the 69 ruff findings or configure them.
2. Config (section 2) + `db.py` pool + `env.py` via settings.
3. Guarded migrations + `c1a...08`; rerun `alembic downgrade base && upgrade head`.
4. `modules/search/` + unit tests.
5. `core/dispatch.py` + tests + `main.py` wiring; delete `trigger.py`.
6. `Storage` protocol + `get`.
7. Lease config.
8. Dockerfiles.
9. Integration tests (both engines, both Postgres images).

## 12. Post-trial move, what stays untouched

- **Supabase:** change `DATABASE_URL`, `S3_*`, `KEYWORD_ENGINE=tsvector` (pg_textsearch likely unavailable there; the migration guard skips it), `QUEUE_DISPATCHER=none`, and run the worker on whatever scheduler you have (it is just `python -m src.kc.worker`). Use Supabase's pooled/direct URL appropriately: asyncpg and transaction-pooler prepared statements conflict, so use the direct or session-mode URL, or `statement_cache_size=0`. **[unverified]**
- **Oracle ARM VM:** API + Postgres + worker via compose. `postgres.Dockerfile` pins the amd64 pg_textsearch zip; switch to the arm64 asset or use `KEYWORD_ENGINE=tsvector`. Use `QUEUE_DISPATCHER=local` with `RUN_LOCAL_WORKERS=true` in a separate worker container, or `none` with cron.
