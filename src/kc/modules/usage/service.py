"""Atomic daily usage & quota service, usage event refunds, and SerpApi search limits (D018, D019, D020, T051, T061, T096)."""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.kc.core.config import settings

SERP_MAX_PER_HOUR = 50
SERP_MAX_PER_MONTH = 250

DEFAULT_SEARCH_LIMITS: dict[str, int] = {
    "serp_per_hour": 10,
    "serp_per_day": 25,
    "serp_per_month": SERP_MAX_PER_MONTH,
}

VALID_USAGE_KINDS = {"llm_call", "doc_upload", "embed_query", "web_search", "serp_search"}


class QuotaExceededError(Exception):
    """Raised when a user, project, global, or per-run quota cap is exceeded."""

    def __init__(
        self,
        *,
        kind: str,
        scope_type: str,
        scope_id: str,
        limit: int,
        used: int,
        byok_available: bool = False,
        message: str | None = None,
    ) -> None:
        self.kind = kind
        self.scope_type = scope_type
        self.scope_id = scope_id
        self.limit = limit
        self.used = used
        self.byok_available = byok_available
        super().__init__(
            message
            or f"{kind} quota exceeded for {scope_type} ({used}/{limit})."
            + (" You can supply a BYOK API key to continue." if byok_available else "")
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": "QUOTA_EXCEEDED",
            "kind": self.kind,
            "scope": self.scope_type,
            "scope_id": self.scope_id,
            "limit": self.limit,
            "used": self.used,
            "byok_available": self.byok_available,
            "message": str(self),
        }


def _normalize_kind(kind: str) -> str:
    if kind == "upload":
        return "doc_upload"
    if kind not in VALID_USAGE_KINDS:
        raise ValueError(f"Unsupported usage kind: {kind!r}")
    return kind


def validate_search_limits(
    *,
    serp_per_hour: int,
    serp_per_day: int,
    serp_per_month: int,
) -> None:
    """Validate user-configurable SerpApi hard ceilings (D020, T096)."""
    for label, val in (
        ("serp_per_hour", serp_per_hour),
        ("serp_per_day", serp_per_day),
        ("serp_per_month", serp_per_month),
    ):
        if not isinstance(val, int) or isinstance(val, bool) or val < 0:
            raise ValueError(f"{label} must be a non-negative integer")
    if serp_per_hour > SERP_MAX_PER_HOUR:
        raise ValueError(f"serp_per_hour cannot exceed {SERP_MAX_PER_HOUR}")
    if serp_per_month > SERP_MAX_PER_MONTH:
        raise ValueError(f"serp_per_month cannot exceed {SERP_MAX_PER_MONTH}")
    if serp_per_day > serp_per_month:
        raise ValueError("serp_per_day cannot exceed serp_per_month")


async def get_search_limits(session: AsyncSession, user_uuid: str) -> dict[str, int]:
    """Return stored SerpApi caps for `user_uuid`, or defaults if none configured."""
    row = (
        await session.execute(
            text(
                """
                SELECT serp_per_hour, serp_per_day, serp_per_month
                FROM search_limits
                WHERE user_uuid = :u
                """
            ),
            {"u": str(user_uuid)},
        )
    ).mappings().first()
    if row is None:
        return dict(DEFAULT_SEARCH_LIMITS)
    return {
        "serp_per_hour": int(
            row["serp_per_hour"]
            if row["serp_per_hour"] is not None
            else DEFAULT_SEARCH_LIMITS["serp_per_hour"]
        ),
        "serp_per_day": int(
            row["serp_per_day"]
            if row["serp_per_day"] is not None
            else DEFAULT_SEARCH_LIMITS["serp_per_day"]
        ),
        "serp_per_month": int(
            row["serp_per_month"]
            if row["serp_per_month"] is not None
            else DEFAULT_SEARCH_LIMITS["serp_per_month"]
        ),
    }


async def upsert_search_limits(
    session: AsyncSession,
    user_uuid: str,
    *,
    serp_per_hour: int,
    serp_per_day: int,
    serp_per_month: int,
) -> dict[str, int]:
    """Validate and store per-user SerpApi limits (capped at 50/hour and 250/month)."""
    validate_search_limits(
        serp_per_hour=serp_per_hour,
        serp_per_day=serp_per_day,
        serp_per_month=serp_per_month,
    )
    await session.execute(
        text(
            """
            INSERT INTO search_limits (user_uuid, serp_per_hour, serp_per_day, serp_per_month, updated_at)
            VALUES (:u, :h, :d, :m, now())
            ON CONFLICT (user_uuid) DO UPDATE
            SET serp_per_hour = EXCLUDED.serp_per_hour,
                serp_per_day = EXCLUDED.serp_per_day,
                serp_per_month = EXCLUDED.serp_per_month,
                updated_at = now()
            """
        ),
        {
            "u": str(user_uuid),
            "h": serp_per_hour,
            "d": serp_per_day,
            "m": serp_per_month,
        },
    )
    return {
        "serp_per_hour": serp_per_hour,
        "serp_per_day": serp_per_day,
        "serp_per_month": serp_per_month,
    }


