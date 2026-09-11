"""Regression tests for issues found during the project-wide recheck.

Each test targets a specific bug that was reproduced and fixed:
1. Email case sensitivity
2. SUPER_ADMIN hitting org-scoped endpoints with no org context
3. Passwords over bcrypt's 72-byte limit
4. accept_invitation racing against a directly-registered user
5. Duplicate pending invitations on re-invite
6. Forgot password / reset password flow
7. Email verification flow
"""
import pytest


@pytest.mark.asyncio
async def test_email_case_insensitive_duplicate_rejected(client):
    await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme",
            "full_name": "Alice",
            "email": "Alice@Acme.com",
            "password": "supersecret123",
        },
    )
    dup = await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Other",
            "full_name": "Alice2",
            "email": "alice@ACME.com",
            "password": "supersecret123",
        },
    )
    assert dup.status_code == 409


@pytest.mark.asyncio
async def test_email_case_insensitive_login(client):
    await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme",
            "full_name": "Alice",
            "email": "Alice@Acme.com",
            "password": "supersecret123",
        },
    )
    # Login with different case than registered — must still succeed.
    login = await client.post(
        "/api/v1/auth/login", json={"email": "alice@acme.com", "password": "supersecret123"}
    )
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_oversized_password_rejected_cleanly(client):
    # 15 chars but well over 72 UTF-8 bytes due to 4-byte emoji encoding.
    long_password = "pw-" + "😀" * 20
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme",
            "full_name": "Alice",
            "email": "alice@acme.com",
            "password": long_password,
        },
    )
    # Must be a clean 422 (validation error), never a 500.
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_forgot_password_reset_flow(client, db_session):
    await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme",
            "full_name": "Alice",
            "email": "alice@acme.com",
            "password": "supersecret123",
        },
    )

    forgot = await client.post("/api/v1/auth/forgot-password", json={"email": "alice@acme.com"})
    assert forgot.status_code == 202

    # Forgot-password must return 202 even for unknown emails (no enumeration).
    forgot_unknown = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "nobody@nowhere.com"}
    )
    assert forgot_unknown.status_code == 202

    # Pull the raw reset token directly from the DB (it would normally be emailed).
    from sqlalchemy import select
    from app.models.auth import PasswordResetToken

    async with db_session() as db:
        token_row = (await db.execute(select(PasswordResetToken))).scalars().first()
    assert token_row is not None

    reset = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token_row.token, "new_password": "brandnewpassword456"},
    )
    assert reset.status_code == 204

    # Old password must no longer work.
    old_login = await client.post(
        "/api/v1/auth/login", json={"email": "alice@acme.com", "password": "supersecret123"}
    )
    assert old_login.status_code == 401

    # New password must work.
    new_login = await client.post(
        "/api/v1/auth/login", json={"email": "alice@acme.com", "password": "brandnewpassword456"}
    )
    assert new_login.status_code == 200

    # The reset token must be single-use.
    reuse = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token_row.token, "new_password": "yetanotherpassword789"},
    )
    assert reuse.status_code == 400


@pytest.mark.asyncio
async def test_password_reset_revokes_existing_sessions(client, db_session):
    await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme",
            "full_name": "Alice",
            "email": "alice@acme.com",
            "password": "supersecret123",
        },
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": "alice@acme.com", "password": "supersecret123"}
    )
    old_refresh = login.json()["refresh_token"]

    await client.post("/api/v1/auth/forgot-password", json={"email": "alice@acme.com"})

    from sqlalchemy import select
    from app.models.auth import PasswordResetToken

    async with db_session() as db:
        token_row = (await db.execute(select(PasswordResetToken))).scalars().first()

    await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token_row.token, "new_password": "brandnewpassword456"},
    )

    # The refresh token issued before the reset must now be dead.
    stale_refresh = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert stale_refresh.status_code == 401


@pytest.mark.asyncio
async def test_email_verification_flow(client, db_session):
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme",
            "full_name": "Alice",
            "email": "alice@acme.com",
            "password": "supersecret123",
        },
    )
    assert reg.json()["is_email_verified"] is False

    from sqlalchemy import select
    from app.models.auth import EmailVerificationToken

    async with db_session() as db:
        token_row = (await db.execute(select(EmailVerificationToken))).scalars().first()
    assert token_row is not None

    verify = await client.post("/api/v1/auth/verify-email", json={"token": token_row.token})
    assert verify.status_code == 204

    login = await client.post(
        "/api/v1/auth/login", json={"email": "alice@acme.com", "password": "supersecret123"}
    )
    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"}
    )
    assert me.json()["is_email_verified"] is True

    # Token must be single-use.
    reuse = await client.post("/api/v1/auth/verify-email", json={"token": token_row.token})
    assert reuse.status_code == 400


@pytest.mark.asyncio
async def test_resend_verification_always_returns_202(client):
    # No account exists at all — must still return 202, not leak non-existence.
    resp = await client.post(
        "/api/v1/auth/resend-verification", json={"email": "nobody@nowhere.com"}
    )
    assert resp.status_code == 202


