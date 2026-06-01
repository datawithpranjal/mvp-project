from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from app.api.routes.auth import bearer_token
from app.schemas.validation import ValidationRequest, ValidationResponse
from app.services.auth_service import AuthService, AuthServiceError
from app.services.premium_access_service import PremiumAccessService, PremiumAccessServiceError
from app.services.validation_service import ScenarioNotFoundError, ValidationService

router = APIRouter(tags=["validation"])
validation_service = ValidationService()
auth_service = AuthService()
premium_access_service = PremiumAccessService()


@router.post("/api/v1/scenarios/{slug}/validate", response_model=ValidationResponse)
@router.post("/v1/scenarios/{slug}/validate", response_model=ValidationResponse)
def validate_submission(
    slug: str,
    payload: ValidationRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> ValidationResponse:
    try:
        if validation_service.scenario_requires_premium(slug) and not _has_premium_access(
            authorization
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Premium access is required to validate this scenario.",
            )
        return validation_service.validate_submission(slug=slug, answer=payload.answer)
    except ScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except (AuthServiceError, PremiumAccessServiceError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc


def _has_premium_access(authorization: str | None) -> bool:
    if not authorization:
        return False

    profile = auth_service.get_profile(bearer_token(authorization))
    return premium_access_service.has_access(profile.email)
