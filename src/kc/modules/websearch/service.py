"""Managed (Vertex/Gemini Google Search) vs BYOK (SerpApi) web search routing, 24h search_cache,
and quota metering (D019, D020, T095, T096)."""
from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any, Literal

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.kc.core.config import settings
from src.kc.core.llm import call_with_retries, client as _managed_client, register_secret_for_redaction, scrub_secrets
from src.kc.modules.usage.service import (
    QuotaExceededError,
    check_and_consume_quota,
    check_serp_window_limits,
    get_search_limits,
    refund_usage_event,
    validate_search_limits,
)


class WebSearchRestrictedError(PermissionError):
    """Raised when web search is invoked in BYOK mode without a user-supplied SerpApi key."""


def normalize_query_hash(source: str, query: str) -> tuple[str, str]:
    """Normalize whitespace/casing and return `(sha256_hash, normalized_query)` scoped to `source`."""
    normalized = " ".join(query.lower().strip().split())
    if not normalized:
        raise ValueError("Search query must not be empty")
    digest = hashlib.sha256(f"{source}:{normalized}".encode("utf-8")).hexdigest()
    return digest, normalized


async def get_cached_search(session: AsyncSession, query_hash: str) -> list[dict[str, Any]] | None:
    """Return cached search results if present and within the 24h TTL."""
    raw = (
        await session.execute(
            text(
                """
                SELECT results
                FROM search_cache
                WHERE query_hash = :h AND expires_at > now()
                """
            ),
            {"h": query_hash},
        )
    ).scalar_one_or_none()
    if raw is None:
        return None
    if isinstance(raw, str):
        parsed = json.loads(raw)
        return list(parsed) if isinstance(parsed, list) else []
    return list(raw) if isinstance(raw, list) else []


async def store_cached_search(
    session: AsyncSession,
    *,
    query_hash: str,
    source: str,
    query: str,
    results: list[dict[str, Any]],
) -> None:
    """Upsert web search results into `search_cache` with a 24-hour TTL."""
    await session.execute(
        text(
            """
            INSERT INTO search_cache (query_hash, source, query, results, fetched_at, expires_at)
            VALUES (:h, :src, :q, CAST(:res AS jsonb), now(), now() + interval '24 hours')
            ON CONFLICT (query_hash) DO UPDATE
            SET source = EXCLUDED.source,
                query = EXCLUDED.query,
                results = EXCLUDED.results,
                fetched_at = now(),
                expires_at = now() + interval '24 hours'
            """
        ),
        {
            "h": query_hash,
            "src": source,
            "q": query,
            "res": json.dumps(results),
        },
    )


async def _execute_serpapi_http(
    query: str,
    serp_api_key: str,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=10.0, transport=transport) as http:
        resp = await http.get(
            "https://serpapi.com/search.json",
            params={"q": query, "api_key": serp_api_key, "num": 5, "engine": "google"},
        )
    payload: dict[str, Any] = {}
    try:
        parsed = resp.json()
        if isinstance(parsed, dict):
            payload = parsed
    except ValueError:
        payload = {}

    if resp.status_code >= 400:
        err_msg = str(payload.get("error") or resp.text[:200] or resp.reason_phrase or "Request failed")
        raise RuntimeError(f"SerpApi HTTP {resp.status_code}: {scrub_secrets(err_msg)}")
    if payload.get("error"):
        raise RuntimeError(f"SerpApi error: {scrub_secrets(str(payload['error']))}")

    organic = payload.get("organic_results") or []
    normalized: list[dict[str, Any]] = []
    for item in organic[:5]:
        normalized.append(
            {
                "title": str(item.get("title") or "").strip(),
                "url": str(item.get("link") or item.get("url") or "").strip(),
                "snippet": str(item.get("snippet") or "").strip(),
            }
        )
    if not normalized:
        answer_box = payload.get("answer_box")
        if isinstance(answer_box, dict):
            ab_snippet = str(answer_box.get("answer") or answer_box.get("snippet") or "").strip()
            ab_url = str(answer_box.get("link") or "").strip()
            if ab_snippet or ab_url:
                normalized.append(
                    {
                        "title": str(answer_box.get("title") or "Answer Box").strip(),
                        "url": ab_url,
                        "snippet": ab_snippet,
                    }
                )
        kg = payload.get("knowledge_graph")
        if isinstance(kg, dict):
            kg_source = kg.get("source")
            kg_desc = str(kg.get("description") or "").strip()
            kg_url = str(
                kg.get("website")
                or (kg_source.get("link") if isinstance(kg_source, dict) else "")
                or ""
            ).strip()
            if kg_desc or kg_url:
                normalized.append(
                    {
                        "title": str(kg.get("title") or "Knowledge Graph").strip(),
                        "url": kg_url,
                        "snippet": kg_desc,
                    }
                )
    return [r for r in normalized if r["url"] or r["snippet"]]


