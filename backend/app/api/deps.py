import uuid
from collections.abc import Callable

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.services.auth_service import ensure_org_not_suspended

bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_token(creds.credentials)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc

    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not an access token")

    user = (await db.execute(select(User).where(User.id == uuid.UUID(payload["sub"])))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    await ensure_org_not_suspended(db, user.organization_id)
    return user


def require_roles(*allowed_roles: UserRole) -> Callable:
    """Dependency factory for RBAC: restricts an endpoint to specific roles.

    SUPER_ADMIN always passes, since it is a platform-wide role.
    """

    async def _guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == UserRole.SUPER_ADMIN:
            return current_user
        if current_user.role not in allowed_roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to perform this action")
        return current_user

    return _guard


async def get_current_org_id(current_user: User = Depends(get_current_user)) -> uuid.UUID:
    """Enforces tenant isolation: resolves the org an org-scoped endpoint should operate on.

    SUPER_ADMIN is not scoped to any single org, so hitting an org-scoped
    endpoint without a target org is a client error, not a server error —
    this slice does not yet support super-admin impersonation of a specific org
    via the regular org endpoints (use /admin endpoints with X-Org-Id instead).
    """
    if current_user.organization_id is None:
        if current_user.role == UserRole.SUPER_ADMIN:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Super admin has no organization context; targeting a specific organization "
                "is not yet supported on this endpoint — use /admin endpoints with X-Org-Id",
            )
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User is not associated with an organization")
    return current_user.organization_id


async def get_current_org_id_or_impersonated(
    current_user: User = Depends(get_current_user),
    x_org_id: str | None = Header(default=None, alias="X-Org-Id"),
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    """Variant that allows SUPER_ADMIN to impersonate an org via X-Org-Id."""
    if current_user.role == UserRole.SUPER_ADMIN:
        if not x_org_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Super admin must provide X-Org-Id header to target an organization",
            )
        try:
            target = uuid.UUID(x_org_id)
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid X-Org-Id header")
        from app.models.organization import Organization as OrgModel

        org_row = (await db.execute(select(OrgModel.id).where(OrgModel.id == target))).scalar_one_or_none()
        if not org_row:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Target organization not found")
        return target
    if current_user.organization_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User is not associated with an organization")
    return current_user.organization_id
