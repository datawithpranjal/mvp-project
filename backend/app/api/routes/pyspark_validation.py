from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from app.api.routes.auth import auth_error_response, auth_service, bearer_token
from app.core.config import get_settings
from app.schemas.pyspark_validation import (
    PysparkValidationRequest,
    PysparkValidationResponse,
)
from app.services.pyspark_validation_service import (
    PysparkValidationConfigurationError,
    PysparkValidationError,
    PysparkValidationNotFoundError,
    PysparkValidationService,
)
from app.services.auth_service import AuthServiceError
from app.services.lab_access_service import pyspark_lab_requires_premium
from app.services.premium_access_service import PremiumAccessService, PremiumAccessServiceError
from app.services.pyspark_specs import PYSPARK_SPECS

router = APIRouter(tags=["pyspark-validation"])
service = PysparkValidationService()
premium_access_service = PremiumAccessService()


def require_pyspark_lab_access(slug: str, authorization: str | None) -> None:
    if slug not in PYSPARK_SPECS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This PySpark practice item does not have executable validation yet.",
        )
    if not pyspark_lab_requires_premium(slug):
        return
    try:
        profile = auth_service.get_profile(bearer_token(authorization))
        has_access = premium_access_service.has_access(profile.email)
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc
    except PremiumAccessServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Premium access could not be confirmed right now.",
        ) from exc
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium access is required for this PySpark lab.",
        )


@router.post(
    "/api/v1/pyspark/validate/{slug}",
    response_model=PysparkValidationResponse,
)
@router.post(
    "/v1/pyspark/validate/{slug}",
    response_model=PysparkValidationResponse,
)
def validate_pyspark_submission(
    slug: str,
    payload: PysparkValidationRequest,
    authorization: Annotated[str | None, Header()] = None,
    x_runner_token: Annotated[str | None, Header()] = None,
) -> PysparkValidationResponse:
    require_pyspark_lab_access(slug, authorization)
    settings = get_settings()
    if (
        settings.pyspark_execution_enabled
        and not settings.pyspark_runner_url
        and settings.pyspark_runner_token
        and x_runner_token != settings.pyspark_runner_token
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid PySpark runner token.",
        )

    try:
        return service.validate(slug=slug, code=payload.code, mode=payload.mode)
    except PysparkValidationNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PysparkValidationConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except PysparkValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
