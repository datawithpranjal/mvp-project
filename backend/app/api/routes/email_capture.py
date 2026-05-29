import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from app.core.config import get_settings
from app.schemas.email_capture import (
    EmailCaptureAdminResponse,
    EmailCaptureRequest,
    EmailCaptureResponse,
)
from app.services.email_capture_store import EmailCaptureStore, EmailCaptureStoreError

router = APIRouter(tags=["email-captures"])
email_capture_store = EmailCaptureStore()
settings = get_settings()


@router.post("/api/v1/email-captures", response_model=EmailCaptureResponse)
@router.post("/v1/email-captures", response_model=EmailCaptureResponse)
def capture_email(payload: EmailCaptureRequest) -> EmailCaptureResponse:
    try:
        return email_capture_store.capture(payload)
    except EmailCaptureStoreError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Email capture is temporarily unavailable. {exc}",
        ) from exc


@router.get("/api/v1/admin/email-captures", response_model=EmailCaptureAdminResponse)
@router.get("/v1/admin/email-captures", response_model=EmailCaptureAdminResponse)
def list_email_captures(
    x_admin_token: Annotated[str | None, Header()] = None,
    limit: int = 50,
) -> EmailCaptureAdminResponse:
    if not settings.admin_api_token:
        raise HTTPException(
            status_code=503,
            detail="Admin email capture access is not configured.",
        )

    if not x_admin_token or not secrets.compare_digest(x_admin_token, settings.admin_api_token):
        raise HTTPException(status_code=401, detail="Invalid admin token.")

    try:
        return email_capture_store.list_captures(limit=limit)
    except EmailCaptureStoreError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Email capture records are temporarily unavailable. {exc}",
        ) from exc
