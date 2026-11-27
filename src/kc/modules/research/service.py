"""Window-bound Deep Research engine with single-runner leases, 60s heartbeat auto-pause,
checkpointed multi-step execution, and non-duplicating resume (D020, D021, T097)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import logging
import re
from typing import Any, Literal
import uuid

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.kc.core.config import settings
from src.kc.core.llm import call_with_retries, scrub_secrets
from src.kc.modules.chat.byok import get_turn_llm_client, resolve_model_name
from src.kc.modules.chat.citations import humanize_answer_references, validate_and_build_citations
from src.kc.modules.chat.conversations import compute_source_scope, record_message_sources, create_conversation
from src.kc.modules.chat.prompts import (
    RESEARCH_PLAN_SYSTEM_PROMPT,
    RESEARCH_REPORT_SYSTEM_PROMPT,
    RESEARCH_STEP_SYSTEM_PROMPT,
)
from src.kc.modules.search import graph_rag
from src.kc.modules.usage.service import check_and_consume_quota
from src.kc.modules.websearch.service import route_and_execute_web_search

logger = logging.getLogger(__name__)


class ResearchLeaseConflictError(RuntimeError):
    """Raised (HTTP 409) when another window/tab owns an active lease on the research run."""


class ActiveResearchRunLimitError(RuntimeError):
    """Raised (HTTP 409) when the user already has an active deep research run in progress."""


class ResearchPlanOutput(BaseModel):
    sub_questions: list[str] = Field(
        default_factory=list,
        description="3-5 focused sub-questions decomposing the main research question",
    )


_DOC_FILENAME_RE = re.compile(r"\b[\w.-]+\.(?:pdf|docx?|pptx?|xlsx?|csv|txt|md)\b", re.IGNORECASE)
_LOCAL_SCOPE_PHRASE_RE = re.compile(
    r"\b(?:as defined in|documented across|across all available sources|in (?:this|the) (?:project|workspace|uploaded) (?:sources?|documents?|files?))[^?;.]*",
    re.IGNORECASE,
)


def _format_web_search_query(sub_question: str) -> str:
    """Strip internal filenames and doc-local qualifiers so SerpApi receives an effective web query."""
    cleaned = _DOC_FILENAME_RE.sub(" ", sub_question)
    cleaned = _LOCAL_SCOPE_PHRASE_RE.sub(" ", cleaned)
    cleaned = re.sub(r"[?!\"']+", " ", cleaned)
    words = [w for w in re.split(r"\s+", cleaned.strip()) if w]
    if len(words) > 16:
        words = words[:16]
    candidate = " ".join(words).strip()
    if len(words) < 2:
        fallback_words = [w for w in re.split(r"\s+", sub_question.strip()) if w][:16]
        return " ".join(fallback_words)
    return candidate


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_plan(raw_plan: Any) -> dict[str, Any]:
    if raw_plan is None:
        return {"sub_questions": [], "findings": [], "shown_chunks": {}, "shown_nodes": {}, "shown_urls": {}, "final_report": None}
    if isinstance(raw_plan, str):
        parsed = json.loads(raw_plan)
    else:
        parsed = dict(raw_plan)
    parsed.setdefault("sub_questions", [])
    parsed.setdefault("findings", [])
    parsed.setdefault("shown_chunks", {})
    parsed.setdefault("shown_nodes", {})
    parsed.setdefault("shown_urls", {})
    parsed.setdefault("final_report", None)
    return parsed


def _serialize_run(row: Any) -> dict[str, Any]:
    plan = _parse_plan(row.get("plan"))
    return {
        "run_uuid": str(row["run_uuid"]),
        "project_uuid": str(row["project_uuid"]),
        "convo_uuid": str(row["convo_uuid"]),
        "user_uuid": str(row["user_uuid"]),
        "question": row["question"],
        "status": row["status"],
        "mode": row["mode"],
        "search_source": row["search_source"],
        "searches_used": int(row["searches_used"] or 0),
        "search_budget": int(row["search_budget"]) if row.get("search_budget") is not None else None,
        "steps_used": int(row["steps_used"] or 0),
        "runner_id": row.get("runner_id"),
        "lease_until": row["lease_until"].isoformat() if row.get("lease_until") else None,
        "last_heartbeat_at": row["last_heartbeat_at"].isoformat() if row.get("last_heartbeat_at") else None,
        "expires_at": row["expires_at"].isoformat() if row.get("expires_at") else None,
        "finished_at": row["finished_at"].isoformat() if row.get("finished_at") else None,
        "plan": plan,
    }


async def _generate_sub_questions(
    question: str,
    *,
    llm_client: Any,
    model: str,
    max_steps: int,
    sources_context: str = "",
) -> list[str]:
    prompt_text = f"Main Research Question: {question}"
    if sources_context:
        prompt_text = f"{sources_context}\n\n{prompt_text}"
    try:
        async def _call() -> Any:
            return await llm_client.aio.interactions.create(
                model=model,
                system_instruction=RESEARCH_PLAN_SYSTEM_PROMPT,
                input=[{"type": "text", "text": prompt_text}],
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": ResearchPlanOutput.model_json_schema(),
                },
                store=False,
                stream=False,
            )

        interaction = await call_with_retries(_call)
        raw = getattr(interaction, "output_text", "") or ""
        if raw:
            parsed = ResearchPlanOutput.model_validate_json(raw)
            cleaned = [s.strip() for s in parsed.sub_questions if s and s.strip()][:max_steps]
            if cleaned:
                return cleaned
    except Exception as exc:  # noqa: BLE001
        logger.debug("Using deterministic fallback research plan: %s", scrub_secrets(str(exc)))

    return [
        f"Project architecture & core evidence for: {question}",
        f"Decisions, constraints, and trade-offs related to: {question}",
        f"Open questions, gaps, or external best practices for: {question}",
    ][:max_steps]


async def create_research_run(
    session: AsyncSession,
    *,
    project_uuid: str,
    user_uuid: str,
    question: str,
    convo_uuid: str | None = None,
    mode: Literal["managed", "byok"] = "managed",
    model: str | None = None,
    serp_api_key: str | None = None,
    byok_api_key: str | None = None,
    base_url: str | None = None,
    search_budget: int | None = None,
    runner_id: str | None = None,
) -> dict[str, Any]:
    """Create and lease a checkpointed Deep Research run (max 1 active run per user, D021)."""
    clean_question = question.strip()
    if not clean_question:
        raise ValueError("Research question must not be empty")

    active_runner = runner_id or str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc)
    hb_cutoff = now_utc - timedelta(seconds=settings.research_heartbeat_timeout_seconds)

    active_existing = (
        await session.execute(
            text(
                """
                SELECT run_uuid
                FROM research_runs
                WHERE user_uuid = :u AND status IN ('planned', 'running')
                LIMIT 1
                """
            ),
            {"u": str(user_uuid)},
        )
    ).scalar_one_or_none()
    if active_existing is not None:
        existing_row = (
            await session.execute(
                text("SELECT * FROM research_runs WHERE run_uuid = :r AND user_uuid = :u"),
                {"r": str(active_existing), "u": str(user_uuid)},
            )
        ).mappings().first()
        existing_lease = _as_utc(existing_row.get("lease_until")) if existing_row else None
        existing_hb = _as_utc(existing_row.get("last_heartbeat_at")) if existing_row else None
        is_same_tab = bool(existing_row and runner_id and existing_row.get("runner_id") == runner_id)
        is_stale = bool(
            (existing_lease is not None and existing_lease <= now_utc)
            or (existing_hb is not None and existing_hb <= hb_cutoff)
        )
        if is_same_tab or is_stale:
            await pause_research_run(session, run_uuid=str(active_existing), user_uuid=str(user_uuid))
        else:
            raise ActiveResearchRunLimitError(
                f"User already has an active research run ({active_existing}). Pause or finish it first."
            )

    llm_client = get_turn_llm_client(mode=mode, byok_api_key=byok_api_key, base_url=base_url)
    resolved_model = resolve_model_name(model)

    if convo_uuid is None:
        convo = await create_conversation(
            session,
            project_uuid=project_uuid,
            user_uuid=user_uuid,
            title=f"Deep Research: {clean_question[:64]}",
            visibility="private",
        )
        resolved_convo = convo["convo_uuid"]
    else:
        resolved_convo = str(convo_uuid)

    clean_serp = (serp_api_key or "").strip()
    if clean_serp:
        search_source: Literal["vertex", "serpapi", "none"] = "serpapi"
    elif mode == "managed" and not (settings.openrouter_api_key or "").strip():
        search_source = "vertex"
    else:
        search_source = "none"

    budget = min(
        int(search_budget) if search_budget is not None else settings.research_max_searches_per_run,
        settings.research_max_searches_per_run,
    )
    max_steps = settings.research_max_steps_per_run
    source_scope, _, docs_meta = await compute_source_scope(
        session,
        project_uuid=project_uuid,
        convo_uuid=resolved_convo,
    )
    source_lines = [
        f"- {docs_meta[did]['filename']}: {docs_meta[did].get('description') or 'project source'}"
        for did in source_scope
        if did in docs_meta
    ]
    sources_context = "Active Project Sources:\n" + "\n".join(source_lines) if source_lines else ""
    sub_qs = await _generate_sub_questions(
        clean_question,
        llm_client=llm_client,
        model=resolved_model,
        max_steps=max_steps,
        sources_context=sources_context,
    )
    plan_payload: dict[str, Any] = {
        "model": resolved_model,
        "sub_questions": [
            {"step_index": i, "sub_question": sq, "status": "pending"}
            for i, sq in enumerate(sub_qs)
        ],
        "findings": [],
        "shown_chunks": {},
        "shown_nodes": {},
        "shown_urls": {},
        "final_report": None,
        **(
            {
                "search_note": (
                    "Web search inactive: enter your SerpApi key in Settings -> Search & Keys on this device."
                )
            }
            if search_source == "none"
            else {}
        ),
    }

    created_done_utc = datetime.now(timezone.utc)
    lease_until = created_done_utc + timedelta(seconds=settings.research_lease_seconds)
    expires_at = created_done_utc + timedelta(days=7)

    row = (
        await session.execute(
            text(
                """
                INSERT INTO research_runs (
                    project_uuid, convo_uuid, user_uuid, question, plan, status, mode,
                    search_source, searches_used, search_budget, steps_used, runner_id,
                    lease_until, last_heartbeat_at, expires_at
                )
                VALUES (
                    :p, :c, :u, :q, CAST(:plan AS jsonb), 'running', :mode,
                    :ss, 0, :sb, 0, :rid,
                    :lease, :hb, :exp
                )
                RETURNING *
                """
            ),
            {
                "p": str(project_uuid),
                "c": resolved_convo,
                "u": str(user_uuid),
                "q": clean_question,
                "plan": json.dumps(plan_payload),
                "mode": mode,
                "ss": search_source,
                "sb": budget,
                "rid": active_runner,
                "lease": lease_until,
                "hb": created_done_utc,
                "exp": expires_at,
            },
        )
    ).mappings().one()
    return _serialize_run(row)


async def get_research_run(
    session: AsyncSession,
    *,
    run_uuid: str,
    user_uuid: str,
) -> dict[str, Any]:
    row = (
        await session.execute(
            text(
                """
                SELECT * FROM research_runs
                WHERE run_uuid = :r AND user_uuid = :u
                """
            ),
            {"r": str(run_uuid), "u": str(user_uuid)},
        )
    ).mappings().first()
    if row is None:
        raise LookupError("Research run not found")
    return _serialize_run(row)


async def heartbeat_research_run(
    session: AsyncSession,
    *,
    run_uuid: str,
    user_uuid: str,
    runner_id: str,
) -> dict[str, Any]:
    """Extend the browser tab lease and record last_heartbeat_at (D021)."""
    row = (
        await session.execute(
            text(
                """
                SELECT * FROM research_runs
                WHERE run_uuid = :r AND user_uuid = :u
                """
            ),
            {"r": str(run_uuid), "u": str(user_uuid)},
        )
    ).mappings().first()
    if row is None:
        raise LookupError("Research run not found")

    now_utc = datetime.now(timezone.utc)
    current_lease = _as_utc(row["lease_until"])
    if row["runner_id"] and row["runner_id"] != runner_id and current_lease and current_lease > now_utc:
        raise ResearchLeaseConflictError("Another active browser tab holds the lease for this research run.")

    new_lease = now_utc + timedelta(seconds=settings.research_lease_seconds)
    updated = (
        await session.execute(
            text(
                """
                UPDATE research_runs
                SET runner_id = :rid,
                    last_heartbeat_at = :hb,
                    lease_until = :lease,
                    updated_at = now()
                WHERE run_uuid = :r
                RETURNING *
                """
            ),
            {"r": str(run_uuid), "rid": runner_id, "hb": now_utc, "lease": new_lease},
        )
    ).mappings().one()
    return _serialize_run(updated)


async def pause_research_run(
    session: AsyncSession,
    *,
    run_uuid: str,
    user_uuid: str,
) -> dict[str, Any]:
    """Pause an active research run cleanly at its current checkpoint (D021)."""
    updated = (
        await session.execute(
            text(
                """
                UPDATE research_runs
                SET status = 'paused',
                    lease_until = now(),
                    updated_at = now()
                WHERE run_uuid = :r AND user_uuid = :u
                RETURNING *
                """
            ),
            {"r": str(run_uuid), "u": str(user_uuid)},
        )
    ).mappings().first()
    if updated is None:
        raise LookupError("Research run not found")
    return _serialize_run(updated)


async def resume_research_run(
    session: AsyncSession,
    *,
    run_uuid: str,
    user_uuid: str,
    runner_id: str,
) -> dict[str, Any]:
    """Resume a paused research run from its checkpoint if within 7-day retention (D021)."""
    row = (
        await session.execute(
            text(
                """
                SELECT * FROM research_runs
                WHERE run_uuid = :r AND user_uuid = :u
                """
            ),
            {"r": str(run_uuid), "u": str(user_uuid)},
        )
    ).mappings().first()
    if row is None:
        raise LookupError("Research run not found")

    now_utc = datetime.now(timezone.utc)
    expires_at = _as_utc(row["expires_at"])
    if expires_at is not None and expires_at <= now_utc:
        await session.execute(
            text("UPDATE research_runs SET status = 'cancelled', updated_at = now() WHERE run_uuid = :r"),
            {"r": str(run_uuid)},
        )
        raise ValueError("Research run checkpoint has expired past its 7-day TTL.")

    new_lease = now_utc + timedelta(seconds=settings.research_lease_seconds)
    updated = (
        await session.execute(
            text(
                """
                UPDATE research_runs
                SET status = CASE WHEN status = 'completed' THEN 'completed' ELSE 'running' END,
                    runner_id = :rid,
                    last_heartbeat_at = :hb,
                    lease_until = :lease,
                    updated_at = now()
                WHERE run_uuid = :r
                RETURNING *
                """
            ),
            {"r": str(run_uuid), "rid": runner_id, "hb": now_utc, "lease": new_lease},
        )
    ).mappings().one()
    return _serialize_run(updated)


async def _synthesize_step_summary(
    *,
    llm_client: Any,
    model: str,
    sub_question: str,
    chunks: list[dict[str, Any]],
    graph: dict[str, Any],
    web_results: list[dict[str, Any]],
) -> str:
    ctx = graph_rag.format_context_within_budget(chunks[:4], graph, max_chars=8000)
    web_text = "\n".join(f"- {w.get('title')}: {w.get('snippet')} ({w.get('url')})" for w in web_results[:4])
    prompt = (
        f"Sub-question: {sub_question}\n\n"
        f"{ctx}\n\nWeb Snippets:\n{web_text or '(none)'}\n\n"
        "Write a concise 2-4 sentence grounded note citing exact chunk_ids/node_uuids/URLs."
    )
    try:
        async def _call() -> Any:
            return await llm_client.aio.interactions.create(
                model=model,
                system_instruction=RESEARCH_STEP_SYSTEM_PROMPT,
                input=[{"type": "text", "text": prompt}],
                store=False,
                stream=False,
            )

        res = await call_with_retries(_call)
        txt = (getattr(res, "output_text", "") or "").strip()
        if txt:
            return txt
    except Exception as exc:  # noqa: BLE001
        logger.debug("Step summary fallback for %r: %s", sub_question, scrub_secrets(str(exc)))

    return (
        f"Retrieved {len(chunks)} chunks, {len(graph.get('nodes') or [])} graph nodes, "
        f"and {len(web_results)} web results for '{sub_question}'."
    )


async def _synthesize_final_report(
    *,
    llm_client: Any,
    model: str,
    question: str,
    plan: dict[str, Any],
    allowed_doc_set: set[str] | None,
    excluded_docs: set[str],
    docs_meta: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    findings = plan.get("findings") or []
    shown_chunks: dict[str, dict[str, Any]] = plan.get("shown_chunks") or {}
    shown_nodes: dict[str, dict[str, Any]] = plan.get("shown_nodes") or {}
    shown_urls: dict[str, dict[str, Any]] = plan.get("shown_urls") or {}

    findings_text = "\n\n".join(
        f"### Step {int(f['step_index']) + 1}: {f['sub_question']}\n{f['summary']}"
        for f in findings
    )
    prompt = f"Main Research Question: {question}\n\nStep Findings:\n{findings_text}"

    try:
        async def _call() -> Any:
            return await llm_client.aio.interactions.create(
                model=model,
                system_instruction=RESEARCH_REPORT_SYSTEM_PROMPT,
                input=[{"type": "text", "text": prompt}],
                generation_config={"max_output_tokens": settings.chat_max_output_tokens},
                store=False,
                stream=False,
            )

        res = await call_with_retries(_call, max_attempts=2)
        report_text = (getattr(res, "output_text", "") or "").strip()
    except Exception:  # noqa: BLE001
        report_text = ""

    if not report_text:
        report_text = f"# Research Report: {question}\n\n" + findings_text

    report_text = humanize_answer_references(
        report_text,
        shown_chunks=shown_chunks,
        shown_nodes=shown_nodes,
        docs_meta=docs_meta,
    )

    citation_bundle = validate_and_build_citations(
        cited_chunk_ids=list(shown_chunks.keys())[:8],
        cited_node_uuids=list(shown_nodes.keys())[:6],
        cited_urls=list(shown_urls.keys())[:6],
        shown_chunks=shown_chunks,
        shown_nodes=shown_nodes,
        shown_urls=shown_urls,
        allowed_doc_uuids=allowed_doc_set,
        excluded_doc_uuids=excluded_docs,
        docs_meta=docs_meta,
    )
    return {
        "report": report_text,
        "citations": citation_bundle["citations"],
        "citation_details": citation_bundle["citation_details"],
        "message_sources": citation_bundle["message_sources"],
    }


async def step_research_run(
    session: AsyncSession,
    *,
    run_uuid: str,
    user_uuid: str,
    runner_id: str,
    byok_api_key: str | None = None,
    serp_api_key: str | None = None,
    base_url: str | None = None,
    search_limits_override: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Execute the next pending sub-question checkpoint of a Deep Research run (D021, T097)."""
    row = (
        await session.execute(
            text(
                """
                SELECT * FROM research_runs
                WHERE run_uuid = :r AND user_uuid = :u
                """
            ),
            {"r": str(run_uuid), "u": str(user_uuid)},
        )
    ).mappings().first()
    if row is None:
        raise LookupError("Research run not found")

    if row["status"] in ("completed", "failed", "cancelled"):
        return _serialize_run(row)

    now_utc = datetime.now(timezone.utc)
    expires_at = _as_utc(row.get("expires_at"))
    if expires_at is not None and expires_at <= now_utc:
        expired = (
            await session.execute(
                text(
                    """
                    UPDATE research_runs
                    SET status = 'cancelled', updated_at = now()
                    WHERE run_uuid = :r
                    RETURNING *
                    """
                ),
                {"r": str(run_uuid)},
            )
        ).mappings().one()
        return _serialize_run(expired)

    current_lease = _as_utc(row.get("lease_until"))
    if row["runner_id"] and row["runner_id"] != runner_id and current_lease and current_lease > now_utc:
        raise ResearchLeaseConflictError("Another active tab holds the lease on this research run.")

    last_hb = _as_utc(row.get("last_heartbeat_at"))
    if last_hb and (now_utc - last_hb).total_seconds() > settings.research_heartbeat_timeout_seconds:
        paused = (
            await session.execute(
                text(
                    """
                    UPDATE research_runs
                    SET status = 'paused', updated_at = now()
                    WHERE run_uuid = :r
                    RETURNING *
                    """
                ),
                {"r": str(run_uuid)},
            )
        ).mappings().one()
        return _serialize_run(paused)

    if row["status"] == "paused":
        return _serialize_run(row)

    mode: Literal["managed", "byok"] = row["mode"] or "managed"
    plan = _parse_plan(row.get("plan"))
    resolved_model = resolve_model_name(plan.get("model"))
    llm_client = get_turn_llm_client(mode=mode, byok_api_key=byok_api_key, base_url=base_url)

    sub_questions: list[dict[str, Any]] = plan["sub_questions"]
    pending_item = next((sq for sq in sub_questions if sq.get("status") != "completed"), None)

    project_uuid = str(row["project_uuid"])
    convo_uuid = str(row["convo_uuid"])
    source_scope, excluded_docs, docs_meta = await compute_source_scope(
        session,
        project_uuid=project_uuid,
        convo_uuid=convo_uuid,
    )

    steps_used = int(row["steps_used"] or 0)
    searches_used = int(row["searches_used"] or 0)
    search_budget = int(row["search_budget"]) if row.get("search_budget") is not None else settings.research_max_searches_per_run
    used_source = "none"

    if pending_item is not None and steps_used < settings.research_max_steps_per_run:
        if mode == "managed":
            await check_and_consume_quota(
                session,
                user_uuid=str(user_uuid),
                project_uuid=project_uuid,
                kind="llm_call",
                amount=1,
            )

        sub_q = str(pending_item["sub_question"])
        ctx = await graph_rag.retrieve_context(
            project_uuid=project_uuid,
            query=sub_q,
            excluded_docs=excluded_docs or None,
            convo_uuid=convo_uuid,
            k_chunks=6,
            k_nodes=4,
            search_mode="hybrid",
            use_graph=True,
        )
        chunks = list(ctx.get("chunks") or [])
        graph = dict(ctx.get("graph") or {})
        for c in chunks:
            if c.get("chunk_id"):
                plan["shown_chunks"][str(c["chunk_id"])] = c
        for n in graph.get("nodes") or []:
            if n.get("node_uuid"):
                plan["shown_nodes"][str(n["node_uuid"])] = n

        web_results: list[dict[str, Any]] = []
        queries_metered = 0
        used_source = "none"
        search_error: str | None = None
        effective_serp = (serp_api_key or "").strip() or None
        can_search = bool(effective_serp) or (
            mode == "managed" and not (settings.openrouter_api_key or "").strip()
        )
        if can_search and searches_used < search_budget and (row.get("search_source") != "none" or bool(effective_serp)):
            try:
                web_query = _format_web_search_query(sub_q)
                web_res = await route_and_execute_web_search(
                    session,
                    user_uuid=str(user_uuid),
                    project_uuid=project_uuid,
                    query=web_query,
                    mode=mode,
                    serp_api_key=effective_serp,
                    search_limits_override=search_limits_override,
                    run_searches_used=searches_used,
                    run_search_budget=search_budget,
                )
                web_results = list(web_res.get("results") or [])
                queries_metered = int(web_res.get("queries_metered") or 0)
                used_source = str(web_res.get("source") or "none")
                searches_used += queries_metered
                if used_source != "none":
                    plan.pop("search_note", None)
                for item in web_results:
                    u = str(item.get("url") or "")
                    if u:
                        plan["shown_urls"][u] = {**item, "source": used_source}
            except Exception as web_exc:  # noqa: BLE001
                search_error = scrub_secrets(str(web_exc))
                logger.warning("Deep research web search failed at step: %s", search_error)

        step_summary = await _synthesize_step_summary(
            llm_client=llm_client,
            model=resolved_model,
            sub_question=sub_q,
            chunks=chunks,
            graph=graph,
            web_results=web_results,
        )
        pending_item["status"] = "completed"
        plan["findings"].append(
            {
                "step_index": pending_item["step_index"],
                "sub_question": sub_q,
                "summary": step_summary,
                "search_source": used_source,
                "queries_metered": queries_metered,
                **({"search_error": search_error} if search_error else {}),
            }
        )
        steps_used += 1

    remaining = [sq for sq in sub_questions if sq.get("status") != "completed"]
    all_done = len(remaining) == 0 or steps_used >= settings.research_max_steps_per_run

    new_status = "running"
    if all_done:
        new_status = "completed"
        final_report = await _synthesize_final_report(
            llm_client=llm_client,
            model=resolved_model,
            question=str(row["question"]),
            plan=plan,
            allowed_doc_set=set(source_scope) if source_scope else None,
            excluded_docs=set(excluded_docs),
            docs_meta=docs_meta,
        )
        msg_sources = final_report.pop("message_sources", [])
        convo_id = row.get("convo_uuid")
        if convo_id is not None:
            human_id = (
                await session.execute(
                    text(
                        """
                        INSERT INTO messages (convo_uuid, user_uuid, content, type, status, mode, model, source_scope)
                        VALUES (:c, :u, :content, 'human', 'answered', :mode, :model, CAST(:scope AS uuid[]))
                        RETURNING message_uuid
                        """
                    ),
                    {
                        "c": str(convo_id),
                        "u": str(user_uuid),
                        "content": str(row["question"]),
                        "mode": str(row.get("mode") or "managed"),
                        "model": resolved_model,
                        "scope": source_scope,
                    },
                )
            ).scalar_one_or_none()
            ai_id = (
                await session.execute(
                    text(
                        """
                        INSERT INTO messages (convo_uuid, user_uuid, content, type, status, mode, model, source_scope)
                        VALUES (:c, NULL, :content, 'ai', 'answered', :mode, :model, CAST(:scope AS uuid[]))
                        RETURNING message_uuid
                        """
                    ),
                    {
                        "c": str(convo_id),
                        "content": final_report["report"],
                        "mode": str(row.get("mode") or "managed"),
                        "model": resolved_model,
                        "scope": source_scope,
                    },
                )
            ).scalar_one_or_none()
            if human_id is not None:
                final_report["human_message_uuid"] = str(human_id)
            if ai_id is not None:
                final_report["message_uuid"] = str(ai_id)
                if msg_sources:
                    await record_message_sources(session, message_uuid=str(ai_id), sources=msg_sources)
        plan["final_report"] = final_report

    effective_run_source = (
        used_source
        if pending_item is not None and steps_used <= settings.research_max_steps_per_run and used_source != "none"
        else str(row.get("search_source") or "none")
    )
    # Capture wall-clock completion time after RAG/SerpApi/LLM calls finish; Postgres now()
    # reflects transaction start and would backdate last_heartbeat_at past concurrent heartbeats.
    step_done_utc = datetime.now(timezone.utc)
    new_lease = step_done_utc + timedelta(seconds=settings.research_lease_seconds)
    updated = (
        await session.execute(
            text(
                """
                UPDATE research_runs
                SET plan = CAST(:plan AS jsonb),
                    status = :st,
                    search_source = :ss,
                    searches_used = :su,
                    steps_used = :steps,
                    runner_id = :rid,
                    lease_until = :lease,
                    last_heartbeat_at = GREATEST(COALESCE(last_heartbeat_at, :hb), :hb),
                    updated_at = :hb,
                    finished_at = CASE WHEN :st = 'completed' THEN :hb ELSE finished_at END
                WHERE run_uuid = :r
                RETURNING *
                """
            ),
            {
                "r": str(run_uuid),
                "plan": json.dumps(plan),
                "st": new_status,
                "ss": effective_run_source,
                "su": searches_used,
                "steps": steps_used,
                "rid": runner_id,
                "lease": new_lease,
                "hb": step_done_utc,
            },
        )
    ).mappings().one()
    return _serialize_run(updated)
