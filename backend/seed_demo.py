"""
Realistic demo seed for CV Screener Auth Module (SQLite dev.db + Postgres compat)
Run:  python seed_demo.py
      or: $env:PYTHONPATH="backend"; python backend/seed_demo.py
Resets demo data idempotently (upserts by email/slug).
"""
import asyncio
import sys
import uuid
from pathlib import Path

# Ensure backend is on path when run as `python backend/seed_demo.py`
ROOT = Path(__file__).parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.db.session import Base
import app.models  # register models
from app.models.enums import OrganizationStatus, UserRole
from app.models.organization import Organization, Team
from app.models.user import User
from app.core.security import hash_password

DEFAULT_PASSWORD = "DemoPass123!"
DATABASE_URL = "sqlite+aiosqlite:///./dev.db"
# If run from project root, support ./backend/dev.db fallback
import os
if not Path(ROOT / "dev.db").exists() and Path(ROOT.parent / "backend" / "dev.db").exists():
    DATABASE_URL = f"sqlite+aiosqlite:///{ROOT.parent / 'backend' / 'dev.db'}"
# Allow override via env
if os.getenv("DATABASE_URL"):
    DATABASE_URL = os.getenv("DATABASE_URL")

# Realistic orgs with teams and users
DEMO_DATA = [
    {
        "org": {"name": "NovaTech Solutions", "slug": "novatech-solutions", "status": OrganizationStatus.ACTIVE},
        "teams": ["Engineering", "Talent Acquisition", "Product"],
        "users": [
            {"email": "sarah.chen@novatech.io", "full_name": "Sarah Chen", "role": UserRole.ORG_ADMIN, "team": "Talent Acquisition"},
            {"email": "david.kim@novatech.io", "full_name": "David Kim", "role": UserRole.RECRUITER, "team": "Talent Acquisition"},
            {"email": "priya.nair@novatech.io", "full_name": "Priya Nair", "role": UserRole.RECRUITER, "team": "Engineering"},
            {"email": "james.wilson@novatech.io", "full_name": "James Wilson", "role": UserRole.HIRING_MANAGER, "team": "Engineering"},
            {"email": "emma.rodriguez@novatech.io", "full_name": "Emma Rodriguez", "role": UserRole.HIRING_MANAGER, "team": "Product"},
        ],
    },
    {
        "org": {"name": "BrightPath Recruitment", "slug": "brightpath-recruitment", "status": OrganizationStatus.ACTIVE},
        "teams": ["Executive Search", "Healthcare Staffing", "Tech Recruiting"],
        "users": [
            {"email": "michael.owen@brightpath.co", "full_name": "Michael Owen", "role": UserRole.ORG_ADMIN, "team": "Executive Search"},
            {"email": "lisa.thompson@brightpath.co", "full_name": "Lisa Thompson", "role": UserRole.RECRUITER, "team": "Tech Recruiting"},
            {"email": "ahmed.hassan@brightpath.co", "full_name": "Ahmed Hassan", "role": UserRole.RECRUITER, "team": "Healthcare Staffing"},
            {"email": "rachel.green@brightpath.co", "full_name": "Rachel Green", "role": UserRole.HIRING_MANAGER, "team": "Executive Search"},
        ],
    },
    {
        "org": {"name": "Meridian Health Systems", "slug": "meridian-health", "status": OrganizationStatus.TRIAL},
        "teams": ["Nursing", "Physician Recruiting", "Allied Health"],
        "users": [
            {"email": "dr.amanda.foster@meridian.health", "full_name": "Dr. Amanda Foster", "role": UserRole.ORG_ADMIN, "team": "Physician Recruiting"},
            {"email": "carlos.mendez@meridian.health", "full_name": "Carlos Mendez", "role": UserRole.RECRUITER, "team": "Nursing"},
            {"email": "jennifer.lee@meridian.health", "full_name": "Jennifer Lee", "role": UserRole.HIRING_MANAGER, "team": "Nursing"},
        ],
    },
    {
        "org": {"name": "Apex Financial Group", "slug": "apex-financial", "status": OrganizationStatus.SUSPENDED},
        "teams": ["Risk & Compliance", "Wealth Management"],
        "users": [
            {"email": "robert.clarke@apexfinancial.com", "full_name": "Robert Clarke", "role": UserRole.ORG_ADMIN, "team": "Risk & Compliance"},
            {"email": "olivia.smith@apexfinancial.com", "full_name": "Olivia Smith", "role": UserRole.RECRUITER, "team": "Wealth Management"},
        ],
    },
]

