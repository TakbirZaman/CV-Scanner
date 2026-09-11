import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_org_id, get_current_user, require_roles
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.enums import UserRole
from app.models.organization import Invitation, Organization, Team
from app.models.user import User
from app.schemas.auth import TokenResponse, UserPublic
from app.schemas.organization import (
    AuditLogPublic,
    InvitationAccept,
    InvitationCreate,
    InvitationPublic,
    MemberUpdate,
    OrganizationPublic,
    TeamCreate,
    TeamPublic,
)
from app.services import auth_service
from app.services.audit_service import log_audit

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.get("/me", response_model=OrganizationPublic)
async def get_my_organization(
    org_id: uuid.UUID = Depends(get_current_org_id),
    db: AsyncSession = Depends(get_db),
) -> Organization:
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalar_one_or_none()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return org


@router.get("/members", response_model=list[UserPublic])
async def list_members(
    org_id: uuid.UUID = Depends(get_current_org_id),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    """List all users belonging to the current organization — powers the Team roster UI."""
    result = await db.execute(select(User).where(User.organization_id == org_id).order_by(User.created_at))
    return list(result.scalars().all())


@router.post("/teams", response_model=TeamPublic, status_code=status.HTTP_201_CREATED)
async def create_team(
    payload: TeamCreate,
    request: Request,
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user: User = Depends(require_roles(UserRole.ORG_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> Team:
    # Prevent duplicate team names within the same org (case-insensitive, works on Postgres and SQLite)
    from sqlalchemy import func as sa_func

    existing = (
        await db.execute(
            select(Team).where(
                Team.organization_id == org_id,
                sa_func.lower(Team.name) == payload.name.strip().lower(),
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "A team with this name already exists")
    team = Team(organization_id=org_id, name=payload.name)
    db.add(team)
    await db.flush()
    await log_audit(
        db,
        action="team.create",
        user_id=current_user.id,
        organization_id=org_id,
        target_type="team",
        target_id=str(team.id),
        meta={"name": team.name},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(team)
    return team


@router.get("/teams", response_model=list[TeamPublic])
async def list_teams(
    org_id: uuid.UUID = Depends(get_current_org_id),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Team]:
    result = await db.execute(select(Team).where(Team.organization_id == org_id))
    return list(result.scalars().all())


@router.post("/invitations", response_model=InvitationPublic, status_code=status.HTTP_201_CREATED)
async def invite_member(
    payload: InvitationCreate,
    request: Request,
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user: User = Depends(require_roles(UserRole.ORG_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> Invitation:
    inv = await auth_service.create_invitation(
        db, organization_id=org_id, invited_by_id=current_user.id, email=payload.email, role=payload.role
    )
    await log_audit(
        db,
        action="invitation.create",
        user_id=current_user.id,
        organization_id=org_id,
        target_type="invitation",
        target_id=str(inv.id),
        meta={"email": inv.email, "role": inv.role},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return inv


@router.get("/invitations", response_model=list[InvitationPublic])
async def list_invitations(
    org_id: uuid.UUID = Depends(get_current_org_id),
    _: User = Depends(require_roles(UserRole.ORG_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[Invitation]:
    # Return only pending invitations — revoked/accepted/expired are noise for the Team UI
    result = await db.execute(
        select(Invitation).where(Invitation.organization_id == org_id, Invitation.status == "pending")
    )
    return list(result.scalars().all())


@router.post("/invitations/accept", response_model=TokenResponse)
async def accept_invitation(payload: InvitationAccept, request: Request, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Public endpoint — no auth required, the invitation token itself is the credential."""
    user = await auth_service.accept_invitation(db, payload.token, payload.full_name, payload.password)
    tokens = await auth_service.issue_tokens(db, user)
    await log_audit(
        db,
        action="invitation.accept",
        user_id=user.id,
        organization_id=user.organization_id,
        target_type="invitation",
        target_id=payload.token[:8],
        meta={"email": user.email},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return tokens


# ── Member management ──────────────────────────────────────────────


@router.patch("/members/{user_id}", response_model=UserPublic)
async def update_member(
    user_id: uuid.UUID,
    payload: MemberUpdate,
    request: Request,
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user: User = Depends(require_roles(UserRole.ORG_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Org admin can change role, (de)activate, or assign team — tenant-isolated."""
    if payload.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot assign super_admin via this endpoint")
    target = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not target or target.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found in this organization")
    if target.id == current_user.id and payload.is_active is False:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot deactivate your own account")
    # Prevent removing last active ORG_ADMIN
    if payload.role is not None or payload.is_active is False:
        # If demoting or deactivating an ORG_ADMIN, ensure at least one remains
        if target.role == UserRole.ORG_ADMIN and (payload.role != UserRole.ORG_ADMIN or payload.is_active is False):
            remaining = (
                await db.execute(
                    select(User).where(
                        User.organization_id == org_id,
                        User.role == UserRole.ORG_ADMIN,
                        User.is_active == True,  # noqa: E712
                        User.id != target.id,
                    )
                )
            ).scalars().all()
            if not remaining:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot remove the last active org admin")

    if payload.role is not None:
        target.role = payload.role
    if payload.is_active is not None:
        target.is_active = payload.is_active
        if not payload.is_active:
            # Revoke sessions for deactivated user
            from sqlalchemy import update as sa_update
            from app.models.auth import RefreshToken

            await db.execute(
                sa_update(RefreshToken)
                .where(RefreshToken.user_id == target.id, RefreshToken.revoked == False)  # noqa: E712
                .values(revoked=True)
            )
    if payload.team_id is not None:
        if payload.team_id == uuid.UUID(int=0):  # sentinel for "remove from team"
            target.team_id = None
        else:
            team = (await db.execute(select(Team).where(Team.id == payload.team_id, Team.organization_id == org_id))).scalar_one_or_none()
            if not team:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found in this organization")
            target.team_id = payload.team_id
    # allow explicit null via separate handling: if client sends team_id null we clear; handled via payload unset vs None ambiguity — we treat None as no-op unless explicitly wanting clear via PATCH with team_id null string? Keep simple: null means clear handled by sentinel above or ignore.
    await db.flush()
    await log_audit(
        db,
        action="member.update",
        user_id=current_user.id,
        organization_id=org_id,
        target_type="user",
        target_id=str(target.id),
        meta={"role": str(payload.role) if payload.role else None, "is_active": payload.is_active, "team_id": str(payload.team_id) if payload.team_id else None},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    await db.refresh(target)
    return target


@router.get("/audit-logs", response_model=list[AuditLogPublic])
async def list_audit_logs(
    org_id: uuid.UUID = Depends(get_current_org_id),
    current_user: User = Depends(require_roles(UserRole.ORG_ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> list[AuditLog]:
    """Org-scoped audit trail — ORG_ADMIN can review actions in their tenant."""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.organization_id == org_id)
        .order_by(AuditLog.created_at.desc())
        .limit(100)
    )
    return list(result.scalars().all())
