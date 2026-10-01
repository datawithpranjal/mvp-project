# Learner Progress Persistence

Authenticated drafts, submissions, results, and completion status are persisted by the FastAPI backend.

## Production setup

Set `POSTGRES_URL` in the backend deployment to the production Supabase Postgres connection string. On the first authenticated progress request, the backend creates these tables if they do not already exist:

- `public.learner_progress`: one mutable draft/progress row per user and content item.
- `public.learner_attempts`: immutable submitted answers and result snapshots, with an idempotency key per logical submission.

The tables are owned by the verified session user id. The API never accepts a client-supplied user id for ownership. Row-level security is enabled; the backend uses the server database connection for the authenticated operation.

## Endpoints

- `GET /api/v1/learner-progress` loads all progress for the authenticated account.
- `PUT /api/v1/learner-progress/{content_type}/{content_id}/draft` saves a revision-aware draft.
- `POST /api/v1/learner-progress/{content_type}/{content_id}/attempt` records an immutable attempt and updates completion when it passes.

For local development, when `POSTGRES_URL` is unset or still the Docker default, progress uses `LEARNER_PROGRESS_STORE_PATH` (default `/tmp/data-foundry-learner-progress.json`). This fallback is for local testing only and is not shared between deployments.

## Existing browser data

Guest recovery data is stored in a guest namespace. Authenticated browser recovery data is namespaced by the verified account id. Existing unscoped browser data is not automatically assigned to an account, because doing so could attach another learner's work to the wrong account. The server account record is the source of truth after login.
