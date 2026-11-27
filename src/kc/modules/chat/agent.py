"""Conversational agent orchestrator: quota enforcement, BYOK routing, query rewriting,
multi-tool retrieval (Hybrid RAG + Knowledge Graph + Web Search/Fetch), citation verification,
and SSE streaming (D018, D019, D020, D022, D023, T057-T061, T102)."""
from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import AsyncIterator
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.kc.core.config import settings
from src.kc.core.llm import call_with_retries, scrub_secrets
from src.kc.core.openrouter import extract_json_object
from src.kc.modules.chat.byok import get_turn_llm_client, resolve_model_name
from src.kc.modules.chat.citations import humanize_answer_references, validate_and_build_citations
from src.kc.modules.chat.conversations import (
    compute_source_scope,
    record_message_sources,
)
from src.kc.modules.chat.prompts import (
    AGENT_ANSWER_SYSTEM_PROMPT,
    AGENT_TOOL_SYSTEM_PROMPT,
)
from src.kc.modules.chat.rewrite import rewrite_followup_query
from src.kc.modules.graph import read_tools
from src.kc.modules.search import graph_rag
from src.kc.modules.usage.service import check_and_consume_quota, refund_usage_event
from src.kc.modules.websearch.fetch import SSRFBlockedError, fetch_safe_page
from src.kc.modules.websearch.service import route_and_execute_web_search

logger = logging.getLogger(__name__)

MAX_TOOL_CALLS_PER_TURN = 8
CITATION_OPEN = "<citations>"
CITATION_CLOSE = "</citations>"

WEB_TOOL_DECLARATIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "web_search",
        "description": "Search the public web for external facts or documentation not covered in project files.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Web search query"},
            },
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "fetch_web_page",
        "description": "Fetch and sanitize text from a public HTTP(S) URL returned by web_search.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "Public HTTP or HTTPS URL to fetch"},
            },
            "required": ["url"],
        },
    },
]

ARTIFACT_TOOL_DECLARATIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "create_artifact",
        "description": "Generate and save a versioned project artifact (Architecture Plan, ADR, PRD, Report, or Diagram) grounded in project sources.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Clear title for the artifact"},
                "artifact_type": {
                    "type": "string",
                    "description": "One of: architecture_plan, adr, prd, report, diagram, other",
                },
                "instructions": {
                    "type": "string",
                    "description": "Specific sections, focus areas, or requirements for the artifact",
                },
            },
            "required": ["title", "artifact_type"],
        },
    }
]

_GREETING_PREFIX_RE = (
    r"(?:hi|hello|hey|howdy|yo|sup|hiya|greetings|good\s+(?:morning|afternoon|evening|night))"
)
_SMALL_TALK_TAIL_RE = (
    r"(?:how\s+are\s+you(?:\s+doing)?|what(?:'s|\s+is)\s+up|how(?:'s|\s+is)\s+it\s+going)"
)

_CONVERSATIONAL_FAST_PATH_RE = re.compile(
    rf"^(?:"
    rf"{_GREETING_PREFIX_RE}(?:[\s,!]+[a-z'_-]+){{0,2}}(?:[\s,!?]+{_SMALL_TALK_TAIL_RE})?"
    rf"|(?:thanks|thank\s+you|thx|ty)(?:[\s,!]+(?:a\s+lot|so\s+much|very\s+much|[a-z'_-]+))?"
    rf"|who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|{_SMALL_TALK_TAIL_RE}"
    rf")[!.?,\s]*$",
    re.IGNORECASE,
)

_TASK_OR_DOC_KEYWORD_RE = re.compile(
    r"\b(?:doc|document|docs|documents|file|files|pdf|page|pages|paragraph|source|sources|chunk|cite|citation|summary|summarize|explain|analy[sz]e|compare|find|search|lookup|architecture|adr|prd|artifact|report|diagram|schema|decision|spec|code|table|section|review|check|tell|help|write|create|generate|draft|build|list|show)\b",
    re.IGNORECASE,
)

_ARTIFACT_INTENT_RE = re.compile(
    r"\b(?:create|generate|draft|write|build|save|make)\b.*\b(?:artifact|adr|prd|architecture\s+plan|design\s+doc|report|diagram)\b",
    re.IGNORECASE,
)

_RAW_TOOL_CALL_RE = re.compile(
    r"\[TOOL\s+[a-zA-Z0-9_]+\(\s*(?:\{.*?\}\s*\)|[^\)\n]*\))\]",
    re.DOTALL,
)


def _strip_raw_tool_calls(text: str) -> tuple[str, bool]:
    """Remove leaked raw `[TOOL ...]` pseudo-calls from model output."""
    if not _RAW_TOOL_CALL_RE.search(text):
        return text, False
    cleaned = _RAW_TOOL_CALL_RE.sub("", text)
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip(), True


