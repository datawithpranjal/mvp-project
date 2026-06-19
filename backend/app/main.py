from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.api.routes.auth import router as auth_router
from app.api.routes.ai_evaluation import router as ai_evaluation_router
from app.api.routes.email_capture import router as email_capture_router
from app.api.routes.health import router as health_router
from app.api.routes.premium import router as premium_router
from app.api.routes.scenarios import router as scenarios_router
from app.api.routes.validation import router as validation_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
        )
        if request.url.scheme == "https":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_origin_regex=settings.backend_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(ai_evaluation_router)
app.include_router(email_capture_router)
app.include_router(premium_router)
app.include_router(scenarios_router)
app.include_router(validation_router)
