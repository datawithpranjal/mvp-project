import logging
import secrets
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Response

from app.core.config import get_settings
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
    days: Annotated[int, Query(ge=1, le=90)] = 30,
    end_date: date | None = None,
):
    response.headers["Cache-Control"] = "no-store"
    admin = settings.admin_api_token
    reader = settings.reporting_api_token
    # Fail closed for reader configuration that would also authorize existing writes.
    distinct = reader and (not admin or not secrets.compare_digest(reader, admin))
    allowed_reader = distinct and x_reporting_token and secrets.compare_digest(x_reporting_token, reader)
    allowed_admin = admin and x_admin_token and secrets.compare_digest(x_admin_token, admin)
    if not allowed_reader and not allowed_admin:
        logger.warning("Admin reporting access denied")
        raise HTTPException(status_code=401, detail="Reporting access denied. Use a configured read-only key or admin key.")
    if end_date and end_date > datetime.now(IST).date():
        raise HTTPException(status_code=422, detail="End date cannot be in the future.")
    if end_date and end_date < date(2000, 1, 1):
        raise HTTPException(status_code=422, detail="End date must be on or after 2000-01-01.")
    logger.info("Admin reporting read role=%s days=%s", "reader" if allowed_reader else "admin", days)
    return reporting.report(days=days, end_date=end_date)
