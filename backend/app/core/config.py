from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
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
    reporting_api_token: str | None = None
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
    google_oauth_frontend_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
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
    feedback_store_path: str = "/tmp/data-foundry-product-feedback.jsonl"
    usage_store_path: str = "/tmp/data-foundry-usage-events.jsonl"
    learner_progress_store_path: str = "/tmp/data-foundry-learner-progress.json"
    content_audit_store_path: str = "/tmp/data-foundry-content-audits.json"
    pyspark_runner_url: str | None = None
    pyspark_runner_token: str | None = None
    pyspark_execution_enabled: bool = False
    pyspark_timeout_seconds: float = 25.0

    model_config = SettingsConfigDict(
        case_sensitive=False,
        env_prefix="",
        env_file=("../.env", ".env"),
        extra="ignore",
    )

    @model_validator(mode="after")
    def separate_reporting_credential(self):
        if self.reporting_api_token and self.reporting_api_token == self.admin_api_token:
            raise ValueError("REPORTING_API_TOKEN must differ from ADMIN_API_TOKEN.")
        return self

    @field_validator("backend_cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        if not value:
            return ["http://localhost:3000"]
        return [origin.strip() for origin in value.split(",") if origin.strip()]

    @field_validator("google_oauth_frontend_origins", mode="before")
    @classmethod
    def parse_google_frontend_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        return [origin.strip() for origin in value.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
