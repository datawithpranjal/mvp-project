from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from app.core.config import DEFAULT_POSTGRES_URL, get_settings
from app.schemas.learner_progress import (
    LearnerAttempt,
    LearnerAttemptRequest,
    LearnerDraftRequest,
    LearnerProgressItem,
    LearnerProgressListResponse,
)


class LearnerProgressStoreError(RuntimeError):
    pass


class LearnerProgressStore:
    """Durable learner drafts and attempts, scoped by the verified account id."""

    def __init__(
        self,
        storage_path: Path | None = None,
        postgres_url: str | None = None,
    ) -> None:
        settings = get_settings()
        self.storage_path = storage_path or Path(settings.learner_progress_store_path)
        configured_url = postgres_url if postgres_url is not None else settings.postgres_url
        self.postgres_url = self._active_postgres_url(configured_url)

    def list_progress(self, user_id: str) -> LearnerProgressListResponse:
        if self.postgres_url:
            return LearnerProgressListResponse(items=self._list_postgres(user_id))
        data = self._read_file()
        items = [
            self._file_item_to_model(item)
            for item in data.get("progress", {}).values()
            if item.get("user_id") == user_id
        ]
        return LearnerProgressListResponse(items=items)

    def save_draft(
        self,
        user_id: str,
        content_type: str,
        content_id: str,
        payload: LearnerDraftRequest,
    ) -> LearnerProgressItem:
        if self.postgres_url:
            return self._save_draft_postgres(user_id, content_type, content_id, payload)

        data = self._read_file()
        key = self._key(user_id, content_type, content_id)
        existing = self._file_progress(data, key, user_id, content_type, content_id)
        if payload.client_revision < int(existing.get("draft_revision", 0)):
            return self._file_item_to_model(existing)
        now = self._now()
        existing.update(
            {
                "user_id": user_id,
                "content_type": content_type,
                "content_id": content_id,
                "draft_answer": payload.draft_answer,
                "draft_interview_answer": payload.draft_interview_answer,
                "hints_revealed": payload.hints_revealed,
                "draft_revision": payload.client_revision,
                "updated_at": now,
            }
        )
        if payload.completed is True:
            existing["completed"] = True
            existing["completed_at"] = existing.get("completed_at") or now
        data.setdefault("progress", {})[key] = existing
        self._write_file(data)
        return self._file_item_to_model(existing)

    def record_attempt(
        self,
        user_id: str,
        content_type: str,
        content_id: str,
        payload: LearnerAttemptRequest,
    ) -> tuple[LearnerProgressItem, bool]:
        if self.postgres_url:
            return self._record_attempt_postgres(user_id, content_type, content_id, payload)

        data = self._read_file()
        key = self._key(user_id, content_type, content_id)
        existing = self._file_progress(data, key, user_id, content_type, content_id)
        attempts = data.setdefault("attempts", {})
        attempt_key = self._attempt_key(user_id, content_type, content_id, payload.idempotency_key)
        if attempt_key in attempts:
            return self._file_item_to_model(existing), True

        now = self._now()
        attempt = {
            "id": f"attempt-{payload.idempotency_key}",
            "user_id": user_id,
            "content_type": content_type,
            "content_id": content_id,
            "idempotency_key": payload.idempotency_key,
            "answer": payload.answer,
            "passed": payload.passed,
            "message": payload.message,
            "result": payload.result,
            "created_at": now,
        }
        attempts[attempt_key] = attempt
        existing.update(
            {
                "user_id": user_id,
                "content_type": content_type,
                "content_id": content_id,
                "completed": bool(existing.get("completed") or payload.passed is True),
                "completed_at": existing.get("completed_at")
                or (now if payload.passed is True else None),
                "latest_result": payload.result,
                "ai_feedback": payload.ai_feedback or existing.get("ai_feedback"),
                "updated_at": now,
            }
        )
        data.setdefault("progress", {})[key] = existing
        self._write_file(data)
        return self._file_item_to_model(existing), False

    def _ensure_schema(self, cursor: Any) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS public.learner_progress (
                user_id TEXT NOT NULL REFERENCES public.playground_users(id) ON DELETE CASCADE,
                content_type TEXT NOT NULL,
                content_id TEXT NOT NULL,
                draft_answer TEXT NOT NULL DEFAULT '',
                draft_interview_answer TEXT NOT NULL DEFAULT '',
                hints_revealed INTEGER NOT NULL DEFAULT 0,
                completed BOOLEAN NOT NULL DEFAULT FALSE,
                completed_at TIMESTAMPTZ,
                latest_result JSONB,
                ai_feedback JSONB,
                draft_revision BIGINT NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (user_id, content_type, content_id)
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS public.learner_attempts (
                id BIGSERIAL PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES public.playground_users(id) ON DELETE CASCADE,
                content_type TEXT NOT NULL,
                content_id TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                answer TEXT NOT NULL,
                passed BOOLEAN,
                message TEXT NOT NULL DEFAULT '',
                result JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (user_id, content_type, content_id, idempotency_key)
            )
            """
        )
        cursor.execute("ALTER TABLE public.learner_progress ENABLE ROW LEVEL SECURITY")
        cursor.execute("ALTER TABLE public.learner_attempts ENABLE ROW LEVEL SECURITY")

    def _list_postgres(self, user_id: str) -> list[LearnerProgressItem]:
        try:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_schema(cursor)
                    cursor.execute(
                        """
                        SELECT user_id, content_type, content_id, draft_answer,
                               draft_interview_answer, hints_revealed, completed,
                               completed_at, latest_result, ai_feedback,
                               draft_revision, updated_at
                        FROM public.learner_progress
                        WHERE user_id = %s
                        ORDER BY updated_at DESC
                        """,
                        (user_id,),
                    )
                    rows = cursor.fetchall()
                    items = [self._postgres_item(cursor, row) for row in rows]
                    for item in items:
                        cursor.execute(
                            """
                            SELECT id, idempotency_key, answer, passed, message, result, created_at
                            FROM public.learner_attempts
                            WHERE user_id = %s AND content_type = %s AND content_id = %s
                            ORDER BY created_at DESC
                            """,
                            (user_id, item.content_type, item.content_id),
                        )
                        item.attempts = [self._attempt_from_row(attempt) for attempt in cursor.fetchall()]
            return items
        except Exception as exc:
            raise LearnerProgressStoreError("Unable to load learner progress.") from exc

    def _save_draft_postgres(
        self,
        user_id: str,
        content_type: str,
        content_id: str,
        payload: LearnerDraftRequest,
    ) -> LearnerProgressItem:
        try:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_schema(cursor)
                    cursor.execute(
                        """
                        INSERT INTO public.learner_progress (
                            user_id, content_type, content_id, draft_answer,
                            draft_interview_answer, hints_revealed, draft_revision, completed, updated_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                        ON CONFLICT (user_id, content_type, content_id) DO UPDATE SET
                            draft_answer = EXCLUDED.draft_answer,
                            draft_interview_answer = EXCLUDED.draft_interview_answer,
                            hints_revealed = EXCLUDED.hints_revealed,
                            draft_revision = EXCLUDED.draft_revision,
                            completed = public.learner_progress.completed OR COALESCE(EXCLUDED.completed, FALSE),
                            completed_at = COALESCE(
                                public.learner_progress.completed_at,
                                CASE WHEN EXCLUDED.completed THEN NOW() ELSE NULL END
                            ),
                            updated_at = NOW()
                        WHERE public.learner_progress.draft_revision <= EXCLUDED.draft_revision
                        RETURNING user_id, content_type, content_id, draft_answer,
                                  draft_interview_answer, hints_revealed, completed,
                                  completed_at, latest_result, ai_feedback,
                                  draft_revision, updated_at
                        """,
                        (
                            user_id,
                            content_type,
                            content_id,
                            payload.draft_answer,
                            payload.draft_interview_answer,
                            payload.hints_revealed,
                            payload.client_revision,
                            payload.completed,
                        ),
                    )
                    row = cursor.fetchone()
                    if not row:
                        cursor.execute(
                            """
                            SELECT user_id, content_type, content_id, draft_answer,
                                   draft_interview_answer, hints_revealed, completed,
                                   completed_at, latest_result, ai_feedback,
                                   draft_revision, updated_at
                            FROM public.learner_progress
                            WHERE user_id = %s AND content_type = %s AND content_id = %s
                            """,
                            (user_id, content_type, content_id),
                        )
                        row = cursor.fetchone()
                    if not row:
                        raise LearnerProgressStoreError("Learner progress row was not available.")
                    item = self._postgres_item(cursor, row)
                    cursor.execute(
                        """
                        SELECT id, idempotency_key, answer, passed, message, result, created_at
                        FROM public.learner_attempts
                        WHERE user_id = %s AND content_type = %s AND content_id = %s
                        ORDER BY created_at DESC
                        """,
                        (user_id, content_type, content_id),
                    )
                    item.attempts = [self._attempt_from_row(attempt) for attempt in cursor.fetchall()]
                connection.commit()
            return item
        except LearnerProgressStoreError:
            raise
        except Exception as exc:
            raise LearnerProgressStoreError("Unable to save learner draft.") from exc

    def _record_attempt_postgres(
        self,
        user_id: str,
        content_type: str,
        content_id: str,
        payload: LearnerAttemptRequest,
    ) -> tuple[LearnerProgressItem, bool]:
        try:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_schema(cursor)
                    cursor.execute(
                        """
                        INSERT INTO public.learner_attempts (
                            user_id, content_type, content_id, idempotency_key,
                            answer, passed, message, result
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                        ON CONFLICT (user_id, content_type, content_id, idempotency_key)
                        DO NOTHING
                        RETURNING id
                        """,
                        (
                            user_id,
                            content_type,
                            content_id,
                            payload.idempotency_key,
                            payload.answer,
                            payload.passed,
                            payload.message,
                            json.dumps(payload.result),
                        ),
                    )
                    inserted = cursor.fetchone() is not None
                    if inserted:
                        cursor.execute(
                            """
                            INSERT INTO public.learner_progress (
                                user_id, content_type, content_id, completed,
                                completed_at, latest_result, ai_feedback, updated_at
                            )
                            VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, NOW())
                            ON CONFLICT (user_id, content_type, content_id) DO UPDATE SET
                                completed = public.learner_progress.completed OR EXCLUDED.completed,
                                completed_at = COALESCE(public.learner_progress.completed_at, EXCLUDED.completed_at),
                                latest_result = EXCLUDED.latest_result,
                                ai_feedback = COALESCE(EXCLUDED.ai_feedback, public.learner_progress.ai_feedback),
                                updated_at = NOW()
                            """,
                            (
                                user_id,
                                content_type,
                                content_id,
                                payload.passed is True,
                                datetime.now(timezone.utc) if payload.passed is True else None,
                                json.dumps(payload.result),
                                json.dumps(payload.ai_feedback) if payload.ai_feedback is not None else None,
                            ),
                        )
                    cursor.execute(
                        """
                        SELECT user_id, content_type, content_id, draft_answer,
                               draft_interview_answer, hints_revealed, completed,
                               completed_at, latest_result, ai_feedback,
                               draft_revision, updated_at
                        FROM public.learner_progress
                        WHERE user_id = %s AND content_type = %s AND content_id = %s
                        """,
                        (user_id, content_type, content_id),
                    )
                    row = cursor.fetchone()
                    if not row:
                        raise LearnerProgressStoreError("Learner progress row was not available.")
                    item = self._postgres_item(cursor, row)
                    cursor.execute(
                        """
                        SELECT id, idempotency_key, answer, passed, message, result, created_at
                        FROM public.learner_attempts
                        WHERE user_id = %s AND content_type = %s AND content_id = %s
                        ORDER BY created_at DESC
                        """,
                        (user_id, content_type, content_id),
                    )
                    item.attempts = [self._attempt_from_row(attempt) for attempt in cursor.fetchall()]
                connection.commit()
            return item, not inserted
        except LearnerProgressStoreError:
            raise
        except Exception as exc:
            raise LearnerProgressStoreError("Unable to save learner attempt.") from exc

    def _postgres_item(self, cursor: Any, row: tuple[Any, ...]) -> LearnerProgressItem:
        return LearnerProgressItem(
            content_type=row[1],
            content_id=row[2],
            draft_answer=row[3] or "",
            draft_interview_answer=row[4] or "",
            hints_revealed=int(row[5] or 0),
            completed=bool(row[6]),
            completed_at=self._iso(row[7]),
            latest_result=self._json_object(row[8]),
            ai_feedback=self._json_object(row[9]),
            draft_revision=int(row[10] or 0),
            updated_at=self._iso(row[11]) or self._now(),
        )

    def _attempt_from_row(self, row: tuple[Any, ...]) -> LearnerAttempt:
        return LearnerAttempt(
            id=str(row[0]),
            idempotency_key=row[1],
            answer=row[2],
            passed=row[3],
            message=row[4],
            result=self._json_object(row[5]),
            created_at=self._iso(row[6]) or self._now(),
        )

    def _file_progress(
        self,
        data: dict[str, Any],
        key: str,
        user_id: str,
        content_type: str,
        content_id: str,
    ) -> dict[str, Any]:
        return data.setdefault("progress", {}).setdefault(
            key,
            {
                "user_id": user_id,
                "content_type": content_type,
                "content_id": content_id,
                "draft_answer": "",
                "draft_interview_answer": "",
                "hints_revealed": 0,
                "completed": False,
                "completed_at": None,
                "latest_result": None,
                "ai_feedback": None,
                "draft_revision": 0,
                "updated_at": self._now(),
            },
        )

    def _file_item_to_model(self, item: dict[str, Any]) -> LearnerProgressItem:
        user_id = item.get("user_id", "")
        content_type = item.get("content_type", "")
        content_id = item.get("content_id", "")
        data = self._read_file()
        attempts = [
            LearnerAttempt(
                id=str(attempt.get("id", "")),
                idempotency_key=str(attempt.get("idempotency_key", "")),
                answer=str(attempt.get("answer", "")),
                passed=attempt.get("passed"),
                message=str(attempt.get("message", "")),
                result=attempt.get("result"),
                created_at=str(attempt.get("created_at", self._now())),
            )
            for attempt in data.get("attempts", {}).values()
            if attempt.get("user_id") == user_id
            and attempt.get("content_type") == content_type
            and attempt.get("content_id") == content_id
        ]
        attempts.sort(key=lambda attempt: attempt.created_at, reverse=True)
        return LearnerProgressItem(
            content_type=content_type,
            content_id=content_id,
            draft_answer=str(item.get("draft_answer", "")),
            draft_interview_answer=str(item.get("draft_interview_answer", "")),
            hints_revealed=int(item.get("hints_revealed", 0)),
            completed=bool(item.get("completed")),
            completed_at=item.get("completed_at"),
            latest_result=item.get("latest_result"),
            ai_feedback=item.get("ai_feedback"),
            draft_revision=int(item.get("draft_revision", 0)),
            updated_at=str(item.get("updated_at", self._now())),
            attempts=attempts,
        )

    def _read_file(self) -> dict[str, Any]:
        if not self.storage_path.exists():
            return {"progress": {}, "attempts": {}}
        try:
            value = json.loads(self.storage_path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {"progress": {}, "attempts": {}}
        except (OSError, json.JSONDecodeError) as exc:
            raise LearnerProgressStoreError("Unable to read learner progress.") from exc

    def _write_file(self, data: dict[str, Any]) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            self.storage_path.write_text(json.dumps(data, default=str), encoding="utf-8")
        except OSError as exc:
            raise LearnerProgressStoreError("Unable to write learner progress.") from exc

    def _connect(self) -> Any:
        try:
            import psycopg

            return psycopg.connect(self.postgres_url)
        except ImportError as exc:
            raise LearnerProgressStoreError("Learner progress storage is unavailable.") from exc

    def _key(self, user_id: str, content_type: str, content_id: str) -> str:
        return f"{user_id}:{content_type}:{content_id}"

    def _attempt_key(self, user_id: str, content_type: str, content_id: str, idempotency_key: str) -> str:
        return f"{user_id}:{content_type}:{content_id}:{idempotency_key}"

    def _json_object(self, value: Any) -> dict[str, Any] | None:
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None
        return None

    def _iso(self, value: datetime | str | None) -> str | None:
        if value is None:
            return None
        return value if isinstance(value, str) else value.isoformat()

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _active_postgres_url(self, postgres_url: str | None) -> str | None:
        if not postgres_url or postgres_url == DEFAULT_POSTGRES_URL:
            return None
        if "supabase.com" in postgres_url and "sslmode=" not in postgres_url:
            separator = "&" if "?" in postgres_url else "?"
            return f"{postgres_url}{separator}sslmode=require"
        return postgres_url
