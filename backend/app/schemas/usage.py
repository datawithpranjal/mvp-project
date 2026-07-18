from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


UsageEventName = Literal[
    "login_success",
    "session_start",
    "session_heartbeat",
    "page_view",
    "content_view",
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


class AnonymousUsageEventRequest(UsageEventRequest):
    visitor_id: str = Field(..., min_length=8, max_length=120)

    @field_validator("visitor_id")
    @classmethod
    def clean_visitor_id(cls, value: str) -> str:
        return value.strip()


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


class UsageVisitorDailyTotal(BaseModel):
    date: str
    visits: int
    unique_visitors: int
    total_active_seconds: int


class UsageVisitorTopPage(BaseModel):
    page_url: str
    visits: int
    unique_visitors: int
    total_active_seconds: int


class UsageVisitorSummaryResponse(BaseModel):
    storage_backend: Literal["postgres", "file"]
    table_exists: bool
    days: int
    total_visits: int
    unique_visitors: int
    total_active_seconds: int
    daily_totals: list[UsageVisitorDailyTotal]
    top_pages: list[UsageVisitorTopPage]


class UsageEventCount(BaseModel):
    event_name: str
    count: int


class UsageBreakdownItem(BaseModel):
    label: str
    count: int
    percentage: float


class UsageConversionInsight(BaseModel):
    page_to_content_rate: float
    visitor_to_login_rate: float
    content_to_submission_rate: float
    submission_to_completion_rate: float


class UsageDailyInsight(BaseModel):
    date: str
    page_views: int
    content_views: int
    submissions: int
    completions: int
    logins: int
    active_seconds: int


class UsageContentInsight(BaseModel):
    content_id: str
    content_type: str
    track: str | None = None
    views: int
    submissions: int
    completions: int
    completion_rate: float
    avg_score: float | None = None
    avg_active_seconds: int
    last_activity_at: str | None = None


class UsageFunnelInsight(BaseModel):
    anonymous_visitors: int
    logged_in_users: int
    total_sessions: int
    page_views: int
    content_views: int
    logins: int
    submissions: int
    completions: int
    completion_rate: float
    active_seconds: int


class UsageAdminInsightsResponse(BaseModel):
    storage_backend: Literal["postgres", "file"]
    table_exists: bool
    days: int
    total_events: int
    funnel: UsageFunnelInsight
    conversion: UsageConversionInsight
    event_counts: list[UsageEventCount]
    device_breakdown: list[UsageBreakdownItem]
    traffic_sources: list[UsageBreakdownItem]
    track_breakdown: list[UsageBreakdownItem]
    daily: list[UsageDailyInsight]
    top_content: list[UsageContentInsight]
    friction_content: list[UsageContentInsight]
