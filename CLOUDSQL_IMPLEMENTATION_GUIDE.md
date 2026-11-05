# Going Cloud SQL + Cloud Run: what changes from the VM design

Companion to `PORTABILITY_GUIDE.md` (do that guide's steps 1-9 first; this one builds on it).
You write the code. I have **not** run any `gcloud` command, created any GCP resource, or connected to Cloud SQL.
Every `gcloud` block below is for you to run later, after you've reviewed it.

Legend: **[doc]** = confirmed in Google's docs via web search; **[local]** = I ran it on your local Postgres;
**[unverified]** = from memory or reasoning, check before relying on it.

---

## 1. The honest summary

Your repo contains **no VM-specific code**: no nginx/systemd/startup scripts, no localhost literals in `src/` or `main.py`
(only `.env` and `docker-compose.yml`, which are local-dev only). So "moving from VM to Cloud SQL + Cloud Run" is mostly
**deploy configuration, not code**. The code changes are small and are about how a container behaves on Cloud Run:

| VM habit | Cloud Run reality | Code impact |
|---|---|---|
| `localhost:5432`, always-open connections | Unix socket `/cloudsql/<conn-name>`; instance can restart | None in code (URL only). Pool sizing matters (section 3). |
| Fixed port | Listens on `$PORT` | Dockerfile `CMD` (guide 1, section 7) |
| Process runs forever, you SSH in | Container gets `SIGTERM`, ~10 s to exit; Jobs run to completion | Worker shutdown handling (section 5) |
| Key files on disk | No files; identity comes from a service account (ADC) | Firebase/Vertex/Run API already use ADC. Don't ship key files. |
| Disk is real | `/tmp` and the whole filesystem are **in memory** | Keep temp files small, delete after use (section 6) |
| Client IP = socket peer | Behind Google's proxy; real IP in `X-Forwarded-For` | uvicorn `--proxy-headers` (section 4) |
| `journalctl` | stdout/stderr -> Cloud Logging | Configure logging (section 4) |
| Run migrations by hand on the box | No box | Auth Proxy from your laptop, or a one-off Job (section 7) |

---

## 2. Cloud SQL instance (reference for when you create it)

What the app needs from the instance:

1. **PostgreSQL 17** (pg_textsearch requires 17+) **[doc]**.
2. Flag `cloudsql.enable_pg_textsearch=on` (adds it to `shared_preload_libraries`, so it restarts the instance), then
   `CREATE EXTENSION pg_textsearch;` **[doc]**. Your guarded migration (guide 1, section 3) does the `CREATE EXTENSION`
   automatically *if* the flag is already on when migrations run. So: set the flag first, migrate second.
3. `CREATE EXTENSION vector` works on Cloud SQL **[unverified: version offered may be older than your local 0.8.7; HNSW needs >= 0.5]**.
4. One database user for both migrations and the app (see the partition-trigger gotcha below).

```bash
# FOR YOU TO RUN LATER. Check tier/edition against current pricing and quotas first.
gcloud sql instances create kc-pg \
  --database-version=POSTGRES_17 --edition=ENTERPRISE \
  --tier=db-custom-1-3840 --region=REGION \
  --database-flags=cloudsql.enable_pg_textsearch=on \
  --backup-start-time=03:00 --deletion-protection
gcloud sql databases create appdb --instance=kc-pg
gcloud sql users create kc_app --instance=kc-pg --password='...'     # or set via console
```

Notes:
- **Trial credit tip:** a running instance burns credit 24/7. When idle you can stop it
  (`gcloud sql instances patch kc-pg --activation-policy=NEVER`); start with `ALWAYS`.
- No VPC or private IP is needed: Cloud Run's built-in Cloud SQL connection tunnels over the instance's connection name
  (your D026 decision). Leave "authorized networks" empty so the public IP accepts nothing directly.
- Turn on automated backups before you put real data in. Your exit plan (section 9) depends on being able to dump.

### Gotcha: partition trigger privileges

`create_project_partition()` runs `CREATE TABLE ... PARTITION OF chunks` as whoever inserts into `projects`.
If migrations run as user A (table owner) and the API connects as user B, that `CREATE TABLE` can fail
(Postgres 15+ no longer lets ordinary users create in `public`). Two fixes, pick one:
- **Simplest (recommended):** use the same DB user for migrations and the app.
- Or add `SECURITY DEFINER` to the function and `SET search_path = public` in a migration. More moving parts.

Also: `CREATE EXTENSION` needs a privileged role. On Cloud SQL the default `postgres` user (and users granted
`cloudsqlsuperuser`) can do it; a plain app user cannot. Run migrations as such a user, or create the extensions once by hand
(`CREATE EXTENSION vector; CREATE EXTENSION pg_textsearch;`) and let the migrations' `IF NOT EXISTS` no-op.

---

## 3. The database URL (the one thing that must be exactly right)

Application code stays as is: `settings.database_url` is the only input (rule 1). In production the value is:

```
postgresql+psycopg://kc_app:ENCODED_PASSWORD@/appdb?host=/cloudsql/PROJECT:REGION:INSTANCE
```

- The `/cloudsql/<instance-connection-name>` socket directory is created when the service/job is deployed with the instance
  attached **[doc]**.
- `db.py` rewrites `+psycopg` to `+asyncpg`; asyncpg accepts the same `host=` directory form **[local: tested `host=`+`port=` over TCP only, not a real socket]**.
- URL-encode the password: `python -c "from urllib.parse import quote_plus; print(quote_plus('p@ss/word'))"`. Alembic's
  `env.py` already escapes `%` for configparser.
- If SQLAlchemy chokes on the colons in the path, URL-encode them: `host=%2Fcloudsql%2FPROJECT%3AREGION%3AINSTANCE`. **[unverified]**
  Smoke-test this on your first deploy with a trivial `select 1` before debugging anything else.

### Connection budget (needs a small code change in `db.py`)

Cloud SQL has a hard `max_connections` (small on small tiers). With max 1 API instance:

```
API:    DB_POOL_SIZE(5) + DB_MAX_OVERFLOW(2)            = 7
Worker: WORKER_CONCURRENCY x pool, per overlapping execution
```

Executions overlap (upload trigger + scheduler tick), so give the **worker** a tiny pool via its own env:

```python
# core/db.py (already shown in guide 1) reads settings.db_pool_size / db_max_overflow
# Cloud Run Job env:  DB_POOL_SIZE=2  DB_MAX_OVERFLOW=0  WORKER_CONCURRENCY=1
```

Check `SHOW max_connections;` on your tier and keep `7 + (2 x simultaneous job executions) + you in psql` below it.
Leave `pool_pre_ping=True` (already there): it transparently replaces connections after a Cloud SQL maintenance restart.

---

## 4. API service: code changes

### 4.1 Real `$PORT`, proxy headers, no reload (Dockerfile `CMD`)

```dockerfile
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]
```

`--forwarded-allow-ips='*'` is fine here because Cloud Run is the only thing that can reach the container.
Without it, your future per-IP rate limiter would see only Google's proxy IP.

### 4.2 Logging to stdout

Cloud Run ships stdout/stderr to Cloud Logging. Unconfigured `logging.info(...)` calls from your own code are dropped
(root logger is WARNING). Add once at the top of `main.py` and `worker/__main__.py`:

```python
import logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
```

(`logging.exception` in the dispatcher already works either way.) Never log `DATABASE_URL`, tokens, or BYOK keys.

### 4.3 Health endpoint (optional but cheap)

```python
@app.get("/healthz")
async def healthz():
    return {"ok": True}          # no DB call: a Cloud SQL blip must not restart your container
```

Cloud Run's default startup check (TCP on `$PORT`) works without it; add this only if you configure an HTTP probe.

### 4.4 Close the pool on shutdown

In the existing `lifespan` in `main.py`, after the `yield` block:

```python
from src.kc.core.db import engine
...
    yield
    for t in tasks: t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await engine.dispose()
```

### 4.5 Startup guards (fail loudly on misconfig)

```python
if settings.run_local_workers and settings.queue_dispatcher == "cloudrun":
    raise RuntimeError("RUN_LOCAL_WORKERS must be off when QUEUE_DISPATCHER=cloudrun")
```

In the deployed service `RUN_LOCAL_WORKERS` must be unset/false (rule 7).

### 4.6 Firebase

`firebase_admin.initialize_app(options={"projectId": ...})` already relies on Application Default Credentials and needs no key
file. `verify_id_token` only needs the project id and outbound internet to fetch Google's public certs, both available on Cloud
Run. **No code change.** Do not set `FIREBASE_AUTH_EMULATOR_HOST` in production env (the code only sets it when present).

### 4.7 Things that can bite later (no change today)

- Cloud Run HTTP/1 request limit is 32 MiB. Your uploads are capped at 5 MB, fine.
- Request timeout defaults to 5 min (max 60 min). Upload only writes to storage and enqueues, so it's fine.
- CORS: when the frontend exists, add FastAPI `CORSMiddleware` with an explicit origin list from config (new setting, add to `.env.example`).
- `max-instances=1` makes your in-memory limiters correct (rule 6); also set `--concurrency` deliberately (default 80) given the small DB pool: requests wait for pool connections, they don't fail.

---

## 5. Worker Job: code changes

### 5.1 What Cloud Run Jobs do

An execution starts your container, runs to exit, and is marked failed if the exit code is non-zero or the task timeout hits.
On stop/timeout the process gets `SIGTERM` and a short grace period. Your existing design (lease + `reap()`) already tolerates
being killed: a killed job's lease expires and the next execution requeues it. So SIGTERM handling is an optimisation, not a necessity.

### 5.2 `worker/__main__.py` target shape

```python
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
    except NotImplementedError:      # Windows dev: no signal handlers on the default loop
        pass

    await reap()
    host = socket.gethostname()
    workers = [asyncio.create_task(run_worker(f"{host}-{i}", exit_when_empty=True, stop=stop))
               for i in range(settings.worker_concurrency)]
    await asyncio.gather(*workers)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
```

`runner.py` change: accept `stop: asyncio.Event | None = None` and check `stop.is_set()` before each `claim()` so a terminating
container stops taking new jobs. (A job already running is covered by the lease.)

```python
async def run_worker(worker_id, exit_when_empty=False, stop=None):
    while not (stop and stop.is_set()):
        job = await claim(worker_id)
        ...
```

### 5.3 Exit code semantics

- Queue empty -> exit 0.
- Individual job failure -> `fail()` records it and the loop continues; the **execution still exits 0**. That's what you want:
  with `--max-retries=0` Cloud Run won't blindly re-run, and the queue's own `attempts/max_attempts` handles retries.
- Crash on startup (bad `DATABASE_URL`) -> non-zero exit, visible as a failed execution. Good.

### 5.4 Lease vs task timeout

`WORKER_LEASE_SECONDS` (guide 1, section 8) must exceed your slowest Docling conversion; the Job `--task-timeout` must exceed
the lease times the jobs per execution you expect. Otherwise a long file is "reaped" while still running and processed twice.

---

## 6. Storage, temp files, memory

- Files stay in GCS through the S3 API (HMAC keys). Put the keys in **Secret Manager** and inject as env vars
  (`--set-secrets`), never in the image or `.env.example`.
- Cloud Run's filesystem is in-memory: a 5 MB download to `/tmp` costs 5 MB of RAM until deleted. In the worker use
  `tempfile.TemporaryDirectory()` so files vanish after each job:

```python
import tempfile, pathlib
async def chunker(row):
    ...
    with tempfile.TemporaryDirectory() as d:
        local = pathlib.Path(d) / doc["filename"]      # sanitize: use doc_uuid + ext, not user filename
        await storage.get(doc["storage_path"], str(local))
        ...convert...
```

- Docling + torch needs real memory. Start the Job at `--memory=8Gi --cpu=4`, watch actual usage, then shrink.
- LLM calls: Gemini via Vertex AI uses the Job/service account (ADC). Grant it `roles/aiplatform.user`. No API keys stored (BYOK stays request-scoped).

---

## 7. Running migrations against Cloud SQL

Pick one. For the trial I'd use (a).

**(a) Cloud SQL Auth Proxy from your laptop**

```bash
# terminal 1 (needs gcloud auth application-default login once)
cloud-sql-proxy PROJECT:REGION:INSTANCE --port 5434
# terminal 2
DATABASE_URL='postgresql+psycopg://kc_app:ENCODED@127.0.0.1:5434/appdb' alembic upgrade head
```

The proxy is a dev/ops tool only. It never appears in application code. **[unverified: exact flags for your proxy version]**

**(b) One-off Cloud Run Job using the API image** with command `alembic upgrade head` and the same Cloud SQL attachment.
More setup, runs inside GCP, good once you have CI.

Never run migrations on API startup (two instances racing, and a bad migration would crash-loop the service).
Order for first deploy: create instance -> set flag -> create DB/user -> run migrations -> deploy service/job.

Verify after migrating (via the proxy + psql):

```sql
SELECT extname, extversion FROM pg_extension;                      -- vector, pg_textsearch
SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%bm25%';     -- chunks_embed_text_bm25 (+ per-partition after projects exist)
```

If `pg_textsearch` is missing there, the flag wasn't on when the guard ran: set it, then `CREATE EXTENSION pg_textsearch;`
and create the bm25 index by hand (or `alembic downgrade c1a000000001 && alembic upgrade head` on an empty DB).

---

## 8. Deploy configuration (reference; none of it run by me)

Service accounts (principle of least privilege):

| Account | Roles |
|---|---|
| `kc-api` | `roles/cloudsql.client`; run-job-start permission on the worker Job (`roles/run.invoker` on that Job, or `roles/run.developer`) **[unverified: confirm the exact role that grants `run.jobs.run`]**; `roles/secretmanager.secretAccessor` for its secrets; `roles/aiplatform.user` |
| `kc-worker` | `roles/cloudsql.client`, `secretAccessor`, `aiplatform.user` |
| `kc-scheduler` | permission to run the Job only |

```bash
# API service: one instance, CPU always allocated, Cloud SQL attached
gcloud run deploy kc-api --image REGION-docker.pkg.dev/PROJECT/kc/api:TAG --region REGION \
  --service-account kc-api@PROJECT.iam.gserviceaccount.com \
  --max-instances=1 --no-cpu-throttling \
  --add-cloudsql-instances=PROJECT:REGION:INSTANCE \
  --set-secrets=DATABASE_URL=kc-database-url:latest,S3_ACCESS_KEY=kc-s3-key:latest,S3_SECRET_KEY=kc-s3-secret:latest \
  --set-env-vars=FIREBASE_PROJECT_ID=...,S3_ENDPOINT=https://storage.googleapis.com,S3_BUCKET=...,KEYWORD_ENGINE=bm25,QUEUE_DISPATCHER=cloudrun,CLOUD_RUN_REGION=REGION,CLOUD_RUN_JOB_NAME=kc-worker,DB_POOL_SIZE=5

# Worker Job: same codebase, other image; flag for Jobs is --set-cloudsql-instances
gcloud run jobs deploy kc-worker --image REGION-docker.pkg.dev/PROJECT/kc/worker:TAG --region REGION \
  --service-account kc-worker@PROJECT.iam.gserviceaccount.com \
  --set-cloudsql-instances=PROJECT:REGION:INSTANCE \
  --max-retries=0 --task-timeout=3600 --memory=8Gi --cpu=4 --parallelism=1 \
  --set-secrets=DATABASE_URL=kc-database-url:latest,... \
  --set-env-vars=DB_POOL_SIZE=2,DB_MAX_OVERFLOW=0,WORKER_CONCURRENCY=1,KEYWORD_ENGINE=bm25

# Safety-net tick every 5 minutes
gcloud scheduler jobs create http kc-worker-tick --location=REGION --schedule="*/5 * * * *" \
  --uri="https://run.googleapis.com/v2/projects/PROJECT/locations/REGION/jobs/kc-worker:run" \
  --http-method=POST --oauth-service-account-email=kc-scheduler@PROJECT.iam.gserviceaccount.com
```

`--add-cloudsql-instances` for services is **[doc]**; the Jobs flag name `--set-cloudsql-instances` is **[unverified]**
(web search didn't return the Jobs reference), check `gcloud run jobs deploy --help`.
Do **not** set `RUN_LOCAL_WORKERS` on either. `QUEUE_DISPATCHER=cloudrun` only on the API.
Cost: each scheduler tick that finds an empty queue is a short execution; if that bothers you, lengthen the interval.

---

## 9. Code-level checklist: "is this completely Cloud SQL ready?"

Required code changes (small):
- [ ] `DATABASE_URL` is the only DB input (already true); `config.py` additions from guide 1.
- [ ] `db.py` pool sizing from settings (section 3).
- [ ] `main.py`: logging, `engine.dispose()` in lifespan, startup guard, dispatcher swap (guide 1 section 5).
- [ ] `worker/__main__.py`: `if __name__ == "__main__"`, SIGTERM stop event, `engine.dispose()` (section 5).
- [ ] `runner.py`: `stop` event.
- [ ] Temp files via `TemporaryDirectory` once ingestion downloads files (section 6).
- [ ] Dockerfile CMD with `$PORT` and proxy headers; `.dockerignore` excluding `.env`.
- [ ] Guarded migrations + same DB user for migrate/app (section 2).
- [ ] `/upload` sets `doc_hash` (currently a NOT NULL violation).

Required non-code (deploy) work: instance + flag, secrets, service accounts, images, Job, Scheduler, run migrations via proxy.

Not needed because of Cloud SQL: Cloud SQL Python Connector, IAM DB auth, VPC connector, private IP, PgBouncer. Don't add them (rule 1).

---

## 10. Leaving Cloud SQL later (so you know the move works)

The app code won't change; the data must move.

```bash
# on the target (Supabase or Oracle Postgres): schema from migrations, not from the dump
DATABASE_URL=<target> alembic upgrade head          # with KEYWORD_ENGINE=tsvector if no pg_textsearch
# from Cloud SQL via the proxy: data only, skip alembic_version
pg_dump -h 127.0.0.1 -p 5434 -U kc_app -d appdb --data-only --no-owner --no-privileges \
  -T alembic_version -Fc -f kc.dump
pg_restore -d "<target url>" --data-only kc.dump
```

Why data-only: a full dump would contain the bm25 index/extension, which a host without pg_textsearch can't restore.
Do **not** use `--disable-triggers`: restoring `projects` rows must fire `projects_create_partition` so the per-project
`chunks` partitions exist before chunk rows load. **[unverified: not run; test the restore on a copy before the trial ends.]**
Dump early and rehearse this once at day ~30, not on day 89.

---

## Sources

- [Cloud SQL: pg_textsearch (Google docs)](https://docs.cloud.google.com/sql/docs/postgres/pg-textsearch): PG 17+, `cloudsql.enable_pg_textsearch=on`, then `CREATE EXTENSION pg_textsearch;`
- [Cloud SQL: connect from Cloud Run (Google docs)](https://cloud.google.com/sql/docs/postgres/connect-instance-cloud-functions): `/cloudsql/<connection-name>` socket, `--add-cloudsql-instances`
- [How to connect a Cloud Run service to Cloud SQL (third-party)](https://oneuptime.com/blog/post/2026-02-17-how-to-connect-a-cloud-run-service-to-a-cloud-sql-instance/view): `host=/cloudsql/...` URL form, Cloud SQL Client role
- [Forum: /cloudsql directory empty on Cloud Run](https://discuss.google.dev/t/cloud-sql-unix-socket-not-showing-up-on-cloud-run-cloudsql-directory-empty/349510): the failure to check first if the socket is missing (usually the instance isn't attached or the Admin API/role is missing)