async def _execute_vertex_grounded_search(query: str) -> tuple[list[dict[str, Any]], int]:
    """Run Gemini Interactions/GenerateContent grounded Google Search (managed mode only)."""
    async def _call() -> Any:
        return await asyncio.wait_for(
            _managed_client().aio.interactions.create(
                model=settings.chat_model,
                input=[{"type": "text", "text": f"Search the web for: {query}"}],
                tools=[{"type": "google_search"}],  # pyright: ignore[reportArgumentType]
                store=False,
                stream=False,
            ),
            timeout=12.0,
        )

    interaction = await call_with_retries(_call, max_attempts=1)
    results: list[dict[str, Any]] = []
    queries_executed = 0

    for out in getattr(interaction, "outputs", None) or []:
        if getattr(out, "type", None) == "google_search_call":
            queries_executed += 1
        elif getattr(out, "type", None) == "google_search_result":
            for r in getattr(out, "result", None) or []:
                url = str(getattr(r, "url", None) or (r.get("url") if isinstance(r, dict) else "") or "")
                title = str(getattr(r, "title", None) or (r.get("title") if isinstance(r, dict) else "") or "")
                snippet = str(getattr(r, "rendered_content", None) or (r.get("snippet") if isinstance(r, dict) else "") or "")
                if url or snippet:
                    results.append({"title": title, "url": url, "snippet": snippet[:500]})

    output_text = getattr(interaction, "output_text", "") or ""
    if not results and output_text:
        results.append({"title": "Grounded Web Summary", "url": "", "snippet": output_text[:600]})

    return results, max(1, queries_executed)


async def route_and_execute_web_search(
    session: AsyncSession,
    *,
    user_uuid: str,
    project_uuid: str | None,
    query: str,
    mode: Literal["managed", "byok"] = "managed",
    serp_api_key: str | None = None,
    search_limits_override: dict[str, int] | None = None,
    run_searches_used: int = 0,
    run_search_budget: int | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> dict[str, Any]:
    """Execute a web search following D019/D020 routing and billing rules (T095, T096):
    1. Enforces per-run `run_search_budget` if provided.
    2. If the user's request-scoped `serp_api_key` (`X-SerpApi-Key`) is present (in either
       `managed` or `byok` mode), routes via SerpApi subject to `search_limits` (`<= 50/hr`,
       `<= 250/mo`) and 24h cache. SerpApi keys are never loaded from server `.env`.
    3. Else if `mode == 'byok'`, refuses search (`WebSearchRestrictedError`) — managed Vertex
       search is never billed on behalf of a BYOK session.
    4. Else (`mode == 'managed'`), routes via Vertex/Gemini grounded search with 24h cache
       and `web_search` daily/global metering (`15/user/day`, `150/global/day`).
    """
    if run_search_budget is not None and run_searches_used >= run_search_budget:
        raise QuotaExceededError(
            kind="web_search",
            scope_type="run",
            scope_id="run",
            limit=run_search_budget,
            used=run_searches_used,
            byok_available=False,
            message=f"Deep research search budget exhausted ({run_searches_used}/{run_search_budget}).",
        )

    clean_serp = (serp_api_key or "").strip()
    if clean_serp:
        register_secret_for_redaction(clean_serp)
        q_hash, norm_q = normalize_query_hash("serpapi", query)
        cached = await get_cached_search(session, q_hash)
        if cached is not None:
            return {
                "source": "serpapi",
                "cached": True,
                "results": cached,
                "queries_metered": 0,
            }

        limits = (
            dict(search_limits_override)
            if search_limits_override is not None
            else await get_search_limits(session, str(user_uuid))
        )
        validate_search_limits(
            serp_per_hour=int(limits["serp_per_hour"]),
            serp_per_day=int(limits["serp_per_day"]),
            serp_per_month=int(limits["serp_per_month"]),
        )
        await check_serp_window_limits(session, user_uuid=str(user_uuid), limits=limits)
        serp_event_uuid = await check_and_consume_quota(
            session,
            user_uuid=str(user_uuid),
            project_uuid=project_uuid,
            kind="serp_search",
            amount=1,
            user_limit=int(limits["serp_per_day"]),
        )

        try:
            results = await _execute_serpapi_http(norm_q, clean_serp, transport=transport)
        except Exception:
            await refund_usage_event(session, serp_event_uuid)
            raise

        await store_cached_search(
            session,
            query_hash=q_hash,
            source="serpapi",
            query=norm_q,
            results=results,
        )
        return {
            "source": "serpapi",
            "cached": False,
            "results": results,
            "queries_metered": 1,
        }

    if mode == "byok":
        raise WebSearchRestrictedError(
            "Web search in BYOK mode requires a user-supplied X-SerpApi-Key header."
        )

    # Managed Vertex/Gemini grounded search
    q_hash, norm_q = normalize_query_hash("vertex", query)
    cached = await get_cached_search(session, q_hash)
    if cached is not None:
        return {
            "source": "vertex",
            "cached": True,
            "results": cached,
            "queries_metered": 0,
        }

    await check_and_consume_quota(
        session,
        user_uuid=str(user_uuid),
        project_uuid=project_uuid,
        kind="web_search",
        amount=1,
        user_limit=settings.user_daily_web_searches,
        global_limit=settings.global_daily_web_searches,
    )
    results, actual_queries = await _execute_vertex_grounded_search(norm_q)
    extra_queries = max(0, actual_queries - 1)
    if extra_queries > 0:
        try:
            await check_and_consume_quota(
                session,
                user_uuid=str(user_uuid),
                project_uuid=project_uuid,
                kind="web_search",
                amount=extra_queries,
                user_limit=settings.user_daily_web_searches,
                global_limit=settings.global_daily_web_searches,
            )
        except QuotaExceededError:
            pass

    await store_cached_search(
        session,
        query_hash=q_hash,
        source="vertex",
        query=norm_q,
        results=results,
    )
    return {
        "source": "vertex",
        "cached": False,
        "results": results,
        "queries_metered": actual_queries,
    }
