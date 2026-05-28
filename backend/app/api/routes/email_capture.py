from fastapi import APIRouter, HTTPException

from app.schemas.email_capture import EmailCaptureRequest, EmailCaptureResponse
from app.services.email_capture_store import EmailCaptureStore, EmailCaptureStoreError

router = APIRouter(tags=["email-captures"])
email_capture_store = EmailCaptureStore()


@router.post("/api/v1/email-captures", response_model=EmailCaptureResponse)
@router.post("/v1/email-captures", response_model=EmailCaptureResponse)
def capture_email(payload: EmailCaptureRequest) -> EmailCaptureResponse:
    try:
        return email_capture_store.capture(payload)
    except EmailCaptureStoreError as exc:
        raise HTTPException(
            status_code=500,
            detail="Email capture is temporarily unavailable. Please try again soon.",
        ) from exc