async def _resolve_default_limits(
    session: AsyncSession,
    *,
    kind: str,
    project_uuid: str | None,
    user_limit: int | None,
    project_limit: int | None,
    global_limit: int | None,
) -> tuple[int | None, int | None, int | None]:
    resolved_user = user_limit
    resolved_project = project_limit
    resolved_global = global_limit

    if kind == "llm_call":
        if resolved_user is None:
            resolved_user = settings.user_daily_llm_calls
        if resolved_global is None:
            resolved_global = settings.global_daily_llm_calls
        if project_uuid is not None and resolved_project is None:
            db_proj_cap = (
                await session.execute(
                    text("SELECT daily_llm_calls FROM projects WHERE project_uuid = :p"),
                    {"p": str(project_uuid)},
                )
            ).scalar_one_or_none()
            resolved_project = (
                int(db_proj_cap)
                if db_proj_cap is not None
                else settings.project_default_daily_llm_calls
            )
    elif kind == "doc_upload":
        if resolved_user is None:
            resolved_user = settings.user_daily_uploads
        if project_uuid is not None and resolved_project is None:
            db_proj_cap = (
                await session.execute(
                    text("SELECT daily_uploads FROM projects WHERE project_uuid = :p"),
                    {"p": str(project_uuid)},
                )
            ).scalar_one_or_none()
            resolved_project = (
                int(db_proj_cap)
                if db_proj_cap is not None
                else settings.project_default_daily_uploads
            )
    elif kind == "web_search":
        if resolved_user is None:
            resolved_user = settings.user_daily_web_searches
        if resolved_global is None:
            resolved_global = settings.global_daily_web_searches
    elif kind == "serp_search":
        if resolved_user is None:
            resolved_user = DEFAULT_SEARCH_LIMITS["serp_per_day"]

    return resolved_user, resolved_project, resolved_global


async def _increment_scope_atomic(
    session: AsyncSession,
    *,
    scope_type: str,
    scope_id: str,
    kind: str,
    amount: int,
    cap: int,
) -> int:
    new_used = (
        await session.execute(
            text(
                """
                INSERT INTO usage (scope_type, scope_id, day, kind, used)
                VALUES (:st, :sid, (now() AT TIME ZONE 'UTC')::date, :kind, :amt)
                ON CONFLICT (scope_type, scope_id, day, kind)
                DO UPDATE SET used = usage.used + :amt
                WHERE usage.used + :amt <= :cap
                RETURNING used
                """
            ),
            {
                "st": scope_type,
                "sid": scope_id,
                "kind": kind,
                "amt": amount,
                "cap": cap,
            },
        )
    ).scalar_one_or_none()

    if new_used is None:
        current_used = (
            await session.execute(
                text(
                    """
                    SELECT coalesce(
                        (SELECT used FROM usage
                         WHERE scope_type = :st
                           AND scope_id = :sid
                           AND day = (now() AT TIME ZONE 'UTC')::date
                           AND kind = :kind),
                        0
                    )
                    """
                ),
                {"st": scope_type, "sid": scope_id, "kind": kind},
            )
        ).scalar_one()
        raise QuotaExceededError(
            kind=kind,
            scope_type=scope_type,
            scope_id=scope_id,
            limit=cap,
            used=int(current_used),
            byok_available=kind in ("llm_call", "web_search"),
        )
    return int(new_used)


async def check_and_consume_quota(
    session: AsyncSession,
    *,
    user_uuid: str,
    project_uuid: str | None = None,
    kind: str,
    amount: int = 1,
    user_limit: int | None = None,
    project_limit: int | None = None,
    global_limit: int | None = None,
    job_uuid: str | None = None,
    message_uuid: str | None = None,
) -> str:
    """Atomically verify and increment `user` -> `project` -> `global` daily quota counters
    inside a savepoint so failure at any scope rolls back earlier increments cleanly (D018).
    """
    if amount <= 0:
        raise ValueError("amount must be >= 1")
    norm_kind = _normalize_kind(kind)

    cap_user, cap_proj, cap_global = await _resolve_default_limits(
        session,
        kind=norm_kind,
        project_uuid=project_uuid,
        user_limit=user_limit,
        project_limit=project_limit,
        global_limit=global_limit,
    )

    async with session.begin_nested():
        if cap_user is not None:
            await _increment_scope_atomic(
                session,
                scope_type="user",
                scope_id=str(user_uuid),
                kind=norm_kind,
                amount=amount,
                cap=cap_user,
            )
        if project_uuid is not None and cap_proj is not None:
            await _increment_scope_atomic(
                session,
                scope_type="project",
                scope_id=str(project_uuid),
                kind=norm_kind,
                amount=amount,
                cap=cap_proj,
            )
        if cap_global is not None:
            await _increment_scope_atomic(
                session,
                scope_type="global",
                scope_id="global",
                kind=norm_kind,
                amount=amount,
                cap=cap_global,
            )

        event_uuid = (
            await session.execute(
                text(
                    """
                    INSERT INTO usage_events (user_uuid, project_uuid, job_uuid, message_uuid, kind, amount)
                    VALUES (:u, :p, :j, :m, :kind, :amt)
                    RETURNING event_uuid
                    """
                ),
                {
                    "u": str(user_uuid),
                    "p": str(project_uuid) if project_uuid is not None else None,
                    "j": str(job_uuid) if job_uuid is not None else None,
                    "m": str(message_uuid) if message_uuid is not None else None,
                    "kind": norm_kind,
                    "amt": amount,
                },
            )
        ).scalar_one()

    return str(event_uuid)


