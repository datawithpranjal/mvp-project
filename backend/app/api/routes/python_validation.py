from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from app.api.routes.auth import auth_error_response, auth_service, bearer_token
from app.schemas.python_validation import (
    PythonLabSolutionResponse,
    PythonValidationRequest,
    PythonValidationResponse,
)
from app.services.auth_service import AuthServiceError
from app.services.python_validation_service import (
    PythonValidationError,
    PythonValidationNotFoundError,
    PythonValidationService,
)

router = APIRouter(tags=["python-validation"])
service = PythonValidationService()


def require_authenticated_user(authorization: str | None) -> None:
    try:
        auth_service.get_profile(bearer_token(authorization))
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc


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
    require_authenticated_user(authorization)
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
def get_python_lab_solution(slug: str) -> PythonLabSolutionResponse:
    try:
        solution_code, explanation = service.get_solution(slug)
        return PythonLabSolutionResponse(
            slug=slug,
            solution_code=solution_code,
            explanation=explanation,
        )
    except PythonValidationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
