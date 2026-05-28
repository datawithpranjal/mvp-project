from fastapi import APIRouter

router = APIRouter()


@router.get("/healthz")
@router.get("/api/healthz")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
