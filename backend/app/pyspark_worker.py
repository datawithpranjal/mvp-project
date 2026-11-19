"""Internal execution API; learner access is checked by the public backend."""

import hashlib
import hmac
import json
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, status

from app.schemas.pyspark_validation import PysparkValidationRequest, PysparkValidationResponse
from app.services.pyspark_specs import PYSPARK_SPECS
from app.services.pyspark_sandbox import CloudRunSandboxExecutor, sandbox_listener_quarantined
from app.services.pyspark_validation_service import (
    PysparkValidationConfigurationError,
    PysparkValidationError,
    PysparkValidationNotFoundError,
    PysparkValidationService,
)


app = FastAPI(title="PySpark execution worker", docs_url=None, redoc_url=None, openapi_url=None)
service = PysparkValidationService(sandbox_executor=CloudRunSandboxExecutor())
CATALOG_SHA256 = hashlib.sha256(
    json.dumps(sorted(PYSPARK_SPECS), separators=(",", ":")).encode("utf-8")
).hexdigest()


@app.get("/healthz")
@app.get("/api/healthz")
def healthcheck() -> dict[str, str | int]:
    return {
        "status": "ok",
        "runner_contract": "tdf-pyspark-worker-v1",
        "execution_backend": "cloud-run-sandbox-template",
        "admission_quarantined": sandbox_listener_quarantined(),
        "supported_lab_count": len(PYSPARK_SPECS),
        "catalog_sha256": CATALOG_SHA256,
    }


@app.post("/api/v1/pyspark/validate/{slug}", response_model=PysparkValidationResponse)
@app.post("/v1/pyspark/validate/{slug}", response_model=PysparkValidationResponse)
def validate_pyspark_submission(
    slug: str,
    payload: PysparkValidationRequest,
    x_runner_token: Annotated[str | None, Header()] = None,
) -> PysparkValidationResponse:
    settings = service.settings
    token = settings.pyspark_runner_token
    if (
        not settings.pyspark_execution_enabled
        or settings.pyspark_runner_url
        or not token
        or not token.strip()
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PySpark worker is not configured for authenticated local execution.",
        )
    if not x_runner_token or not hmac.compare_digest(
        x_runner_token.encode("utf-8"), token.encode("utf-8")
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
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except PysparkValidationError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
