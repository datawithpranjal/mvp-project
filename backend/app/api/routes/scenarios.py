from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from app.api.errors import internal_service_error
from app.api.routes.auth import auth_error_response, bearer_token
from app.schemas.scenario import ScenarioDetail, ScenarioSummary
from app.services.auth_service import AuthService, AuthServiceError
from app.services.premium_access_service import PremiumAccessService, PremiumAccessServiceError
from app.services.validation_service import ScenarioNotFoundError, ValidationService

router = APIRouter(tags=["scenarios"])
validation_service = ValidationService()
auth_service = AuthService()
premium_access_service = PremiumAccessService()


@router.get("/api/v1/scenarios", response_model=list[ScenarioSummary])
@router.get("/v1/scenarios", response_model=list[ScenarioSummary])
def list_scenarios() -> list[ScenarioSummary]:
    return validation_service.list_scenarios()


@router.get("/api/v1/scenarios/{slug}", response_model=ScenarioDetail)
@router.get("/v1/scenarios/{slug}", response_model=ScenarioDetail)
def get_scenario(
    slug: str,
    authorization: Annotated[str | None, Header()] = None,
) -> ScenarioDetail:
    try:
        include_locked_content = not validation_service.scenario_requires_premium(
            slug
        ) or _has_premium_access(authorization)
        return validation_service.get_scenario_detail(
            slug,
            include_locked_content=include_locked_content,
        )
    except ScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc
    except PremiumAccessServiceError as exc:
        raise internal_service_error("Premium access is temporarily unavailable.", exc) from exc


def _has_premium_access(authorization: str | None) -> bool:
    if not authorization:
        return False

    profile = auth_service.get_profile(bearer_token(authorization))
    return premium_access_service.has_access(profile.email)
