import re

from pydantic import BaseModel, Field, field_validator

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class EmailCaptureRequest(BaseModel):
    email: str = Field(max_length=254)
    source: str = Field(default="premium_unlock", max_length=80)
    scenario_slug: str | None = Field(default=None, max_length=160)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not EMAIL_PATTERN.match(normalized):
            raise ValueError("Please enter a valid email address.")
        return normalized

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Source is required.")
        return normalized


class EmailCaptureResponse(BaseModel):
    captured: bool
    email: str
    unlocked_premium: bool


class EmailCaptureRecord(BaseModel):
    email: str
    source: str
    scenario_slug: str | None = None
    captured_at: str


class EmailCaptureAdminResponse(BaseModel):
    storage_backend: str
    table_exists: bool
    count: int
    rows: list[EmailCaptureRecord]
