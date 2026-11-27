import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal, NoReturn

import firebase_admin
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.kc.core.auth import get_current_user
from src.kc.core.config import settings
from src.kc.core.db import engine, get_session
from src.kc.core.rate_limit import query_rate_limiter
from src.kc.core.storage import upload_file
from src.kc.core.trigger import trigger_worker
from src.kc.modules.artifacts.service import (
    add_artifact_to_knowledge_base,
    build_artifact_export,
    delete_project_artifact,
    generate_project_artifact,
    get_artifact_detail,
    list_project_artifacts,
)
from src.kc.modules.chat.agent import run_agentic_turn, stream_agentic_turn
from src.kc.modules.chat.byok import BYOKConfigurationError
from src.kc.modules.chat.citations import format_page_paragraph_label
from src.kc.modules.chat.conversations import (
    create_conversation,
    delete_conversation,
    get_accessible_conversation,
    get_conversation_detail,
    list_conversations,
    set_conversation_excluded_sources,
    update_conversation,
    verify_project_membership,
)
from src.kc.modules.exports import (
    MEDIA_TYPES,
    ExportFormat,
    MessageNotExportableError,
    build_message_export,
    export_filename,
    render_docx,
    render_pdf,
)
from src.kc.modules.graph.aura import AuraUnavailableError
from src.kc.modules.graph.conflicts import check_document_conflicts
from src.kc.modules.graph.gateway import delete_document_cascade
from src.kc.modules.graph.proposals import (
    approve_graph_proposal,
    propose_from_conversation,
)
from src.kc.modules.graph.read_tools import invalidate_allowed_nodes_cache
from src.kc.modules.graph.sync import sync_project_to_aura
from src.kc.modules.ingestion.parsers.types import verify_file_size, verify_file_type
from src.kc.modules.research.service import (
    ActiveResearchRunLimitError,
    ResearchLeaseConflictError,
    create_research_run,
    get_research_run,
    heartbeat_research_run,
    pause_research_run,
    resume_research_run,
    step_research_run,
)
from src.kc.modules.search.graph_rag import retrieve_and_answer
from src.kc.modules.usage.service import (
    QuotaExceededError,
    get_user_usage_summary,
    upsert_search_limits,
)
from src.kc.modules.websearch.service import WebSearchRestrictedError
from src.kc.worker.runner import run_worker

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # local dev only; in production the worker is a Cloud Run Job (python -m src.kc.worker)
    tasks = (
        [asyncio.create_task(run_worker(f"w{i}")) for i in range(settings.worker_concurrency)]
        if settings.run_local_workers
        else []
    )
    yield
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await engine.dispose()


app = FastAPI(lifespan=lifespan)

cors_origins = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:4173,http://127.0.0.1:4173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(OSError)
async def db_connection_exception_handler(_request: Any, exc: OSError):
    return JSONResponse(
        status_code=503,
        content={"detail": f"Database connection unavailable: {exc}"},
    )

if settings.firebase_auth_emulator_host:
    os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = settings.firebase_auth_emulator_host
firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})

MAX_ACCOUNTS_PER_DEVICE_PER_DAY = 3

CurrentUser = Annotated[dict, Depends(get_current_user)]
DBSession = Annotated[AsyncSession, Depends(get_session)]


def _resolve_serpapi_key(
    x_serpapi_key: str | None = Header(default=None, alias="X-SerpApi-Key"),
    x_serp_api_key: str | None = Header(default=None, alias="X-Serp-Api-Key"),
) -> str | None:
    """Read personal SerpApi key from frontend header X-SerpApi-Key (or legacy hyphenated X-Serp-Api-Key)."""
    cleaned = (x_serpapi_key or x_serp_api_key or "").strip()
    return cleaned or None


SerpApiKeyHeader = Annotated[str | None, Depends(_resolve_serpapi_key)]


