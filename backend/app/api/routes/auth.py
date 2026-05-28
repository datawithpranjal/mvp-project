from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from app.schemas.auth import (
    AuthProfileUpdateRequest,
    AuthRequestOtpRequest,
    AuthRequestOtpResponse,
    AuthSessionResponse,
    AuthUserProfile,
    AuthVerifyOtpRequest,
)
from app.services.auth_service import (
    AuthNotFoundError,
    AuthService,
    AuthServiceError,
    AuthUnauthorizedError,
    AuthValidationError,
)

router = APIRouter(tags=["auth"])
auth_service = AuthService()


def bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header.")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header.")

    return token


def auth_error_response(exc: Exception) -> HTTPException:
    if isinstance(exc, AuthValidationError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, AuthNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, AuthUnauthorizedError):
        return HTTPException(status_code=401, detail=str(exc))
    return HTTPException(status_code=500, detail=f"Authentication is temporarily unavailable. {exc}")


@router.post("/api/v1/auth/request-otp", response_model=AuthRequestOtpResponse)
@router.post("/v1/auth/request-otp", response_model=AuthRequestOtpResponse)
def request_otp(payload: AuthRequestOtpRequest) -> AuthRequestOtpResponse:
    try:
        return auth_service.request_otp(payload)
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc


@router.post("/api/v1/auth/verify-otp", response_model=AuthSessionResponse)
@router.post("/v1/auth/verify-otp", response_model=AuthSessionResponse)
def verify_otp(payload: AuthVerifyOtpRequest) -> AuthSessionResponse:
    try:
        return auth_service.verify_otp(payload)
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc


@router.get("/api/v1/auth/me", response_model=AuthUserProfile)
@router.get("/v1/auth/me", response_model=AuthUserProfile)
def current_profile(
    authorization: Annotated[str | None, Header()] = None,
) -> AuthUserProfile:
    try:
        return auth_service.get_profile(bearer_token(authorization))
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc


@router.patch("/api/v1/auth/profile", response_model=AuthUserProfile)
@router.patch("/v1/auth/profile", response_model=AuthUserProfile)
def update_profile(
    payload: AuthProfileUpdateRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> AuthUserProfile:
    try:
        return auth_service.update_profile(bearer_token(authorization), payload)
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc


@router.post("/api/v1/auth/logout")
@router.post("/v1/auth/logout")
def logout(authorization: Annotated[str | None, Header()] = None) -> dict[str, bool]:
    try:
        auth_service.logout(bearer_token(authorization))
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc

    return {"logged_out": True}
