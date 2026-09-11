import time
import asyncio
from collections import deque, defaultdict
from typing import Deque

from fastapi import HTTPException, Request, status

from app.core.config import settings

# In-memory sliding-window store; process-local.
# If Redis is available we use it, otherwise we fall back to this.
_store: dict[str, Deque[float]] = defaultdict(deque)
_lock = asyncio.Lock()

# Optional Redis client (lazy)
_redis = None
_redis_available: bool | None = None


def _get_redis():
    global _redis, _redis_available
    if _redis_available is False:
        return None
    if _redis is not None:
        return _redis
    try:
        import redis.asyncio as redis_async  # type: ignore

        _redis = redis_async.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1)
        # Don't eagerly ping here — we probe lazily on first use and cache failure
        _redis_available = None
        return _redis
    except Exception:
        _redis_available = False
        return None


async def _redis_incr_sliding_window(key: str, window_seconds: int, limit: int) -> bool:
    """Returns True if allowed, False if rate-limited. Uses Redis if available."""
    global _redis_available
    r = _get_redis()
    if r is None:
        return None  # type: ignore[return-value]  # signal fallback
    try:
        now = time.time()
        window_start = now - window_seconds
        pipe = r.pipeline()
        # Use sorted set with timestamp as score; member is unique
        member = f"{now}:{id(key)}"
        pipe.zadd(key, {member: now})
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zcard(key)
        pipe.expire(key, window_seconds + 2)
        results = await pipe.execute()
        count = results[2]
        if count > limit:
            return False
        _redis_available = True
        return True
    except Exception:
        # Redis not reachable — fall back to memory
        return None  # type: ignore[return-value]


async def check_rate_limit(key: str, limit: int, window_seconds: int) -> None:
    """Raises 429 if the sliding window is exceeded."""
    # Try Redis first
    redis_result = await _redis_incr_sliding_window(f"rl:{key}", window_seconds, limit)
    if redis_result is True:
        return
    if redis_result is False:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests — please try again shortly")

    # Fallback: in-memory
    now = time.time()
    async with _lock:
        dq = _store[key]
        # Evict entries outside window
        while dq and dq[0] <= now - window_seconds:
            dq.popleft()
        if len(dq) >= limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests — please try again shortly")
        dq.append(now)


def rate_limit(limit: int, window_seconds: int, key_prefix: str):
    """FastAPI dependency factory.

    Key is `<prefix>:<client_ip>`. For authenticated endpoints you could
    extend to include user id, but for login/register/forgot the IP is
    the right scope.
    """

    async def _dep(request: Request) -> None:
        # In test mode (pytest) we allow disabling via env or just use very high limit?
        # Instead, rely on in-memory which is reset per process; tests run fast
        # enough that they won't hit 5/min unless we spam. To avoid flakiness
        # in CI, allow an env flag to disable.
        if settings.ENVIRONMENT == "test":
            return
        # Prefer X-Forwarded-For when behind proxy, else client.host
        xff = request.headers.get("x-forwarded-for")
        if xff:
            ip = xff.split(",")[0].strip()
        elif request.client:
            ip = request.client.host
        else:
            ip = "unknown"
        key = f"{key_prefix}:{ip}"
        await check_rate_limit(key, limit, window_seconds)

    return _dep