def _empty_scope_context_note(docs_meta: dict[str, dict[str, Any]]) -> str:
    """Explain zero-source scope cleanly to the LLM without inviting pseudo-tool calls."""
    if not docs_meta:
        return (
            "[NO ACTIVE PROJECT SOURCES] This project currently has no uploaded documents, so zero project "
            "sources were searched. Inform the user clearly that no documents are uploaded to this project yet "
            "and no project-source retrieval was performed. If the question depends on project files, ask the "
            "user to upload or select sources rather than pretending to invoke search tools."
        )
    return (
        f"[NO ACTIVE PROJECT SOURCES] All {len(docs_meta)} uploaded project source(s) are currently unticked/"
        "excluded from scope, so zero project sources were searched. Inform the user clearly that 0 sources are "
        "currently selected and invite them to tick one or more sources in the sidebar to search them, rather "
        "than pretending to invoke search tools."
    )


def _empty_scope_fallback_message(docs_meta: dict[str, dict[str, Any]]) -> str:
    if not docs_meta:
        return (
            "No sources are uploaded to this project yet (0 active sources in scope), so no project documents "
            "or graph nodes were searched. Upload at least one source or enable web research and try again."
        )
    return (
        "All project sources are currently unticked (0 active sources in scope), so no project documents "
        "or graph nodes were searched. Tick one or more sources in the sidebar to include them in retrieval."
    )


def _is_conversational_fast_path(query: str) -> bool:
    """Return True when the user's message is a greeting, thanks, or meta-question that needs zero retrieval."""
    cleaned = query.strip()
    if not cleaned or len(cleaned) > 80:
        return False
    if _TASK_OR_DOC_KEYWORD_RE.search(cleaned):
        return False
    return bool(_CONVERSATIONAL_FAST_PATH_RE.match(cleaned))


def _needs_tool_planning_loop(
    *,
    query: str,
    chunks: list[dict[str, Any]],
    research_mode: str,
    allow_web_tools: bool,
) -> bool:
    """Skip the extra LLM tool-planning round-trip when initial hybrid retrieval already has strong coverage
    (>= 3 chunks) and the user isn't requesting web research, deep research, or artifact generation."""
    if research_mode in ("web", "deep", "deep_research") or allow_web_tools:
        return True
    if _ARTIFACT_INTENT_RE.search(query):
        return True
    return len(chunks) < 3


class GroundedAgentAnswer(BaseModel):
    answer: str = Field(description="Grounded answer synthesized from verified context and tools")
    cited_chunk_ids: list[str] = Field(
        default_factory=list,
        description="Exact chunk_ids from the shown context that support the answer",
    )
    cited_node_uuids: list[str] = Field(
        default_factory=list,
        description="Exact node_uuids from the shown graph context that support the answer",
    )
    cited_urls: list[str] = Field(
        default_factory=list,
        description="Exact web URLs from shown web search or fetch tool outputs that support the answer",
    )


def _extract_usage_tokens(interaction: Any) -> tuple[int, int]:
    usage = getattr(interaction, "usage", None)
    if usage is None:
        return 0, 0
    in_tok = int(getattr(usage, "total_input_tokens", 0) or getattr(usage, "input_tokens", 0) or 0)
    out_tok = int(getattr(usage, "total_output_tokens", 0) or getattr(usage, "output_tokens", 0) or 0)
    return in_tok, out_tok


def _format_web_results_context(web_items: list[dict[str, Any]]) -> str:
    if not web_items:
        return ""
    lines = ["\n=== WEB SEARCH RESULTS (Untrusted External Context) ==="]
    for item in web_items:
        url = str(item.get("url") or "")
        title = str(item.get("title") or "")
        snippet = str(item.get("snippet") or item.get("content") or "")
        lines.append(
            f'<untrusted_web_content source_url="{url}">\nTitle: {title}\n{snippet}\n</untrusted_web_content>'
        )
    return "\n".join(lines)


async def _call_agent_tool_turn(
    *,
    llm_client: Any,
    model: str,
    prompt_text: str,
    tools: list[dict[str, Any]],
) -> tuple[dict[str, Any], int, int]:
    async def _call() -> Any:
        return await llm_client.aio.interactions.create(
            model=model,
            system_instruction=AGENT_TOOL_SYSTEM_PROMPT,
            input=[{"type": "text", "text": prompt_text}],
            tools=tools,
            store=False,
            stream=False,
        )

    interaction = await call_with_retries(_call)
    tool_calls: list[dict[str, Any]] = []
    for out in getattr(interaction, "outputs", None) or []:
        if getattr(out, "type", None) == "function_call":
            args = getattr(out, "arguments", {}) or {}
            if isinstance(args, str):
                args = json.loads(args)
            tool_calls.append({"name": getattr(out, "name", ""), "args": dict(args)})
    in_tok, out_tok = _extract_usage_tokens(interaction)
    return {
        "tool_calls": tool_calls,
        "text": getattr(interaction, "output_text", "") or "",
    }, in_tok, out_tok


