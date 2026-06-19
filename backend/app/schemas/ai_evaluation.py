from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AiRubricWeights(BaseModel):
    root_cause: int = Field(default=25, ge=0, le=100)
    correctness: int = Field(default=25, ge=0, le=100)
    production_thinking: int = Field(default=20, ge=0, le=100)
    tradeoffs: int = Field(default=15, ge=0, le=100)
    communication: int = Field(default=15, ge=0, le=100)

    @model_validator(mode="after")
    def validate_total(self) -> "AiRubricWeights":
        if sum(self.model_dump().values()) != 100:
            raise ValueError("AI evaluation rubric weights must total 100.")
        return self


class AiScenarioContext(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    domain: str = Field(default="mixed", max_length=80)
    scenario_type: str = Field(default="mixed_lab", max_length=80)
    business_context: str = Field(default="", max_length=5000)
    problem_statement: str = Field(min_length=1, max_length=7000)
    requirement: str = Field(default="", max_length=5000)
    broken_code: str = Field(default="", max_length=12000)
    actual_output: str = Field(default="", max_length=5000)
    expected_output: str = Field(default="", max_length=5000)
    model_solution: str = Field(default="", max_length=12000)
    production_explanation: str = Field(default="", max_length=10000)
    common_mistakes: list[str] = Field(default_factory=list, max_length=10)
    follow_ups: list[str] = Field(default_factory=list, max_length=6)
    rubric: AiRubricWeights = Field(default_factory=AiRubricWeights)


class AiEvaluationRequest(BaseModel):
    scenario_slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=180)
    user_answer: str = Field(min_length=1, max_length=24000)
    context: AiScenarioContext | None = None


class AiRubricBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    root_cause: int = Field(ge=0, le=100)
    correctness: int = Field(ge=0, le=100)
    production_thinking: int = Field(ge=0, le=100)
    tradeoffs: int = Field(ge=0, le=100)
    communication: int = Field(ge=0, le=100)


class AiEvaluationModelOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strengths: list[str] = Field(max_length=5)
    gaps: list[str] = Field(max_length=5)
    improved_answer: str = Field(min_length=1, max_length=3000)
    follow_up_questions: list[str] = Field(max_length=3)
    rubric_breakdown: AiRubricBreakdown


class AiEvaluationResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    verdict: Literal["weak", "partial", "good", "strong"]
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    improved_answer: str
    follow_up_questions: list[str] = Field(default_factory=list)
    rubric_breakdown: AiRubricBreakdown
    mode: Literal["openai"] = "openai"
    model: str


class AiEvaluationStatusResponse(BaseModel):
    configured: bool
    model: str
