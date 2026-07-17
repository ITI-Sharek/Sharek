"""Bearer-token verification for skill generation routes.

The NestJS backend sends ``Authorization: Bearer <AI_SERVICE_AUTH_TOKEN>``
when that variable is configured (see
``docs/operations/local-development.md``). ``/health`` stays unauthenticated.
When the service has no token configured, requests are allowed so local
development works without shared secrets — a startup warning flags this.
"""

from __future__ import annotations

import secrets

from fastapi import Header, HTTPException

from sharek_agents.config import settings
from sharek_agents.common.logging import get_logger

logger = get_logger(__name__)


def warn_if_unauthenticated() -> None:
    if not settings.auth_token:
        logger.warning(
            "AI_SERVICE_AUTH_TOKEN is not set: skill generation routes accept "
            "unauthenticated requests. Set the same token as the backend."
        )


async def require_service_token(
    authorization: str | None = Header(default=None),
) -> None:
    expected = settings.auth_token
    if not expected:
        return
    provided = ""
    if authorization and authorization.lower().startswith("bearer "):
        provided = authorization[len("bearer ") :]
    if not secrets.compare_digest(provided, expected):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid bearer token",
        )
