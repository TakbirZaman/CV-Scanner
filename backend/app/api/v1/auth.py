from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import rate_limit
from app.db.session import get_db
from app.models.user import User
from app.services.audit_service import log_audit
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserPublic,
    VerifyEmailRequest,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(settings.RATE_LIMIT_REGISTER, settings.RATE_LIMIT_WINDOW_SECONDS, "register")),
) -> User:
    """Creates a new organization plus its first ORG_ADMIN user."""
    user = await auth_service.register_organization(db, payload)
    await log_audit(
        db,
        action="org.register",
        user_id=user.id,
        organization_id=user.organization_id,
        target_type="organization",
        target_id=str(user.organization_id),
        meta={"email": user.email},
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(settings.RATE_LIMIT_LOGIN, settings.RATE_LIMIT_WINDOW_SECONDS, "login")),
) -> TokenResponse:
    user = await auth_service.authenticate_user(db, payload)
    tokens = await auth_service.issue_tokens(db, user)
    await log_audit(
        db,
        action="auth.login",
        user_id=user.id,
        organization_id=user.organization_id,
        target_type="user",
        target_id=str(user.id),
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()
    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    return await auth_service.refresh_access_token(db, payload.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> None:
    await auth_service.revoke_refresh_token(db, payload.refresh_token)


@router.get("/me", response_model=UserPublic)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(
        rate_limit(settings.RATE_LIMIT_FORGOT_PASSWORD, settings.RATE_LIMIT_WINDOW_SECONDS, "forgot_password")
    ),
) -> dict[str, str]:
    """Always returns 202 regardless of whether the email is registered, to avoid
    leaking which emails have accounts."""
    await auth_service.request_password_reset(db, payload.email)
    return {"message": "If that email is registered, a password reset link has been sent."}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> None:
    await auth_service.reset_password(db, payload.token, payload.new_password)


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
async def verify_email(payload: VerifyEmailRequest, db: AsyncSession = Depends(get_db)) -> None:
    await auth_service.verify_email(db, payload.token)


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
async def resend_verification(
    payload: ResendVerificationRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(
        rate_limit(settings.RATE_LIMIT_RESEND_VERIFICATION, settings.RATE_LIMIT_WINDOW_SECONDS, "resend_verification")
    ),
) -> dict[str, str]:
    await auth_service.resend_verification_email(db, payload.email)
    return {"message": "If that email is registered and unverified, a new verification link has been sent."}
