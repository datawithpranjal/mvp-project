from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def root() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "Data Engineering Scenario Playground API",
        "health": "/healthz",
        "scenarios": "/api/v1/scenarios",
    }


@router.get("/healthz")
@router.get("/api/healthz")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
