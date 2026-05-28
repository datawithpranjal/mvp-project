from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path

from app.core.config import DEFAULT_POSTGRES_URL, get_settings
from app.schemas.email_capture import (
    EmailCaptureAdminResponse,
    EmailCaptureRecord,
    EmailCaptureRequest,
    EmailCaptureResponse,
)


class EmailCaptureStoreError(RuntimeError):
    def __init__(self, message: str, cause: Exception | None = None) -> None:
        if cause is not None:
            message = f"{message} Cause: {type(cause).__name__}: {cause}"
        super().__init__(message)


class EmailCaptureStore:
    def __init__(self, storage_path: Path | None = None, postgres_url: str | None = None) -> None:
        settings = get_settings()
        self.storage_path = storage_path or Path(settings.email_capture_store_path)
        configured_postgres_url = postgres_url if postgres_url is not None else settings.postgres_url
        self.postgres_url = self._active_postgres_url(configured_postgres_url)

    def capture(self, payload: EmailCaptureRequest) -> EmailCaptureResponse:
        if self.postgres_url:
            self._capture_in_postgres(payload)
        else:
            self._capture_in_file(payload)

        return EmailCaptureResponse(
            captured=True,
            email=payload.email,
            unlocked_premium=True,
        )

    def list_captures(self, limit: int = 50) -> EmailCaptureAdminResponse:
        bounded_limit = max(1, min(limit, 200))

        if self.postgres_url:
            return self._list_postgres_captures(bounded_limit)

        return self._list_file_captures(bounded_limit)

    def _capture_in_file(self, payload: EmailCaptureRequest) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "email": payload.email,
            "source": payload.source,
            "scenario_slug": payload.scenario_slug,
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }
        with self.storage_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")

    def _capture_in_postgres(self, payload: EmailCaptureRequest) -> None:
        try:
            import psycopg
        except ImportError as exc:
            raise EmailCaptureStoreError(
                "Postgres email capture is configured, but psycopg is not installed.",
                exc,
            ) from exc

        captured_at = datetime.now(timezone.utc)

        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        CREATE TABLE IF NOT EXISTS email_captures (
                            id BIGSERIAL PRIMARY KEY,
                            email TEXT NOT NULL,
                            source TEXT NOT NULL,
                            scenario_slug TEXT,
                            captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                    cursor.execute(
                        """
                        INSERT INTO email_captures (
                            email,
                            source,
                            scenario_slug,
                            captured_at
                        )
                        VALUES (%s, %s, %s, %s)
                        """,
                        (
                            payload.email,
                            payload.source,
                            payload.scenario_slug,
                            captured_at,
                        ),
                    )
                connection.commit()
        except Exception as exc:
            raise EmailCaptureStoreError("Unable to capture email in Postgres.", exc) from exc

    def _list_file_captures(self, limit: int) -> EmailCaptureAdminResponse:
        if not self.storage_path.exists():
            return EmailCaptureAdminResponse(
                storage_backend="file",
                table_exists=False,
                count=0,
                rows=[],
            )

        records: list[EmailCaptureRecord] = []
        with self.storage_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue

                records.append(
                    EmailCaptureRecord(
                        email=str(record.get("email", "")),
                        source=str(record.get("source", "")),
                        scenario_slug=record.get("scenario_slug"),
                        captured_at=str(record.get("captured_at", "")),
                    )
                )

        return EmailCaptureAdminResponse(
            storage_backend="file",
            table_exists=True,
            count=len(records),
            rows=list(reversed(records[-limit:])),
        )

    def _list_postgres_captures(self, limit: int) -> EmailCaptureAdminResponse:
        try:
            import psycopg
        except ImportError as exc:
            raise EmailCaptureStoreError(
                "Postgres email capture is configured, but psycopg is not installed.",
                exc,
            ) from exc

        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT to_regclass('public.email_captures') IS NOT NULL")
                    table_exists = bool(cursor.fetchone()[0])

                    if not table_exists:
                        return EmailCaptureAdminResponse(
                            storage_backend="postgres",
                            table_exists=False,
                            count=0,
                            rows=[],
                        )

                    cursor.execute("SELECT COUNT(*) FROM public.email_captures")
                    count = int(cursor.fetchone()[0])
                    cursor.execute(
                        """
                        SELECT email, source, scenario_slug, captured_at
                        FROM public.email_captures
                        ORDER BY captured_at DESC
                        LIMIT %s
                        """,
                        (limit,),
                    )
                    rows = [
                        EmailCaptureRecord(
                            email=row[0],
                            source=row[1],
                            scenario_slug=row[2],
                            captured_at=row[3].isoformat(),
                        )
                        for row in cursor.fetchall()
                    ]

            return EmailCaptureAdminResponse(
                storage_backend="postgres",
                table_exists=True,
                count=count,
                rows=rows,
            )
        except Exception as exc:
            raise EmailCaptureStoreError(
                "Unable to read email captures from Postgres.",
                exc,
            ) from exc

    def _active_postgres_url(self, postgres_url: str | None) -> str | None:
        if not postgres_url or postgres_url == DEFAULT_POSTGRES_URL:
            return None

        if "supabase.com" in postgres_url and "sslmode=" not in postgres_url:
            separator = "&" if "?" in postgres_url else "?"
            return f"{postgres_url}{separator}sslmode=require"

        return postgres_url
