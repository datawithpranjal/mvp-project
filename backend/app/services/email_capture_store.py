from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path

from app.core.config import DEFAULT_POSTGRES_URL, get_settings
from app.schemas.email_capture import EmailCaptureRequest, EmailCaptureResponse


class EmailCaptureStoreError(RuntimeError):
    pass


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
                "Postgres email capture is configured, but psycopg is not installed."
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
            raise EmailCaptureStoreError("Unable to capture email in Postgres.") from exc

    def _active_postgres_url(self, postgres_url: str | None) -> str | None:
        if not postgres_url or postgres_url == DEFAULT_POSTGRES_URL:
            return None

        if "supabase.com" in postgres_url and "sslmode=" not in postgres_url:
            separator = "&" if "?" in postgres_url else "?"
            return f"{postgres_url}{separator}sslmode=require"

        return postgres_url
