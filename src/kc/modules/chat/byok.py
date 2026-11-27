"""BYOK client isolation, provider host allowlisting, and current Gemini model resolution (D019, T092)."""
from __future__ import annotations

from functools import cache
from typing import Any, Literal
from urllib.parse import urlparse

from google import genai
from google.genai import types as genai_types

from src.kc.core.config import settings
from src.kc.core.llm import client as _gemini_client, register_secret_for_redaction
from src.kc.core.openrouter import OpenRouterClient

ALLOWED_LLM_HOSTS: frozenset[str] = frozenset(
    {
        "generativelanguage.googleapis.com",
        "aiplatform.googleapis.com",
        "openrouter.ai",
    }
)

_DEPRECATED_MODEL_PREFIXES = ("gemini-1.0", "gemini-1.5", "gemini-2.0", "gemini-2.5")


class BYOKConfigurationError(ValueError):
    """Raised when BYOK mode is missing a user API key or specifies a disallowed provider host."""


def validate_llm_base_url(base_url: str | None) -> str | None:
    """Validate optional custom LLM base_url against HTTPS and the provider allowlist."""
    if base_url is None:
        return None
    clean = base_url.strip()
    if not clean:
        return None
    parsed = urlparse(clean)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in ALLOWED_LLM_HOSTS:
        raise BYOKConfigurationError(
            f"Disallowed BYOK provider host {host!r}. Allowed hosts: {sorted(ALLOWED_LLM_HOSTS)}"
        )
    return clean.rstrip("/")


def resolve_model_name(requested_model: str | None) -> str:
    """Resolve requested model ID, upgrading deprecated model families to `settings.chat_model`."""
    if not requested_model or not requested_model.strip():
        return settings.chat_model
    candidate = requested_model.strip()
    lowered = candidate.lower()
    if any(lowered.startswith(prefix) for prefix in _DEPRECATED_MODEL_PREFIXES):
        return settings.chat_model
    return candidate


@cache
def _managed_client() -> Any:
    """Return the managed LLM client: OpenRouter when `OPENROUTER_API_KEY` is configured, else Gemini."""
    or_key = (settings.openrouter_api_key or "").strip()
    if or_key:
        register_secret_for_redaction(or_key)
        return OpenRouterClient(
            api_key=or_key,
            default_model=settings.openrouter_model,
            base_url=settings.openrouter_base_url,
        )
    return _gemini_client()


def get_turn_llm_client(
    mode: Literal["managed", "byok"] = "managed",
    byok_api_key: str | None = None,
    base_url: str | None = None,
) -> Any:
    """Construct the request-scoped LLM client.
    In `byok` mode, strictly requires `byok_api_key`, scrubs it from logs, and never falls back to managed credentials.
    """
    if mode == "byok":
        clean_key = byok_api_key.strip() if byok_api_key else ""
        if not clean_key:
            raise BYOKConfigurationError(
                "BYOK mode requires a non-empty X-LLM-Api-Key header and will not fall back to the managed key."
            )
        register_secret_for_redaction(clean_key)
        clean_base_url = validate_llm_base_url(base_url)
        if clean_key.startswith("sk-or-") or (clean_base_url and "openrouter.ai" in clean_base_url.lower()):
            return OpenRouterClient(
                api_key=clean_key,
                default_model=settings.openrouter_model,
                base_url=clean_base_url or settings.openrouter_base_url,
            )
        if clean_base_url:
            return genai.Client(
                api_key=clean_key,
                http_options=genai_types.HttpOptions(base_url=clean_base_url),
            )
        return genai.Client(api_key=clean_key)

    return _managed_client()
