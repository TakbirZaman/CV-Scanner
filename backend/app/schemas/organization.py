import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import OrganizationStatus, UserRole
from app.schemas.auth import _validate_bcrypt_length


class OrganizationPublic(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    status: OrganizationStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class TeamCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)


class TeamPublic(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class InvitationCreate(BaseModel):
    email: EmailStr
    role: UserRole = Field(description="Cannot be SUPER_ADMIN — org-scoped roles only")


class InvitationPublic(BaseModel):
    id: uuid.UUID
    email: EmailStr
    role: str
    status: str
    expires_at: datetime

    model_config = {"from_attributes": True}


class InvitationAccept(BaseModel):
    token: str
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def _check_password_bytes(cls, v: str) -> str:
        return _validate_bcrypt_length(v)


class MemberUpdate(BaseModel):
    role: UserRole | None = Field(default=None, description="New role; super_admin not allowed via this endpoint")
    is_active: bool | None = None
    team_id: uuid.UUID | None = None


class AuditLogPublic(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    user_id: uuid.UUID | None
    action: str
    target_type: str | None
    target_id: str | None
    meta: dict | None
    ip_address: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
