import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_org_id_or_impersonated, require_roles
from app.core.config import settings
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.auth import EmailVerificationToken, PasswordResetToken, RefreshToken
from app.models.enums import OrganizationStatus, UserRole
from app.models.organization import Organization, Team
from app.schemas.auth import UserPublic
from app.schemas.organization import AuditLogPublic, OrganizationPublic, TeamPublic
from app.services.audit_service import log_audit

router = APIRouter(prefix="/admin", tags=["Admin"])


class OrgStatusUpdate(BaseModel):
    status: OrganizationStatus


class CleanupResponse(BaseModel):
    refresh_tokens_deleted: int
    password_reset_tokens_deleted: int
    email_verification_tokens_deleted: int


@router.get("/organizations", response_model=list[OrganizationPublic])
async def list_organizations(
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[Organization]:
    result = await db.execute(select(Organization).order_by(Organization.created_at))
    return list(result.scalars().all())


@router.patch("/organizations/{org_id}/status", response_model=OrganizationPublic)
async def update_org_status(
    org_id: uuid.UUID,
    payload: OrgStatusUpdate,
    request: Request,
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> Organization:
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    old_status = org.status
    org.status = payload.status
    await db.flush()
    await log_audit(
        db,
        action="org.status_change",
        user_id=current_user.id,
        organization_id=org_id,
        target_type="organization",
        target_id=str(org_id),
        meta={"from": str(old_status.value) if hasattr(old_status, "value") else str(old_status), "to": payload.status.value},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(org)
    return org


@router.post("/cleanup/tokens", response_model=CleanupResponse)
async def cleanup_expired_tokens(
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> CleanupResponse:
    """Deletes expired/revoked/used tokens older than retention window.

    In production this would be a Celery beat periodic task; exposing as
    an admin endpoint allows manual triggering and keeps the same logic
    testable without a worker.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.REFRESH_TOKEN_RETENTION_DAYS)

    # Refresh tokens: revoked or expired and older than cutoff, OR expired regardless if very old?
    # Keep logic simple: delete if (revoked==True or expires_at < now) and created_at < cutoff
    # For now delete any revoked/expired where expires_at < now
    now = datetime.now(timezone.utc)

    # Use delete returning rowcount
    rt_result = await db.execute(
        delete(RefreshToken).where(
            (RefreshToken.revoked == True) | (RefreshToken.expires_at < now),  # noqa: E712
            RefreshToken.created_at < cutoff,
        )
    )
    # Also delete very old expired password reset / verification tokens (used or expired)
    prt_result = await db.execute(
        delete(PasswordResetToken).where(
            ((PasswordResetToken.used == True) | (PasswordResetToken.expires_at < now)),  # noqa: E712
            PasswordResetToken.created_at < cutoff,
        )
    )
    evt_result = await db.execute(
        delete(EmailVerificationToken).where(
            ((EmailVerificationToken.used == True) | (EmailVerificationToken.expires_at < now)),  # noqa: E712
            EmailVerificationToken.created_at < cutoff,
        )
    )
    await db.commit()
    return CleanupResponse(
        refresh_tokens_deleted=rt_result.rowcount or 0,
        password_reset_tokens_deleted=prt_result.rowcount or 0,
        email_verification_tokens_deleted=evt_result.rowcount or 0,
    )


@router.get("/organizations/{org_id}/teams", response_model=list[TeamPublic])
async def admin_list_teams(
    org_id: uuid.UUID,
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[Team]:
    """SUPER_ADMIN impersonation: list teams for any org by id."""
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    result = await db.execute(select(Team).where(Team.organization_id == org_id))
    return list(result.scalars().all())


@router.get("/organizations/{org_id}/members", response_model=list[UserPublic])
async def admin_list_members(
    org_id: uuid.UUID,
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    result = await db.execute(select(User).where(User.organization_id == org_id).order_by(User.created_at))
    return list(result.scalars().all())


# Generic impersonated read via X-Org-Id header — demonstrates header-based impersonation
@router.get("/impersonate/teams", response_model=list[TeamPublic])
async def impersonate_list_teams(
    org_id: uuid.UUID = Depends(get_current_org_id_or_impersonated),
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[Team]:
    result = await db.execute(select(Team).where(Team.organization_id == org_id))
    return list(result.scalars().all())


@router.get("/impersonate/members", response_model=list[UserPublic])
async def impersonate_list_members(
    org_id: uuid.UUID = Depends(get_current_org_id_or_impersonated),
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    result = await db.execute(select(User).where(User.organization_id == org_id).order_by(User.created_at))
    return list(result.scalars().all())


@router.get("/audit-logs", response_model=list[AuditLogPublic])
async def admin_list_audit_logs(
    _: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLog]:
    result = await db.execute(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(100))
    return list(result.scalars().all())
