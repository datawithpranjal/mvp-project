from fastapi import HTTPException

from app.core.config import get_settings


def internal_service_error(public_message: str, exc: Exception) -> HTTPException:
    settings = get_settings()
    detail = f"{public_message} {exc}" if settings.expose_internal_errors else public_message
    return HTTPException(status_code=500, detail=detail)
