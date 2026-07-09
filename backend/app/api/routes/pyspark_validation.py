from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

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

router = APIRouter(tags=["pyspark-validation"])
service = PysparkValidationService()


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
    x_runner_token: Annotated[str | None, Header()] = None,
) -> PysparkValidationResponse:
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
