"""Safe SSRF-hardened web fetching and Managed/BYOK web search routing."""
from src.kc.modules.websearch.fetch import (
    SSRFBlockedError,
    fetch_safe_page,
    is_ip_blocked,
    resolve_and_validate_url,
    sanitize_and_wrap_html,
)
from src.kc.modules.websearch.service import (
    WebSearchRestrictedError,
    get_cached_search,
    normalize_query_hash,
    route_and_execute_web_search,
    store_cached_search,
)

__all__ = [
    "SSRFBlockedError",
    "WebSearchRestrictedError",
    "fetch_safe_page",
    "get_cached_search",
    "is_ip_blocked",
    "normalize_query_hash",
    "resolve_and_validate_url",
    "route_and_execute_web_search",
    "sanitize_and_wrap_html",
    "store_cached_search",
]
