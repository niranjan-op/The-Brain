from typing import Annotated
from firebase_admin.auth import get_user
from requests import session
from src.kc.core.auth import get_current_user
import os
import firebase_admin
from src.kc.core.config import settings
from starlette.datastructures import UploadFile
from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile, File, Header, BackgroundTasks
from src.kc.modules.ingestion.parsers.types import verify_file_type, verify_file_size
from src.kc.core.storage import upload_file
from sqlalchemy import text
from src.kc.core.db import get_session
import hashlib
import asyncio
from contextlib import asynccontextmanager
from src.kc.core.trigger import trigger_worker
from src.kc.worker.runner import run_worker
from sqlalchemy.ext.asyncio import AsyncSession
@asynccontextmanager
async def lifespan(app: FastAPI):
      # local dev only; in production the worker is a Cloud Run Job (python -m src.kc.worker)
      tasks = [asyncio.create_task(run_worker(f"w{i}")) for i in range(settings.worker_concurrency)] if settings.run_local_workers else []
      yield                        # app serves requests while the tasks run
      for t in tasks:
          t.cancel()
      await asyncio.gather(*tasks, return_exceptions=True)

app = FastAPI(lifespan=lifespan)

if settings.firebase_auth_emulator_host:
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = settings.firebase_auth_emulator_host
firebase_admin.initialize_app(options = {"projectId":settings.firebase_project_id})

@app.get("/")
async def root():
    return {"message": "Hello World"}

# @app.post("/session/start")
# async def session_start(x_device:str=Header(...), user=Depends(get_current_user), session=Depends(get_session)):
#     h = hashlib.sha256(x_device.encode()).hexdigest()
#     device_id = (await session.execute(text("""
#             INSERT INTO devices (fingerprint_hash) VALUES (:h)
#             ON CONFLICT (fingerprint_hash) DO UPDATE SET last_seen_at = now()
#             RETURNING device_id
#     """) , {"h":h})).scalar_one()
#     await session.execute(text("""
#          INSERT INTO account_devices (user_uuid, device_id) VALUES(:u,:d)
#          ON CONFLICT DO NOTHING
#     """), {"u":user["user_uuid"], "d": device_id})
#     await session.commit()


MAX_ACCOUNTS_PER_DEVICE_PER_DAY = 3

# Writing dependencies:
CurrentUser = Annotated[dict, Depends(get_current_user)]
DBSession = Annotated[AsyncSession, Depends(get_session)]

@app.post("/session/start")
async def session_start(user: CurrentUser, session: DBSession, x_device_id: str = Header(...)):
    # Serialise per device so two concurrent 4th sign-ins can't both pass the count.
    await session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:d))"), {"d": x_device_id})
    others = (await session.execute(text("""
        SELECT count(*) FROM account_devices
        WHERE device_id = :d AND user_uuid <> :u
          AND (last_login_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
    """), {"d": x_device_id, "u": user["user_uuid"]})).scalar_one()
    if others >= MAX_ACCOUNTS_PER_DEVICE_PER_DAY:
        await session.rollback()
        raise HTTPException(403, "Too many accounts have signed in from this device today")
    await session.execute(text("""
        INSERT INTO devices (device_id) VALUES (:d)
        ON CONFLICT (device_id) DO UPDATE SET last_seen_at = now()
    """), {"d": x_device_id})
    await session.execute(text("""
        INSERT INTO account_devices (user_uuid, device_id) VALUES (:u, :d)
        ON CONFLICT (user_uuid, device_id) DO UPDATE SET last_login_at = now()
    """), {"u": user["user_uuid"], "d": x_device_id})
    await session.commit()
    return {"ok": True}

@app.post("/projects")
async def create_project(name, user: CurrentUser, session: DBSession):
    project_uuid = (await session.execute(text(
        """
        INSERT INTO projects(name, created_by)
        VALUES (:n, :u)
        RETURNING project_uuid
        """),
        {"n":name, "u":user["user_uuid"]}
    )).scalar_one()
    # Creator becomes owner so the project shows up in GET /projects.
    await session.execute(text(
        """
        INSERT INTO project_members(project_uuid, user_uuid, role)
        VALUES (:p, :u, 'owner')
        """),
        {"p": project_uuid, "u": user["user_uuid"]}
    )
    await session.commit()
    return {"project_uuid": project_uuid, "name": name}

# @app.put("/projects")
@app.get("/projects")
async def list_projects(user: CurrentUser, session: DBSession):
      rows = (await session.execute(text("""
          SELECT p.project_uuid, p.name, m.role
          FROM project_members m JOIN projects p USING (project_uuid)
          WHERE m.user_uuid = :u AND p.deleted_at IS NULL
          ORDER BY p.created_at
      """), {"u": user["user_uuid"]})).mappings().all()
      return rows

@app.patch("/projects/{project_id}")
async def update_project(project_uuid, name, user: CurrentUser, session: DBSession):
    pass
    
    

@app.post("/upload")
async def upload(project_uuid, user: CurrentUser, session: DBSession, file: UploadFile = File(...)):

    ext = await verify_file_type(file)
    size = await verify_file_size(file)

    doc_uuid = (await session.execute(text("""
          INSERT INTO documents (project_uuid, filename, mime_type, size_bytes, uploaded_by)
          VALUES (:p, :fn, :mt, :size, :u) RETURNING doc_uuid
      """), {"p": project_uuid, "fn": file.filename, "mt": file.content_type, "size": size, "u": user["user_uuid"]})).scalar_one()
    await session.commit()

    path = f"{project_uuid}/{doc_uuid}{ext}"
    try:
        await upload_file(file, path)
    except Exception as e:
        await session.execute(text("UPDATE documents SET status = 'failed', error = :e WHERE doc_uuid = :d"),
                              {"e": str(e), "d": doc_uuid})
        await session.commit()
        raise HTTPException(502, "Storage upload failed")
    await session.execute(text("UPDATE documents SET status = 'uploaded', storage_path = :p WHERE doc_uuid = :d"),
                          {"p": path, "d": doc_uuid})
    await session.commit()
    job_uuid = (await session.execute(text(
        """
        INSERT INTO jobs (project_uuid, user_uuid, doc_uuid, type, idempotency_key)
        VALUES (:pid, :uid, :docid, 'ingest', :key)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING job_id
        """),
        {"pid": project_uuid, "uid": user["user_uuid"], "docid": doc_uuid, "key": f"ingest:{doc_uuid}"}
        )).scalar_one_or_none()
    await session.commit()
    await trigger_worker()   # no-op locally; starts the Cloud Run Job in production
    return {"doc_uuid": doc_uuid, "job_uuid":job_uuid}

    # Check file type, if image, send to an LLM to generate a description and a tag (diagram, photo, etc)
    # If image is a diagram chunk it and save it into the vector db, update the vector db id in the db 
    # If text/pdf/md, chunk it and save it into the vector db, update the vector db id in the db 
    #update status to completed 
    #return the file id
    #if any error occurs, update the status to error
    #return error
    
