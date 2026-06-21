import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from app.core.config import get_settings
from app.schemas.feedback import FeedbackAdminResponse, FeedbackRequest, FeedbackResponse
from app.services.feedback_store import (
    FeedbackRateLimitError,
    FeedbackStore,
    FeedbackStoreError,
)

router = APIRouter(tags=["feedback"])
feedback_store = FeedbackStore()
settings = get_settings()


@router.post("/api/v1/feedback", response_model=FeedbackResponse)
@router.post("/v1/feedback", response_model=FeedbackResponse)
def submit_feedback(payload: FeedbackRequest) -> FeedbackResponse:
    try:
        return feedback_store.submit(payload)
    except FeedbackRateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except FeedbackStoreError as exc:
        raise HTTPException(
            status_code=503,
            detail="Feedback could not be saved right now. Please try again later.",
        ) from exc


@router.get("/api/v1/admin/feedback", response_model=FeedbackAdminResponse)
@router.get("/v1/admin/feedback", response_model=FeedbackAdminResponse)
def list_feedback(
    x_admin_token: Annotated[str | None, Header()] = None,
    limit: int = 100,
) -> FeedbackAdminResponse:
    if not settings.admin_api_token:
        raise HTTPException(status_code=503, detail="Admin feedback access is not configured.")
    if not x_admin_token or not secrets.compare_digest(
        x_admin_token, settings.admin_api_token
    ):
        raise HTTPException(status_code=401, detail="Invalid admin token.")
    try:
        return feedback_store.list_feedback(limit=limit)
    except FeedbackStoreError as exc:
        raise HTTPException(
            status_code=503,
            detail="Feedback records are temporarily unavailable.",
        ) from exc
