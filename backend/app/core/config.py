from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEFAULT_POSTGRES_URL = "postgresql://postgres:postgres@postgres:5432/scenario_playground"


class Settings(BaseSettings):
    app_name: str = "Data Engineering Scenario Playground API"
    environment: str = "development"
    backend_cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    backend_cors_origin_regex: str | None = None
    admin_api_token: str | None = None
    auth_session_ttl_days: int = 30
    auth_otp_ttl_minutes: int = 10
    auth_show_debug_otp: bool = False
    auth_allow_demo_otp: bool = False
    resend_api_key: str | None = None
    otp_email_from: str = "Data Engineering Scenario Playground <onboarding@resend.dev>"
    frontend_base_url: str = "http://localhost:3000"
    google_oauth_client_id: str | None = None
    google_oauth_client_secret: str | None = None
    google_oauth_redirect_uri: str | None = None
    google_oauth_state_secret: str | None = None
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    ai_evaluation_provider: Literal["openai", "gemini"] = "openai"
    openai_api_key: str | None = None
    openai_model: str = "gpt-5.4-mini"
    openai_timeout_seconds: float = 25.0
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-pro"
    gemini_timeout_seconds: float = 30.0
    postgres_url: str = DEFAULT_POSTGRES_URL
    email_capture_store_path: str = "/tmp/data-engineering-scenario-playground-email-captures.jsonl"

    model_config = SettingsConfigDict(
        case_sensitive=False,
        env_prefix="",
        env_file=("../.env", ".env"),
        extra="ignore",
    )

    @field_validator("backend_cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        if not value:
            return ["http://localhost:3000"]
        return [origin.strip() for origin in value.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