def _raise_domain_http_error(exc: Exception) -> NoReturn:
    if isinstance(exc, QuotaExceededError):
        raise HTTPException(status_code=429, detail=exc.to_dict()) from exc
    if isinstance(exc, BYOKConfigurationError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if isinstance(exc, WebSearchRestrictedError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if isinstance(exc, (ResearchLeaseConflictError, ActiveResearchRunLimitError)):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, PermissionError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if isinstance(exc, LookupError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    raise exc


async def _ensure_member(
    session: AsyncSession,
    *,
    project_uuid: uuid.UUID,
    user_uuid: str,
    require_write: bool = False,
) -> str:
    try:
        return await verify_project_membership(
            session,
            project_uuid=str(project_uuid),
            user_uuid=str(user_uuid),
            require_write=require_write,
        )
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/auth/me")
async def auth_me(user: CurrentUser):
    return {
        "user_uuid": str(user["user_uuid"]),
        "email": user.get("email"),
        "display_name": user.get("display_name"),
    }


@app.post("/session/start")
async def session_start(user: CurrentUser, session: DBSession, x_device_id: str = Header(...)):
    # Serialise per device so two concurrent 4th sign-ins can't both pass the count.
    await session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:d))"), {"d": x_device_id})
    others = (
        await session.execute(
            text(
                """
                SELECT count(*) FROM account_devices
                WHERE device_id = :d AND user_uuid <> :u
                  AND (last_login_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
                """
            ),
            {"d": x_device_id, "u": user["user_uuid"]},
        )
    ).scalar_one()
    if others >= MAX_ACCOUNTS_PER_DEVICE_PER_DAY:
        await session.rollback()
        raise HTTPException(403, "Too many accounts have signed in from this device today")
    await session.execute(
        text(
            """
            INSERT INTO devices (device_id) VALUES (:d)
            ON CONFLICT (device_id) DO UPDATE SET last_seen_at = now()
            """
        ),
        {"d": x_device_id},
    )
    await session.execute(
        text(
            """
            INSERT INTO account_devices (user_uuid, device_id) VALUES (:u, :d)
            ON CONFLICT (user_uuid, device_id) DO UPDATE SET last_login_at = now()
            """
        ),
        {"u": user["user_uuid"], "d": x_device_id},
    )
    await session.commit()
    return {"ok": True}


def _serialize_project_row(row: Any, *, invites: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "project_uuid": str(row["project_uuid"]),
        "name": row["name"],
        "role": row.get("role", "owner"),
        "created_by": str(row["created_by"]),
        "max_members": int(row["max_members"] if row.get("max_members") is not None else 4),
        "max_docs": int(row["max_docs"] if row.get("max_docs") is not None else 50),
        "max_chunks": int(row["max_chunks"] if row.get("max_chunks") is not None else 15000),
        "max_graph_nodes": int(row["max_graph_nodes"] if row.get("max_graph_nodes") is not None else 1000),
        "daily_llm_calls": int(
            row["daily_llm_calls"]
            if row.get("daily_llm_calls") is not None
            else settings.project_default_daily_llm_calls
        ),
        "daily_uploads": int(
            row["daily_uploads"]
            if row.get("daily_uploads") is not None
            else settings.project_default_daily_uploads
        ),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "doc_count": int(row.get("doc_count") or 0),
        "convo_count": int(row.get("convo_count") or 0),
        "invites": invites or [],
    }


@app.post("/projects")
async def create_project(name: str, user: CurrentUser, session: DBSession):
    created = (
        await session.execute(
            text(
                """
                INSERT INTO projects(name, created_by)
                VALUES (:n, :u)
                RETURNING project_uuid, name, created_by, max_members, max_docs, max_chunks,
                          max_graph_nodes, daily_llm_calls, daily_uploads, created_at
                """
            ),
            {"n": name.strip(), "u": user["user_uuid"]},
        )
    ).mappings().one()
    await session.execute(
        text(
            """
            INSERT INTO project_members(project_uuid, user_uuid, role)
            VALUES (:p, :u, 'owner')
            """
        ),
        {"p": created["project_uuid"], "u": user["user_uuid"]},
    )
    await session.commit()
    return _serialize_project_row({**dict(created), "role": "owner", "doc_count": 0, "convo_count": 0}, invites=[])


@app.get("/projects")
async def list_projects(user: CurrentUser, session: DBSession):
    rows = (
        await session.execute(
            text(
                """
                SELECT p.project_uuid, p.name, m.role, p.created_by, p.max_members, p.max_docs,
                       p.max_chunks, p.max_graph_nodes, p.daily_llm_calls, p.daily_uploads,
                       p.created_at,
                       (
                           SELECT count(*) FROM documents d
                           WHERE d.project_uuid = p.project_uuid AND d.deleted_at IS NULL
                       ) AS doc_count,
                       (
                           SELECT count(*) FROM conversations c
                           WHERE c.project_uuid = p.project_uuid AND c.deleted_at IS NULL
                             AND (c.visibility = 'shared' OR c.created_by = :u)
                       ) AS convo_count
                FROM project_members m
                JOIN projects p USING (project_uuid)
                WHERE m.user_uuid = :u AND p.deleted_at IS NULL
                ORDER BY p.created_at DESC
                """
            ),
            {"u": user["user_uuid"]},
        )
    ).mappings().all()

    project_ids = [str(r["project_uuid"]) for r in rows]
    invites_by_project: dict[str, list[dict[str, Any]]] = {pid: [] for pid in project_ids}
    if project_ids:
        inv_rows = (
            await session.execute(
                text(
                    """
                    SELECT invite_uuid, project_uuid, email, role, invited_by,
                           expires_at, accepted_at, created_at
                    FROM invites
                    WHERE project_uuid = ANY(CAST(:pids AS uuid[]))
                    ORDER BY created_at ASC
                    """
                ),
                {"pids": project_ids},
            )
        ).mappings().all()
        for ir in inv_rows:
            pid = str(ir["project_uuid"])
            invites_by_project.setdefault(pid, []).append(
                {
                    "invite_uuid": str(ir["invite_uuid"]),
                    "project_uuid": pid,
                    "email": ir["email"],
                    "role": ir["role"],
                    "invited_by": str(ir["invited_by"]),
                    "expires_at": ir["expires_at"].isoformat() if ir["expires_at"] else None,
                    "accepted_at": ir["accepted_at"].isoformat() if ir["accepted_at"] else None,
                    "created_at": ir["created_at"].isoformat() if ir["created_at"] else None,
                }
            )

    return [
        _serialize_project_row(r, invites=invites_by_project.get(str(r["project_uuid"]), []))
        for r in rows
    ]


@app.patch("/projects/{project_uuid}")
async def update_project(project_uuid: uuid.UUID, name: str, user: CurrentUser, session: DBSession):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]), require_write=True)
    updated = (
        await session.execute(
            text("UPDATE projects SET name = :n WHERE project_uuid = :p AND deleted_at IS NULL RETURNING project_uuid, name"),
            {"n": name.strip(), "p": str(project_uuid)},
        )
    ).mappings().first()
    if updated is None:
        raise HTTPException(404, "Project not found")
    await session.commit()
    return {"project_uuid": str(updated["project_uuid"]), "name": updated["name"]}


@app.delete("/projects/{project_uuid}")
async def delete_project(project_uuid: uuid.UUID, user: CurrentUser, session: DBSession):
    role = await _ensure_member(
        session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]), require_write=True
    )
    if role != "owner":
        raise HTTPException(403, "Only the project owner can delete a workspace")
    deleted = (
        await session.execute(
            text(
                """
                UPDATE projects
                SET deleted_at = now()
                WHERE project_uuid = :p AND deleted_at IS NULL
                RETURNING project_uuid
                """
            ),
            {"p": str(project_uuid)},
        )
    ).scalar_one_or_none()
    if deleted is None:
        raise HTTPException(404, "Project not found")
    await session.commit()
    invalidate_allowed_nodes_cache(str(project_uuid))
    return {"deleted": True, "project_uuid": str(deleted)}


class CreateInviteRequest(BaseModel):
    email: str = Field(min_length=3)
    role: Literal["edit", "view"] = "edit"


