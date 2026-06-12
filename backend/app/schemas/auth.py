import re

from pydantic import BaseModel, field_validator

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(value: str) -> str:
    normalized = value.strip().lower()
    if not EMAIL_PATTERN.match(normalized):
        raise ValueError("Please enter a valid email address.")
    return normalized


class ProfileFields(BaseModel):
    full_name: str | None = None
    role: str | None = None
    experience_level: str | None = None
    target_role: str | None = None
    country: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    preparation_goal: str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class AuthRequestOtpRequest(ProfileFields):
    email: str
    mode: str = "signin"

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"signin", "signup"}:
            raise ValueError("Mode must be signin or signup.")
        return normalized


class AuthRequestOtpResponse(BaseModel):
    email: str
    otp_required: bool
    delivery_channel: str
    expires_in_seconds: int
    resend_after_seconds: int = 60
    debug_otp: str | None = None


class AuthVerifyOtpRequest(BaseModel):
    email: str
    otp_code: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("otp_code")
    @classmethod
    def validate_otp_code(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized.isdigit() or len(normalized) != 6:
            raise ValueError("Enter the 6 digit OTP.")
        return normalized


class AuthUserProfile(ProfileFields):
    id: str
    email: str
    full_name: str
    role: str
    experience_level: str
    created_at: str
    updated_at: str
    last_login_at: str | None = None


class AuthSessionResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    expires_at: str
    user: AuthUserProfile


class AuthProfileUpdateRequest(ProfileFields):
    pass
