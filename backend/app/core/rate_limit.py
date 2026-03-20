"""
Simple in-memory sliding-window rate limiter for FastAPI.

Usage (per-user, keyed by bearer token user ID):
    from app.core.rate_limit import create_rate_limit

    _order_limiter = create_rate_limit(max_requests=5, window_seconds=60)

    @router.post("/create-order")
    async def create_order(
        _rate_limit: Annotated[None, Depends(_order_limiter)],
        token: Annotated[str, Depends(get_bearer_token)],
        ...
    ):

Usage (per-IP, for public endpoints):
    _callback_limiter = create_rate_limit(max_requests=20, window_seconds=60, by="ip")
"""

from __future__ import annotations

import time
from typing import Literal

from fastapi import HTTPException, Request


class RateLimiter:
    """Sliding-window counter rate limiter backed by an in-memory dict."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        # {key: [timestamp, ...]}
        self._hits: dict[str, list[float]] = {}
        self._last_cleanup = time.time()

    def _cleanup(self, now: float) -> None:
        """Remove expired entries every 60 seconds."""
        if now - self._last_cleanup < 60:
            return
        self._last_cleanup = now
        cutoff = now - self.window_seconds
        expired_keys = [
            key for key, timestamps in self._hits.items()
            if not timestamps or timestamps[-1] < cutoff
        ]
        for key in expired_keys:
            del self._hits[key]

    def check(self, key: str) -> bool:
        """Return True if the request is allowed, False if rate-limited."""
        now = time.time()
        self._cleanup(now)

        cutoff = now - self.window_seconds
        timestamps = self._hits.get(key)

        if timestamps is None:
            self._hits[key] = [now]
            return True

        # Remove timestamps outside the window
        while timestamps and timestamps[0] < cutoff:
            timestamps.pop(0)

        if len(timestamps) >= self.max_requests:
            return False

        timestamps.append(now)
        return True


def create_rate_limit(
    max_requests: int,
    window_seconds: int = 60,
    by: Literal["ip", "token"] = "token",
):
    """
    Create a FastAPI dependency that enforces rate limiting.

    Args:
        max_requests: Maximum number of requests allowed within the window.
        window_seconds: Time window in seconds (default 60).
        by: "ip" to key by client IP, "token" to key by Authorization bearer value.
    """
    limiter = RateLimiter(max_requests, window_seconds)

    async def rate_limit_dependency(request: Request) -> None:
        if by == "ip":
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                key = forwarded.split(",")[0].strip()
            else:
                key = request.headers.get("x-real-ip") or (
                    request.client.host if request.client else "unknown"
                )
        else:
            # Use the raw Authorization header value as key (unique per user session)
            auth = request.headers.get("authorization", "")
            key = auth.removeprefix("Bearer ").strip() if auth else "anonymous"

        if not limiter.check(key):
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please try again later.",
            )

    return rate_limit_dependency