async def _call_agent_structured_answer(
    *,
    llm_client: Any,
    model: str,
    prompt_text: str,
) -> tuple[GroundedAgentAnswer, int, int]:
    """Final synthesis call: plain Markdown answer + trailing `<citations>` block.

    A JSON-wrapped answer breaks on a single bad escape, which becomes likely once answers run to
    thousands of tokens, so the answer is free text and only the small citation block is JSON."""
    async def _call() -> Any:
        return await llm_client.aio.interactions.create(
            model=model,
            system_instruction=AGENT_ANSWER_SYSTEM_PROMPT,
            input=[{"type": "text", "text": prompt_text}],
            generation_config={"max_output_tokens": settings.chat_max_output_tokens},
            store=False,
            stream=False,
        )

    interaction = await call_with_retries(_call)
    raw = getattr(interaction, "output_text", "") or ""
    in_tok, out_tok = _extract_usage_tokens(interaction)
    return parse_answer_with_citations(raw), in_tok, out_tok


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(v).strip() for v in value if isinstance(v, (str, int)) and str(v).strip()]


def parse_answer_with_citations(raw: str) -> GroundedAgentAnswer:
    """Split the model's reply into the Markdown answer and its trailing citation block.

    A missing or malformed block keeps the answer and yields empty citations (they are then
    simply not shown); an unterminated block (output cut off at the token cap) is stripped."""
    text_out = (raw or "").strip()
    lower = text_out.lower()
    start = lower.rfind(CITATION_OPEN)
    if start == -1:
        return GroundedAgentAnswer(answer=text_out)

    answer = text_out[:start].rstrip()
    end = lower.find(CITATION_CLOSE, start)
    if end == -1:
        logger.info("Agent answer ended without a closing citation tag; citations dropped")
        return GroundedAgentAnswer(answer=answer)

    block = text_out[start + len(CITATION_OPEN) : end]
    try:
        data = json.loads(extract_json_object(block))
    except (json.JSONDecodeError, ValueError):
        logger.info("Agent citation block was not valid JSON; citations dropped")
        return GroundedAgentAnswer(answer=answer)
    if not isinstance(data, dict):
        return GroundedAgentAnswer(answer=answer)
    return GroundedAgentAnswer(
        answer=answer,
        cited_chunk_ids=_string_list(data.get("chunk_ids")),
        cited_node_uuids=_string_list(data.get("node_uuids")),
        cited_urls=_string_list(data.get("urls")),
    )


async def _load_recent_history(
    session: AsyncSession,
    convo_uuid: str,
    *,
    limit: int = 8,
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(
                """
                SELECT type, content
                FROM messages
                WHERE convo_uuid = :c AND status = 'answered' AND content IS NOT NULL
                ORDER BY created_at DESC
                LIMIT :lim
                """
            ),
            {"c": str(convo_uuid), "lim": limit},
        )
    ).mappings().all()
    return [{"type": r["type"], "content": r["content"]} for r in reversed(rows)]


async def _insert_turn_messages(
    session: AsyncSession,
    *,
    convo_uuid: str,
    user_uuid: str,
    user_query: str,
    mode: str,
    model: str,
    source_scope: list[str],
) -> tuple[str, str]:
    human_uuid = (
        await session.execute(
            text(
                """
                INSERT INTO messages (convo_uuid, user_uuid, content, type, status, mode, model, source_scope)
                VALUES (:c, :u, :content, 'human', 'answered', :mode, :model, CAST(:scope AS uuid[]))
                RETURNING message_uuid
                """
            ),
            {
                "c": str(convo_uuid),
                "u": str(user_uuid),
                "content": user_query,
                "mode": mode,
                "model": model,
                "scope": source_scope,
            },
        )
    ).scalar_one()
    ai_uuid = (
        await session.execute(
            text(
                """
                INSERT INTO messages (convo_uuid, user_uuid, content, type, status, mode, model, source_scope)
                VALUES (:c, NULL, '', 'ai', 'pending', :mode, :model, CAST(:scope AS uuid[]))
                RETURNING message_uuid
                """
            ),
            {
                "c": str(convo_uuid),
                "mode": mode,
                "model": model,
                "scope": source_scope,
            },
        )
    ).scalar_one()
    return str(human_uuid), str(ai_uuid)


async def _finalize_ai_message(
    session: AsyncSession,
    *,
    message_uuid: str,
    status: Literal["answered", "failed"],
    content: str | None = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    error: str | None = None,
    message_sources: list[dict[str, Any]] | None = None,
) -> None:
    await session.execute(
        text(
            """
            UPDATE messages
            SET status = :st,
                content = COALESCE(:content, content),
                input_tokens = :in_tok,
                output_tokens = :out_tok,
                error = :err,
                updated_at = now()
            WHERE message_uuid = :m
            """
        ),
        {
            "m": str(message_uuid),
            "st": status,
            "content": content,
            "in_tok": input_tokens,
            "out_tok": output_tokens,
            "err": scrub_secrets(error) if error else None,
        },
    )
    if message_sources:
        await record_message_sources(session, message_uuid=str(message_uuid), sources=message_sources)


