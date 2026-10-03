from typing import Annotated
import hmac
from urllib.parse import quote, parse_qs, urlparse

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response
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
GOOGLE_STATE_COOKIE = "tdf_google_login_state"


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
    return HTTPException(status_code=503, detail="Authentication is temporarily unavailable. Please try again shortly.")


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
def google_start_url(
    response: Response, return_to: str = "/dashboard", frontend_origin: str | None = None,
) -> dict[str, str]:
    response.headers["Cache-Control"] = "no-store"
    try:
        return {"url": auth_service.google_login_url(return_to=return_to, frontend_origin=frontend_origin)}
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc


@router.get("/api/v1/auth/providers")
@router.get("/v1/auth/providers")
def auth_providers() -> dict[str, bool]:
    return {"google": auth_service.google_is_configured(), "email": True}


@router.get("/api/v1/auth/google/start")
@router.get("/v1/auth/google/start")
def google_start(
    return_to: str = "/dashboard", state: str | None = None,
    frontend_origin: str | None = None,
) -> RedirectResponse:
    try:
        url = auth_service.google_login_url(return_to=return_to, state=state, frontend_origin=frontend_origin)
        signed_state = parse_qs(urlparse(url).query)["state"][0]
        response = RedirectResponse(url)
        response.set_cookie(
            GOOGLE_STATE_COOKIE, signed_state, max_age=900, httponly=True,
            secure=bool(auth_service.google_redirect_uri and auth_service.google_redirect_uri.startswith("https://")),
            samesite="lax", path="/",
        )
        response.headers["Cache-Control"] = "no-store"
        return response
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc


@router.get("/api/v1/auth/google/callback")
@router.get("/v1/auth/google/callback")
def google_callback(
    request: Request,
    code: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
    error: Annotated[str | None, Query()] = None,
) -> RedirectResponse:
    def redirect(location: str) -> RedirectResponse:
        response = RedirectResponse(location)
        response.delete_cookie(GOOGLE_STATE_COOKIE, path="/")
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    # Only verified, unexpired signed state may select a return origin. This also
    # keeps cancellation and error recovery beside the learner's browser draft.
    frontend_origin = auth_service.frontend_base_url
    try:
        if state:
            frontend_origin = auth_service.google_callback_origin(state)
    except AuthServiceError:
        return redirect(f"{frontend_origin}/auth/callback?error=Please%20restart%20Google%20login%20in%20this%20browser.")

    expected_state = request.cookies.get(GOOGLE_STATE_COOKIE, "")
    if not state or not expected_state or not hmac.compare_digest(state, expected_state):
        return redirect(f"{frontend_origin}/auth/callback?error=Please%20restart%20Google%20login%20in%20this%20browser.")
    if error:
        return redirect(f"{frontend_origin}/auth/callback?error=Google%20login%20was%20cancelled.%20You%20can%20continue%20with%20email.")
    if not code or not state:
        return redirect(
            f"{frontend_origin}/auth/callback?error=Missing%20Google%20callback%20code."
        )

    try:
        session, return_to = auth_service.authenticate_google_callback(code=code, state=state)
        user_json = quote(session.user.model_dump_json())
        redirect_url = (
            f"{frontend_origin}/auth/callback"
            f"#token={quote(session.token)}"
            f"&expires_at={quote(session.expires_at)}"
            f"&user={user_json}"
            f"&return_to={quote(return_to)}"
            f"&state={quote(state)}"
        )
        return redirect(redirect_url)
    except AuthServiceError as exc:
        message = str(exc) if isinstance(exc, (AuthUnauthorizedError, AuthValidationError)) else "Google login is temporarily unavailable. Please continue with email."
        return redirect(
            f"{frontend_origin}/auth/callback?error={quote(message)}"
        )
