from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


PythonValidationMode = Literal["sample", "hidden"]


class PythonValidationRequest(BaseModel):
    code: str
    mode: PythonValidationMode = "sample"

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        code = value.strip()
        if not code:
            raise ValueError("Python code is required.")
        if len(code) > 8000:
            raise ValueError("Python code is too long for this practice runner.")
        return value


class PythonTestResult(BaseModel):
    name: str
    passed: bool
    message: str
    actual: Any = None
    expected: Any = None


class PythonValidationResponse(BaseModel):
    validation_type: Literal["PYTHON_OUTPUT_MATCH"] = "PYTHON_OUTPUT_MATCH"
    mode: PythonValidationMode
    passed: bool
    message: str
    tests: list[PythonTestResult] = Field(default_factory=list)
    execution_engine: Literal["subprocess"] = "subprocess"


class PythonLabSolutionResponse(BaseModel):
    slug: str
    solution_code: str
    explanation: str