@app.post("/projects/{project_uuid}/invites")
async def create_project_invite(
    project_uuid: uuid.UUID,
    body: CreateInviteRequest,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]), require_write=True)
    clean_email = body.email.strip().lower()
    if "@" not in clean_email or "." not in clean_email.split("@")[-1]:
        raise HTTPException(400, "Enter a valid collaborator email address")

    max_members = (
        await session.execute(
            text("SELECT max_members FROM projects WHERE project_uuid = :p AND deleted_at IS NULL"),
            {"p": str(project_uuid)},
        )
    ).scalar_one_or_none()
    if max_members is None:
        raise HTTPException(404, "Project not found")

    member_count = (
        await session.execute(
            text("SELECT count(*) FROM project_members WHERE project_uuid = :p"),
            {"p": str(project_uuid)},
        )
    ).scalar_one()
    pending_invites = (
        await session.execute(
            text(
                """
                SELECT invite_uuid, email FROM invites
                WHERE project_uuid = :p AND accepted_at IS NULL
                """
            ),
            {"p": str(project_uuid)},
        )
    ).mappings().all()
    if any(str(inv["email"]).lower() == clean_email for inv in pending_invites):
        raise HTTPException(409, "Collaborator has already been invited to this project")
    if int(member_count) + len(pending_invites) >= int(max_members):
        raise HTTPException(400, f"Project member limit reached ({max_members} members max)")

    created = (
        await session.execute(
            text(
                """
                INSERT INTO invites (project_uuid, email, role, invited_by, expires_at)
                VALUES (:p, :email, :role, :u, now() + interval '7 days')
                RETURNING invite_uuid, project_uuid, email, role, invited_by,
                          expires_at, accepted_at, created_at
                """
            ),
            {
                "p": str(project_uuid),
                "email": clean_email,
                "role": body.role,
                "u": str(user["user_uuid"]),
            },
        )
    ).mappings().one()
    await session.commit()
    return {
        "invite_uuid": str(created["invite_uuid"]),
        "project_uuid": str(created["project_uuid"]),
        "email": created["email"],
        "role": created["role"],
        "invited_by": str(created["invited_by"]),
        "expires_at": created["expires_at"].isoformat() if created["expires_at"] else None,
        "accepted_at": created["accepted_at"].isoformat() if created["accepted_at"] else None,
        "created_at": created["created_at"].isoformat() if created["created_at"] else None,
    }


@app.delete("/projects/{project_uuid}/invites/{invite_uuid}")
async def delete_project_invite(
    project_uuid: uuid.UUID,
    invite_uuid: uuid.UUID,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]), require_write=True)
    deleted = (
        await session.execute(
            text(
                """
                DELETE FROM invites
                WHERE project_uuid = :p AND invite_uuid = :iid
                RETURNING invite_uuid
                """
            ),
            {"p": str(project_uuid), "iid": str(invite_uuid)},
        )
    ).scalar_one_or_none()
    if deleted is None:
        raise HTTPException(404, "Invite not found")
    await session.commit()
    return {"deleted": True, "invite_uuid": str(deleted)}


class QueryRequest(BaseModel):
    query: str = Field(min_length=1)
    convo_uuid: uuid.UUID | None = None
    excluded_doc_uuids: list[uuid.UUID] | None = None
    k_chunks: int = Field(default=8, ge=1, le=30)
    k_nodes: int = Field(default=5, ge=1, le=20)
    search_mode: Literal["hybrid", "vector", "keyword"] = "hybrid"
    use_graph: bool = True
    use_tools: bool = True
    generate_answer: bool = True
    mode: Literal["managed", "byok"] = "managed"
    model: str | None = None
    effort: Literal["low", "medium", "high"] = "medium"
    research_mode: Literal["normal", "quick", "web", "deep", "deep_research"] = "quick"
    history: list[dict[str, Any]] | None = None
    base_url: str | None = None
    search_limits: dict[str, int] | None = None


@app.post("/projects/{project_uuid}/query")
async def query_project(
    project_uuid: uuid.UUID,
    body: QueryRequest,
    user: CurrentUser,
    session: DBSession,
    x_llm_api_key: str | None = Header(default=None),
    x_serp_api_key: SerpApiKeyHeader = None,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))

    excluded_set: set[str] = {str(d) for d in (body.excluded_doc_uuids or [])}
    convo_str: str | None = str(body.convo_uuid) if body.convo_uuid else None

    if convo_str is not None:
        try:
            await get_accessible_conversation(
                session,
                project_uuid=str(project_uuid),
                convo_uuid=convo_str,
                user_uuid=str(user["user_uuid"]),
            )
        except Exception as exc:  # noqa: BLE001
            _raise_domain_http_error(exc)

        convo_excluded = (
            await session.execute(
                text(
                    """
                    SELECT doc_uuid FROM conversation_excluded_sources
                    WHERE convo_uuid = :c
                    """
                ),
                {"c": convo_str},
            )
        ).scalars().all()
        excluded_set.update(str(d) for d in convo_excluded if d is not None)

    if not query_rate_limiter.allow(str(user["user_uuid"])):
        raise HTTPException(429, "Rate limit exceeded for project queries")

    uses_agent_features = bool(
        body.mode == "byok"
        or body.research_mode not in ("quick", "normal")
        or body.history
        or body.model
        or x_llm_api_key
        or x_serp_api_key
    )
    if not uses_agent_features:
        return await retrieve_and_answer(
            project_uuid=str(project_uuid),
            query=body.query,
            excluded_docs=sorted(excluded_set) if excluded_set else None,
            convo_uuid=convo_str,
            k_chunks=body.k_chunks,
            k_nodes=body.k_nodes,
            search_mode=body.search_mode,
            use_graph=body.use_graph,
            use_tools=body.use_tools,
            generate_answer=body.generate_answer,
        )

    try:
        result = await run_agentic_turn(
            session=session,
            project_uuid=str(project_uuid),
            user_uuid=str(user["user_uuid"]),
            query=body.query,
            convo_uuid=convo_str,
            excluded_docs=sorted(excluded_set) if excluded_set else None,
            k_chunks=body.k_chunks,
            k_nodes=body.k_nodes,
            search_mode=body.search_mode,
            use_graph=body.use_graph,
            use_tools=body.use_tools,
            generate_answer=body.generate_answer,
            mode=body.mode,
            model=body.model,
            effort=body.effort,
            research_mode=body.research_mode,
            byok_api_key=x_llm_api_key,
            serp_api_key=x_serp_api_key,
            base_url=body.base_url,
            history=body.history,
            search_limits_override=body.search_limits,
        )
        await session.commit()
        return result
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


