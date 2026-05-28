from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from typing import Any
from uuid import uuid4

from app.core.config import DEFAULT_POSTGRES_URL, get_settings
from app.schemas.auth import (
    AuthProfileUpdateRequest,
    AuthRequestOtpRequest,
    AuthRequestOtpResponse,
    AuthSessionResponse,
    AuthUserProfile,
    AuthVerifyOtpRequest,
)
from app.schemas.email_capture import EmailCaptureRequest
from app.services.email_capture_store import EmailCaptureStore, EmailCaptureStoreError


class AuthServiceError(RuntimeError):
    pass


class AuthUnauthorizedError(AuthServiceError):
    pass


class AuthNotFoundError(AuthServiceError):
    pass


class AuthValidationError(AuthServiceError):
    pass


class AuthService:
    _memory_users: dict[str, dict[str, Any]] = {}
    _memory_otps: list[dict[str, Any]] = []
    _memory_sessions: dict[str, dict[str, Any]] = {}

    def __init__(self, postgres_url: str | None = None) -> None:
        settings = get_settings()
        configured_postgres_url = postgres_url if postgres_url is not None else settings.postgres_url
        self.postgres_url = self._active_postgres_url(configured_postgres_url)
        self.otp_ttl = timedelta(minutes=settings.auth_otp_ttl_minutes)
        self.session_ttl = timedelta(days=settings.auth_session_ttl_days)
        self.email_capture_store = EmailCaptureStore(postgres_url=configured_postgres_url)

    def request_otp(self, payload: AuthRequestOtpRequest) -> AuthRequestOtpResponse:
        otp_code = f"{secrets.randbelow(900000) + 100000}"
        now = self._now()
        expires_at = now + self.otp_ttl

        if payload.mode == "signup":
            if not payload.full_name:
                raise AuthValidationError("Full name is required to create an account.")
            self._upsert_user(payload, now)
            self._capture_signup_email(payload.email)
        else:
            if not self._get_user_by_email(payload.email):
                raise AuthNotFoundError("No account exists for this email. Please sign up first.")

        self._store_otp(payload.email, otp_code, payload.mode, now, expires_at)

        return AuthRequestOtpResponse(
            email=payload.email,
            otp_required=True,
            delivery_channel="demo",
            expires_in_seconds=int(self.otp_ttl.total_seconds()),
            debug_otp=otp_code,
        )

    def verify_otp(self, payload: AuthVerifyOtpRequest) -> AuthSessionResponse:
        now = self._now()
        user = self._get_user_by_email(payload.email)
        if not user:
            raise AuthNotFoundError("No account exists for this email.")

        if not self._consume_otp(payload.email, payload.otp_code, now):
            raise AuthUnauthorizedError("Invalid or expired OTP.")

        token = secrets.token_urlsafe(32)
        expires_at = now + self.session_ttl
        updated_user = self._record_login_and_session(user["id"], token, now, expires_at)

        return AuthSessionResponse(
            token=token,
            expires_at=expires_at.isoformat(),
            user=self._profile_from_row(updated_user),
        )

    def get_profile(self, token: str) -> AuthUserProfile:
        user = self._get_user_by_session(token, self._now())
        if not user:
            raise AuthUnauthorizedError("Invalid or expired session.")
        return self._profile_from_row(user)

    def update_profile(self, token: str, payload: AuthProfileUpdateRequest) -> AuthUserProfile:
        user = self._get_user_by_session(token, self._now())
        if not user:
            raise AuthUnauthorizedError("Invalid or expired session.")

        updated_user = self._update_user_profile(user["id"], payload, self._now())
        return self._profile_from_row(updated_user)

    def logout(self, token: str) -> None:
        self._revoke_session(token)

    def _upsert_user(self, payload: AuthRequestOtpRequest, now: datetime) -> dict[str, Any]:
        existing = self._get_user_by_email(payload.email)
        user_id = existing["id"] if existing else str(uuid4())
        profile = {
            "id": user_id,
            "email": payload.email,
            "full_name": payload.full_name or (existing or {}).get("full_name") or payload.email,
            "role": payload.role or (existing or {}).get("role") or "Student",
            "experience_level": payload.experience_level or (existing or {}).get("experience_level") or "Beginner",
            "target_role": payload.target_role if payload.target_role is not None else (existing or {}).get("target_role"),
            "country": payload.country if payload.country is not None else (existing or {}).get("country"),
            "phone": payload.phone if payload.phone is not None else (existing or {}).get("phone"),
            "linkedin_url": payload.linkedin_url if payload.linkedin_url is not None else (existing or {}).get("linkedin_url"),
            "preparation_goal": payload.preparation_goal if payload.preparation_goal is not None else (existing or {}).get("preparation_goal"),
            "created_at": existing["created_at"] if existing else now,
            "updated_at": now,
            "last_login_at": existing.get("last_login_at") if existing else None,
        }

        if self.postgres_url:
            return self._postgres_upsert_user(profile)

        self._memory_users[payload.email] = profile
        return profile

    def _store_otp(
        self,
        email: str,
        otp_code: str,
        purpose: str,
        now: datetime,
        expires_at: datetime,
    ) -> None:
        otp_row = {
            "email": email,
            "code_hash": self._hash_otp(email, otp_code),
            "purpose": purpose,
            "expires_at": expires_at,
            "consumed_at": None,
            "created_at": now,
        }

        if self.postgres_url:
            self._postgres_store_otp(otp_row)
            return

        self._memory_otps.append(otp_row)

    def _consume_otp(self, email: str, otp_code: str, now: datetime) -> bool:
        code_hash = self._hash_otp(email, otp_code)

        if self.postgres_url:
            return self._postgres_consume_otp(email, code_hash, now)

        for otp in reversed(self._memory_otps):
            if (
                otp["email"] == email
                and otp["code_hash"] == code_hash
                and otp["consumed_at"] is None
                and otp["expires_at"] >= now
            ):
                otp["consumed_at"] = now
                return True
        return False

    def _record_login_and_session(
        self,
        user_id: str,
        token: str,
        now: datetime,
        expires_at: datetime,
    ) -> dict[str, Any]:
        token_hash = self._hash_token(token)

        if self.postgres_url:
            return self._postgres_record_login_and_session(user_id, token_hash, now, expires_at)

        for user in self._memory_users.values():
            if user["id"] == user_id:
                user["last_login_at"] = now
                user["updated_at"] = now
                self._memory_sessions[token_hash] = {
                    "user_id": user_id,
                    "created_at": now,
                    "expires_at": expires_at,
                    "revoked_at": None,
                }
                return user

        raise AuthNotFoundError("User account was not found.")

    def _get_user_by_email(self, email: str) -> dict[str, Any] | None:
        if self.postgres_url:
            return self._postgres_get_user_by_email(email)
        return self._memory_users.get(email)

    def _get_user_by_session(self, token: str, now: datetime) -> dict[str, Any] | None:
        token_hash = self._hash_token(token)

        if self.postgres_url:
            return self._postgres_get_user_by_session(token_hash, now)

        session = self._memory_sessions.get(token_hash)
        if not session or session["revoked_at"] is not None or session["expires_at"] < now:
            return None

        for user in self._memory_users.values():
            if user["id"] == session["user_id"]:
                return user
        return None

    def _update_user_profile(
        self,
        user_id: str,
        payload: AuthProfileUpdateRequest,
        now: datetime,
    ) -> dict[str, Any]:
        if self.postgres_url:
            return self._postgres_update_user_profile(user_id, payload, now)

        for user in self._memory_users.values():
            if user["id"] == user_id:
                for field, value in payload.model_dump(exclude_none=True).items():
                    user[field] = value
                user["updated_at"] = now
                return user

        raise AuthNotFoundError("User account was not found.")

    def _revoke_session(self, token: str) -> None:
        token_hash = self._hash_token(token)

        if self.postgres_url:
            self._postgres_revoke_session(token_hash, self._now())
            return

        if token_hash in self._memory_sessions:
            self._memory_sessions[token_hash]["revoked_at"] = self._now()

    def _capture_signup_email(self, email: str) -> None:
        try:
            self.email_capture_store.capture(
                EmailCaptureRequest(
                    email=email,
                    source="signup",
                    scenario_slug=None,
                )
            )
        except EmailCaptureStoreError as exc:
            raise AuthServiceError(f"Unable to capture signup email. {exc}") from exc

    def _postgres_connect(self):
        try:
            import psycopg
        except ImportError as exc:
            raise AuthServiceError("Postgres auth is configured, but psycopg is not installed.") from exc
        return psycopg.connect(self.postgres_url)

    def _ensure_postgres_schema(self, cursor: Any) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS playground_users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL,
                experience_level TEXT NOT NULL,
                target_role TEXT,
                country TEXT,
                phone TEXT,
                linkedin_url TEXT,
                preparation_goal TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_login_at TIMESTAMPTZ
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_otps (
                id BIGSERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                code_hash TEXT NOT NULL,
                purpose TEXT NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES playground_users(id) ON DELETE CASCADE,
                expires_at TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                revoked_at TIMESTAMPTZ
            )
            """
        )

    def _postgres_upsert_user(self, profile: dict[str, Any]) -> dict[str, Any]:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        INSERT INTO playground_users (
                            id, email, full_name, role, experience_level, target_role,
                            country, phone, linkedin_url, preparation_goal,
                            created_at, updated_at, last_login_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (email) DO UPDATE SET
                            full_name = EXCLUDED.full_name,
                            role = EXCLUDED.role,
                            experience_level = EXCLUDED.experience_level,
                            target_role = EXCLUDED.target_role,
                            country = EXCLUDED.country,
                            phone = EXCLUDED.phone,
                            linkedin_url = EXCLUDED.linkedin_url,
                            preparation_goal = EXCLUDED.preparation_goal,
                            updated_at = EXCLUDED.updated_at
                        RETURNING id, email, full_name, role, experience_level, target_role,
                                  country, phone, linkedin_url, preparation_goal,
                                  created_at, updated_at, last_login_at
                        """,
                        (
                            profile["id"],
                            profile["email"],
                            profile["full_name"],
                            profile["role"],
                            profile["experience_level"],
                            profile["target_role"],
                            profile["country"],
                            profile["phone"],
                            profile["linkedin_url"],
                            profile["preparation_goal"],
                            profile["created_at"],
                            profile["updated_at"],
                            profile["last_login_at"],
                        ),
                    )
                    row = cursor.fetchone()
                connection.commit()
            return self._row_to_user(row)
        except Exception as exc:
            raise AuthServiceError(f"Unable to save user profile. {exc}") from exc

    def _postgres_get_user_by_email(self, email: str) -> dict[str, Any] | None:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        SELECT id, email, full_name, role, experience_level, target_role,
                               country, phone, linkedin_url, preparation_goal,
                               created_at, updated_at, last_login_at
                        FROM playground_users
                        WHERE email = %s
                        """,
                        (email,),
                    )
                    row = cursor.fetchone()
            return self._row_to_user(row) if row else None
        except Exception as exc:
            raise AuthServiceError(f"Unable to read user profile. {exc}") from exc

    def _postgres_store_otp(self, otp_row: dict[str, Any]) -> None:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        INSERT INTO auth_otps (email, code_hash, purpose, expires_at, created_at)
                        VALUES (%s, %s, %s, %s, %s)
                        """,
                        (
                            otp_row["email"],
                            otp_row["code_hash"],
                            otp_row["purpose"],
                            otp_row["expires_at"],
                            otp_row["created_at"],
                        ),
                    )
                connection.commit()
        except Exception as exc:
            raise AuthServiceError(f"Unable to create OTP. {exc}") from exc

    def _postgres_consume_otp(self, email: str, code_hash: str, now: datetime) -> bool:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        UPDATE auth_otps
                        SET consumed_at = %s
                        WHERE id = (
                            SELECT id
                            FROM auth_otps
                            WHERE email = %s
                              AND code_hash = %s
                              AND consumed_at IS NULL
                              AND expires_at >= %s
                            ORDER BY created_at DESC
                            LIMIT 1
                        )
                        RETURNING id
                        """,
                        (now, email, code_hash, now),
                    )
                    row = cursor.fetchone()
                connection.commit()
            return row is not None
        except Exception as exc:
            raise AuthServiceError(f"Unable to verify OTP. {exc}") from exc

    def _postgres_record_login_and_session(
        self,
        user_id: str,
        token_hash: str,
        now: datetime,
        expires_at: datetime,
    ) -> dict[str, Any]:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        UPDATE playground_users
                        SET last_login_at = %s, updated_at = %s
                        WHERE id = %s
                        RETURNING id, email, full_name, role, experience_level, target_role,
                                  country, phone, linkedin_url, preparation_goal,
                                  created_at, updated_at, last_login_at
                        """,
                        (now, now, user_id),
                    )
                    row = cursor.fetchone()
                    if not row:
                        raise AuthNotFoundError("User account was not found.")
                    cursor.execute(
                        """
                        INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (token_hash, user_id, expires_at, now),
                    )
                connection.commit()
            return self._row_to_user(row)
        except AuthNotFoundError:
            raise
        except Exception as exc:
            raise AuthServiceError(f"Unable to create session. {exc}") from exc

    def _postgres_get_user_by_session(self, token_hash: str, now: datetime) -> dict[str, Any] | None:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        SELECT u.id, u.email, u.full_name, u.role, u.experience_level,
                               u.target_role, u.country, u.phone, u.linkedin_url,
                               u.preparation_goal, u.created_at, u.updated_at, u.last_login_at
                        FROM auth_sessions s
                        JOIN playground_users u ON u.id = s.user_id
                        WHERE s.token_hash = %s
                          AND s.revoked_at IS NULL
                          AND s.expires_at >= %s
                        """,
                        (token_hash, now),
                    )
                    row = cursor.fetchone()
            return self._row_to_user(row) if row else None
        except Exception as exc:
            raise AuthServiceError(f"Unable to read session. {exc}") from exc

    def _postgres_update_user_profile(
        self,
        user_id: str,
        payload: AuthProfileUpdateRequest,
        now: datetime,
    ) -> dict[str, Any]:
        current = None
        for user in self._memory_users.values():
            if user["id"] == user_id:
                current = user
                break

        existing = self._postgres_get_user_by_id(user_id) if self.postgres_url else current
        if not existing:
            raise AuthNotFoundError("User account was not found.")

        values = {**existing, **payload.model_dump(exclude_none=True), "updated_at": now}

        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        UPDATE playground_users
                        SET full_name = %s,
                            role = %s,
                            experience_level = %s,
                            target_role = %s,
                            country = %s,
                            phone = %s,
                            linkedin_url = %s,
                            preparation_goal = %s,
                            updated_at = %s
                        WHERE id = %s
                        RETURNING id, email, full_name, role, experience_level, target_role,
                                  country, phone, linkedin_url, preparation_goal,
                                  created_at, updated_at, last_login_at
                        """,
                        (
                            values["full_name"],
                            values["role"],
                            values["experience_level"],
                            values["target_role"],
                            values["country"],
                            values["phone"],
                            values["linkedin_url"],
                            values["preparation_goal"],
                            now,
                            user_id,
                        ),
                    )
                    row = cursor.fetchone()
                connection.commit()
            if not row:
                raise AuthNotFoundError("User account was not found.")
            return self._row_to_user(row)
        except AuthNotFoundError:
            raise
        except Exception as exc:
            raise AuthServiceError(f"Unable to update profile. {exc}") from exc

    def _postgres_get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        SELECT id, email, full_name, role, experience_level, target_role,
                               country, phone, linkedin_url, preparation_goal,
                               created_at, updated_at, last_login_at
                        FROM playground_users
                        WHERE id = %s
                        """,
                        (user_id,),
                    )
                    row = cursor.fetchone()
            return self._row_to_user(row) if row else None
        except Exception as exc:
            raise AuthServiceError(f"Unable to read user profile. {exc}") from exc

    def _postgres_revoke_session(self, token_hash: str, now: datetime) -> None:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        UPDATE auth_sessions
                        SET revoked_at = %s
                        WHERE token_hash = %s
                        """,
                        (now, token_hash),
                    )
                connection.commit()
        except Exception as exc:
            raise AuthServiceError(f"Unable to logout. {exc}") from exc

    def _row_to_user(self, row: Any) -> dict[str, Any]:
        return {
            "id": row[0],
            "email": row[1],
            "full_name": row[2],
            "role": row[3],
            "experience_level": row[4],
            "target_role": row[5],
            "country": row[6],
            "phone": row[7],
            "linkedin_url": row[8],
            "preparation_goal": row[9],
            "created_at": row[10],
            "updated_at": row[11],
            "last_login_at": row[12],
        }

    def _profile_from_row(self, row: dict[str, Any]) -> AuthUserProfile:
        return AuthUserProfile(
            id=row["id"],
            email=row["email"],
            full_name=row["full_name"],
            role=row["role"],
            experience_level=row["experience_level"],
            target_role=row.get("target_role"),
            country=row.get("country"),
            phone=row.get("phone"),
            linkedin_url=row.get("linkedin_url"),
            preparation_goal=row.get("preparation_goal"),
            created_at=self._iso(row["created_at"]),
            updated_at=self._iso(row["updated_at"]),
            last_login_at=self._iso(row.get("last_login_at")) if row.get("last_login_at") else None,
        )

    def _active_postgres_url(self, postgres_url: str | None) -> str | None:
        if not postgres_url or postgres_url == DEFAULT_POSTGRES_URL:
            return None

        if "supabase.com" in postgres_url and "sslmode=" not in postgres_url:
            separator = "&" if "?" in postgres_url else "?"
            return f"{postgres_url}{separator}sslmode=require"

        return postgres_url

    def _hash_otp(self, email: str, otp_code: str) -> str:
        return hashlib.sha256(f"{email}:{otp_code}".encode("utf-8")).hexdigest()

    def _hash_token(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)

    def _iso(self, value: datetime | str | None) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        return value.isoformat()
