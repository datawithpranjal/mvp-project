from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import DEFAULT_POSTGRES_URL, get_settings


class PremiumAccessServiceError(RuntimeError):
    pass


class PremiumAccessService:
    _memory_grants: dict[str, dict[str, Any]] = {}
    _memory_payment_requests: list[dict[str, Any]] = []
    _memory_purchase_records: list[dict[str, Any]] = []
    _plan_durations = {
        "monthly": timedelta(days=30),
        "yearly": timedelta(days=365),
    }

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
        original_amount_inr: int | None = None,
        discount_amount_inr: int = 0,
        coupon_code: str | None = None,
        payment_provider: str = "manual",
        provider_order_id: str | None = None,
        provider_payment_id: str | None = None,
        currency: str = "INR",
        purchase_status: str = "paid",
    ) -> dict[str, Any]:
        granted_at = datetime.now(timezone.utc)
        record = {
            "email": email.strip().lower(),
            "plan_label": plan_label,
            "billing_interval": billing_interval,
            "amount_inr": amount_inr,
            "payment_reference": payment_reference,
            "granted_at": granted_at,
            "expires_at": self._expires_at_for(billing_interval, granted_at),
        }
        purchase_record = self._build_purchase_record(
            record,
            original_amount_inr=original_amount_inr,
            discount_amount_inr=discount_amount_inr,
            coupon_code=coupon_code,
            payment_provider=payment_provider,
            provider_order_id=provider_order_id,
            provider_payment_id=provider_payment_id,
            currency=currency,
            purchase_status=purchase_status,
        )

        if self.postgres_url:
            return self._postgres_grant(record, purchase_record)

        recorded_purchase = self._record_memory_purchase_record(purchase_record)
        grant_record = self._grant_from_purchase_record(recorded_purchase)
        return self._store_memory_grant_if_current(grant_record)

    def submit_manual_payment_request(
        self,
        email: str,
        plan_label: str,
        billing_interval: str,
        amount_inr: int,
        payment_reference: str,
        original_amount_inr: int | None = None,
        discount_amount_inr: int = 0,
        coupon_code: str | None = None,
    ) -> dict[str, Any]:
        record = {
            "email": email.strip().lower(),
            "plan_label": plan_label,
            "billing_interval": billing_interval,
            "amount_inr": amount_inr,
            "original_amount_inr": original_amount_inr or amount_inr,
            "discount_amount_inr": discount_amount_inr,
            "coupon_code": coupon_code,
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

        return self.get_access(email) is not None

    def get_access(self, email: str | None) -> dict[str, Any] | None:
        if not email:
            return None

        normalized_email = email.strip().lower()
        if self.postgres_url:
            return self._postgres_get_access(normalized_email)

        record = self._memory_grants.get(normalized_email)
        if not record:
            return None

        expires_at = record.get("expires_at")
        if not isinstance(expires_at, datetime):
            granted_at = record.get("granted_at")
            if not isinstance(granted_at, datetime):
                granted_at = datetime.now(timezone.utc)
                record["granted_at"] = granted_at
            expires_at = self._expires_at_for(str(record.get("billing_interval", "yearly")), granted_at)
            record["expires_at"] = expires_at

        if self._to_aware_datetime(expires_at) <= datetime.now(timezone.utc):
            return None

        return record

    def list_purchase_records(self, email: str | None = None) -> list[dict[str, Any]]:
        normalized_email = email.strip().lower() if email else None
        if self.postgres_url:
            return self._postgres_list_purchase_records(normalized_email)

        records = self._memory_purchase_records
        if normalized_email:
            records = [
                record for record in records if record.get("email") == normalized_email
            ]
        return sorted(
            records,
            key=lambda record: record.get("purchased_at") or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

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
                granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMPTZ NOT NULL
            )
            """
        )
        cursor.execute(
            """
            ALTER TABLE premium_access_grants
                ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ
            """
        )
        cursor.execute(
            """
            UPDATE premium_access_grants
            SET expires_at = CASE
                WHEN billing_interval = 'monthly' THEN granted_at + INTERVAL '1 month'
                ELSE granted_at + INTERVAL '1 year'
            END
            WHERE expires_at IS NULL
            """
        )
        cursor.execute(
            """
            ALTER TABLE premium_access_grants
                ALTER COLUMN expires_at SET NOT NULL
            """
        )
        cursor.execute(
            "ALTER TABLE public.premium_access_grants ENABLE ROW LEVEL SECURITY"
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
                original_amount_inr INTEGER NOT NULL,
                discount_amount_inr INTEGER NOT NULL DEFAULT 0,
                coupon_code TEXT,
                payment_reference TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        cursor.execute(
            """
            ALTER TABLE premium_payment_requests
                ADD COLUMN IF NOT EXISTS original_amount_inr INTEGER,
                ADD COLUMN IF NOT EXISTS discount_amount_inr INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS coupon_code TEXT
            """
        )
        cursor.execute(
            """
            UPDATE premium_payment_requests
            SET original_amount_inr = amount_inr
            WHERE original_amount_inr IS NULL
            """
        )
        cursor.execute(
            """
            ALTER TABLE premium_payment_requests
            ALTER COLUMN original_amount_inr SET NOT NULL
            """
        )
        cursor.execute(
            "ALTER TABLE public.premium_payment_requests ENABLE ROW LEVEL SECURITY"
        )

    def _ensure_purchase_record_schema(self, cursor: Any) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS premium_purchase_records (
                id BIGSERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                plan_label TEXT NOT NULL,
                billing_interval TEXT NOT NULL,
                amount_inr INTEGER NOT NULL,
                original_amount_inr INTEGER NOT NULL,
                discount_amount_inr INTEGER NOT NULL DEFAULT 0,
                coupon_code TEXT,
                payment_provider TEXT NOT NULL DEFAULT 'manual',
                payment_reference TEXT NOT NULL,
                provider_order_id TEXT,
                provider_payment_id TEXT,
                currency TEXT NOT NULL DEFAULT 'INR',
                purchase_status TEXT NOT NULL DEFAULT 'paid',
                purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                access_expires_at TIMESTAMPTZ NOT NULL
            )
            """
        )
        cursor.execute(
            """
            ALTER TABLE premium_purchase_records
                ADD COLUMN IF NOT EXISTS original_amount_inr INTEGER,
                ADD COLUMN IF NOT EXISTS discount_amount_inr INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS coupon_code TEXT,
                ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'manual',
                ADD COLUMN IF NOT EXISTS provider_order_id TEXT,
                ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
                ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
                ADD COLUMN IF NOT EXISTS purchase_status TEXT NOT NULL DEFAULT 'paid',
                ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ
            """
        )
        cursor.execute(
            """
            UPDATE premium_purchase_records
            SET original_amount_inr = amount_inr
            WHERE original_amount_inr IS NULL
            """
        )
        cursor.execute(
            """
            UPDATE premium_purchase_records
            SET access_expires_at = CASE
                WHEN billing_interval = 'monthly' THEN purchased_at + INTERVAL '1 month'
                ELSE purchased_at + INTERVAL '1 year'
            END
            WHERE access_expires_at IS NULL
            """
        )
        cursor.execute(
            """
            ALTER TABLE premium_purchase_records
                ALTER COLUMN original_amount_inr SET NOT NULL,
                ALTER COLUMN access_expires_at SET NOT NULL
            """
        )
        cursor.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS premium_purchase_records_provider_reference_idx
            ON premium_purchase_records (payment_provider, payment_reference)
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS premium_purchase_records_email_purchased_idx
            ON premium_purchase_records (email, purchased_at DESC)
            """
        )
        cursor.execute(
            "ALTER TABLE public.premium_purchase_records ENABLE ROW LEVEL SECURITY"
        )
        self._ensure_purchase_record_immutability(cursor)

    def _ensure_purchase_record_immutability(self, cursor: Any) -> None:
        cursor.execute(
            """
            CREATE OR REPLACE FUNCTION public.prevent_premium_purchase_record_mutation()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'premium_purchase_records is append-only. Insert a new payment record instead of updating or deleting payment history.';
            END;
            $$ LANGUAGE plpgsql
            """
        )
        cursor.execute(
            """
            DROP TRIGGER IF EXISTS premium_purchase_records_no_update_delete
            ON public.premium_purchase_records
            """
        )
        cursor.execute(
            """
            CREATE TRIGGER premium_purchase_records_no_update_delete
            BEFORE UPDATE OR DELETE ON public.premium_purchase_records
            FOR EACH ROW
            EXECUTE FUNCTION public.prevent_premium_purchase_record_mutation()
            """
        )

    def _postgres_grant(
        self,
        record: dict[str, Any],
        purchase_record: dict[str, Any],
    ) -> dict[str, Any]:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_schema(cursor)
                    self._ensure_purchase_record_schema(cursor)
                    recorded_purchase = self._postgres_insert_purchase_record(
                        cursor,
                        purchase_record,
                    )
                    if recorded_purchase["email"] != record["email"]:
                        raise PremiumAccessServiceError(
                            "This payment has already been recorded for another account."
                        )
                    grant_record = self._grant_from_purchase_record(recorded_purchase)
                    cursor.execute(
                        """
                        INSERT INTO premium_access_grants (
                            email, plan_label, billing_interval, amount_inr,
                            payment_reference, granted_at, expires_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (email) DO UPDATE SET
                            plan_label = EXCLUDED.plan_label,
                            billing_interval = EXCLUDED.billing_interval,
                            amount_inr = EXCLUDED.amount_inr,
                            payment_reference = EXCLUDED.payment_reference,
                            granted_at = EXCLUDED.granted_at,
                            expires_at = EXCLUDED.expires_at
                        WHERE premium_access_grants.expires_at <= EXCLUDED.expires_at
                        RETURNING email, plan_label, billing_interval, amount_inr,
                                  payment_reference, granted_at, expires_at
                        """,
                        (
                            grant_record["email"],
                            grant_record["plan_label"],
                            grant_record["billing_interval"],
                            grant_record["amount_inr"],
                            grant_record["payment_reference"],
                            grant_record["granted_at"],
                            grant_record["expires_at"],
                        ),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        cursor.execute(
                            """
                            SELECT email, plan_label, billing_interval, amount_inr,
                                   payment_reference, granted_at, expires_at
                            FROM premium_access_grants
                            WHERE email = %s
                            LIMIT 1
                            """,
                            (grant_record["email"],),
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
                "expires_at": row[6],
            }
        except Exception as exc:
            raise PremiumAccessServiceError(f"Unable to grant premium access. {exc}") from exc

    def _postgres_insert_purchase_record(
        self,
        cursor: Any,
        record: dict[str, Any],
    ) -> dict[str, Any]:
        cursor.execute(
            """
            INSERT INTO premium_purchase_records (
                email, plan_label, billing_interval, amount_inr,
                original_amount_inr, discount_amount_inr, coupon_code,
                payment_provider, payment_reference, provider_order_id,
                provider_payment_id, currency, purchase_status, purchased_at,
                access_expires_at
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            ON CONFLICT (payment_provider, payment_reference) DO NOTHING
            RETURNING email, plan_label, billing_interval, amount_inr,
                      original_amount_inr, discount_amount_inr, coupon_code,
                      payment_provider, payment_reference, provider_order_id,
                      provider_payment_id, currency, purchase_status,
                      purchased_at, access_expires_at
            """,
            (
                record["email"],
                record["plan_label"],
                record["billing_interval"],
                record["amount_inr"],
                record["original_amount_inr"],
                record["discount_amount_inr"],
                record["coupon_code"],
                record["payment_provider"],
                record["payment_reference"],
                record["provider_order_id"],
                record["provider_payment_id"],
                record["currency"],
                record["purchase_status"],
                record["purchased_at"],
                record["access_expires_at"],
            ),
        )
        row = cursor.fetchone()
        if row is None:
            cursor.execute(
                """
                SELECT email, plan_label, billing_interval, amount_inr,
                       original_amount_inr, discount_amount_inr, coupon_code,
                       payment_provider, payment_reference, provider_order_id,
                       provider_payment_id, currency, purchase_status,
                       purchased_at, access_expires_at
                FROM premium_purchase_records
                WHERE payment_provider = %s
                  AND payment_reference = %s
                LIMIT 1
                """,
                (record["payment_provider"], record["payment_reference"]),
            )
            row = cursor.fetchone()

        return self._purchase_record_from_row(row)

    def _postgres_submit_payment_request(self, record: dict[str, Any]) -> dict[str, Any]:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_payment_request_schema(cursor)
                    cursor.execute(
                        """
                        INSERT INTO premium_payment_requests (
                            email, plan_label, billing_interval, amount_inr,
                            original_amount_inr, discount_amount_inr, coupon_code,
                            payment_reference, status, submitted_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id, email, status, submitted_at
                        """,
                        (
                            record["email"],
                            record["plan_label"],
                            record["billing_interval"],
                            record["amount_inr"],
                            record["original_amount_inr"],
                            record["discount_amount_inr"],
                            record["coupon_code"],
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
        return self._postgres_get_access(email) is not None

    def _postgres_get_access(self, email: str) -> dict[str, Any] | None:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_schema(cursor)
                    cursor.execute(
                        """
                        SELECT email, plan_label, billing_interval, amount_inr,
                               payment_reference, granted_at, expires_at
                        FROM premium_access_grants
                        WHERE email = %s
                          AND expires_at > NOW()
                        LIMIT 1
                        """,
                        (email,),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        return None
                    return {
                        "email": row[0],
                        "plan_label": row[1],
                        "billing_interval": row[2],
                        "amount_inr": row[3],
                        "payment_reference": row[4],
                        "granted_at": row[5],
                        "expires_at": row[6],
                    }
        except Exception as exc:
            raise PremiumAccessServiceError(f"Unable to check premium access. {exc}") from exc

    def _postgres_list_purchase_records(
        self,
        email: str | None = None,
    ) -> list[dict[str, Any]]:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_purchase_record_schema(cursor)
                    where_clause = "WHERE email = %s" if email else ""
                    params = (email,) if email else ()
                    cursor.execute(
                        f"""
                        SELECT id, email, plan_label, billing_interval, amount_inr,
                               original_amount_inr, discount_amount_inr, coupon_code,
                               payment_provider, payment_reference, provider_order_id,
                               provider_payment_id, currency, purchase_status,
                               purchased_at, access_expires_at
                        FROM premium_purchase_records
                        {where_clause}
                        ORDER BY purchased_at DESC
                        """,
                        params,
                    )
                    rows = cursor.fetchall()
            return [
                {
                    "id": row[0],
                    "email": row[1],
                    "plan_label": row[2],
                    "billing_interval": row[3],
                    "amount_inr": row[4],
                    "original_amount_inr": row[5],
                    "discount_amount_inr": row[6],
                    "coupon_code": row[7],
                    "payment_provider": row[8],
                    "payment_reference": row[9],
                    "provider_order_id": row[10],
                    "provider_payment_id": row[11],
                    "currency": row[12],
                    "purchase_status": row[13],
                    "purchased_at": row[14],
                    "access_expires_at": row[15],
                }
                for row in rows
            ]
        except Exception as exc:
            raise PremiumAccessServiceError(
                f"Unable to list premium purchase records. {exc}"
            ) from exc

    def _build_purchase_record(
        self,
        access_record: dict[str, Any],
        *,
        original_amount_inr: int | None,
        discount_amount_inr: int,
        coupon_code: str | None,
        payment_provider: str,
        provider_order_id: str | None,
        provider_payment_id: str | None,
        currency: str,
        purchase_status: str,
    ) -> dict[str, Any]:
        provider = (payment_provider or "manual").strip().lower()
        normalized_coupon = coupon_code.strip().upper() if coupon_code else None
        return {
            "email": access_record["email"],
            "plan_label": access_record["plan_label"],
            "billing_interval": access_record["billing_interval"],
            "amount_inr": access_record["amount_inr"],
            "original_amount_inr": original_amount_inr
            if original_amount_inr is not None
            else access_record["amount_inr"],
            "discount_amount_inr": discount_amount_inr,
            "coupon_code": normalized_coupon,
            "payment_provider": provider or "manual",
            "payment_reference": access_record["payment_reference"],
            "provider_order_id": provider_order_id,
            "provider_payment_id": provider_payment_id,
            "currency": (currency or "INR").strip().upper(),
            "purchase_status": (purchase_status or "paid").strip().lower(),
            "purchased_at": access_record["granted_at"],
            "access_expires_at": access_record["expires_at"],
        }

    def _grant_from_purchase_record(self, record: dict[str, Any]) -> dict[str, Any]:
        return {
            "email": record["email"],
            "plan_label": record["plan_label"],
            "billing_interval": record["billing_interval"],
            "amount_inr": record["amount_inr"],
            "payment_reference": record["payment_reference"],
            "granted_at": record["purchased_at"],
            "expires_at": record["access_expires_at"],
        }

    def _purchase_record_from_row(self, row: Any) -> dict[str, Any]:
        if row is None:
            raise PremiumAccessServiceError("Unable to record premium purchase.")

        return {
            "email": row[0],
            "plan_label": row[1],
            "billing_interval": row[2],
            "amount_inr": row[3],
            "original_amount_inr": row[4],
            "discount_amount_inr": row[5],
            "coupon_code": row[6],
            "payment_provider": row[7],
            "payment_reference": row[8],
            "provider_order_id": row[9],
            "provider_payment_id": row[10],
            "currency": row[11],
            "purchase_status": row[12],
            "purchased_at": row[13],
            "access_expires_at": row[14],
        }

    def _record_memory_purchase_record(self, record: dict[str, Any]) -> dict[str, Any]:
        for existing in self._memory_purchase_records:
            if (
                existing.get("payment_provider") == record["payment_provider"]
                and existing.get("payment_reference") == record["payment_reference"]
            ):
                if existing.get("email") != record["email"]:
                    raise PremiumAccessServiceError(
                        "This payment has already been recorded for another account."
                    )
                return existing
        self._memory_purchase_records.append(record)
        return record

    def _store_memory_grant_if_current(self, record: dict[str, Any]) -> dict[str, Any]:
        existing = self._memory_grants.get(record["email"])
        if existing:
            existing_expires_at = self._to_aware_datetime(existing["expires_at"])
            next_expires_at = self._to_aware_datetime(record["expires_at"])
            if existing_expires_at > next_expires_at:
                return existing

        self._memory_grants[record["email"]] = record
        return record

    def _expires_at_for(self, billing_interval: str, granted_at: datetime) -> datetime:
        normalized_interval = billing_interval if billing_interval in self._plan_durations else "yearly"
        return self._to_aware_datetime(granted_at) + self._plan_durations[normalized_interval]

    def _to_aware_datetime(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def _active_postgres_url(self, postgres_url: str | None) -> str | None:
        if not postgres_url or postgres_url == DEFAULT_POSTGRES_URL:
            return None

        if "supabase.com" in postgres_url and "sslmode=" not in postgres_url:
            separator = "&" if "?" in postgres_url else "?"
            return f"{postgres_url}{separator}sslmode=require"

        return postgres_url
