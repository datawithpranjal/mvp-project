import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class FeedbackRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=254)
    category: Literal["general", "content", "bug", "feature", "other"] = "general"
    message: str = Field(min_length=10, max_length=4000)
    rating: int | None = Field(default=None, ge=1, le=5)
    page_url: str | None = Field(default=None, max_length=500)
    website: str | None = Field(default=None, max_length=200)

    @field_validator("name", "message", mode="before")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        return str(value).strip()

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not EMAIL_PATTERN.match(normalized):
            raise ValueError("Please enter a valid email address.")
        return normalized

    @field_validator("page_url", "website", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None


class FeedbackResponse(BaseModel):
    submitted: bool
    message: str


class FeedbackRecord(BaseModel):
    id: str
    name: str
    email: str
    category: str
    message: str
    rating: int | None = None
    page_url: str | None = None
    created_at: str


class FeedbackAdminResponse(BaseModel):
    storage_backend: str
    table_exists: bool
    count: int
    rows: list[FeedbackRecord]
