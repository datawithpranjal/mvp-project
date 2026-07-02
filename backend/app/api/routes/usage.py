import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from app.core.config import get_settings
from app.schemas.usage import (
    AnonymousUsageEventRequest,
    UsageAdminSummaryResponse,
    UsageEventRequest,
    UsageEventResponse,
    UsageVisitorSummaryResponse,
)
from app.services.auth_service import AuthService, AuthServiceError, AuthUnauthorizedError
from app.services.usage_store import UsageStore, UsageStoreError

router = APIRouter(tags=["usage"])
auth_service = AuthService()
usage_store = UsageStore()
settings = get_settings()


def bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header.")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header.")

    return token


@router.post("/api/v1/usage/events", response_model=UsageEventResponse)
@router.post("/v1/usage/events", response_model=UsageEventResponse)
def record_usage_event(
    payload: UsageEventRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> UsageEventResponse:
    if payload.event_name == "login_success":
        raise HTTPException(status_code=400, detail="Login events are recorded by the server.")
    try:
        user = auth_service.get_profile(bearer_token(authorization))
        return usage_store.record_event(user=user, payload=payload)
    except AuthUnauthorizedError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except AuthServiceError as exc:
        raise HTTPException(status_code=503, detail=f"Authentication is temporarily unavailable. {exc}") from exc
    except UsageStoreError as exc:
        raise HTTPException(status_code=503, detail="Usage event could not be saved right now.") from exc


@router.post("/api/v1/usage/anonymous-events", response_model=UsageEventResponse)
@router.post("/v1/usage/anonymous-events", response_model=UsageEventResponse)
def record_anonymous_usage_event(payload: AnonymousUsageEventRequest) -> UsageEventResponse:
    if payload.event_name == "login_success":
        raise HTTPException(status_code=400, detail="Login events are recorded by the server.")
    try:
        return usage_store.record_anonymous_event(payload=payload)
    except UsageStoreError as exc:
        raise HTTPException(status_code=503, detail="Usage event could not be saved right now.") from exc


@router.get("/api/v1/admin/usage/summary", response_model=UsageAdminSummaryResponse)
@router.get("/v1/admin/usage/summary", response_model=UsageAdminSummaryResponse)
def usage_summary(
    x_admin_token: Annotated[str | None, Header()] = None,
    days: int = 30,
    limit: int = 100,
) -> UsageAdminSummaryResponse:
    if not settings.admin_api_token:
        raise HTTPException(status_code=503, detail="Admin usage access is not configured.")
    if not x_admin_token or not secrets.compare_digest(
        x_admin_token, settings.admin_api_token
    ):
        raise HTTPException(status_code=401, detail="Invalid admin token.")
    try:
        return usage_store.admin_summary(days=days, limit=limit)
    except UsageStoreError as exc:
        raise HTTPException(
            status_code=503,
            detail="Usage summary is temporarily unavailable.",
        ) from exc


@router.get("/api/v1/admin/usage/visitors", response_model=UsageVisitorSummaryResponse)
@router.get("/v1/admin/usage/visitors", response_model=UsageVisitorSummaryResponse)
def visitor_usage_summary(
    x_admin_token: Annotated[str | None, Header()] = None,
    days: int = 30,
    limit: int = 25,
) -> UsageVisitorSummaryResponse:
    if not settings.admin_api_token:
        raise HTTPException(status_code=503, detail="Admin usage access is not configured.")
    if not x_admin_token or not secrets.compare_digest(
        x_admin_token, settings.admin_api_token
    ):
        raise HTTPException(status_code=401, detail="Invalid admin token.")
    try:
        return usage_store.visitor_summary(days=days, limit=limit)
    except UsageStoreError as exc:
        raise HTTPException(
            status_code=503,
            detail="Visitor usage summary is temporarily unavailable.",
        ) from exc
