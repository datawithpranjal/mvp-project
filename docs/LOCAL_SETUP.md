# Local Setup

## Backend

From the repository root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check:

```bash
curl http://localhost:8000/healthz
```

## Frontend

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` for local development.

## Docker Compose

From the repository root:

```bash
docker compose up --build
```

## Environment Variables

- `NEXT_PUBLIC_API_BASE_URL`: frontend-to-backend URL.
- `BACKEND_CORS_ORIGINS`: comma-separated frontend origins.
- `BACKEND_CORS_ORIGIN_REGEX`: optional Vercel preview regex.
- `POSTGRES_URL`: optional Postgres/Supabase connection string.
- `RESEND_API_KEY`: optional OTP email provider key.
- `AUTH_EMAIL_FROM`: verified sender for OTP email.

## How To Add A New Scenario

Create one JSON file under `backend/app/scenarios` or a scenario folder with `scenario.json`, `setup.sql`, and `expected.sql`.

For SQL validation, include:

- `validation_type: "SQL_OUTPUT_MATCH"`
- `setup.sql` to create seed tables
- `expected.sql` with the canonical expected result

For rubric validation, include:

- `validation_type: "DEBUG_RUBRIC"`, `"DESIGN_RUBRIC"`, or `"CODE_REVIEW_RUBRIC"`
- `rubric`
- `solution_query` or model answer fields
- `hints`

Restart or redeploy the backend. The file-backed loader will include the scenario in `/api/v1/scenarios`.