async def run_agentic_turn(
    *,
    session: AsyncSession | None = None,
    project_uuid: str,
    user_uuid: str,
    query: str,
    convo_uuid: str | None = None,
    excluded_docs: list[str] | None = None,
    k_chunks: int = 8,
    k_nodes: int = 5,
    search_mode: Literal["hybrid", "vector", "keyword"] = "hybrid",
    use_graph: bool = True,
    use_tools: bool = True,
    generate_answer: bool = True,
    mode: Literal["managed", "byok"] = "managed",
    model: str | None = None,
    effort: Literal["low", "medium", "high"] = "medium",
    research_mode: Literal["normal", "quick", "web", "deep", "deep_research"] = "quick",
    byok_api_key: str | None = None,
    serp_api_key: str | None = None,
    base_url: str | None = None,
    history: list[dict[str, Any]] | None = None,
    search_limits_override: dict[str, int] | None = None,
    max_tool_calls: int = MAX_TOOL_CALLS_PER_TURN,
    consume_quota: bool = True,
) -> dict[str, Any]:
    """Execute one full agentic conversation turn across RAG, Graph, Web Search, and Synthesis."""
    clean_query = query.strip()
    if not clean_query:
        raise ValueError("Query must not be empty")

    resolved_model = resolve_model_name(model)
    llm_client = get_turn_llm_client(mode=mode, byok_api_key=byok_api_key, base_url=base_url)

    trace_steps: list[dict[str, Any]] = []
    source_scope: list[str] = []
    merged_excluded = list(dict.fromkeys(str(d) for d in (excluded_docs or [])))
    docs_meta: dict[str, dict[str, Any]] = {}
    effective_history = list(history or [])
    ai_message_uuid: str | None = None
    human_message_uuid: str | None = None
    quota_event_uuid: str | None = None

    if session is not None:
        source_scope, db_excluded, docs_meta = await compute_source_scope(
            session,
            project_uuid=project_uuid,
            convo_uuid=convo_uuid,
            request_excluded_docs=merged_excluded,
        )
        merged_excluded = db_excluded

        if convo_uuid is not None and not effective_history:
            effective_history = await _load_recent_history(session, convo_uuid)

        if convo_uuid is not None and generate_answer:
            human_message_uuid, ai_message_uuid = await _insert_turn_messages(
                session,
                convo_uuid=convo_uuid,
                user_uuid=user_uuid,
                user_query=clean_query,
                mode=mode,
                model=resolved_model,
                source_scope=source_scope,
            )

        # D018 / D019: Managed consumes daily llm_call quota; BYOK skips daily llm_call quota.
        if consume_quota and mode == "managed" and generate_answer:
            quota_event_uuid = await check_and_consume_quota(
                session,
                user_uuid=user_uuid,
                project_uuid=project_uuid,
                kind="llm_call",
                amount=1,
                message_uuid=ai_message_uuid,
            )

    try:
        effective_query = clean_query
        fast_conversational = _is_conversational_fast_path(clean_query) and generate_answer
        if effective_history and generate_answer and not fast_conversational:
            effective_query = await rewrite_followup_query(
                clean_query,
                effective_history,
                llm_client=llm_client,
                model=resolved_model,
            )
            if effective_query != clean_query:
                trace_steps.append(
                    {
                        "id": "tr-rewrite",
                        "kind": "reasoning",
                        "title": "Rewrote follow-up query with conversation context",
                        "output": effective_query,
                    }
                )

        empty_project_scope = session is not None and not source_scope
        if fast_conversational or empty_project_scope:
            chunks = []
            graph = {"nodes": [], "relationships": [], "evidence_by_node": {}, "graph_source": "none"}
            embed_queries = 0
            if empty_project_scope and not fast_conversational:
                trace_steps.append(
                    {
                        "id": "tr-hybrid",
                        "kind": "rag_hybrid",
                        "title": "Skipped project retrieval (0 active sources)",
                        "description": "No sources uploaded" if not docs_meta else "All project sources are unticked",
                    }
                )
        else:
            t0 = time.monotonic()
            ctx = await graph_rag.retrieve_context(
                project_uuid=project_uuid,
                query=effective_query,
                excluded_docs=merged_excluded or None,
                convo_uuid=convo_uuid,
                k_chunks=k_chunks,
                k_nodes=k_nodes,
                search_mode=search_mode,
                use_graph=use_graph,
            )
            elapsed_ms = int((time.monotonic() - t0) * 1000)

            chunks = list(ctx.get("chunks") or [])
            graph = dict(ctx.get("graph") or {})
            embed_queries = int(ctx.get("embed_queries", 0))

            trace_steps.append(
                {
                    "id": "tr-hybrid",
                    "kind": "rag_hybrid",
                    "title": f"Searched {len(source_scope) if source_scope else 'active'} allowed project source{'s' if len(source_scope) != 1 else ''}",
                    "description": f"{len(chunks)} passages · {elapsed_ms} ms",
                }
            )

        shown_chunks: dict[str, dict[str, Any]] = {str(c["chunk_id"]): c for c in chunks if c.get("chunk_id")}
        shown_nodes: dict[str, dict[str, Any]] = {
            str(n["node_uuid"]): n for n in (graph.get("nodes") or []) if n.get("node_uuid")
        }
        shown_urls: dict[str, dict[str, Any]] = {}
        web_items: list[dict[str, Any]] = []
        doc_names = {did: str(m.get("filename")) for did, m in docs_meta.items() if m.get("filename")}

        if not generate_answer:
            return {
                "answer": None,
                "citations": {"chunk_ids": [], "node_uuids": [], "urls": []},
                "rejected_citations": {"chunk_ids": [], "node_uuids": [], "urls": []},
                "citation_details": [],
                "chunks": chunks,
                "graph": graph,
                "trace_steps": trace_steps,
                "rewritten_query": effective_query,
                "mode": mode,
                "model": resolved_model,
                "effort": effort,
                "source_scope": source_scope,
                "metrics": {"embed_queries": embed_queries, "llm_calls": 0, "tool_calls_used": 0},
            }

        tool_outputs: list[dict[str, Any]] = []
        created_artifacts: list[dict[str, Any]] = []
        tool_calls_used = 0
        llm_calls = 0
        total_in_tokens = 0
        total_out_tokens = 0

        effective_serp = (serp_api_key or "").strip() or None
        vertex_enabled = mode == "managed" and not (settings.openrouter_api_key or "").strip()
        allow_upfront_web = research_mode in ("web", "deep", "deep_research") and (
            bool(effective_serp) or vertex_enabled
        )
        allow_web_tools = allow_upfront_web or bool(effective_serp)

        # If user explicitly asked for web search mode but no provider is configured, surface clearly in trace.
        if (
            research_mode in ("web", "deep", "deep_research")
            and not allow_upfront_web
            and session is not None
            and not fast_conversational
        ):
            missing_msg = (
                "No SerpApi key saved on this device. Enter your SerpApi key in Settings -> Search & Keys to enable web search."
            )
            trace_steps.append(
                {
                    "id": "tr-web-init",
                    "kind": "web_search",
                    "status": "error",
                    "title": "Web search unavailable (SerpApi key missing)",
                    "description": missing_msg,
                    "output": missing_msg,
                }
            )

        # If web research mode is selected upfront and allowed, run an initial web search when session is available
        if allow_upfront_web and session is not None and not fast_conversational:
            try:
                web_res = await route_and_execute_web_search(
                    session,
                    user_uuid=user_uuid,
                    project_uuid=project_uuid,
                    query=effective_query,
                    mode=mode,
                    serp_api_key=effective_serp,
                    search_limits_override=search_limits_override,
                )
                for item in web_res.get("results") or []:
                    u = str(item.get("url") or "")
                    if u:
                        shown_urls[u] = {**item, "source": web_res.get("source", "web")}
                    web_items.append(item)
                trace_steps.append(
                    {
                        "id": "tr-web-init",
                        "kind": "web_search",
                        "title": f"Executed {web_res.get('source', 'web')} search ({'cached' if web_res.get('cached') else 'live'})",
                        "description": f"{len(web_res.get('results') or [])} results",
                    }
                )
            except Exception as web_exc:  # noqa: BLE001
                err_msg = scrub_secrets(str(web_exc))
                logger.warning("Initial web search failed: %s", err_msg)
                trace_steps.append(
                    {
                        "id": "tr-web-init",
                        "kind": "web_search",
                        "status": "error",
                        "title": "Initial web search failed",
                        "description": err_msg[:180],
                        "output": err_msg,
                    }
                )

        active_tools: list[dict[str, Any]] = []
        if not empty_project_scope:
            active_tools.extend(
                list(graph_rag.TOOL_DECLARATIONS)
                if use_graph
                else [t for t in graph_rag.TOOL_DECLARATIONS if t["name"] == "search_chunks"]
            )
        if allow_web_tools and session is not None:
            active_tools.extend(WEB_TOOL_DECLARATIONS)
        if session is not None and not empty_project_scope:
            active_tools.extend(ARTIFACT_TOOL_DECLARATIONS)

        should_plan_tools = (
            use_tools
            and max_tool_calls > 0
            and bool(active_tools)
            and not fast_conversational
            and (
                (
                    not empty_project_scope
                    and _needs_tool_planning_loop(
                        query=effective_query,
                        chunks=chunks,
                        research_mode=research_mode,
                        allow_web_tools=allow_web_tools,
                    )
                )
                or (empty_project_scope and allow_web_tools)
            )
        )
        seen_tool_calls: set[tuple[str, str]] = set()
        if should_plan_tools:
            while tool_calls_used < max_tool_calls:
                base_context = graph_rag.format_context_within_budget(chunks, graph, tool_outputs=tool_outputs, doc_names=doc_names)
                web_ctx = _format_web_results_context(web_items)
                scope_note = f"\n{_empty_scope_context_note(docs_meta)}\n" if empty_project_scope else ""
                web_tool_note = ""
                if allow_web_tools and session is not None:
                    if web_items:
                        web_tool_note = (
                            "\n[WEB SEARCH STATUS] Web search is ENABLED and web results are already included below. "
                            "Only call `web_search` or `fetch_web_page` if a critical fact is still missing; "
                            "only pass URLs already shown in web results to `fetch_web_page`.\n"
                        )
                    else:
                        provider = "SerpApi" if effective_serp else "grounded web search"
                        web_tool_note = (
                            f"\n[WEB SEARCH STATUS] Web search via {provider} is ENABLED for this turn. "
                            "Use `web_search` for external facts, current documentation, library versions, or web lookups not fully covered in project sources.\n"
                        )
                turn_prompt = f"User Question: {effective_query}\n{scope_note}{web_tool_note}\n{base_context}{web_ctx}"
                turn_res, in_tok, out_tok = await _call_agent_tool_turn(
                    llm_client=llm_client,
                    model=resolved_model,
                    prompt_text=turn_prompt,
                    tools=active_tools,
                )
                llm_calls += 1
                total_in_tokens += in_tok
                total_out_tokens += out_tok
                requested_calls = turn_res.get("tool_calls") or []
                if not requested_calls:
                    break

                executed_in_round = 0
                for call in requested_calls:
                    if tool_calls_used >= max_tool_calls:
                        break
                    t_name = str(call.get("name") or "")
                    t_args = dict(call.get("args") or {})
                    call_key = (t_name, json.dumps(t_args, sort_keys=True, default=str))
                    if call_key in seen_tool_calls:
                        continue
                    seen_tool_calls.add(call_key)
                    executed_in_round += 1
                    extra_embeds = 0
                    t_result: Any

                    tool_error: str | None = None
                    if t_name == "create_artifact" and session is not None:
                        from src.kc.modules.artifacts.service import generate_project_artifact

                        art_title = str(t_args.get("title") or "Generated Artifact").strip()
                        art_type = str(t_args.get("artifact_type") or "architecture_plan").strip()
                        art_instr = str(t_args.get("instructions") or effective_query).strip()
                        try:
                            art_res = await generate_project_artifact(
                                session,
                                project_uuid=project_uuid,
                                user_uuid=user_uuid,
                                artifact_type=art_type,
                                title=art_title,
                                instructions=art_instr,
                                convo_uuid=convo_uuid,
                                mode=mode,
                                byok_api_key=byok_api_key,
                                base_url=base_url,
                                model=resolved_model,
                                consume_quota=False,
                            )
                            created_artifacts.append(art_res)
                            t_result = {
                                "artifact_uuid": art_res["artifact_uuid"],
                                "title": art_res["title"],
                                "type": art_res["type"],
                                "version": art_res["version"],
                                "status": "created",
                            }
                        except Exception as art_exc:  # noqa: BLE001
                            tool_error = scrub_secrets(str(art_exc))
                            t_result = {"error": tool_error}
                    elif t_name == "web_search" and session is not None:
                        wq = str(t_args.get("query") or effective_query)
                        try:
                            t_result = await route_and_execute_web_search(
                                session,
                                user_uuid=user_uuid,
                                project_uuid=project_uuid,
                                query=wq,
                                mode=mode,
                                serp_api_key=effective_serp,
                                search_limits_override=search_limits_override,
                            )
                            for item in t_result.get("results") or []:
                                u = str(item.get("url") or "")
                                if u:
                                    shown_urls[u] = {**item, "source": t_result.get("source", "web")}
                                web_items.append(item)
                        except Exception as web_exc:  # noqa: BLE001
                            tool_error = scrub_secrets(str(web_exc))
                            logger.warning("Tool web_search failed: %s", tool_error)
                            t_result = {"error": tool_error}
                    elif t_name == "fetch_web_page":
                        target_url = str(t_args.get("url") or "")
                        try:
                            t_result = await fetch_safe_page(target_url)
                            shown_urls[t_result["url"]] = {
                                "title": target_url,
                                "url": t_result["url"],
                                "snippet": t_result["content"][:280],
                                "source": "fetch",
                            }
                            web_items.append(
                                {"title": target_url, "url": t_result["url"], "content": t_result["content"]}
                            )
                        except (SSRFBlockedError, ValueError) as fetch_exc:
                            tool_error = str(fetch_exc)
                            t_result = {"error": tool_error}
                    else:
                        t_result, extra_embeds = await graph_rag._execute_bound_tool(
                            t_name,
                            t_args,
                            project_uuid=project_uuid,
                            excluded_docs=merged_excluded or None,
                            convo_uuid=convo_uuid,
                            search_mode=search_mode,
                        )
                        _index_tool_shown_objects(t_result, shown_chunks, shown_nodes)

                    embed_queries += extra_embeds
                    tool_calls_used += 1
                    tool_outputs.append({"tool": t_name, "args": t_args, "result": t_result})
                    trace_kind = (
                        "web_search"
                        if t_name in ("web_search", "fetch_web_page")
                        else ("rag_hybrid" if t_name == "search_chunks" else "reasoning")
                    )
                    trace_title = (
                        f"Executed web lookup ({t_name})"
                        if t_name in ("web_search", "fetch_web_page")
                        else (
                            "Generated project artifact"
                            if t_name == "create_artifact"
                            else "Examined additional source passages"
                        )
                    )
                    trace_step: dict[str, Any] = {
                        "id": f"tr-tool-{tool_calls_used}",
                        "kind": trace_kind,
                        "title": f"{trace_title} failed" if tool_error else trace_title,
                        "description": tool_error[:180] if tool_error else json.dumps(t_args)[:120],
                    }
                    if tool_error:
                        trace_step["status"] = "error"
                        trace_step["output"] = tool_error
                    trace_steps.append(trace_step)
                if executed_in_round == 0:
                    break

        if fast_conversational:
            history_lines = "\n".join(
                f"- {item.get('type', 'user')}: {str(item.get('content') or '')[:300]}"
                for item in effective_history[-4:]
            )
            history_block = f"\nRecent conversation:\n{history_lines}\n" if history_lines else ""
            final_prompt = (
                f"User Message: {effective_query}\n{history_block}\n"
                "[CONVERSATIONAL TURN] No document retrieval was needed for this greeting or casual check-in. "
                "Respond warmly, enthusiastically, and concisely in your nerdy systems-architect persona, "
                "and invite the user to dive into their project sources whenever they are ready. "
                'Emit <citations>{"chunk_ids": [], "node_uuids": [], "urls": []}</citations> at the end.'
            )
        elif empty_project_scope and not web_items and not tool_outputs:
            scope_note = _empty_scope_context_note(docs_meta)
            final_prompt = f"User Question: {effective_query}\n\n{scope_note}"
        else:
            final_context = graph_rag.format_context_within_budget(chunks, graph, tool_outputs=tool_outputs, doc_names=doc_names)
            web_ctx = _format_web_results_context(web_items)
            scope_note = f"{_empty_scope_context_note(docs_meta)}\n\n" if empty_project_scope else ""
            final_prompt = f"User Question: {effective_query}\n\n{scope_note}{final_context}{web_ctx}"

        structured, s_in, s_out = await _call_agent_structured_answer(
            llm_client=llm_client,
            model=resolved_model,
            prompt_text=final_prompt,
        )
        llm_calls += 1
        total_in_tokens += s_in
        total_out_tokens += s_out

        cleaned_answer, had_raw_tools = _strip_raw_tool_calls(structured.answer)
        if had_raw_tools:
            logger.warning("Stripped raw [TOOL ...] call syntax leaked in synthesis output (model=%s)", resolved_model)
            structured.answer = cleaned_answer
            if not structured.answer and not fast_conversational:
                clean_context = (
                    ""
                    if (empty_project_scope and not web_items)
                    else graph_rag.format_context_within_budget(chunks, graph, tool_outputs=None, doc_names=doc_names)
                )
                retry_scope = f"{_empty_scope_context_note(docs_meta)}\n\n" if empty_project_scope else ""
                retry_prompt = (
                    f"User Question: {effective_query}\n\n"
                    f"{retry_scope}{clean_context}{_format_web_results_context(web_items)}\n\n"
                    "[SYNTHESIS RECOVERY] Retrieval is finished and no tools exist in this phase. "
                    "Never output `[TOOL ...]`, function calls, or tool invocations. "
                    "Write a clear Markdown answer addressed directly to the user stating what the context shows or what is missing."
                )
                retried, r_in, r_out = await _call_agent_structured_answer(
                    llm_client=llm_client,
                    model=resolved_model,
                    prompt_text=retry_prompt,
                )
                llm_calls += 1
                total_in_tokens += r_in
                total_out_tokens += r_out
                retried_answer, _ = _strip_raw_tool_calls(retried.answer)
                structured = retried
                structured.answer = retried_answer

        if not structured.answer.strip():
            structured.answer = (
                _empty_scope_fallback_message(docs_meta)
                if empty_project_scope
                else "I could not find enough grounded information in the selected sources to answer that question."
            )

        structured.answer = humanize_answer_references(
            structured.answer,
            shown_chunks=shown_chunks,
            shown_nodes=shown_nodes,
            docs_meta=docs_meta,
        )

        allowed_node_ids = (
            await read_tools.get_allowed_node_ids(
                project_uuid,
                excluded_docs=merged_excluded or None,
                convo_uuid=convo_uuid,
            )
            if use_graph and not empty_project_scope
            else set()
        )

        # If `source_scope` wasn't populated (e.g. unit test without session), treat non-excluded docs as allowed
        allowed_doc_set = set(source_scope) if session is not None and docs_meta else None
        citation_bundle = validate_and_build_citations(
            cited_chunk_ids=structured.cited_chunk_ids,
            cited_node_uuids=structured.cited_node_uuids,
            cited_urls=structured.cited_urls,
            shown_chunks=shown_chunks,
            shown_nodes=shown_nodes,
            shown_urls=shown_urls,
            allowed_doc_uuids=allowed_doc_set,
            excluded_doc_uuids=set(merged_excluded),
            allowed_node_ids=allowed_node_ids,
            docs_meta=docs_meta,
        )

        if session is not None and ai_message_uuid is not None:
            await _finalize_ai_message(
                session,
                message_uuid=ai_message_uuid,
                status="answered",
                content=structured.answer,
                input_tokens=total_in_tokens,
                output_tokens=total_out_tokens,
                message_sources=citation_bundle["message_sources"],
            )
            await session.execute(
                text("UPDATE conversations SET updated_at = now() WHERE convo_uuid = :c"),
                {"c": str(convo_uuid)},
            )

        return {
            "answer": structured.answer,
            "message_uuid": ai_message_uuid,
            "human_message_uuid": human_message_uuid,
            "convo_uuid": convo_uuid,
            "citations": citation_bundle["citations"],
            "rejected_citations": citation_bundle["rejected_citations"],
            "citation_details": citation_bundle["citation_details"],
            "artifacts": created_artifacts,
            "chunks": chunks,
            "graph": graph,
            "trace_steps": trace_steps,
            "rewritten_query": effective_query,
            "mode": mode,
            "model": resolved_model,
            "effort": effort,
            "source_scope": source_scope,
            "metrics": {
                "embed_queries": embed_queries,
                "llm_calls": llm_calls,
                "tool_calls_used": tool_calls_used,
                "input_tokens": total_in_tokens,
                "output_tokens": total_out_tokens,
            },
        }
    except Exception as exc:
        if session is not None and quota_event_uuid is not None:
            await refund_usage_event(session, quota_event_uuid)
        if session is not None and ai_message_uuid is not None:
            await _finalize_ai_message(
                session,
                message_uuid=ai_message_uuid,
                status="failed",
                error=str(exc),
            )
        raise


