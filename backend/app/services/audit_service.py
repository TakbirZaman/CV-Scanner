import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def log_audit(
    db: AsyncSession,
    *,
    action: str,
    user_id: uuid.UUID | None = None,
    organization_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    meta: dict | None = None,
    ip_address: str | None = None,
) -> None:
    """Best-effort audit log — never raises, so it can't break the main flow."""
    try:
        db.add(
            AuditLog(
                action=action,
                user_id=user_id,
                organization_id=organization_id,
                target_type=target_type,
                target_id=target_id,
                meta=meta,
                ip_address=ip_address,
            )
        )
        await db.flush()
    except Exception:
        # Audit logging must never break business logic
        await db.rollback()
