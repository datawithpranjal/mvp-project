from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from uuid import uuid4

from app.core.config import DEFAULT_POSTGRES_URL, get_settings
from app.schemas.feedback import (
    FeedbackAdminResponse,
    FeedbackRecord,
    FeedbackRequest,
    FeedbackResponse,
)

FEEDBACK_LIMIT = 3
FEEDBACK_WINDOW = timedelta(minutes=10)


class FeedbackStoreError(RuntimeError):
    pass


class FeedbackRateLimitError(FeedbackStoreError):
    pass


class FeedbackStore:
    def __init__(
        self,
        storage_path: Path | None = None,
        postgres_url: str | None = None,
    ) -> None:
        settings = get_settings()
        self.storage_path = storage_path or Path(settings.feedback_store_path)
        configured_url = postgres_url if postgres_url is not None else settings.postgres_url
        self.postgres_url = self._active_postgres_url(configured_url)

    def submit(self, payload: FeedbackRequest) -> FeedbackResponse:
        if payload.website:
            return FeedbackResponse(
                submitted=True,
                message="Thank you. Your feedback has been received.",
            )
        if self.postgres_url:
            self._submit_postgres(payload)
        else:
            self._submit_file(payload)
        return FeedbackResponse(
            submitted=True,
            message="Thank you. Your feedback has been received.",
        )

    def list_feedback(self, limit: int = 100) -> FeedbackAdminResponse:
        bounded_limit = max(1, min(limit, 200))
        if self.postgres_url:
            return self._list_postgres(bounded_limit)
        return self._list_file(bounded_limit)

    def _submit_file(self, payload: FeedbackRequest) -> None:
        now = datetime.now(timezone.utc)
        records = self._read_file_records()
        recent_count = sum(
            1
            for record in records
            if record.get("email") == payload.email
            and self._parse_datetime(record.get("created_at")) >= now - FEEDBACK_WINDOW
        )
        if recent_count >= FEEDBACK_LIMIT:
            raise FeedbackRateLimitError("Please wait before sending more feedback.")

        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "id": str(uuid4()),
            **payload.model_dump(exclude={"website"}),
            "created_at": now.isoformat(),
        }
        with self.storage_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")

    def _submit_postgres(self, payload: FeedbackRequest) -> None:
        try:
            import psycopg
        except ImportError as exc:
            raise FeedbackStoreError("Feedback storage is unavailable.") from exc

        now = datetime.now(timezone.utc)
        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    self._ensure_table(cursor)
                    cursor.execute(
                        """
                        SELECT COUNT(*)
                        FROM public.product_feedback
                        WHERE email = %s AND created_at >= %s
                        """,
                        (payload.email, now - FEEDBACK_WINDOW),
                    )
                    if int(cursor.fetchone()[0]) >= FEEDBACK_LIMIT:
                        raise FeedbackRateLimitError(
                            "Please wait before sending more feedback."
                        )
                    cursor.execute(
                        """
                        INSERT INTO public.product_feedback (
                            name, email, category, message, rating, page_url, created_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            payload.name,
                            payload.email,
                            payload.category,
                            payload.message,
                            payload.rating,
                            payload.page_url,
                            now,
                        ),
                    )
                connection.commit()
        except FeedbackRateLimitError:
            raise
        except Exception as exc:
            raise FeedbackStoreError("Unable to save feedback.") from exc

    def _list_file(self, limit: int) -> FeedbackAdminResponse:
        if not self.storage_path.exists():
            return FeedbackAdminResponse(
                storage_backend="file", table_exists=False, count=0, rows=[]
            )
        records = self._read_file_records()
        rows = [FeedbackRecord.model_validate(record) for record in reversed(records[-limit:])]
        return FeedbackAdminResponse(
            storage_backend="file",
            table_exists=True,
            count=len(records),
            rows=rows,
        )

    def _list_postgres(self, limit: int) -> FeedbackAdminResponse:
        try:
            import psycopg
        except ImportError as exc:
            raise FeedbackStoreError("Feedback storage is unavailable.") from exc

        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT to_regclass('public.product_feedback') IS NOT NULL"
                    )
                    if not bool(cursor.fetchone()[0]):
                        return FeedbackAdminResponse(
                            storage_backend="postgres",
                            table_exists=False,
                            count=0,
                            rows=[],
                        )
                    cursor.execute("SELECT COUNT(*) FROM public.product_feedback")
                    count = int(cursor.fetchone()[0])
                    cursor.execute(
                        """
                        SELECT id, name, email, category, message, rating, page_url, created_at
                        FROM public.product_feedback
                        ORDER BY created_at DESC
                        LIMIT %s
                        """,
                        (limit,),
                    )
                    rows = [
                        FeedbackRecord(
                            id=str(row[0]),
                            name=row[1],
                            email=row[2],
                            category=row[3],
                            message=row[4],
                            rating=row[5],
                            page_url=row[6],
                            created_at=row[7].isoformat(),
                        )
                        for row in cursor.fetchall()
                    ]
            return FeedbackAdminResponse(
                storage_backend="postgres",
                table_exists=True,
                count=count,
                rows=rows,
            )
        except Exception as exc:
            raise FeedbackStoreError("Unable to read feedback.") from exc

    def _ensure_table(self, cursor: object) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS public.product_feedback (
                id BIGSERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                category TEXT NOT NULL,
                message TEXT NOT NULL,
                rating SMALLINT,
                page_url TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT product_feedback_rating_range
                    CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
            )
            """
        )
        cursor.execute("ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY")

    def _read_file_records(self) -> list[dict[str, object]]:
        if not self.storage_path.exists():
            return []
        records: list[dict[str, object]] = []
        with self.storage_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(record, dict):
                    records.append(record)
        return records

    @staticmethod
    def _parse_datetime(value: object) -> datetime:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return datetime.min.replace(tzinfo=timezone.utc)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    @staticmethod
    def _active_postgres_url(postgres_url: str | None) -> str | None:
        if not postgres_url or postgres_url == DEFAULT_POSTGRES_URL:
            return None
        if "supabase.com" in postgres_url and "sslmode=" not in postgres_url:
            separator = "&" if "?" in postgres_url else "?"
            return f"{postgres_url}{separator}sslmode=require"
        return postgres_url