def _index_tool_shown_objects(
    result: Any,
    shown_chunks: dict[str, dict[str, Any]],
    shown_nodes: dict[str, dict[str, Any]],
) -> None:
    if isinstance(result, dict):
        if result.get("chunk_id"):
            shown_chunks[str(result["chunk_id"])] = result
        if result.get("node_uuid"):
            shown_nodes[str(result["node_uuid"])] = result
        for val in result.values():
            _index_tool_shown_objects(val, shown_chunks, shown_nodes)
    elif isinstance(result, list):
        for item in result:
            _index_tool_shown_objects(item, shown_chunks, shown_nodes)


async def stream_agentic_turn(
    **kwargs: Any,
) -> AsyncIterator[dict[str, Any]]:
    """Async generator producing structured SSE events (`trace`, `delta`, `citations`, `done`, `error`)."""
    try:
        result = await run_agentic_turn(**kwargs)
        for step in result.get("trace_steps") or []:
            yield {"event": "trace", "data": step}

        answer_text = result.get("answer") or ""
        for token in re.findall(r"\S+\s*|\s+", answer_text):
            yield {"event": "delta", "data": {"text": token}}

        yield {
            "event": "citations",
            "data": {
                "citations": result.get("citations"),
                "citation_details": result.get("citation_details"),
                "rejected_citations": result.get("rejected_citations"),
            },
        }
        yield {
            "event": "done",
            "data": {
                "message_uuid": result.get("message_uuid"),
                "human_message_uuid": result.get("human_message_uuid"),
                "mode": result.get("mode"),
                "model": result.get("model"),
                "metrics": result.get("metrics"),
                "source_scope": result.get("source_scope"),
                "artifacts": result.get("artifacts") or [],
            },
        }
    except Exception as exc:  # noqa: BLE001
        yield {
            "event": "error",
            "data": {"message": scrub_secrets(str(exc))},
        }