SUPER_ADMINS = [
    {"email": "superadmin@cvscreener.io", "full_name": "Alex Morgan (Platform Admin)", "role": UserRole.SUPER_ADMIN},
]


async def upsert_org(session, org_data):
    result = await session.execute(select(Organization).where(Organization.slug == org_data["slug"]))
    org = result.scalar_one_or_none()
    if org:
        org.name = org_data["name"]
        org.status = org_data["status"]
    else:
        org = Organization(id=uuid.uuid4(), name=org_data["name"], slug=org_data["slug"], status=org_data["status"])
        session.add(org)
        await session.flush()
    return org


async def upsert_team(session, org, team_name):
    result = await session.execute(select(Team).where(Team.organization_id == org.id, Team.name == team_name))
    team = result.scalar_one_or_none()
    if not team:
        team = Team(id=uuid.uuid4(), organization_id=org.id, name=team_name)
        session.add(team)
        await session.flush()
    return team


async def upsert_user(session, email, full_name, role, org_id, team_id):
    # case-insensitive lookup (app normalizes to lower)
    result = await session.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    hashed = hash_password(DEFAULT_PASSWORD)
    if user:
        user.full_name = full_name
        user.role = role
        user.organization_id = org_id
        user.team_id = team_id
        user.is_active = True
        user.is_email_verified = True
        # keep password as demo password
        user.hashed_password = hashed
    else:
        user = User(
            id=uuid.uuid4(),
            email=email.lower(),
            full_name=full_name,
            role=role,
            organization_id=org_id,
            team_id=team_id,
            hashed_password=hashed,
            is_active=True,
            is_email_verified=True,
        )
        session.add(user)
        await session.flush()
    return user


async def main():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with Session() as session:
        team_cache = {}
        org_cache = {}
        for entry in DEMO_DATA:
            org = await upsert_org(session, entry["org"])
            org_cache[org.slug] = org
            for tname in entry["teams"]:
                team = await upsert_team(session, org, tname)
                team_cache[(org.slug, tname)] = team
            for u in entry["users"]:
                team = team_cache.get((org.slug, u["team"]))
                await upsert_user(session, u["email"], u["full_name"], u["role"], org.id, team.id if team else None)

        # super admins (no org)
        for sa in SUPER_ADMINS:
            await upsert_user(session, sa["email"], sa["full_name"], sa["role"], None, None)

        await session.commit()

        # summary
        print(f"\nSeed complete into {DATABASE_URL}")
        print(f"Password for ALL demo users: {DEFAULT_PASSWORD}\n")
        print("Organizations:")
        for e in DEMO_DATA:
            print(f"  - {e['org']['name']} ({e['org']['slug']}) [{e['org']['status'].value}] -> {len(e['teams'])} teams, {len(e['users'])} users")
        print("\nDemo Logins (try these):")
        print(f"  SUPER_ADMIN : superadmin@cvscreener.io / {DEFAULT_PASSWORD}")
        for e in DEMO_DATA:
            for u in e["users"]:
                print(f"  {u['role'].value:15} : {u['email'].lower():40} / {DEFAULT_PASSWORD}  ({u['full_name']} @ {e['org']['name']})")
        print("\nSuspended org (login will be blocked by design):")
        print(f"  robert.clarke@apexfinancial.com / {DEFAULT_PASSWORD} -> 403 (org suspended, see backend/app/models/enums.py:18)")
        print("\nTry: POST http://localhost:8000/api/v1/auth/login  with any above email/password")
        print("     GET  http://localhost:8000/api/v1/auth/me       (Bearer token)")
        print("     GET  http://localhost:8000/docs                 (interactive docs)")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
