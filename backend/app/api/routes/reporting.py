import logging
import secrets
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Response

from app.core.config import get_settings
from app.api.routes.auth import auth_service, bearer_token, auth_error_response
from app.services.auth_service import AuthServiceError
from app.services.admin_reporting import AdminReporting, IST

router = APIRouter(tags=["reporting"])
settings = get_settings()
reporting = AdminReporting()
logger = logging.getLogger(__name__)


@router.get("/api/v1/admin/reporting")
@router.get("/v1/admin/reporting")
def get_report(
    response: Response,
    x_reporting_token: Annotated[str | None, Header()] = None,
    x_admin_token: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
    end_date: date | None = None,
):
    response.headers["Cache-Control"] = "no-store"
    admin = settings.admin_api_token
    reader = settings.reporting_api_token
    # Fail closed for reader configuration that would also authorize existing writes.
    distinct = reader and (not admin or not secrets.compare_digest(reader, admin))
    allowed_reader = distinct and x_reporting_token and secrets.compare_digest(x_reporting_token, reader)
    allowed_admin = admin and x_admin_token and secrets.compare_digest(x_admin_token, admin)
    allowed_account = False
    if authorization and not (allowed_reader or allowed_admin):
        try:
            profile = auth_service.get_profile(bearer_token(authorization))
        except AuthServiceError as exc:
            raise auth_error_response(exc) from exc
        allowed_account = bool(settings.reporting_admin_email.strip()) and profile.email.strip().casefold() == settings.reporting_admin_email.strip().casefold()
        if not allowed_account:
            raise HTTPException(status_code=403, detail="This account is not authorized to view admin reports.")
    if not allowed_reader and not allowed_admin and not allowed_account:
        logger.warning("Admin reporting access denied")
        raise HTTPException(status_code=401, detail="Reporting access denied. Use a configured read-only key or admin key.")
    if end_date and end_date > datetime.now(IST).date():
        raise HTTPException(status_code=422, detail="End date cannot be in the future.")
    if end_date and end_date < date(2000, 1, 1):
        raise HTTPException(status_code=422, detail="End date must be on or after 2000-01-01.")
    logger.info("Admin reporting read role=%s days=%s", "account" if allowed_account else "reader" if allowed_reader else "admin", days)
    return reporting.report(days=days, end_date=end_date)
