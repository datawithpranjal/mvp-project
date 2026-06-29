from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


UsageEventName = Literal[
    "login_success",
    "session_start",
    "session_heartbeat",
    "page_view",
    "coding_lab_submitted",
    "coding_lab_completed",
    "scenario_submitted",
    "scenario_completed",
]


class UsageEventRequest(BaseModel):
    event_name: UsageEventName
    session_id: str = Field(..., min_length=8, max_length=120)
    page_url: str | None = Field(default=None, max_length=1000)
    active_seconds: int = Field(default=0, ge=0, le=300)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("session_id")
    @classmethod
    def clean_session_id(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_metadata(self) -> "UsageEventRequest":
        if len(self.metadata) > 30:
            raise ValueError("Usage metadata can contain at most 30 fields.")
        return self


class UsageEventResponse(BaseModel):
    recorded: bool


class UsageUserSummary(BaseModel):
    user_id: str
    email: str
    full_name: str
    total_active_seconds: int
    questions_submitted: int
    questions_completed: int
    logins_7d: int
    logins_30d: int
    sessions_7d: int
    sessions_30d: int
    last_seen_at: str | None


class UsageAdminSummaryResponse(BaseModel):
    storage_backend: Literal["postgres", "file"]
    table_exists: bool
    days: int
    total_users: int
    rows: list[UsageUserSummary]