@app.post("/upload")
async def upload(project_uuid, user: CurrentUser, session: DBSession, file: UploadFile = File(...)):
    ext = await verify_file_type(file)
    size, doc_hash = await verify_file_size(file)

    doc_uuid = (
        await session.execute(
            text(
                """
                INSERT INTO documents (project_uuid, filename, doc_hash, mime_type, size_bytes, uploaded_by)
                VALUES (:p, :fn, :doc_hash, :mt, :size, :u)
                ON CONFLICT (project_uuid, doc_hash) DO UPDATE
                SET status = 'pending', error = NULL, deleted_at = NULL, filename = EXCLUDED.filename
                WHERE documents.status IN ('failed', 'pending') OR documents.deleted_at IS NOT NULL
                RETURNING doc_uuid
                """
            ),
            {
                "p": project_uuid,
                "fn": file.filename,
                "doc_hash": doc_hash,
                "mt": file.content_type,
                "size": size,
                "u": user["user_uuid"],
            },
        )
    ).scalar_one_or_none()
    await session.commit()

    if doc_uuid is None:
        existing_uuid = (
            await session.execute(
                text(
                    """
                    SELECT doc_uuid FROM documents
                    WHERE project_uuid = :p AND doc_hash = :doc_hash AND deleted_at IS NULL
                    """
                ),
                {"p": project_uuid, "doc_hash": doc_hash},
            )
        ).scalar_one()
        existing_job = (
            await session.execute(
                text("SELECT job_id FROM jobs WHERE idempotency_key = :key"),
                {"key": f"ingest:{existing_uuid}"},
            )
        ).scalar_one_or_none()
        return {"doc_uuid": existing_uuid, "job_uuid": existing_job, "duplicate": True}

    path = f"{project_uuid}/{doc_uuid}{ext}"
    try:
        await upload_file(file, path)
    except Exception as e:
        await session.execute(
            text("UPDATE documents SET status = 'failed', error = :e WHERE doc_uuid = :d"),
            {"e": str(e), "d": doc_uuid},
        )
        await session.commit()
        raise HTTPException(502, "Storage upload failed")
    await session.execute(
        text("UPDATE documents SET status = 'uploaded', storage_path = :p WHERE doc_uuid = :d"),
        {"p": path, "d": doc_uuid},
    )
    await session.commit()
    job_uuid = (
        await session.execute(
            text(
                """
                INSERT INTO jobs (project_uuid, user_uuid, doc_uuid, type, idempotency_key)
                VALUES (:pid, :uid, :docid, 'ingest', :key)
                ON CONFLICT (idempotency_key) DO UPDATE
                SET status = 'queued', attempts = 0, run_after = now(), error = NULL, finished_at = NULL
                WHERE jobs.status IN ('failed', 'dead')
                RETURNING job_id
                """
            ),
            {"pid": project_uuid, "uid": user["user_uuid"], "docid": doc_uuid, "key": f"ingest:{doc_uuid}"},
        )
    ).scalar_one_or_none()
    await session.commit()
    await trigger_worker()
    return {"doc_uuid": doc_uuid, "job_uuid": job_uuid}


# ---------------------------------------------------------------------------
# Documents & Jobs (T053, T054, T100)
# ---------------------------------------------------------------------------


@app.get("/projects/{project_uuid}/documents")
async def list_project_documents(project_uuid: uuid.UUID, user: CurrentUser, session: DBSession):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    rows = (
        await session.execute(
            text(
                """
                SELECT doc_uuid, project_uuid, filename, doc_hash, uploaded_by, mime_type,
                       size_bytes, storage_path, status, doc_kind, description, page_count,
                       error, created_at
                FROM documents
                WHERE project_uuid = :p AND deleted_at IS NULL
                ORDER BY created_at DESC
                """
            ),
            {"p": str(project_uuid)},
        )
    ).mappings().all()
    return [
        {
            "doc_uuid": str(r["doc_uuid"]),
            "project_uuid": str(r["project_uuid"]),
            "filename": r["filename"],
            "doc_hash": r["doc_hash"],
            "uploaded_by": str(r["uploaded_by"]),
            "mime_type": r["mime_type"],
            "size_bytes": r["size_bytes"],
            "storage_path": r["storage_path"],
            "status": r["status"],
            "doc_kind": r["doc_kind"] or "other",
            "description": r["description"] or "",
            "page_count": r["page_count"],
            "error": r["error"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


@app.delete("/projects/{project_uuid}/documents/{doc_uuid}")
async def soft_delete_document(project_uuid: uuid.UUID, doc_uuid: uuid.UUID, user: CurrentUser, session: DBSession):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]), require_write=True)
    cascade = await delete_document_cascade(
        session,
        project_uuid=str(project_uuid),
        doc_uuid=str(doc_uuid),
        actor_user=str(user["user_uuid"]),
    )
    if not cascade.get("deleted"):
        raise HTTPException(404, "Document not found")
    await session.commit()
    invalidate_allowed_nodes_cache(str(project_uuid))
    if cascade.get("deleted_nodes") or cascade.get("deleted_edges"):
        try:
            await sync_project_to_aura(str(project_uuid))
        except Exception:  # noqa: BLE001
            pass
    return cascade


