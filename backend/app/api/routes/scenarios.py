from fastapi import APIRouter, HTTPException, status

from app.schemas.scenario import ScenarioDetail, ScenarioSummary
from app.services.validation_service import ScenarioNotFoundError, ValidationService

router = APIRouter(tags=["scenarios"])
validation_service = ValidationService()


@router.get("/api/v1/scenarios", response_model=list[ScenarioSummary])
@router.get("/v1/scenarios", response_model=list[ScenarioSummary])
def list_scenarios() -> list[ScenarioSummary]:
    return validation_service.list_scenarios()


@router.get("/api/v1/scenarios/{slug}", response_model=ScenarioDetail)
@router.get("/v1/scenarios/{slug}", response_model=ScenarioDetail)
def get_scenario(slug: str) -> ScenarioDetail:
    try:
        return validation_service.get_scenario_detail(slug)
    except ScenarioNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
