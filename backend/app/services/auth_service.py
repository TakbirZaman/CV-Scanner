import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.auth import EmailVerificationToken, PasswordResetToken, RefreshToken
from app.models.enums import OrganizationStatus, UserRole
from app.models.organization import Invitation, Organization
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse

# A precomputed bcrypt hash of a fixed dummy value, used to keep login timing
# roughly constant whether or not the email exists — avoids leaking account
# existence through response-time differences.
_DUMMY_HASH = hash_password("dummy-password-for-timing-only")


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def ensure_org_not_suspended(db: AsyncSession, organization_id: uuid.UUID | None) -> None:
    """Blocks access for users whose organization has been suspended.

    A None organization_id means the caller is a platform-level SUPER_ADMIN,
    who is never org-scoped, so there is nothing to check.
    """
    if organization_id is None:
        return
    org_status = (
        await db.execute(select(Organization.status).where(Organization.id == organization_id))
    ).scalar_one_or_none()
    if org_status == OrganizationStatus.SUSPENDED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This organization's account has been suspended")


def _aware(dt: datetime) -> datetime:
    """Some DB drivers (e.g. SQLite, used in tests) drop tzinfo on round-trip."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _slugify(name: str) -> str:
    base = "-".join(name.strip().lower().split())
    base = "".join(c for c in base if c.isalnum() or c == "-")
    return base or "org"


async def _unique_slug(db: AsyncSession, name: str) -> str:
    base = _slugify(name)
    slug = base
    suffix = 1
    while (await db.execute(select(Organization).where(Organization.slug == slug))).scalar_one_or_none():
        suffix += 1
        slug = f"{base}-{suffix}"
    return slug


async def register_organization(db: AsyncSession, payload: RegisterRequest) -> User:
    email = _normalize_email(payload.email)
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    # Retry a bounded number of times in case of a concurrent registration
    # racing us for the same organization slug (TOCTOU on the slug uniqueness check).
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        slug = await _unique_slug(db, payload.organization_name)
        org = Organization(name=payload.organization_name, slug=slug, status=OrganizationStatus.TRIAL)
        db.add(org)
        try:
            await db.flush()  # get org.id without committing
            break
        except IntegrityError:
            await db.rollback()
            if attempt == max_attempts:
                raise HTTPException(
                    status.HTTP_409_CONFLICT, "Could not allocate a unique organization slug, please try again"
                )

    user = User(
        organization_id=org.id,
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=UserRole.ORG_ADMIN,
        is_active=True,
        is_email_verified=False,
    )
    db.add(user)
    await db.flush()

    verification = EmailVerificationToken(
        user_id=user.id,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.now(timezone.utc) + timedelta(days=2),
    )
    db.add(verification)

    await db.commit()
    await db.refresh(user)
    # In production: dispatch verification.token via email service (Celery task).
    return user


async def authenticate_user(db: AsyncSession, payload: LoginRequest) -> User:
    email = _normalize_email(payload.email)
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

    # Always run a bcrypt verify, even when no user was found, so that response
    # timing does not reveal whether the email is registered.
    password_ok = verify_password(payload.password, user.hashed_password if user else _DUMMY_HASH)

    if not user or not password_ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")
    await ensure_org_not_suspended(db, user.organization_id)
    return user


async def issue_tokens(db: AsyncSession, user: User) -> TokenResponse:
    access = create_access_token(user.id, user.organization_id, user.role.value)
    refresh = create_refresh_token(user.id)

    db.add(
        RefreshToken(
            user_id=user.id,
            token=refresh,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    await db.commit()
    return TokenResponse(access_token=access, refresh_token=refresh)


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> TokenResponse:
    try:
        payload = decode_token(refresh_token)
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from exc

    if payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not a refresh token")

    stored = (
        await db.execute(select(RefreshToken).where(RefreshToken.token == refresh_token))
    ).scalar_one_or_none()
    if not stored or stored.revoked or _aware(stored.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token is revoked or expired")

    user = (await db.execute(select(User).where(User.id == uuid.UUID(payload["sub"])))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer active")
    await ensure_org_not_suspended(db, user.organization_id)

    # Rotate: revoke old, issue new
    stored.revoked = True
    await db.commit()
    return await issue_tokens(db, user)


async def revoke_refresh_token(db: AsyncSession, refresh_token: str) -> None:
    stored = (
        await db.execute(select(RefreshToken).where(RefreshToken.token == refresh_token))
    ).scalar_one_or_none()
    if stored:
        stored.revoked = True
        await db.commit()


async def revoke_all_user_refresh_tokens(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked == False).values(  # noqa: E712
            revoked=True
        )
    )
    await db.commit()


async def request_password_reset(db: AsyncSession, email: str) -> None:
    """Always succeeds from the caller's perspective, whether or not the email
    is registered, to avoid leaking account existence (user enumeration)."""
    email = _normalize_email(email)
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user and user.is_active:
        reset_token = PasswordResetToken(
            user_id=user.id,
            token=secrets.token_urlsafe(32),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        db.add(reset_token)
        await db.commit()
        # In production: dispatch reset_token.token via email service (Celery task).


async def reset_password(db: AsyncSession, token: str, new_password: str) -> None:
    reset_token = (
        await db.execute(select(PasswordResetToken).where(PasswordResetToken.token == token))
    ).scalar_one_or_none()
    if not reset_token or reset_token.used or _aware(reset_token.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reset link is invalid or has expired")

    user = (await db.execute(select(User).where(User.id == reset_token.user_id))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reset link is invalid or has expired")

    user.hashed_password = hash_password(new_password)
    reset_token.used = True
    await db.commit()

    # Force re-login everywhere: a password reset should invalidate existing sessions.
    await revoke_all_user_refresh_tokens(db, user.id)


async def verify_email(db: AsyncSession, token: str) -> None:
    verification = (
        await db.execute(select(EmailVerificationToken).where(EmailVerificationToken.token == token))
    ).scalar_one_or_none()
    if not verification or verification.used or _aware(verification.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification link is invalid or has expired")

    user = (await db.execute(select(User).where(User.id == verification.user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification link is invalid or has expired")

    user.is_email_verified = True
    verification.used = True
    await db.commit()


async def resend_verification_email(db: AsyncSession, email: str) -> None:
    """Always succeeds from the caller's perspective; avoids user enumeration."""
    email = _normalize_email(email)
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if user and user.is_active and not user.is_email_verified:
        verification = EmailVerificationToken(
            user_id=user.id,
            token=secrets.token_urlsafe(32),
            expires_at=datetime.now(timezone.utc) + timedelta(days=2),
        )
        db.add(verification)
        await db.commit()
        # In production: dispatch verification.token via email service (Celery task).


