from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.validation import QueryResult


PysparkValidationMode = Literal["sample", "hidden"]


class PysparkValidationRequest(BaseModel):
    code: str
    mode: PysparkValidationMode = "sample"

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        code = value.strip()
        if not code:
            raise ValueError("PySpark code is required.")
        if len(code) > 8000:
            raise ValueError("PySpark code is too long for this practice runner.")
        return value


class PysparkTestResult(BaseModel):
    name: str
    passed: bool
    message: str
    actual_output: QueryResult | None = None
    expected_output: QueryResult | None = None


class PysparkValidationResponse(BaseModel):
    validation_type: Literal["PYSPARK_OUTPUT_MATCH"] = "PYSPARK_OUTPUT_MATCH"
    mode: PysparkValidationMode
    passed: bool
    message: str
    tests: list[PysparkTestResult] = Field(default_factory=list)
    execution_engine: Literal["remote", "local"]
