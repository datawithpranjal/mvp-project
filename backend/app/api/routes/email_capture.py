from fastapi import APIRouter

from app.schemas.email_capture import EmailCaptureRequest, EmailCaptureResponse
from app.services.email_capture_store import EmailCaptureStore

router = APIRouter(prefix="/api/v1/email-captures", tags=["email-captures"])
email_capture_store = EmailCaptureStore()


@router.post("", response_model=EmailCaptureResponse)
def capture_email(payload: EmailCaptureRequest) -> EmailCaptureResponse:
    return email_capture_store.capture(payload)