async def create_invitation(
    db: AsyncSession, organization_id: uuid.UUID, invited_by_id: uuid.UUID, email: str, role: UserRole
) -> Invitation:
    if role == UserRole.SUPER_ADMIN:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot invite a user as super admin")

    email = _normalize_email(email)
    existing_user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing_user:
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")

    # Supersede any still-pending invitation for the same email in this org,
    # so re-inviting someone doesn't leave multiple valid tokens outstanding.
    await db.execute(
        update(Invitation)
        .where(
            Invitation.organization_id == organization_id,
            Invitation.email == email,
            Invitation.status == "pending",
        )
        .values(status="revoked")
    )

    invitation = Invitation(
        organization_id=organization_id,
        email=email,
        role=role.value,
        token=secrets.token_urlsafe(32),
        status="pending",
        invited_by_id=invited_by_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    # In production: dispatch invitation.token via email service (Celery task).
    return invitation


async def accept_invitation(db: AsyncSession, token: str, full_name: str, password: str) -> User:
    invitation = (await db.execute(select(Invitation).where(Invitation.token == token))).scalar_one_or_none()
    if not invitation or invitation.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invitation is invalid or already used")
    if _aware(invitation.expires_at) < datetime.now(timezone.utc):
        invitation.status = "expired"
        await db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invitation has expired")
    await ensure_org_not_suspended(db, invitation.organization_id)

    # Guard against a user account having been created for this email through
    # another path (e.g. direct registration) between invite and acceptance.
    existing_user = (
        await db.execute(select(User).where(User.email == invitation.email))
    ).scalar_one_or_none()
    if existing_user:
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")

    user = User(
        organization_id=invitation.organization_id,
        email=invitation.email,
        hashed_password=hash_password(password),
        full_name=full_name,
        role=UserRole(invitation.role),
        is_active=True,
        is_email_verified=True,  # accepting via emailed link implies verified
    )
    db.add(user)
    invitation.status = "accepted"
    await db.commit()
    await db.refresh(user)
    return user
