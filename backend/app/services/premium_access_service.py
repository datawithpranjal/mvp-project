from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.config import DEFAULT_POSTGRES_URL, get_settings


class PremiumAccessServiceError(RuntimeError):
    pass


class PremiumAccessService:
    _memory_grants: dict[str, dict[str, Any]] = {}
    _memory_payment_requests: list[dict[str, Any]] = []

    def __init__(self, postgres_url: str | None = None) -> None:
        settings = get_settings()
        configured_postgres_url = postgres_url if postgres_url is not None else settings.postgres_url
        self.postgres_url = self._active_postgres_url(configured_postgres_url)

    def grant_manual_access(
        self,
        email: str,
        plan_label: str,
        billing_interval: str,
        amount_inr: int,
        payment_reference: str,
    ) -> dict[str, Any]:
        record = {
            "email": email.strip().lower(),
            "plan_label": plan_label,
            "billing_interval": billing_interval,
            "amount_inr": amount_inr,
            "payment_reference": payment_reference,
            "granted_at": datetime.now(timezone.utc),
        }

        if self.postgres_url:
            return self._postgres_grant(record)

        self._memory_grants[record["email"]] = record
        return record

    def submit_manual_payment_request(
        self,
        email: str,
        plan_label: str,
        billing_interval: str,
        amount_inr: int,
        payment_reference: str,
    ) -> dict[str, Any]:
        record = {
            "email": email.strip().lower(),
            "plan_label": plan_label,
            "billing_interval": billing_interval,
            "amount_inr": amount_inr,
            "payment_reference": payment_reference,
            "status": "pending",
            "submitted_at": datetime.now(timezone.utc),
        }

        if self.postgres_url:
            return self._postgres_submit_payment_request(record)

        self._memory_payment_requests.append(record)
        return record

    def has_access(self, email: str | None) -> bool:
        if not email:
            return False

        normalized_email = email.strip().lower()
        if self.postgres_url:
            return self._postgres_has_access(normalized_email)

        return normalized_email in self._memory_grants

    def _postgres_connect(self):
        try:
            import psycopg
        except ImportError as exc:
            raise PremiumAccessServiceError("Postgres is configured, but psycopg is not installed.") from exc
        return psycopg.connect(self.postgres_url)

    def _ensure_schema(self, cursor: Any) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS premium_access_grants (
                email TEXT PRIMARY KEY,
                plan_label TEXT NOT NULL,
                billing_interval TEXT NOT NULL,
                amount_inr INTEGER NOT NULL,
                payment_reference TEXT NOT NULL,
                granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )

    def _ensure_payment_request_schema(self, cursor: Any) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS premium_payment_requests (
                id BIGSERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                plan_label TEXT NOT NULL,
                billing_interval TEXT NOT NULL,
                amount_inr INTEGER NOT NULL,
                payment_reference TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )

    def _postgres_grant(self, record: dict[str, Any]) -> dict[str, Any]:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_schema(cursor)
                    cursor.execute(
                        """
                        INSERT INTO premium_access_grants (
                            email, plan_label, billing_interval, amount_inr,
                            payment_reference, granted_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (email) DO UPDATE SET
                            plan_label = EXCLUDED.plan_label,
                            billing_interval = EXCLUDED.billing_interval,
                            amount_inr = EXCLUDED.amount_inr,
                            payment_reference = EXCLUDED.payment_reference,
                            granted_at = EXCLUDED.granted_at
                        RETURNING email, plan_label, billing_interval, amount_inr,
                                  payment_reference, granted_at
                        """,
                        (
                            record["email"],
                            record["plan_label"],
                            record["billing_interval"],
                            record["amount_inr"],
                            record["payment_reference"],
                            record["granted_at"],
                        ),
                    )
                    row = cursor.fetchone()
                connection.commit()
            return {
                "email": row[0],
                "plan_label": row[1],
                "billing_interval": row[2],
                "amount_inr": row[3],
                "payment_reference": row[4],
                "granted_at": row[5],
            }
        except Exception as exc:
            raise PremiumAccessServiceError(f"Unable to grant premium access. {exc}") from exc

    def _postgres_submit_payment_request(self, record: dict[str, Any]) -> dict[str, Any]:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_payment_request_schema(cursor)
                    cursor.execute(
                        """
                        INSERT INTO premium_payment_requests (
                            email, plan_label, billing_interval, amount_inr,
                            payment_reference, status, submitted_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        RETURNING id, email, status, submitted_at
                        """,
                        (
                            record["email"],
                            record["plan_label"],
                            record["billing_interval"],
                            record["amount_inr"],
                            record["payment_reference"],
                            record["status"],
                            record["submitted_at"],
                        ),
                    )
                    row = cursor.fetchone()
                connection.commit()
            return {
                "id": row[0],
                "email": row[1],
                "status": row[2],
                "submitted_at": row[3],
            }
        except Exception as exc:
            raise PremiumAccessServiceError(
                f"Unable to submit premium payment request. {exc}"
            ) from exc

    def _postgres_has_access(self, email: str) -> bool:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_schema(cursor)
                    cursor.execute(
                        "SELECT 1 FROM premium_access_grants WHERE email = %s LIMIT 1",
                        (email,),
                    )
                    return cursor.fetchone() is not None
        except Exception as exc:
            raise PremiumAccessServiceError(f"Unable to check premium access. {exc}") from exc

    def _active_postgres_url(self, postgres_url: str | None) -> str | None:
        if not postgres_url or postgres_url == DEFAULT_POSTGRES_URL:
            return None

        if "supabase.com" in postgres_url and "sslmode=" not in postgres_url:
            separator = "&" if "?" in postgres_url else "?"
            return f"{postgres_url}{separator}sslmode=require"

        return postgres_url
