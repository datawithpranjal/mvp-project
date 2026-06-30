import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Request

from app.core.config import get_settings
from app.schemas.content_audit import (
    ContentAuditBulkRequest,
    ContentAuditBulkResponse,
    ContentAuditDetailResponse,
    ContentAuditItem,
    ContentAuditStatusUpdateRequest,
    ContentAuditSummaryResponse,
)
from app.services.content_audit_service import ContentAuditError, ContentAuditService

router = APIRouter(tags=["content-audit"])
settings = get_settings()
content_audit_service = ContentAuditService()


@router.get("/api/admin/content-audit", response_model=ContentAuditSummaryResponse)
@router.get("/api/v1/admin/content-audit", response_model=ContentAuditSummaryResponse)
@router.get("/v1/admin/content-audit", response_model=ContentAuditSummaryResponse)
def list_content_audits(
    x_admin_token: Annotated[str | None, Header()] = None,
) -> ContentAuditSummaryResponse:
    _require_admin_token(x_admin_token)
    try:
        return content_audit_service.list_latest()
    except ContentAuditError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/api/admin/content-audit/run", response_model=ContentAuditBulkResponse)
@router.post("/api/v1/admin/content-audit/run", response_model=ContentAuditBulkResponse)
@router.post("/v1/admin/content-audit/run", response_model=ContentAuditBulkResponse)
def audit_content_items(
    payload: ContentAuditBulkRequest,
    x_admin_token: Annotated[str | None, Header()] = None,
) -> ContentAuditBulkResponse:
    _require_admin_token(x_admin_token)
    try:
        return content_audit_service.audit_items(payload.items)
    except ContentAuditError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/api/cron/content-audit/daily", response_model=ContentAuditBulkResponse)
@router.get("/api/v1/admin/content-audit/run-daily", response_model=ContentAuditBulkResponse)
@router.get("/v1/admin/content-audit/run-daily", response_model=ContentAuditBulkResponse)
def run_daily_content_audit(
    request: Request,
    x_admin_token: Annotated[str | None, Header()] = None,
) -> ContentAuditBulkResponse:
    _require_admin_token_or_vercel_cron(request, x_admin_token)
    try:
        return content_audit_service.audit_backend_catalog()
    except ContentAuditError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/api/admin/content-audit/{content_id}", response_model=ContentAuditDetailResponse)
@router.get("/api/v1/admin/content-audit/{content_id}", response_model=ContentAuditDetailResponse)
@router.get("/v1/admin/content-audit/{content_id}", response_model=ContentAuditDetailResponse)
def get_content_audit(
    content_id: str,
    x_admin_token: Annotated[str | None, Header()] = None,
) -> ContentAuditDetailResponse:
    _require_admin_token(x_admin_token)
    try:
        return content_audit_service.get_latest_detail(content_id)
    except ContentAuditError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/api/admin/content-audit/{content_id}", response_model=ContentAuditDetailResponse)
@router.post("/api/v1/admin/content-audit/{content_id}", response_model=ContentAuditDetailResponse)
@router.post("/v1/admin/content-audit/{content_id}", response_model=ContentAuditDetailResponse)
def audit_content_item(
    content_id: str,
    payload: ContentAuditItem,
    x_admin_token: Annotated[str | None, Header()] = None,
) -> ContentAuditDetailResponse:
    _require_admin_token(x_admin_token)
    if payload.content_id != content_id:
        raise HTTPException(
            status_code=400,
            detail="content_id in the URL must match the request body.",
        )
    try:
        return content_audit_service.audit_item(payload)
    except ContentAuditError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.patch(
    "/api/admin/content-audit/{content_id}/issues/{issue_id}",
    response_model=ContentAuditDetailResponse,
)
@router.patch(
    "/api/v1/admin/content-audit/{content_id}/issues/{issue_id}",
    response_model=ContentAuditDetailResponse,
)
@router.patch(
    "/v1/admin/content-audit/{content_id}/issues/{issue_id}",
    response_model=ContentAuditDetailResponse,
)
def update_content_audit_issue_status(
    content_id: str,
    issue_id: str,
    payload: ContentAuditStatusUpdateRequest,
    x_admin_token: Annotated[str | None, Header()] = None,
) -> ContentAuditDetailResponse:
    _require_admin_token(x_admin_token)
    try:
        return content_audit_service.update_issue_status(content_id, issue_id, payload.status)
    except ContentAuditError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _require_admin_token(x_admin_token: str | None) -> None:
    if not settings.admin_api_token:
        raise HTTPException(status_code=503, detail="Admin content audit access is not configured.")
    if not x_admin_token or not secrets.compare_digest(
        x_admin_token,
        settings.admin_api_token,
    ):
        raise HTTPException(status_code=401, detail="Invalid admin token.")


def _require_admin_token_or_vercel_cron(
    request: Request,
    x_admin_token: str | None,
) -> None:
    if x_admin_token:
        _require_admin_token(x_admin_token)
        return
    if request.headers.get("x-vercel-cron") == "1":
        return
    _require_admin_token(x_admin_token)
