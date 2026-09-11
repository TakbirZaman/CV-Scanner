# AI CV Screener — Auth & Multi-Tenant Foundation

This is the first working slice of the AI CV Screener & Recruitment Automation
Platform: **Module 1 (Authentication)** and **Module 2 (Organization
Management)**. Everything here is real, tested code — not a scaffold.

This version has been through a full audit pass: every claim below was
reproduced and verified, not just asserted. See "Recheck notes" at the
bottom for exactly what was found and fixed.

## What's implemented

- **Multi-tenant data model**: `Organization` → `Team` → `User`, with
  `SUPER_ADMIN` as the one role not scoped to a single org.
- **Roles**: `SUPER_ADMIN`, `ORG_ADMIN`, `RECRUITER`, `HIRING_MANAGER`.
- **Auth flow**: register (creates an org + its first `ORG_ADMIN`), login,
  JWT access + refresh tokens, refresh rotation with revocation, logout.
- **Forgot password / reset password**: request a reset link, reset with a
  one-hour, single-use token; resetting revokes all existing sessions.
- **Email verification**: a verification token is issued at registration;
  a resend endpoint exists for expired/lost links. Neither endpoint leaks
  whether an email is registered.
- **RBAC**: a `require_roles(...)` FastAPI dependency that gates endpoints
  by role, with `SUPER_ADMIN` always passing through.
- **Tenant isolation**: every org-scoped query is filtered by the caller's
  `organization_id`, resolved from the JWT — verified by test that one
  org's admin cannot see another org's teams.
- **Invitations**: org admins invite a teammate by email + role; re-inviting
  the same email supersedes the old pending invite instead of leaving
  duplicates; the invitee accepts with a token to create their account,
  already scoped to the right org.
- **Password security**: bcrypt via the `bcrypt` library directly (not
  passlib — its bundled bcrypt backend has a known incompatibility with
  bcrypt 4.x that causes hangs; see `app/core/security.py`). Passwords are
  validated against bcrypt's 72-byte limit at the API boundary, so an
  oversized password (easy to hit with emoji/accented characters) gets a
  clean 422 instead of crashing.
- **Email normalization**: all email lookups (register, login, invite) are
  case-insensitive, so `Alice@Acme.com` and `alice@acme.com` are the same
  account.
- **Timing-safe login**: a bcrypt verify always runs, even for unknown
  emails, so response timing doesn't reveal which emails are registered.
- **Migrations**: a hand-written, Postgres-accurate Alembic migration
  (`alembic/versions/0001_initial_schema.py`) creating all 7 tables with
  correct enums, FKs, and indexes — diffed column-by-column and index-by-
  index against the SQLAlchemy models to confirm they match exactly.
- **Tests**: 21 passing end-to-end API tests — 8 covering the core auth/org
  flow, 13 specifically regression-testing bugs found across two audit
  passes (see below), including real reproductions of unhandled-500 crashes
  and unenforced business rules before each fix.

## What's *not* yet built

Everything past Module 2: job management, resume upload/parsing, the AI
matching engine, semantic search, analytics, n8n integration, and the
frontend. This was a deliberate scope decision — see the note at the end.

Also explicitly out of scope for this slice, and worth knowing about before
production use:
- **Rate limiting** on login/register/password-reset — the original spec
  calls for this under Security; not implemented here.
- **Super-admin org impersonation** — a `SUPER_ADMIN` currently cannot
  target a specific org's teams/invitations (they get a clean 400 rather
  than a crash, but there's no mechanism yet to say "act on behalf of org X").
- **Non-root Docker user** — the container currently runs as root; fine for
  local dev, worth hardening before any real deployment.
