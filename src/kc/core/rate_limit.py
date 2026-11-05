"""In-process sliding-window per-user rate limiter (D019, PORTABILITY_GUIDE Rule 9)."""
from __future__ import annotations

import threading
import time
from collections import deque

from src.kc.core.config import settings


class RateLimiter:
    """Sliding-window rate limiter keyed by `user_uuid`."""

    def __init__(self, max_requests: int = 10, window_seconds: float = 60.0) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._events: dict[str, deque[float]] = {}

    def allow(self, user_uuid: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        key = str(user_uuid)
        with self._lock:
            q = self._events.get(key)
            if q is None:
                q = deque()
                self._events[key] = q
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= self.max_requests:
                return False
            q.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


query_rate_limiter = RateLimiter(max_requests=settings.query_rate_limit_per_minute, window_seconds=60.0)