@app.get("/projects/{project_uuid}/documents/{doc_uuid}/chunks")
async def list_document_chunks(project_uuid: uuid.UUID, doc_uuid: uuid.UUID, user: CurrentUser, session: DBSession):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    rows = (
        await session.execute(
            text(
                """
                SELECT chunk_id, doc_uuid, ordinal, kind, heading_path,
                       page_start, page_end, text, payload
                FROM chunks
                WHERE project_uuid = :p AND doc_uuid = :d
                ORDER BY page_start ASC NULLS LAST, ordinal ASC
                """
            ),
            {"p": str(project_uuid), "d": str(doc_uuid)},
        )
    ).mappings().all()
    out: list[dict[str, Any]] = []
    for r in rows:
        row_dict = dict(r)
        page_label, p_start, p_end, para_start, para_end = format_page_paragraph_label(row_dict)
        out.append(
            {
                "chunk_id": str(r["chunk_id"]),
                "doc_uuid": str(r["doc_uuid"]),
                "ordinal": int(r["ordinal"] or 0),
                "kind": r["kind"] or "text",
                "heading_path": r["heading_path"] or "Root Section",
                "page_start": p_start,
                "page_end": p_end,
                "para_start": para_start,
                "para_end": para_end,
                "page_label": page_label,
                "text": r["text"] or "",
                "payload": r["payload"] or {},
            }
        )
    return out


@app.post("/projects/{project_uuid}/documents/{doc_uuid}/conflicts")
async def document_conflicts(project_uuid: uuid.UUID, doc_uuid: uuid.UUID, user: CurrentUser, session: DBSession):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    return await check_document_conflicts(
        session,
        project_uuid=str(project_uuid),
        doc_uuid=str(doc_uuid),
    )


