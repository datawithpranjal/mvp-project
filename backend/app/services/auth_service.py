from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hmac
import hashlib
import json
import math
import secrets
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

import httpx

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
from app.services.otp_delivery_service import OtpDeliveryError, OtpDeliveryService
from app.services.usage_store import UsageStore, UsageStoreError

OTP_REQUEST_LIMIT = 5
OTP_REQUEST_WINDOW = timedelta(minutes=15)
OTP_RESEND_COOLDOWN = timedelta(seconds=60)
OTP_VERIFY_FAILURE_LIMIT = 8
OTP_VERIFY_FAILURE_WINDOW = timedelta(minutes=15)


class AuthServiceError(RuntimeError):
    pass


class AuthRateLimitError(AuthServiceError):
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
    _memory_otp_verify_failures: list[dict[str, Any]] = []
    _memory_sessions: dict[str, dict[str, Any]] = {}

    def __init__(self, postgres_url: str | None = None) -> None:
        settings = get_settings()
        configured_postgres_url = postgres_url if postgres_url is not None else settings.postgres_url
        self.postgres_url = self._active_postgres_url(configured_postgres_url)
        self.otp_ttl = timedelta(minutes=settings.auth_otp_ttl_minutes)
        self.session_ttl = timedelta(days=settings.auth_session_ttl_days)
        self.frontend_base_url = settings.frontend_base_url.rstrip("/")
        self.google_client_id = settings.google_oauth_client_id
        self.google_client_secret = settings.google_oauth_client_secret
        self.google_redirect_uri = settings.google_oauth_redirect_uri
        self.google_state_secret = (
            settings.google_oauth_state_secret
            or settings.google_oauth_client_secret
            or "development-google-oauth-state-secret"
        )
        self.email_capture_store = EmailCaptureStore(postgres_url=configured_postgres_url)
        self.usage_store = UsageStore(postgres_url=configured_postgres_url)
        self.otp_delivery_service = OtpDeliveryService()
        self.show_debug_otp = (
            settings.auth_show_debug_otp
            and self.otp_delivery_service.delivery_channel() == "demo"
        )

    def request_otp(self, payload: AuthRequestOtpRequest) -> AuthRequestOtpResponse:
        now = self._now()
        if payload.mode == "signup":
            full_name = (payload.full_name or "").strip()
            if len(full_name) < 2:
                raise AuthValidationError("Please enter your name to create an account.")
            if len(full_name) > 80:
                raise AuthValidationError("Name must be 80 characters or fewer.")
        self._check_otp_request_rate_limit(payload.email, now)

        otp_code = f"{secrets.randbelow(900000) + 100000}"
        expires_at = now + self.otp_ttl

        if payload.mode == "signup":
            self._upsert_user(payload, now)
            self._capture_signup_email(payload.email)
        else:
            if not self._get_user_by_email(payload.email):
                raise AuthNotFoundError("No account exists for this email. Please sign up first.")

        self._store_otp(payload.email, otp_code, payload.mode, now, expires_at)
        self._deliver_otp(payload.email, otp_code)

        return AuthRequestOtpResponse(
            email=payload.email,
            otp_required=True,
            delivery_channel=self.otp_delivery_service.delivery_channel(),
            expires_in_seconds=int(self.otp_ttl.total_seconds()),
            resend_after_seconds=int(OTP_RESEND_COOLDOWN.total_seconds()),
            debug_otp=otp_code if self.show_debug_otp else None,
        )

    def verify_otp(self, payload: AuthVerifyOtpRequest) -> AuthSessionResponse:
        now = self._now()
        self._check_otp_verify_rate_limit(payload.email, now)

        user = self._get_user_by_email(payload.email)
        if not user:
            raise AuthNotFoundError("No account exists for this email.")

        if not self._consume_otp(payload.email, payload.otp_code, now):
            self._record_otp_verify_failure(payload.email, now)
            raise AuthUnauthorizedError("Invalid or expired OTP.")

        token = secrets.token_urlsafe(32)
        expires_at = now + self.session_ttl
        updated_user = self._record_login_and_session(user["id"], token, now, expires_at)
        self._record_login_usage(updated_user)

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

    def google_login_url(self, return_to: str | None = None) -> str:
        if not self.google_client_id or not self.google_client_secret or not self.google_redirect_uri:
            raise AuthValidationError(
                "Google login is not configured yet. Add GOOGLE_OAUTH_CLIENT_ID, "
                "GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI."
            )

        state = self._build_google_state(return_to or "/dashboard")
        query = urlencode(
            {
                "client_id": self.google_client_id,
                "redirect_uri": self.google_redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "access_type": "online",
                "prompt": "select_account",
            }
        )
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    def authenticate_google_callback(self, code: str, state: str) -> tuple[AuthSessionResponse, str]:
        state_payload = self._parse_google_state(state)
        user_info = self._fetch_google_user_info(code)
        email = str(user_info.get("email", "")).strip().lower()
        full_name = str(user_info.get("name") or email).strip()

        if not email or not user_info.get("email_verified", False):
            raise AuthUnauthorizedError("Google account email is missing or not verified.")

        now = self._now()
        user = self._upsert_oauth_user(email=email, full_name=full_name, now=now)
        token = secrets.token_urlsafe(32)
        expires_at = now + self.session_ttl
        updated_user = self._record_login_and_session(user["id"], token, now, expires_at)
        self._record_login_usage(updated_user)
        session = AuthSessionResponse(
            token=token,
            expires_at=expires_at.isoformat(),
            user=self._profile_from_row(updated_user),
        )
        return session, str(state_payload.get("return_to") or "/dashboard")

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

    def _upsert_oauth_user(self, email: str, full_name: str, now: datetime) -> dict[str, Any]:
        existing = self._get_user_by_email(email)
        if existing:
            payload = AuthProfileUpdateRequest(
                full_name=existing.get("full_name") or full_name,
                role=existing.get("role") or "Student",
                experience_level=existing.get("experience_level") or "Beginner",
                target_role=existing.get("target_role"),
                country=existing.get("country"),
                phone=existing.get("phone"),
                linkedin_url=existing.get("linkedin_url"),
                preparation_goal=existing.get("preparation_goal"),
            )
            return self._update_user_profile(existing["id"], payload, now)

        profile = {
            "id": str(uuid4()),
            "email": email,
            "full_name": full_name or email,
            "role": "Student",
            "experience_level": "Beginner",
            "target_role": None,
            "country": None,
            "phone": None,
            "linkedin_url": None,
            "preparation_goal": "Created through Google login.",
            "created_at": now,
            "updated_at": now,
            "last_login_at": None,
        }

        if self.postgres_url:
            user = self._postgres_upsert_user(profile)
        else:
            self._memory_users[email] = profile
            user = profile

        self._capture_signup_email(email)
        return user

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

        for existing_otp in self._memory_otps:
            if existing_otp["email"] == email and existing_otp["consumed_at"] is None:
                existing_otp["consumed_at"] = now
        self._memory_otps.append(otp_row)

    def _check_otp_request_rate_limit(self, email: str, now: datetime) -> None:
        window_start = now - OTP_REQUEST_WINDOW

        if self.postgres_url:
            recent_count = self._postgres_count_recent_otp_requests(email, window_start)
            latest_request_at = self._postgres_latest_otp_request(email)
        else:
            self._memory_otps = [
                otp for otp in self._memory_otps if otp["created_at"] >= window_start
            ]
            matching_otps = [otp for otp in self._memory_otps if otp["email"] == email]
            recent_count = len(matching_otps)
            latest_request_at = (
                max(otp["created_at"] for otp in matching_otps)
                if matching_otps
                else None
            )

        if recent_count >= OTP_REQUEST_LIMIT:
            raise AuthRateLimitError(
                "Too many OTP requests. Please wait 15 minutes before trying again."
            )
        if latest_request_at:
            remaining_seconds = math.ceil(
                (latest_request_at + OTP_RESEND_COOLDOWN - now).total_seconds()
            )
            if remaining_seconds > 0:
                raise AuthRateLimitError(
                    f"Please wait {remaining_seconds} seconds before requesting a new OTP."
                )

    def _check_otp_verify_rate_limit(self, email: str, now: datetime) -> None:
        window_start = now - OTP_VERIFY_FAILURE_WINDOW

        if self.postgres_url:
            recent_count = self._postgres_count_recent_otp_verify_failures(email, window_start)
        else:
            self._memory_otp_verify_failures = [
                failure
                for failure in self._memory_otp_verify_failures
                if failure["attempted_at"] >= window_start
            ]
            recent_count = sum(
                1
                for failure in self._memory_otp_verify_failures
                if failure["email"] == email
            )

        if recent_count >= OTP_VERIFY_FAILURE_LIMIT:
            raise AuthRateLimitError(
                "Too many OTP verification attempts. Please wait 15 minutes before trying again."
            )

    def _record_otp_verify_failure(self, email: str, now: datetime) -> None:
        if self.postgres_url:
            self._postgres_record_otp_verify_failure(email, now)
            return

        self._memory_otp_verify_failures.append({"email": email, "attempted_at": now})

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

    def _deliver_otp(self, email: str, otp_code: str) -> None:
        try:
            self.otp_delivery_service.send_otp(
                email=email,
                otp_code=otp_code,
                expires_in_minutes=int(self.otp_ttl.total_seconds() // 60),
            )
        except OtpDeliveryError as exc:
            raise AuthServiceError(f"Unable to send OTP email. {exc}") from exc

    def _record_login_usage(self, user: dict[str, Any]) -> None:
        try:
            self.usage_store.record_login(user)
        except UsageStoreError:
            # Usage tracking should never block authentication.
            return

    def _build_google_state(self, return_to: str) -> str:
        safe_return_to = return_to if return_to.startswith("/") else "/dashboard"
        payload = {
            "return_to": safe_return_to,
            "created_at": int(self._now().timestamp()),
            "nonce": secrets.token_urlsafe(12),
        }
        payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        payload_b64 = self._base64url_encode(payload_json)
        signature = hmac.new(
            self.google_state_secret.encode("utf-8"),
            payload_b64.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return f"{payload_b64}.{self._base64url_encode(signature)}"

    def _parse_google_state(self, state: str) -> dict[str, Any]:
        payload_b64, separator, signature_b64 = state.partition(".")
        if not separator:
            raise AuthUnauthorizedError("Invalid Google login state.")

        expected_signature = hmac.new(
            self.google_state_secret.encode("utf-8"),
            payload_b64.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        provided_signature = self._base64url_decode(signature_b64)
        if not hmac.compare_digest(expected_signature, provided_signature):
            raise AuthUnauthorizedError("Invalid Google login state.")

        try:
            payload = json.loads(self._base64url_decode(payload_b64))
        except Exception as exc:
            raise AuthUnauthorizedError("Invalid Google login state.") from exc

        created_at = payload.get("created_at")
        if not isinstance(created_at, int):
            raise AuthUnauthorizedError("Invalid Google login state.")

        state_age = self._now() - datetime.fromtimestamp(created_at, timezone.utc)
        if state_age > timedelta(minutes=15):
            raise AuthUnauthorizedError("Google login state expired. Please try again.")

        return payload

    def _fetch_google_user_info(self, code: str) -> dict[str, Any]:
        if not self.google_client_id or not self.google_client_secret or not self.google_redirect_uri:
            raise AuthValidationError("Google login is not configured yet.")

        try:
            token_response = httpx.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": self.google_client_id,
                    "client_secret": self.google_client_secret,
                    "redirect_uri": self.google_redirect_uri,
                    "grant_type": "authorization_code",
                },
                timeout=10,
            )
            token_response.raise_for_status()
            access_token = token_response.json().get("access_token")
            if not access_token:
                raise AuthUnauthorizedError("Google did not return an access token.")

            user_response = httpx.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
            user_response.raise_for_status()
            return user_response.json()
        except AuthServiceError:
            raise
        except httpx.HTTPStatusError as exc:
            raise AuthUnauthorizedError(
                f"Google login failed with status {exc.response.status_code}."
            ) from exc
        except httpx.HTTPError as exc:
            raise AuthServiceError(f"Unable to reach Google OAuth. {exc}") from exc

    def _base64url_encode(self, value: bytes) -> str:
        return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")

    def _base64url_decode(self, value: str) -> bytes:
        padding = "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode(f"{value}{padding}".encode("utf-8"))

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
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_otp_attempts (
                id BIGSERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        for table_name in (
            "playground_users",
            "auth_otps",
            "auth_sessions",
            "auth_otp_attempts",
        ):
            cursor.execute(
                f"ALTER TABLE public.{table_name} ENABLE ROW LEVEL SECURITY"
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
                        UPDATE auth_otps
                        SET consumed_at = %s
                        WHERE email = %s
                          AND consumed_at IS NULL
                        """,
                        (otp_row["created_at"], otp_row["email"]),
                    )
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

    def _postgres_latest_otp_request(self, email: str) -> datetime | None:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        SELECT created_at
                        FROM auth_otps
                        WHERE email = %s
                        ORDER BY created_at DESC
                        LIMIT 1
                        """,
                        (email,),
                    )
                    row = cursor.fetchone()
                    return row[0] if row else None
        except Exception as exc:
            raise AuthServiceError(f"Unable to check OTP resend timing. {exc}") from exc

    def _postgres_count_recent_otp_requests(
        self,
        email: str,
        window_start: datetime,
    ) -> int:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        SELECT COUNT(*)
                        FROM auth_otps
                        WHERE email = %s
                          AND created_at >= %s
                        """,
                        (email, window_start),
                    )
                    return int(cursor.fetchone()[0])
        except Exception as exc:
            raise AuthServiceError(f"Unable to check OTP request limits. {exc}") from exc

    def _postgres_count_recent_otp_verify_failures(
        self,
        email: str,
        window_start: datetime,
    ) -> int:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        SELECT COUNT(*)
                        FROM auth_otp_attempts
                        WHERE email = %s
                          AND attempted_at >= %s
                        """,
                        (email, window_start),
                    )
                    return int(cursor.fetchone()[0])
        except Exception as exc:
            raise AuthServiceError(f"Unable to check OTP verification limits. {exc}") from exc

    def _postgres_record_otp_verify_failure(self, email: str, now: datetime) -> None:
        try:
            with self._postgres_connect() as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        INSERT INTO auth_otp_attempts (email, attempted_at)
                        VALUES (%s, %s)
                        """,
                        (email, now),
                    )
                connection.commit()
        except Exception as exc:
            raise AuthServiceError(f"Unable to record OTP verification attempt. {exc}") from exc

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
