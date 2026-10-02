from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from app.api.routes.auth import auth_error_response, auth_service, bearer_token
from app.schemas.python_validation import (
    PythonLabSolutionResponse,
    PythonValidationRequest,
    PythonValidationResponse,
)
from app.services.auth_service import AuthServiceError
from app.services.lab_access_service import python_lab_requires_premium
from app.services.premium_access_service import PremiumAccessService, PremiumAccessServiceError
from app.services.python_lab_specs import PYTHON_LAB_SPECS
from app.services.python_validation_service import (
    PythonValidationError,
    PythonValidationNotFoundError,
    PythonValidationService,
)

router = APIRouter(tags=["python-validation"])
service = PythonValidationService()
premium_access_service = PremiumAccessService()


def require_authenticated_user(authorization: str | None):
    try:
        return auth_service.get_profile(bearer_token(authorization))
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc


def require_python_lab_access(
    slug: str,
    authorization: str | None,
    *,
    require_auth_for_free: bool = True,
) -> None:
    if slug not in PYTHON_LAB_SPECS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This Python practice item does not have executable validation yet.",
        )
    if not python_lab_requires_premium(slug):
        if require_auth_for_free:
            require_authenticated_user(authorization)
        return
    profile = require_authenticated_user(authorization)
    try:
        has_access = premium_access_service.has_access(profile.email)
    except PremiumAccessServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Premium access could not be confirmed right now.",
        ) from exc
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium access is required for this Python lab.",
        )


@router.post(
    "/api/v1/python/validate/{slug}",
    response_model=PythonValidationResponse,
)
@router.post(
    "/v1/python/validate/{slug}",
    response_model=PythonValidationResponse,
)
def validate_python_submission(
    slug: str,
    payload: PythonValidationRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> PythonValidationResponse:
    require_python_lab_access(slug, authorization)
    try:
        return service.validate(slug=slug, code=payload.code, mode=payload.mode)
    except PythonValidationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PythonValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


@router.get(
    "/api/v1/python/labs/{slug}/solution",
    response_model=PythonLabSolutionResponse,
)
@router.get(
    "/v1/python/labs/{slug}/solution",
    response_model=PythonLabSolutionResponse,
)
def get_python_lab_solution(
    slug: str,
    authorization: Annotated[str | None, Header()] = None,
) -> PythonLabSolutionResponse:
    require_python_lab_access(slug, authorization, require_auth_for_free=False)
    try:
        solution_code, explanation = service.get_solution(slug)
        return PythonLabSolutionResponse(
            slug=slug,
            solution_code=solution_code,
            explanation=explanation,
        )
    except PythonValidationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