- **Refresh token cleanup** — revoked/expired refresh tokens accumulate in
  the table indefinitely; needs a periodic cleanup job (natural fit for the
  Celery worker once that's introduced).

## Running it

Requires Docker (Postgres + Redis aren't available in the sandbox this was
built in, so integration against real Postgres hasn't been run yet — only
against SQLite in tests, which validates logic but not every Postgres-
specific behavior).

```bash
cd cv-screener
cp backend/.env.example backend/.env
# edit backend/.env — at minimum change JWT_SECRET_KEY for anything beyond local dev
docker compose up --build
```

This runs `alembic upgrade head` automatically before starting the API.
Once up:

- API: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

## Running tests locally (no Docker needed)

```bash
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements-dev.txt
./venv/bin/python -m pytest tests/ -v
```

Tests run against an in-memory SQLite DB via dependency override, so they're
fast and need no external services.

## API surface

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/register` | none | creates org + first ORG_ADMIN |
| POST | `/api/v1/auth/login` | none | returns access + refresh tokens |
| POST | `/api/v1/auth/refresh` | none (refresh token) | rotates refresh token |
| POST | `/api/v1/auth/logout` | none (refresh token) | revokes refresh token |
| GET | `/api/v1/auth/me` | bearer | current user |
| POST | `/api/v1/auth/forgot-password` | none | always 202, no enumeration |
| POST | `/api/v1/auth/reset-password` | none (reset token) | revokes all sessions |
| POST | `/api/v1/auth/verify-email` | none (verify token) | marks email verified |
| POST | `/api/v1/auth/resend-verification` | none | always 202, no enumeration |
| GET | `/api/v1/organizations/me` | bearer | current org |
| POST | `/api/v1/organizations/teams` | bearer, ORG_ADMIN | create team |
| GET | `/api/v1/organizations/teams` | bearer | list own org's teams |
| POST | `/api/v1/organizations/invitations` | bearer, ORG_ADMIN | invite by email+role |
| GET | `/api/v1/organizations/invitations` | bearer, ORG_ADMIN | list pending invites |
| POST | `/api/v1/organizations/invitations/accept` | none (invite token) | accept invite, get tokens |

## Recheck notes

A full audit pass was run against the first delivered version: fresh
install, fresh test run, and a line-by-line review rather than trusting the
original write-up. Six real bugs and two real spec gaps were found and
fixed, each one reproduced first so the fix could be verified against an
actual failure, not just reasoned about:

1. **Email case sensitivity** — duplicate accounts and login mismatches
   were possible across different casing of the same email. Fixed with
   normalization at every entry point.
2. **SUPER_ADMIN + org-scoped endpoints** — hitting `create_team` or
   `create_invitation` with no org context crashed with an unhandled 500
   (`NOT NULL constraint failed`). Now returns a clean 400.
3. **Oversized passwords** — a password under 128 characters but over
   bcrypt's 72-byte limit (easy with multi-byte characters) crashed with an
   unhandled 500. Now rejected with a clean 422 at the schema boundary.
4. **Invitation-acceptance race** — accepting an invitation didn't check
   whether a user with that email had been created through another path in
   the meantime, risking an unhandled 500 on the unique constraint.
5. **Duplicate pending invitations** — re-inviting the same email created a
   second valid invitation instead of superseding the first.
6. **Redundant migration indexes** — the hand-written migration paired
   `UniqueConstraint` with a separate `create_index` on the same column six
   times, creating two index structures where the models only produce one.
   Confirmed by compiling actual Postgres DDL from the models and diffing
   against the migration; fixed to a single unique index in each case.
7. **Missing Forgot Password endpoint** — the `PasswordResetToken` model
   and schemas existed but nothing was wired up, despite this being an
   explicit Module 1 requirement in the original spec. Built and tested.
8. **Missing Email Verification endpoint** — same gap, same fix, for
   `EmailVerificationToken`.

A login timing side-channel (skipping the bcrypt check entirely for unknown
emails, which is measurably faster than a real check) was also found and
fixed as a drive-by security improvement, even though it wasn't a
correctness bug.

**Second pass**: a further check found that `Organization.status`
(active/suspended/trial) was modeled but never enforced anywhere — a user
whose org was suspended could still log in, refresh tokens, accept
invitations, and use any endpoint indefinitely. Fixed by checking org status
at login, token refresh, invitation acceptance, and — most importantly — on
every authenticated request via `get_current_user`, so a still-valid access
token stops working immediately on suspension rather than continuing until
its natural expiry. Worth noting honestly: no endpoint in this slice can
actually *set* an org to suspended yet (that's a future super-admin
feature), so this couldn't be triggered through the live API today — it's a
fix for a modeled business rule that had silently gone unenforced, closed
now so it's correct the moment that admin endpoint exists.

## A note on scope

Your original spec asks for a 13-module enterprise SaaS platform with AI
matching, vector search, n8n automation, full DevOps, and CI/CD — that's
realistically weeks of engineering work, not one deliverable. Rather than
generate 13 modules' worth of thin, unverified stubs, this slice is narrow
but real: every piece of logic here has been executed and checked, not just
written. The auth/tenant layer is the right foundation to build the rest on
top of.

**Suggested next slice**: Module 3 (Job Management) or Module 4-5 (Resume
Upload + Parsing) — both build directly on the org/user/RBAC model that's
now in place. Let me know which you want next and I'll build it the same
way: real code, real tests, nothing hand-waved.
