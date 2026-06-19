import secrets
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, status

from app.api.routes.auth import auth_error_response, bearer_token
from app.schemas.ai_evaluation import (
    AiEvaluationRequest,
    AiEvaluationResponse,
    AiEvaluationStatusResponse,
    AiRubricWeights,
    AiScenarioContext,
)
from app.core.config import get_settings
from app.services.ai_evaluation_service import (
    AiEvaluationConfigurationError,
    AiEvaluationError,
    AiEvaluationRateLimitError,
    OpenAIEvaluationService,
)
from app.services.auth_service import AuthService, AuthServiceError
from app.services.premium_access_service import PremiumAccessService, PremiumAccessServiceError
from app.services.scenario_loader import ScenarioLoader, ScenarioNotFoundError

router = APIRouter(tags=["ai-evaluation"])
auth_service = AuthService()
premium_access_service = PremiumAccessService()
scenario_loader = ScenarioLoader()
ai_evaluation_service = OpenAIEvaluationService()
settings = get_settings()


@router.get(
    "/api/v1/admin/ai/status",
    response_model=AiEvaluationStatusResponse,
)
@router.get(
    "/v1/admin/ai/status",
    response_model=AiEvaluationStatusResponse,
)
def ai_evaluation_status(
    x_admin_token: Annotated[str | None, Header()] = None,
) -> AiEvaluationStatusResponse:
    if not settings.admin_api_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin AI diagnostics are not configured.",
        )
    if not x_admin_token or not secrets.compare_digest(
        x_admin_token,
        settings.admin_api_token,
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin token.",
        )
    return AiEvaluationStatusResponse(
        configured=bool(settings.openai_api_key),
        model=settings.openai_model,
    )


@router.post(
    "/api/v1/ai/evaluate-scenario",
    response_model=AiEvaluationResponse,
)
@router.post(
    "/v1/ai/evaluate-scenario",
    response_model=AiEvaluationResponse,
)
def evaluate_scenario_answer(
    payload: AiEvaluationRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> AiEvaluationResponse:
    try:
        profile = auth_service.get_profile(bearer_token(authorization))
        context = _trusted_context(payload, profile.email)
        return ai_evaluation_service.evaluate(context, payload.user_answer)
    except AuthServiceError as exc:
        raise auth_error_response(exc) from exc
    except PremiumAccessServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Premium access could not be checked right now.",
        ) from exc
    except AiEvaluationConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except AiEvaluationRateLimitError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except AiEvaluationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc


def _trusted_context(payload: AiEvaluationRequest, email: str) -> AiScenarioContext:
    try:
        scenario = scenario_loader.get_scenario(payload.scenario_slug)
    except ScenarioNotFoundError:
        if payload.context is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scenario evaluation context was not found.",
            )
        return payload.context

    if scenario.access_tier == "premium" and not premium_access_service.has_access(email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium access is required for AI evaluation of this scenario.",
        )

    client_context = payload.context
    return AiScenarioContext(
        title=scenario.title,
        domain=scenario.section,
        scenario_type=scenario.validation_type,
        business_context=scenario.business_context,
        problem_statement=scenario.problem_statement,
        requirement=scenario.student_task,
        broken_code=scenario.broken_code,
        actual_output="\n".join(scenario.production_logs),
        expected_output=scenario.validation_logic or scenario.submission_instructions,
        model_solution=scenario.solution_answer,
        production_explanation=scenario.explanation,
        common_mistakes=scenario.common_mistakes[:10],
        follow_ups=client_context.follow_ups[:6] if client_context else [],
        rubric=client_context.rubric if client_context else AiRubricWeights(),
    )
