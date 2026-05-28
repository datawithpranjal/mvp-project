from fastapi import APIRouter, HTTPException, status

from app.schemas.validation import ValidationRequest, ValidationResponse
from app.services.validation_service import ScenarioNotFoundError, ValidationService

router = APIRouter(prefix="/api/v1/scenarios", tags=["validation"])
validation_service = ValidationService()


@router.post("/{slug}/validate", response_model=ValidationResponse)
def validate_submission(slug: str, payload: ValidationRequest) -> ValidationResponse:
    try:
        return validation_service.validate_submission(slug=slug, answer=payload.answer)
    except ScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