@pytest.mark.asyncio
async def test_reinviting_same_email_supersedes_old_invitation(client, db_session):
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme",
            "full_name": "Alice",
            "email": "alice@acme.com",
            "password": "supersecret123",
        },
    )
    assert reg.status_code == 201
    login = await client.post(
        "/api/v1/auth/login", json={"email": "alice@acme.com", "password": "supersecret123"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    first = await client.post(
        "/api/v1/organizations/invitations",
        json={"email": "bob@acme.com", "role": "recruiter"},
        headers=headers,
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/v1/organizations/invitations",
        json={"email": "bob@acme.com", "role": "hiring_manager"},
        headers=headers,
    )
    assert second.status_code == 201

    from sqlalchemy import select
    from app.models.organization import Invitation

    async with db_session() as db:
        rows = (
            await db.execute(select(Invitation).where(Invitation.email == "bob@acme.com"))
        ).scalars().all()

    pending = [r for r in rows if r.status == "pending"]
    revoked = [r for r in rows if r.status == "revoked"]
    assert len(pending) == 1
    assert pending[0].role == "hiring_manager"
    assert len(revoked) == 1


@pytest.mark.asyncio
async def test_super_admin_hitting_org_scoped_endpoint_gets_clean_400(client, db_session):
    import uuid
    from app.models.user import User
    from app.models.enums import UserRole
    from app.core.security import create_access_token

    super_admin_id = uuid.uuid4()
    async with db_session() as db:
        db.add(
            User(
                id=super_admin_id,
                organization_id=None,
                email="root@platform.com",
                hashed_password="x",
                full_name="Root",
                role=UserRole.SUPER_ADMIN,
                is_active=True,
            )
        )
        await db.commit()

    token = create_access_token(super_admin_id, None, "super_admin")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/organizations/teams", json={"name": "Ghost Team"}, headers=headers
    )
    # Must be a clean 400, never an unhandled 500.
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_duplicate_org_name_gets_disambiguated_slug(client, db_session):
    """Two orgs registered with the same name must not collide on slug —
    exercises the retry/suffix logic in _unique_slug directly through the API."""
    from sqlalchemy import select
    from app.models.organization import Organization

    r1 = await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme Inc",
            "full_name": "Alice",
            "email": "alice@acme.com",
            "password": "supersecret123",
        },
    )
    assert r1.status_code == 201

    r2 = await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme Inc",
            "full_name": "Carl",
            "email": "carl@acmeinc.com",
            "password": "supersecret123",
        },
    )
    assert r2.status_code == 201

    async with db_session() as db:
        slugs = sorted(
            (await db.execute(select(Organization.slug))).scalars().all()
        )
    assert slugs == ["acme-inc", "acme-inc-2"]


@pytest.mark.asyncio
async def test_suspended_org_blocks_login(client, db_session):
    from sqlalchemy import select
    from app.models.organization import Organization
    from app.models.enums import OrganizationStatus

    await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme",
            "full_name": "Alice",
            "email": "alice@acme.com",
            "password": "supersecret123",
        },
    )

    async with db_session() as db:
        org = (await db.execute(select(Organization))).scalars().first()
        org.status = OrganizationStatus.SUSPENDED
        await db.commit()

    login = await client.post(
        "/api/v1/auth/login", json={"email": "alice@acme.com", "password": "supersecret123"}
    )
    assert login.status_code == 403


@pytest.mark.asyncio
async def test_suspending_org_mid_session_cuts_off_existing_access_token(client, db_session):
    """An access token issued before suspension must stop working immediately,
    not just at its natural expiry — this is the main enforcement point since
    access tokens are re-checked against the DB on every request."""
    from sqlalchemy import select
    from app.models.organization import Organization
    from app.models.enums import OrganizationStatus

    await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme",
            "full_name": "Alice",
            "email": "alice@acme.com",
            "password": "supersecret123",
        },
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": "alice@acme.com", "password": "supersecret123"}
    )
    access_token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # Confirm the token works before suspension.
    me_before = await client.get("/api/v1/auth/me", headers=headers)
    assert me_before.status_code == 200

    async with db_session() as db:
        org = (await db.execute(select(Organization))).scalars().first()
        org.status = OrganizationStatus.SUSPENDED
        await db.commit()

    # Same still-unexpired access token must now be rejected.
    me_after = await client.get("/api/v1/auth/me", headers=headers)
    assert me_after.status_code == 403


@pytest.mark.asyncio
async def test_suspended_org_blocks_invitation_acceptance(client, db_session):
    from sqlalchemy import select
    from app.models.organization import Organization, Invitation
    from app.models.enums import OrganizationStatus

    await client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": "Acme",
            "full_name": "Alice",
            "email": "alice@acme.com",
            "password": "supersecret123",
        },
    )
    login = await client.post(
        "/api/v1/auth/login", json={"email": "alice@acme.com", "password": "supersecret123"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    await client.post(
        "/api/v1/organizations/invitations",
        json={"email": "bob@acme.com", "role": "recruiter"},
        headers=headers,
    )

    async with db_session() as db:
        org = (await db.execute(select(Organization))).scalars().first()
        org.status = OrganizationStatus.SUSPENDED
        invite_row = (await db.execute(select(Invitation))).scalars().first()
        raw_token = invite_row.token
        await db.commit()

    accept = await client.post(
        "/api/v1/organizations/invitations/accept",
        json={"token": raw_token, "full_name": "Bob", "password": "supersecret123"},
    )
    assert accept.status_code == 403
