from app.api.routes.email_capture import router as email_capture_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.health import router as health_router
from app.api.routes.scenarios import router as scenarios_router
from app.api.routes.validation import router as validation_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_origin_regex=settings.backend_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(email_capture_router)
app.include_router(scenarios_router)
app.include_router(validation_router)
