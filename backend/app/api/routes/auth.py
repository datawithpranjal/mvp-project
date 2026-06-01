from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import RedirectResponse

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
    AuthRateLimitError,
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
    if isinstance(exc, AuthRateLimitError):
        return HTTPException(status_code=429, detail=str(exc))
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


@router.get("/api/v1/auth/google/start-url")
@router.get("/v1/auth/google/start-url")
def google_start_url(return_to: str = "/dashboard") -> dict[str, str]:
    try:
        return {"url": auth_service.google_login_url(return_to=return_to)}
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc


@router.get("/api/v1/auth/google/start")
@router.get("/v1/auth/google/start")
def google_start(return_to: str = "/dashboard") -> RedirectResponse:
    try:
        return RedirectResponse(auth_service.google_login_url(return_to=return_to))
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc


@router.get("/api/v1/auth/google/callback")
@router.get("/v1/auth/google/callback")
def google_callback(
    code: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
    error: Annotated[str | None, Query()] = None,
) -> RedirectResponse:
    if error:
        return RedirectResponse(f"{auth_service.frontend_base_url}/auth/callback?error={quote(error)}")
    if not code or not state:
        return RedirectResponse(
            f"{auth_service.frontend_base_url}/auth/callback?error=Missing%20Google%20callback%20code."
        )

    try:
        session, return_to = auth_service.authenticate_google_callback(code=code, state=state)
        user_json = quote(session.user.model_dump_json())
        redirect_url = (
            f"{auth_service.frontend_base_url}/auth/callback"
            f"#token={quote(session.token)}"
            f"&expires_at={quote(session.expires_at)}"
            f"&user={user_json}"
            f"&return_to={quote(return_to)}"
        )
        return RedirectResponse(redirect_url)
    except AuthServiceError as exc:
        return RedirectResponse(
            f"{auth_service.frontend_base_url}/auth/callback?error={quote(str(exc))}"
        )
