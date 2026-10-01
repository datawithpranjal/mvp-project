from typing import Annotated

from fastapi import APIRouter, Header, HTTPException

from app.schemas.learner_progress import (
    LearnerAttemptRequest,
    LearnerAttemptResponse,
    LearnerDraftRequest,
    LearnerDraftResponse,
    LearnerProgressListResponse,
)
from app.services.auth_service import AuthService, AuthServiceError, AuthUnauthorizedError
from app.services.learner_progress_store import LearnerProgressStore, LearnerProgressStoreError

router = APIRouter(tags=["learner-progress"])
auth_service = AuthService()
learner_progress_store = LearnerProgressStore()


def bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Invalid authorization header.")
    return token


def authenticated_user(authorization: str | None):
    try:
        return auth_service.get_profile(bearer_token(authorization))
    except AuthUnauthorizedError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except AuthServiceError as exc:
        raise HTTPException(status_code=503, detail=f"Authentication is temporarily unavailable. {exc}") from exc


@router.get("/api/v1/learner-progress", response_model=LearnerProgressListResponse)
@router.get("/v1/learner-progress", response_model=LearnerProgressListResponse)
def list_learner_progress(
    authorization: Annotated[str | None, Header()] = None,
) -> LearnerProgressListResponse:
    user = authenticated_user(authorization)
    try:
        return learner_progress_store.list_progress(user.id)
    except LearnerProgressStoreError as exc:
        raise HTTPException(status_code=503, detail="Learner progress is temporarily unavailable.") from exc


@router.put(
    "/api/v1/learner-progress/{content_type}/{content_id}/draft",
    response_model=LearnerDraftResponse,
)
@router.put("/v1/learner-progress/{content_type}/{content_id}/draft", response_model=LearnerDraftResponse)
def save_learner_draft(
    content_type: str,
    content_id: str,
    payload: LearnerDraftRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> LearnerDraftResponse:
    user = authenticated_user(authorization)
    try:
        item = learner_progress_store.save_draft(user.id, content_type, content_id, payload)
        return LearnerDraftResponse(item=item)
    except LearnerProgressStoreError as exc:
        raise HTTPException(status_code=503, detail="Learner draft could not be saved.") from exc


@router.post(
    "/api/v1/learner-progress/{content_type}/{content_id}/attempt",
    response_model=LearnerAttemptResponse,
)
@router.post("/v1/learner-progress/{content_type}/{content_id}/attempt", response_model=LearnerAttemptResponse)
def save_learner_attempt(
    content_type: str,
    content_id: str,
    payload: LearnerAttemptRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> LearnerAttemptResponse:
    user = authenticated_user(authorization)
    try:
        item, duplicate = learner_progress_store.record_attempt(
            user.id, content_type, content_id, payload
        )
        return LearnerAttemptResponse(item=item, duplicate=duplicate)
    except LearnerProgressStoreError as exc:
        raise HTTPException(status_code=503, detail="Learner attempt could not be saved.") from exc
