"""Shared Gemini client, secret redaction filter, and bounded concurrency/retry helpers (D019, T025, T092)."""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from functools import cache
import logging
import threading
from typing import TypeVar

from dotenv import load_dotenv
from google import genai

from src.kc.core.config import settings

T = TypeVar("T")

_SECRET_LOCK = threading.Lock()
_REDACTED_SECRETS: set[str] = set()
_FILTER_INSTALLED = False
_LLM_SEMAPHORE: asyncio.Semaphore | None = None
_SEMAPHORE_LOOP_ID: int | None = None


def scrub_secrets(text: str) -> str:
    """Replace any registered secret substring with `[REDACTED_KEY]`."""
    if not text:
        return text
    with _SECRET_LOCK:
        secrets_snapshot = tuple(sorted(_REDACTED_SECRETS, key=len, reverse=True))
    cleaned = text
    for secret in secrets_snapshot:
        if secret and secret in cleaned:
            cleaned = cleaned.replace(secret, "[REDACTED_KEY]")
    return cleaned


class RedactSecretsFilter(logging.Filter):
    """Logging filter that redacts registered BYOK/SerpApi secrets from log messages and args."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = scrub_secrets(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: scrub_secrets(v) if isinstance(v, str) else v
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    scrub_secrets(a) if isinstance(a, str) else a
                    for a in record.args
                )
        return True


def register_secret_for_redaction(secret: str | None) -> None:
    """Register a user-supplied secret so it is never emitted to logs or persisted error fields."""
    global _FILTER_INSTALLED
    if not secret:
        return
    clean = secret.strip()
    if len(clean) < 6:
        return
    with _SECRET_LOCK:
        _REDACTED_SECRETS.add(clean)
        if not _FILTER_INSTALLED:
            root = logging.getLogger()
            flt = RedactSecretsFilter()
            root.addFilter(flt)
            for handler in root.handlers:
                handler.addFilter(flt)
            _FILTER_INSTALLED = True


def clear_redacted_secrets_for_tests() -> None:
    """Test helper to reset registered secrets cleanly."""
    with _SECRET_LOCK:
        _REDACTED_SECRETS.clear()


def _get_llm_semaphore() -> asyncio.Semaphore:
    global _LLM_SEMAPHORE, _SEMAPHORE_LOOP_ID
    try:
        loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        loop_id = None
    if _LLM_SEMAPHORE is None or _SEMAPHORE_LOOP_ID != loop_id:
        _LLM_SEMAPHORE = asyncio.Semaphore(max(1, settings.llm_max_concurrency))
        _SEMAPHORE_LOOP_ID = loop_id
    return _LLM_SEMAPHORE


def _is_transient_llm_error(exc: BaseException) -> bool:
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return True
    msg = str(exc).lower()
    return any(tok in msg for tok in ("429", "503", "rate limit", "resource_exhausted", "temporarily unavailable", "timeout"))


async def call_with_retries(
    coro_factory: Callable[[], Awaitable[T]],
    *,
    max_attempts: int = 3,
    base_delay: float = 0.5,
) -> T:
    """Execute an async LLM operation under bounded concurrency with exponential backoff on transient failures."""
    sem = _get_llm_semaphore()
    last_exc: BaseException | None = None
    for attempt in range(1, max(1, max_attempts) + 1):
        try:
            async with sem:
                return await coro_factory()
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if attempt >= max_attempts or not _is_transient_llm_error(exc):
                raise
            await asyncio.sleep(base_delay * (2 ** (attempt - 1)))
    assert last_exc is not None
    raise last_exc


@cache
def client() -> genai.Client:
    load_dotenv()
    return genai.Client()
