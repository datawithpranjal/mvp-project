from functools import lru_cache
from typing import Annotated

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
    postgres_url: str = DEFAULT_POSTGRES_URL
    email_capture_store_path: str = "/tmp/data-engineering-scenario-playground-email-captures.jsonl"

    model_config = SettingsConfigDict(
        case_sensitive=False,
        env_prefix="",
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
