from __future__ import annotations

import re

import duckdb

from app.schemas.scenario import ScenarioDefinition, ScenarioDetail, ScenarioSummary
from app.schemas.validation import QueryResult, ValidationResponse
from app.services.duckdb_runner import DuckDBRunner
from app.services.scenario_loader import ScenarioLoader, ScenarioNotFoundError

DISALLOWED_SQL_PATTERN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|replace|truncate|copy|attach|detach|merge|call)\b",
    flags=re.IGNORECASE,
)


class ValidationService:
    def __init__(
        self,
        scenario_loader: ScenarioLoader | None = None,
        duckdb_runner: DuckDBRunner | None = None,
    ) -> None:
        self.scenario_loader = scenario_loader or ScenarioLoader()
        self.duckdb_runner = duckdb_runner or DuckDBRunner()

    def list_scenarios(self) -> list[ScenarioSummary]:
        return self.scenario_loader.list_scenarios()

    def get_scenario_detail(self, slug: str) -> ScenarioDetail:
        scenario = self.scenario_loader.get_scenario(slug)
        tables = scenario.tables
        expected_output: QueryResult | None = None

        if scenario.validation_type == "SQL_OUTPUT_MATCH":
            connection = self._prepare_connection_for_scenario(scenario)
            try:
                if scenario.table_names:
                    tables = [
                        self.duckdb_runner.preview_table(connection, table_name)
                        for table_name in scenario.table_names
                    ]
                expected_output = self.duckdb_runner.execute_query(
                    connection,
                    scenario.solution_query or scenario.solution_answer,
                )
            finally:
                connection.close()

        return ScenarioDetail(
            slug=scenario.slug,
            title=scenario.title,
            difficulty=scenario.difficulty,
            section=scenario.section,
            short_description=scenario.short_description,
            access_tier=scenario.access_tier,
            topics=scenario.topics,
            validation_type=scenario.validation_type,
            business_context=scenario.business_context,
            problem_statement=scenario.problem_statement,
            student_task=scenario.student_task,
            learning_objectives=scenario.learning_objectives,
            tables=tables,
            broken_code=scenario.broken_code,
            production_logs=scenario.production_logs,
            expected_output=expected_output,
            submission_instructions=scenario.submission_instructions,
            validation_logic=scenario.validation_logic,
            solution_answer=scenario.solution_answer,
            explanation=scenario.explanation,
            common_mistakes=scenario.common_mistakes,
            hints=scenario.hints,
            rubric=scenario.rubric,
        )

    def validate_submission(self, slug: str, answer: str) -> ValidationResponse:
        scenario = self.scenario_loader.get_scenario(slug)

        if scenario.validation_type != "SQL_OUTPUT_MATCH":
            return ValidationResponse(
                validation_type=scenario.validation_type,
                passed=None,
                message=self._rubric_submission_message(scenario.validation_type),
                actual_output=None,
                expected_output=None,
                explanation=scenario.explanation,
                solution_answer=scenario.solution_answer,
                rubric=self._serialize_rubric(scenario.rubric),
            )

        connection = self._prepare_connection_for_scenario(scenario)

        try:
            expected_output = self.duckdb_runner.execute_query(
                connection,
                scenario.solution_query or scenario.solution_answer,
            )
            read_only_error = self._validate_read_only_sql(answer)
            if read_only_error:
                return ValidationResponse(
                    validation_type=scenario.validation_type,
                    passed=False,
                    message=read_only_error,
                    actual_output=None,
                    expected_output=expected_output,
                    explanation=scenario.explanation,
                    solution_answer=scenario.solution_answer,
                    rubric=self._serialize_rubric(scenario.rubric),
                )

            actual_output = self.duckdb_runner.execute_query(connection, answer)
            passed = self.duckdb_runner.results_match(actual_output, expected_output)
            message = (
                "Pass: your query matches the expected output for this scenario."
                if passed
                else "Fail: your query does not match the expected output for this scenario."
            )
            return ValidationResponse(
                validation_type=scenario.validation_type,
                passed=passed,
                message=message,
                actual_output=actual_output,
                expected_output=expected_output,
                explanation=scenario.explanation,
                solution_answer=scenario.solution_answer,
                rubric=self._serialize_rubric(scenario.rubric),
            )
        except duckdb.Error as exc:
            return ValidationResponse(
                validation_type=scenario.validation_type,
                passed=False,
                message=f"Your SQL could not be executed: {exc}",
                actual_output=None,
                expected_output=expected_output if "expected_output" in locals() else QueryResult(),
                explanation=scenario.explanation,
                solution_answer=scenario.solution_answer,
                rubric=self._serialize_rubric(scenario.rubric),
            )
        finally:
            connection.close()

    def _validate_read_only_sql(self, sql: str) -> str | None:
        normalized_sql = self.duckdb_runner.normalize_query(self._strip_comments(sql))
        lowered = normalized_sql.lower()

        if not lowered.startswith(("select", "with")):
            return "Only read-only SELECT or WITH queries are allowed in this playground."

        if ";" in normalized_sql:
            return "Please submit a single query only."

        sanitized_sql = self._strip_string_literals(lowered)
        if DISALLOWED_SQL_PATTERN.search(sanitized_sql):
            return "Only read-only SELECT or WITH queries are allowed in this playground."

        return None

    def _strip_comments(self, sql: str) -> str:
        without_line_comments = re.sub(r"--.*?$", "", sql, flags=re.MULTILINE)
        without_block_comments = re.sub(r"/\*.*?\*/", "", without_line_comments, flags=re.DOTALL)
        return without_block_comments.strip()

    def _strip_string_literals(self, sql: str) -> str:
        return re.sub(r"'(?:''|[^'])*'", "''", sql)

    def _prepare_connection_for_scenario(
        self, scenario: ScenarioDefinition
    ) -> duckdb.DuckDBPyConnection:
        if scenario.setup_sql:
            return self.duckdb_runner.prepare_connection(scenario.setup_sql)
        return self.duckdb_runner.prepare_connection_from_tables(scenario.tables)

    def _rubric_submission_message(self, validation_type: str) -> str:
        if validation_type == "DEBUG_RUBRIC":
            return "Submission recorded. Compare your debugging approach against the rubric and model answer."
        if validation_type == "CODE_REVIEW_RUBRIC":
            return "Submission recorded. Review your code feedback against the rubric and model answer."
        return "Submission recorded. Compare your answer against the rubric and model answer."

    def _serialize_rubric(self, rubric: list) -> list[dict[str, object]]:
        return [item.model_dump() for item in rubric]


__all__ = ["ScenarioNotFoundError", "ValidationService"]