@app.get("/jobs/{job_uuid}")
async def get_job_status(job_uuid: uuid.UUID, user: CurrentUser, session: DBSession):
    row = (
        await session.execute(
            text(
                """
                SELECT j.job_id, j.project_uuid, j.user_uuid, j.doc_uuid, j.type, j.status,
                       j.stage, j.attempts, j.max_attempts, j.error, j.created_at,
                       j.started_at, j.finished_at
                FROM jobs j
                JOIN project_members pm ON pm.project_uuid = j.project_uuid AND pm.user_uuid = :u
                WHERE j.job_id = :jid
                """
            ),
            {"jid": str(job_uuid), "u": str(user["user_uuid"])},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(404, "Job not found")
    return {
        "job_id": str(row["job_id"]),
        "project_uuid": str(row["project_uuid"]),
        "doc_uuid": str(row["doc_uuid"]) if row["doc_uuid"] else None,
        "type": row["type"],
        "status": row["status"],
        "stage": row["stage"],
        "attempts": row["attempts"],
        "max_attempts": row["max_attempts"],
        "error": row["error"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "started_at": row["started_at"].isoformat() if row["started_at"] else None,
        "finished_at": row["finished_at"].isoformat() if row["finished_at"] else None,
    }


# ---------------------------------------------------------------------------
# Usage & SerpApi Search Limits (T051, T096)
# ---------------------------------------------------------------------------


@app.get("/usage")
async def read_usage(user: CurrentUser, session: DBSession):
    return await get_user_usage_summary(session, str(user["user_uuid"]))


class SearchLimitsRequest(BaseModel):
    serp_per_hour: int = Field(ge=0, le=50)
    serp_per_day: int = Field(ge=0)
    serp_per_month: int = Field(ge=0, le=250)


@app.put("/usage/search-limits")
async def update_search_limits(body: SearchLimitsRequest, user: CurrentUser, session: DBSession):
    try:
        saved = await upsert_search_limits(
            session,
            str(user["user_uuid"]),
            serp_per_hour=body.serp_per_hour,
            serp_per_day=body.serp_per_day,
            serp_per_month=body.serp_per_month,
        )
        await session.commit()
        return saved
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


# ---------------------------------------------------------------------------
# Conversations, Source Exclusion & Streaming Messages (T056, T057, T059)
# ---------------------------------------------------------------------------


class CreateConversationRequest(BaseModel):
    title: str | None = None
    visibility: Literal["shared", "private"] = "shared"


@app.post("/projects/{project_uuid}/conversations")
async def create_project_conversation(
    project_uuid: uuid.UUID,
    body: CreateConversationRequest,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    convo = await create_conversation(
        session,
        project_uuid=str(project_uuid),
        user_uuid=str(user["user_uuid"]),
        title=body.title,
        visibility=body.visibility,
    )
    await session.commit()
    return convo


@app.get("/projects/{project_uuid}/conversations")
async def list_project_conversations(project_uuid: uuid.UUID, user: CurrentUser, session: DBSession):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    return await list_conversations(session, project_uuid=str(project_uuid), user_uuid=str(user["user_uuid"]))


@app.get("/projects/{project_uuid}/conversations/{convo_uuid}")
async def read_conversation(
    project_uuid: uuid.UUID,
    convo_uuid: uuid.UUID,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        return await get_conversation_detail(
            session,
            project_uuid=str(project_uuid),
            convo_uuid=str(convo_uuid),
            user_uuid=str(user["user_uuid"]),
        )
    except Exception as exc:  # noqa: BLE001
        _raise_domain_http_error(exc)


class UpdateConversationRequest(BaseModel):
    title: str | None = None
    visibility: Literal["shared", "private"] | None = None


@app.patch("/projects/{project_uuid}/conversations/{convo_uuid}")
async def patch_conversation(
    project_uuid: uuid.UUID,
    convo_uuid: uuid.UUID,
    body: UpdateConversationRequest,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        updated = await update_conversation(
            session,
            project_uuid=str(project_uuid),
            convo_uuid=str(convo_uuid),
            user_uuid=str(user["user_uuid"]),
            title=body.title,
            visibility=body.visibility,
        )
        await session.commit()
        return updated
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


@app.delete("/projects/{project_uuid}/conversations/{convo_uuid}")
async def remove_conversation(
    project_uuid: uuid.UUID,
    convo_uuid: uuid.UUID,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        deleted = await delete_conversation(
            session,
            project_uuid=str(project_uuid),
            convo_uuid=str(convo_uuid),
            user_uuid=str(user["user_uuid"]),
        )
        await session.commit()
        return deleted
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


class ExcludedSourcesRequest(BaseModel):
    excluded_doc_uuids: list[uuid.UUID] = Field(default_factory=list)


@app.put("/projects/{project_uuid}/conversations/{convo_uuid}/excluded-sources")
async def update_conversation_excluded_sources(
    project_uuid: uuid.UUID,
    convo_uuid: uuid.UUID,
    body: ExcludedSourcesRequest,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        await get_accessible_conversation(
            session,
            project_uuid=str(project_uuid),
            convo_uuid=str(convo_uuid),
            user_uuid=str(user["user_uuid"]),
        )
        excluded = await set_conversation_excluded_sources(
            session,
            project_uuid=str(project_uuid),
            convo_uuid=str(convo_uuid),
            excluded_doc_uuids=[str(d) for d in body.excluded_doc_uuids],
        )
        await session.commit()
        invalidate_allowed_nodes_cache(str(project_uuid))
        return {"convo_uuid": str(convo_uuid), "excluded_doc_uuids": excluded}
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


class MessageTurnRequest(BaseModel):
    query: str = Field(min_length=1)
    excluded_doc_uuids: list[uuid.UUID] | None = None
    k_chunks: int = Field(default=8, ge=1, le=30)
    k_nodes: int = Field(default=5, ge=1, le=20)
    search_mode: Literal["hybrid", "vector", "keyword"] = "hybrid"
    use_graph: bool = True
    use_tools: bool = True
    mode: Literal["managed", "byok"] = "managed"
    model: str | None = None
    effort: Literal["low", "medium", "high"] = "medium"
    research_mode: Literal["normal", "quick", "web", "deep", "deep_research"] = "quick"
    history: list[dict[str, Any]] | None = None
    base_url: str | None = None
    search_limits: dict[str, int] | None = None


@app.post("/projects/{project_uuid}/conversations/{convo_uuid}/messages")
async def post_conversation_message(
    project_uuid: uuid.UUID,
    convo_uuid: uuid.UUID,
    body: MessageTurnRequest,
    user: CurrentUser,
    session: DBSession,
    x_llm_api_key: str | None = Header(default=None),
    x_serp_api_key: SerpApiKeyHeader = None,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    if not query_rate_limiter.allow(str(user["user_uuid"])):
        raise HTTPException(429, "Rate limit exceeded for conversation messages")
    try:
        await get_accessible_conversation(
            session,
            project_uuid=str(project_uuid),
            convo_uuid=str(convo_uuid),
            user_uuid=str(user["user_uuid"]),
        )
        res = await run_agentic_turn(
            session=session,
            project_uuid=str(project_uuid),
            user_uuid=str(user["user_uuid"]),
            query=body.query,
            convo_uuid=str(convo_uuid),
            excluded_docs=[str(d) for d in (body.excluded_doc_uuids or [])] or None,
            k_chunks=body.k_chunks,
            k_nodes=body.k_nodes,
            search_mode=body.search_mode,
            use_graph=body.use_graph,
            use_tools=body.use_tools,
            generate_answer=True,
            mode=body.mode,
            model=body.model,
            effort=body.effort,
            research_mode=body.research_mode,
            byok_api_key=x_llm_api_key,
            serp_api_key=x_serp_api_key,
            base_url=body.base_url,
            history=body.history,
            search_limits_override=body.search_limits,
        )
        await session.commit()
        return res
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


@app.post("/projects/{project_uuid}/conversations/{convo_uuid}/messages/stream")
async def stream_conversation_message(
    project_uuid: uuid.UUID,
    convo_uuid: uuid.UUID,
    body: MessageTurnRequest,
    user: CurrentUser,
    session: DBSession,
    x_llm_api_key: str | None = Header(default=None),
    x_serp_api_key: SerpApiKeyHeader = None,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    if not query_rate_limiter.allow(str(user["user_uuid"])):
        raise HTTPException(429, "Rate limit exceeded for conversation messages")
    try:
        await get_accessible_conversation(
            session,
            project_uuid=str(project_uuid),
            convo_uuid=str(convo_uuid),
            user_uuid=str(user["user_uuid"]),
        )
    except Exception as exc:  # noqa: BLE001
        _raise_domain_http_error(exc)

    async def _sse_generator():
        try:
            async for evt in stream_agentic_turn(
                session=session,
                project_uuid=str(project_uuid),
                user_uuid=str(user["user_uuid"]),
                query=body.query,
                convo_uuid=str(convo_uuid),
                excluded_docs=[str(d) for d in (body.excluded_doc_uuids or [])] or None,
                k_chunks=body.k_chunks,
                k_nodes=body.k_nodes,
                search_mode=body.search_mode,
                use_graph=body.use_graph,
                use_tools=body.use_tools,
                generate_answer=True,
                mode=body.mode,
                model=body.model,
                effort=body.effort,
                research_mode=body.research_mode,
                byok_api_key=x_llm_api_key,
                serp_api_key=x_serp_api_key,
                base_url=body.base_url,
                history=body.history,
                search_limits_override=body.search_limits,
            ):
                yield f"event: {evt['event']}\ndata: {json.dumps(evt['data'])}\n\n"
            await session.commit()
        except Exception as exc:  # noqa: BLE001
            await session.rollback()
            yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"

    return StreamingResponse(_sse_generator(), media_type="text/event-stream")


@app.get("/projects/{project_uuid}/conversations/{convo_uuid}/messages/{message_uuid}/export")
async def export_conversation_message(
    project_uuid: uuid.UUID,
    convo_uuid: uuid.UUID,
    message_uuid: uuid.UUID,
    user: CurrentUser,
    session: DBSession,
    fmt: Annotated[ExportFormat, Query(alias="format")] = "pdf",
):
    """Download one answered agent message as PDF or DOCX (rendered on demand, not stored)."""
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        detail = await get_conversation_detail(
            session,
            project_uuid=str(project_uuid),
            convo_uuid=str(convo_uuid),
            user_uuid=str(user["user_uuid"]),
        )
        export = build_message_export(detail, str(message_uuid))
    except MessageNotExportableError as exc:
        raise HTTPException(409, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        _raise_domain_http_error(exc)

    renderer = render_pdf if fmt == "pdf" else render_docx
    content = await asyncio.to_thread(renderer, export)
    return Response(
        content=content,
        media_type=MEDIA_TYPES[fmt],
        headers={"Content-Disposition": f'attachment; filename="{export_filename(export.title, fmt)}"'},
    )


# ---------------------------------------------------------------------------
# Window-Bound Deep Research Runs (D021, T097)
# ---------------------------------------------------------------------------


class CreateResearchRunRequest(BaseModel):
    question: str = Field(min_length=1)
    convo_uuid: uuid.UUID | None = None
    mode: Literal["managed", "byok"] = "managed"
    model: str | None = None
    search_budget: int | None = Field(default=None, ge=0, le=20)
    runner_id: str | None = None
    base_url: str | None = None


@app.post("/projects/{project_uuid}/research/runs")
async def start_research_run(
    project_uuid: uuid.UUID,
    body: CreateResearchRunRequest,
    user: CurrentUser,
    session: DBSession,
    x_llm_api_key: str | None = Header(default=None),
    x_serp_api_key: SerpApiKeyHeader = None,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        run = await create_research_run(
            session,
            project_uuid=str(project_uuid),
            user_uuid=str(user["user_uuid"]),
            question=body.question,
            convo_uuid=str(body.convo_uuid) if body.convo_uuid else None,
            mode=body.mode,
            model=body.model,
            serp_api_key=x_serp_api_key,
            byok_api_key=x_llm_api_key,
            base_url=body.base_url,
            search_budget=body.search_budget,
            runner_id=body.runner_id,
        )
        await session.commit()
        return run
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


@app.get("/projects/{project_uuid}/research/runs/{run_uuid}")
async def read_research_run(
    project_uuid: uuid.UUID,
    run_uuid: uuid.UUID,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        return await get_research_run(session, run_uuid=str(run_uuid), user_uuid=str(user["user_uuid"]))
    except Exception as exc:  # noqa: BLE001
        _raise_domain_http_error(exc)


class RunnerLeaseRequest(BaseModel):
    runner_id: str = Field(min_length=1)
    base_url: str | None = None
    search_limits: dict[str, int] | None = None


@app.post("/projects/{project_uuid}/research/runs/{run_uuid}/heartbeat")
async def heartbeat_run(
    project_uuid: uuid.UUID,
    run_uuid: uuid.UUID,
    body: RunnerLeaseRequest,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        res = await heartbeat_research_run(
            session,
            run_uuid=str(run_uuid),
            user_uuid=str(user["user_uuid"]),
            runner_id=body.runner_id,
        )
        await session.commit()
        return res
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


@app.post("/projects/{project_uuid}/research/runs/{run_uuid}/step")
async def execute_research_step(
    project_uuid: uuid.UUID,
    run_uuid: uuid.UUID,
    body: RunnerLeaseRequest,
    user: CurrentUser,
    session: DBSession,
    x_llm_api_key: str | None = Header(default=None),
    x_serp_api_key: SerpApiKeyHeader = None,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        res = await step_research_run(
            session,
            run_uuid=str(run_uuid),
            user_uuid=str(user["user_uuid"]),
            runner_id=body.runner_id,
            byok_api_key=x_llm_api_key,
            serp_api_key=x_serp_api_key,
            base_url=body.base_url,
            search_limits_override=body.search_limits,
        )
        await session.commit()
        return res
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        if not isinstance(exc, (ResearchLeaseConflictError, LookupError)):
            try:
                await pause_research_run(session, run_uuid=str(run_uuid), user_uuid=str(user["user_uuid"]))
                await session.commit()
            except Exception:  # noqa: BLE001
                await session.rollback()
        _raise_domain_http_error(exc)


@app.post("/projects/{project_uuid}/research/runs/{run_uuid}/pause")
async def pause_run(
    project_uuid: uuid.UUID,
    run_uuid: uuid.UUID,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        res = await pause_research_run(session, run_uuid=str(run_uuid), user_uuid=str(user["user_uuid"]))
        await session.commit()
        return res
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


@app.post("/projects/{project_uuid}/research/runs/{run_uuid}/resume")
async def resume_run(
    project_uuid: uuid.UUID,
    run_uuid: uuid.UUID,
    body: RunnerLeaseRequest,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        res = await resume_research_run(
            session,
            run_uuid=str(run_uuid),
            user_uuid=str(user["user_uuid"]),
            runner_id=body.runner_id,
        )
        await session.commit()
        return res
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


# ---------------------------------------------------------------------------
# Knowledge Graph Read, Sync & Chat-to-Decision Proposals (T089, T091)
# ---------------------------------------------------------------------------


@app.get("/projects/{project_uuid}/graph")
async def read_project_graph(project_uuid: uuid.UUID, user: CurrentUser, session: DBSession):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    nodes = (
        await session.execute(
            text(
                """
                SELECT node_uuid, type, role, layer, name, summary, text, aliases, status
                FROM nodes
                WHERE project_uuid = :p
                ORDER BY created_at DESC
                LIMIT 200
                """
            ),
            {"p": str(project_uuid)},
        )
    ).mappings().all()
    edges = (
        await session.execute(
            text(
                """
                SELECT edge_uuid, src_node, dst_node, type, kind, scope, aspects, status
                FROM edges
                WHERE project_uuid = :p
                ORDER BY created_at DESC
                LIMIT 400
                """
            ),
            {"p": str(project_uuid)},
        )
    ).mappings().all()
    return {
        "nodes": [dict(n, node_uuid=str(n["node_uuid"]), aliases=list(n["aliases"] or [])) for n in nodes],
        "edges": [
            dict(
                e,
                edge_uuid=str(e["edge_uuid"]),
                src_node=str(e["src_node"]),
                dst_node=str(e["dst_node"]),
                aspects=list(e["aspects"] or []),
            )
            for e in edges
        ],
    }


@app.post("/projects/{project_uuid}/graph/sync")
async def trigger_graph_sync(project_uuid: uuid.UUID, user: CurrentUser, session: DBSession):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        return await sync_project_to_aura(str(project_uuid))
    except AuraUnavailableError as exc:
        raise HTTPException(503, str(exc)) from exc


class GraphProposalRequest(BaseModel):
    convo_uuid: uuid.UUID
    transcript_text: str = Field(min_length=1)
    model: str | None = None


@app.post("/projects/{project_uuid}/graph/proposals")
async def create_graph_proposals(
    project_uuid: uuid.UUID,
    body: GraphProposalRequest,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    return await propose_from_conversation(
        project_uuid=str(project_uuid),
        convo_uuid=str(body.convo_uuid),
        transcript_text=body.transcript_text,
        model=body.model,
    )


class ApproveProposalRequest(BaseModel):
    convo_uuid: uuid.UUID | None = None
    message_uuid: uuid.UUID | None = None
    nodes: list[dict[str, Any]] = Field(default_factory=list)
    edges: list[dict[str, Any]] = Field(default_factory=list)


@app.post("/projects/{project_uuid}/graph/proposals/approve")
async def approve_proposals(
    project_uuid: uuid.UUID,
    body: ApproveProposalRequest,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]), require_write=True)
    return await approve_graph_proposal(
        project_uuid=str(project_uuid),
        user_uuid=str(user["user_uuid"]),
        convo_uuid=str(body.convo_uuid) if body.convo_uuid else None,
        message_uuid=str(body.message_uuid) if body.message_uuid else None,
        nodes=body.nodes,
        edges=body.edges,
    )


# ---------------------------------------------------------------------------
# Versioned Artifacts (T099)
# ---------------------------------------------------------------------------


class GenerateArtifactRequest(BaseModel):
    artifact_type: str = "architecture_plan"
    title: str = Field(min_length=1)
    instructions: str = ""
    convo_uuid: uuid.UUID | None = None
    artifact_uuid: uuid.UUID | None = None
    mode: Literal["managed", "byok"] = "managed"
    model: str | None = None
    base_url: str | None = None


@app.post("/projects/{project_uuid}/artifacts")
async def create_or_update_artifact(
    project_uuid: uuid.UUID,
    body: GenerateArtifactRequest,
    user: CurrentUser,
    session: DBSession,
    x_llm_api_key: str | None = Header(default=None),
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]), require_write=True)
    try:
        art = await generate_project_artifact(
            session,
            project_uuid=str(project_uuid),
            user_uuid=str(user["user_uuid"]),
            artifact_type=body.artifact_type,
            title=body.title,
            instructions=body.instructions,
            convo_uuid=str(body.convo_uuid) if body.convo_uuid else None,
            artifact_uuid=str(body.artifact_uuid) if body.artifact_uuid else None,
            mode=body.mode,
            byok_api_key=x_llm_api_key,
            base_url=body.base_url,
            model=body.model,
        )
        await session.commit()
        return art
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


@app.get("/projects/{project_uuid}/artifacts")
async def list_artifacts(project_uuid: uuid.UUID, user: CurrentUser, session: DBSession):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    return await list_project_artifacts(session, project_uuid=str(project_uuid))


@app.get("/projects/{project_uuid}/artifacts/{artifact_uuid}")
async def read_artifact(
    project_uuid: uuid.UUID,
    artifact_uuid: uuid.UUID,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        return await get_artifact_detail(
            session,
            project_uuid=str(project_uuid),
            artifact_uuid=str(artifact_uuid),
        )
    except Exception as exc:  # noqa: BLE001
        _raise_domain_http_error(exc)


@app.delete("/projects/{project_uuid}/artifacts/{artifact_uuid}")
async def remove_artifact(
    project_uuid: uuid.UUID,
    artifact_uuid: uuid.UUID,
    user: CurrentUser,
    session: DBSession,
):
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]), require_write=True)
    try:
        res = await delete_project_artifact(
            session,
            project_uuid=str(project_uuid),
            artifact_uuid=str(artifact_uuid),
        )
        await session.commit()
        return res
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)


@app.get("/projects/{project_uuid}/artifacts/{artifact_uuid}/export")
async def export_artifact(
    project_uuid: uuid.UUID,
    artifact_uuid: uuid.UUID,
    user: CurrentUser,
    session: DBSession,
    fmt: Annotated[Literal["md", "pdf", "docx"], Query(alias="format")] = "md",
):
    """Install / download an artifact locally as Markdown (.md), PDF (.pdf), or Word (.docx)."""
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]))
    try:
        detail = await get_artifact_detail(
            session,
            project_uuid=str(project_uuid),
            artifact_uuid=str(artifact_uuid),
        )
        if fmt == "md":
            versions = list(detail.get("versions") or [])
            content_str = str(versions[0].get("content") if versions else "")
            title = str(detail.get("title") or "artifact")
            fname = export_filename(title, "pdf")[:-4] + ".md"
            return Response(
                content=content_str.encode("utf-8"),
                media_type="text/markdown; charset=utf-8",
                headers={"Content-Disposition": f'attachment; filename="{fname}"'},
            )
        export_doc = build_artifact_export(detail)
    except Exception as exc:  # noqa: BLE001
        _raise_domain_http_error(exc)

    renderer = render_pdf if fmt == "pdf" else render_docx
    content = await asyncio.to_thread(renderer, export_doc)
    return Response(
        content=content,
        media_type=MEDIA_TYPES[fmt],
        headers={"Content-Disposition": f'attachment; filename="{export_filename(export_doc.title, fmt)}"'},
    )


@app.post("/projects/{project_uuid}/artifacts/{artifact_uuid}/add-to-kb")
async def promote_artifact_to_kb(
    project_uuid: uuid.UUID,
    artifact_uuid: uuid.UUID,
    user: CurrentUser,
    session: DBSession,
):
    """Promote an artifact into the project's Knowledge Base (`documents` + `chunks` Vector RAG)."""
    await _ensure_member(session, project_uuid=project_uuid, user_uuid=str(user["user_uuid"]), require_write=True)
    try:
        doc = await add_artifact_to_knowledge_base(
            session,
            project_uuid=str(project_uuid),
            artifact_uuid=str(artifact_uuid),
            user_uuid=str(user["user_uuid"]),
        )
        await session.commit()
        return doc
    except Exception as exc:  # noqa: BLE001
        await session.rollback()
        _raise_domain_http_error(exc)
