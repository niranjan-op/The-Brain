"""OpenRouter adapter exposing the subset of the google-genai Interactions surface the app uses.

Call sites invoke `client.aio.interactions.create(model=, system_instruction=, input=, tools=,
response_format=, ...)` and read `.outputs`, `.output_text` and `.usage`. This adapter translates
those calls to OpenRouter's OpenAI-compatible Chat Completions API so reasoning-heavy paths
(chat agent, query rewrite, deep research) can run on OpenRouter models without touching callers.

Structured output: many OpenRouter models (including free variants) do not support
`response_format`, so the JSON schema is put in the system prompt and the JSON object is
extracted from the reply. Callers still validate it with Pydantic.
"""
from __future__ import annotations

import asyncio
import json
import re
from types import SimpleNamespace
from typing import Any

import httpx

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


class OpenRouterError(RuntimeError):
    """Non-2xx OpenRouter response. The status code is kept in the message so
    `call_with_retries` treats 429/503 as transient."""


def _to_chat_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t.get("parameters") or {"type": "object", "properties": {}},
            },
        }
        for t in tools
    ]


def _input_to_text(input_items: Any) -> str:
    if isinstance(input_items, str):
        return input_items
    parts = [str(item.get("text", "")) for item in input_items or [] if item.get("type") == "text"]
    return "\n\n".join(p for p in parts if p)


def extract_json_object(text: str) -> str:
    """Return the JSON object embedded in a model reply (fenced or bare), else the stripped text."""
    candidate = text.strip()
    fence = _FENCE_RE.search(candidate)
    if fence:
        candidate = fence.group(1).strip()
    start, end = candidate.find("{"), candidate.rfind("}")
    if start != -1 and end > start:
        return candidate[start : end + 1]
    return candidate


class _Interactions:
    def __init__(self, owner: OpenRouterClient) -> None:
        self._owner = owner

    async def create(
        self,
        *,
        model: str,
        input: Any,
        system_instruction: str | None = None,
        tools: list[dict[str, Any]] | None = None,
        response_format: dict[str, Any] | None = None,
        generation_config: dict[str, Any] | None = None,
        **_ignored: Any,  # store/stream are genai-specific
    ) -> SimpleNamespace:
        owner = self._owner
        # Callers may pass Gemini model IDs (UI default, stored plans); OpenRouter IDs contain "/".
        resolved_model = model if model and "/" in model else owner.default_model

        system_text = system_instruction or ""
        schema = (response_format or {}).get("schema")
        if schema:
            system_text += (
                "\n\n<output_format>\nReturn ONLY one JSON object that conforms to this JSON Schema. "
                "No prose, no markdown fences.\n"
                f"{json.dumps(schema)}\n</output_format>"
            )

        messages: list[dict[str, Any]] = []
        if system_text:
            messages.append({"role": "system", "content": system_text})
        messages.append({"role": "user", "content": _input_to_text(input)})

        payload: dict[str, Any] = {"model": resolved_model, "messages": messages}
        max_tokens = (generation_config or {}).get("max_output_tokens")
        if max_tokens:
            payload["max_tokens"] = int(max_tokens)
        if owner.reasoning_effort:
            payload["reasoning"] = {"effort": owner.reasoning_effort, "exclude": True}
        if tools:
            payload["tools"] = _to_chat_tools(tools)
            payload["tool_choice"] = "auto"

        async with httpx.AsyncClient(timeout=owner.timeout_seconds) as http:
            # Enforce a total wall-clock cap; OpenRouter's 3s whitespace keepalives reset httpx's read timer.
            resp = await asyncio.wait_for(
                http.post(
                    f"{owner.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {owner.api_key}",
                        "Content-Type": "application/json",
                        "X-Title": "Knowledge Cartographer",
                    },
                    json=payload,
                ),
                timeout=owner.timeout_seconds,
            )
        if resp.status_code >= 400:
            raise OpenRouterError(f"OpenRouter HTTP {resp.status_code}: {resp.text[:500]}")
        data = resp.json()
        if data.get("error"):
            err = data["error"]
            raise OpenRouterError(f"OpenRouter error {err.get('code')}: {err.get('message')}")

        choices = data.get("choices") or []
        if not choices:
            raise OpenRouterError(f"OpenRouter returned no choices: {str(data)[:300]}")
        message = choices[0].get("message") or {}
        text = message.get("content") or ""
        if schema and text:
            text = extract_json_object(text)

        outputs: list[SimpleNamespace] = [
            SimpleNamespace(
                type="function_call",
                name=(call.get("function") or {}).get("name", ""),
                arguments=(call.get("function") or {}).get("arguments") or "{}",
            )
            for call in message.get("tool_calls") or []
        ]
        if text:
            outputs.append(SimpleNamespace(type="text", text=text))

        usage = data.get("usage") or {}
        return SimpleNamespace(
            outputs=outputs,
            output_text=text,
            model=data.get("model", resolved_model),
            usage=SimpleNamespace(
                input_tokens=int(usage.get("prompt_tokens") or 0),
                output_tokens=int(usage.get("completion_tokens") or 0),
            ),
        )


class OpenRouterClient:
    """Drop-in for `genai.Client` on the `client.aio.interactions.create` path."""

    def __init__(
        self,
        *,
        api_key: str,
        default_model: str,
        base_url: str = "https://openrouter.ai/api/v1",
        reasoning_effort: str | None = "medium",
        timeout_seconds: float = 120.0,
    ) -> None:
        self.api_key = api_key
        self.default_model = default_model
        self.base_url = base_url.rstrip("/")
        self.reasoning_effort = reasoning_effort
        self.timeout_seconds = timeout_seconds
        self.aio = SimpleNamespace(interactions=_Interactions(self))