async def refund_usage_event(session: AsyncSession, event_uuid: str) -> bool:
    """Refund a pre-consumed `usage_events` row once (idempotent via `refunded_at IS NULL`, D018)."""
    row = (
        await session.execute(
            text(
                """
                UPDATE usage_events
                SET refunded_at = now()
                WHERE event_uuid = :e AND refunded_at IS NULL
                RETURNING user_uuid, project_uuid, kind, amount, (created_at AT TIME ZONE 'UTC')::date AS day
                """
            ),
            {"e": str(event_uuid)},
        )
    ).mappings().first()
    if row is None:
        return False

    scopes: list[tuple[str, str]] = [
        ("user", str(row["user_uuid"])),
        ("global", "global"),
    ]
    if row["project_uuid"] is not None:
        scopes.append(("project", str(row["project_uuid"])))

    for scope_type, scope_id in scopes:
        await session.execute(
            text(
                """
                UPDATE usage
                SET used = GREATEST(0, used - :amt)
                WHERE scope_type = :st
                  AND scope_id = :sid
                  AND day = :day
                  AND kind = :kind
                """
            ),
            {
                "amt": int(row["amount"]),
                "st": scope_type,
                "sid": scope_id,
                "day": row["day"],
                "kind": row["kind"],
            },
        )
    return True


async def check_serp_window_limits(
    session: AsyncSession,
    *,
    user_uuid: str,
    limits: dict[str, int],
) -> None:
    """Enforce rolling 1-hour and calendar-month SerpApi caps against `usage_events` (`D020`)."""
    counts = (
        await session.execute(
            text(
                """
                SELECT
                    coalesce(sum(amount) FILTER (WHERE created_at >= now() - interval '1 hour'), 0) AS used_hour,
                    coalesce(sum(amount) FILTER (WHERE date_trunc('month', created_at AT TIME ZONE 'UTC') = date_trunc('month', now() AT TIME ZONE 'UTC')), 0) AS used_month
                FROM usage_events
                WHERE user_uuid = :u
                  AND kind = 'serp_search'
                  AND refunded_at IS NULL
                """
            ),
            {"u": str(user_uuid)},
        )
    ).mappings().first()
    if counts is None:
        return

    used_hour = int(counts["used_hour"] or 0)
    used_month = int(counts["used_month"] or 0)
    if used_hour >= limits["serp_per_hour"]:
        raise QuotaExceededError(
            kind="serp_search",
            scope_type="user_hour",
            scope_id=str(user_uuid),
            limit=limits["serp_per_hour"],
            used=used_hour,
            byok_available=False,
        )
    if used_month >= limits["serp_per_month"]:
        raise QuotaExceededError(
            kind="serp_search",
            scope_type="user_month",
            scope_id=str(user_uuid),
            limit=limits["serp_per_month"],
            used=used_month,
            byok_available=False,
        )


async def get_user_usage_summary(session: AsyncSession, user_uuid: str) -> dict[str, Any]:
    """Return today's per-user usage breakdown and active SerpApi limits."""
    rows = (
        await session.execute(
            text(
                """
                SELECT kind, used
                FROM usage
                WHERE scope_type = 'user'
                  AND scope_id = :u
                  AND day = (now() AT TIME ZONE 'UTC')::date
                """
            ),
            {"u": str(user_uuid)},
        )
    ).mappings().all()
    used_map = {str(r["kind"]): int(r["used"]) for r in rows}
    limits = await get_search_limits(session, str(user_uuid))
    return {
        "day": "today_utc",
        "daily_used": {
            "llm_call": used_map.get("llm_call", 0),
            "doc_upload": used_map.get("doc_upload", 0),
            "web_search": used_map.get("web_search", 0),
            "serp_search": used_map.get("serp_search", 0),
        },
        "daily_limits": {
            "llm_call": settings.user_daily_llm_calls,
            "doc_upload": settings.user_daily_uploads,
            "web_search": settings.user_daily_web_searches,
            "serp_search": limits["serp_per_day"],
        },
        "search_limits": limits,
        "web_search_status": {
            "vertex_enabled": not bool((settings.openrouter_api_key or "").strip()),
        },
    }
