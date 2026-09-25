from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LearnerAttempt(BaseModel):
    id: str
    idempotency_key: str
    answer: str
    passed: bool | None
    message: str
    result: dict[str, Any] | None = None
    created_at: str


class LearnerProgressItem(BaseModel):
    content_type: str
    content_id: str
    draft_answer: str
    draft_interview_answer: str
    hints_revealed: int
    completed: bool
    completed_at: str | None = None
    latest_result: dict[str, Any] | None = None
    ai_feedback: dict[str, Any] | None = None
    draft_revision: int
    updated_at: str
    attempts: list[LearnerAttempt] = Field(default_factory=list)


class LearnerProgressListResponse(BaseModel):
    items: list[LearnerProgressItem]


class LearnerDraftRequest(BaseModel):
    draft_answer: str = Field(default="", max_length=200_000)
    draft_interview_answer: str = Field(default="", max_length=100_000)
    hints_revealed: int = Field(default=0, ge=0, le=100)
    client_revision: int = Field(default=0, ge=0)
    completed: bool | None = None


class LearnerDraftResponse(BaseModel):
    item: LearnerProgressItem


class LearnerAttemptRequest(BaseModel):
    idempotency_key: str = Field(..., min_length=8, max_length=160)
    answer: str = Field(default="", max_length=300_000)
    passed: bool | None = None
    message: str = Field(default="", max_length=10_000)
    result: dict[str, Any] | None = None
    ai_feedback: dict[str, Any] | None = None


class LearnerAttemptResponse(BaseModel):
    item: LearnerProgressItem
    duplicate: bool = False
