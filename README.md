# CV Screener

Screens CVs for recruiters. Upload resumes, it parses and ranks them. Auth + multi-org is already done.

What it does:
- Org / team / user setup with roles
- JWT login, invites, password reset
- Resume upload and AI matching (in progress)
- Postgres + Redis backend

Stack: FastAPI, PostgreSQL, Redis, Docker

Run it:
```bash
docker compose up --build
# backend at http://localhost:8000
```
Use `start.bat` / `./start.ps1` on Windows.
