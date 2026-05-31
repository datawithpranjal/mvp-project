from typing import Any
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ValidationType = Literal[
    "SQL_OUTPUT_MATCH",
    "DEBUG_RUBRIC",
    "DESIGN_RUBRIC",
    "CODE_REVIEW_RUBRIC",
]


class QueryResult(BaseModel):
    columns: list[str] = Field(default_factory=list)
    column_types: list[str] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)


class RubricItem(BaseModel):
    point: str
    weight: int


class ValidationRequest(BaseModel):
    answer: str = Field(max_length=20000)

    @field_validator("answer")
    @classmethod
    def validate_answer(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("An answer is required.")
        return value


class ValidationResponse(BaseModel):
    validation_type: ValidationType
    passed: bool | None = None
    message: str
    actual_output: QueryResult | None = None
    expected_output: QueryResult | None = None
    explanation: str
    solution_answer: str
    rubric: list[RubricItem] = Field(default_factory=list)
