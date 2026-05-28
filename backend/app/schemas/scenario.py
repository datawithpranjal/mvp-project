from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.validation import QueryResult

AccessTier = Literal["free", "premium"]
ValidationType = Literal[
    "SQL_OUTPUT_MATCH",
    "DEBUG_RUBRIC",
    "DESIGN_RUBRIC",
    "CODE_REVIEW_RUBRIC",
]


class ScenarioSummary(BaseModel):
    slug: str
    title: str
    difficulty: str
    section: str
    short_description: str
    access_tier: AccessTier = "free"
    topics: list[str] = Field(default_factory=list)
    validation_type: ValidationType = "SQL_OUTPUT_MATCH"


class RubricItem(BaseModel):
    point: str
    weight: int


class ScenarioDefinition(ScenarioSummary):
    id: str
    business_context: str
    problem_statement: str
    student_task: str
    learning_objectives: list[str] = Field(default_factory=list)
    broken_code: str
    production_logs: list[str] = Field(default_factory=list)
    submission_instructions: str
    explanation: str
    common_mistakes: list[str] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)
    validation_logic: str | None = None
    tables: list["TablePreview"] = Field(default_factory=list)
    rubric: list[RubricItem] = Field(default_factory=list)
    solution_answer: str
    setup_sql: str | None = None
    solution_query: str | None = None
    table_names: list[str] = Field(default_factory=list)


class TablePreview(BaseModel):
    name: str
    columns: list[str] = Field(default_factory=list)
    rows: list[list[Any]] = Field(default_factory=list)


class ScenarioDetail(BaseModel):
    slug: str
    title: str
    difficulty: str
    section: str
    short_description: str
    access_tier: AccessTier = "free"
    topics: list[str] = Field(default_factory=list)
    validation_type: ValidationType = "SQL_OUTPUT_MATCH"
    business_context: str
    problem_statement: str
    student_task: str
    learning_objectives: list[str] = Field(default_factory=list)
    tables: list[TablePreview] = Field(default_factory=list)
    broken_code: str
    production_logs: list[str] = Field(default_factory=list)
    expected_output: QueryResult | None = None
    submission_instructions: str
    validation_logic: str | None = None
    solution_answer: str
    explanation: str
    common_mistakes: list[str] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)
    rubric: list[RubricItem] = Field(default_factory=list)
