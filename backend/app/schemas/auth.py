import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import UserRole


def _validate_bcrypt_length(password: str) -> str:
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be 72 bytes or fewer (some multi-byte characters count as more than 1 byte)")
    return password


class RegisterRequest(BaseModel):
    """Registers a brand-new organization along with its first admin user."""

    organization_name: str = Field(min_length=2, max_length=255)
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def _check_password_bytes(cls, v: str) -> str:
        return _validate_bcrypt_length(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _check_password_bytes(cls, v: str) -> str:
        return _validate_bcrypt_length(v)


class VerifyEmailRequest(BaseModel):
    token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserPublic(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: UserRole
    organization_id: uuid.UUID | None
    is_active: bool
    is_email_verified: bool

    model_config = {"from_attributes": True}
