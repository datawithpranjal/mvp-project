from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path

from app.schemas.scenario import RubricItem, ScenarioDefinition, ScenarioSummary, TablePreview

PRIMARY_TOPIC_TAGS = {"SQL", "Spark", "Airflow", "Kafka", "Lakehouse", "Data Quality"}


class ScenarioNotFoundError(Exception):
    pass


class ScenarioLoader:
    def __init__(self, scenarios_dir: Path | None = None) -> None:
        self.scenarios_dir = scenarios_dir or Path(__file__).resolve().parent.parent / "scenarios"

    def list_scenarios(self) -> list[ScenarioSummary]:
        scenarios = [
            ScenarioSummary(
                slug=scenario.slug,
                title=scenario.title,
                difficulty=scenario.difficulty,
                section=scenario.section,
                short_description=scenario.short_description,
                access_tier=scenario.access_tier,
                topics=scenario.topics,
                validation_type=scenario.validation_type,
            )
            for scenario in self._load_all().values()
        ]
        return sorted(scenarios, key=lambda scenario: scenario.title.lower())

    def get_scenario(self, slug: str) -> ScenarioDefinition:
        scenario = self._load_all().get(slug)
        if scenario is None:
            raise ScenarioNotFoundError(f"Scenario '{slug}' was not found.")
        return scenario

    @lru_cache(maxsize=1)
    def _load_all(self) -> dict[str, ScenarioDefinition]:
        loaded: dict[str, ScenarioDefinition] = {}

        for scenario_path in sorted(self.scenarios_dir.glob("*.json")):
            scenario = self._load_json_scenario(scenario_path)
            loaded[scenario.slug] = scenario

        for scenario_dir in sorted(path for path in self.scenarios_dir.iterdir() if path.is_dir()):
            manifest_path = scenario_dir / "scenario.json"
            setup_path = scenario_dir / "setup.sql"
            expected_path = scenario_dir / "expected.sql"

            manifest = json.loads(manifest_path.read_text())
            topics = self._normalize_topic_tags(
                manifest.get("topics", []),
                manifest.get("section"),
            )
            scenario = ScenarioDefinition(
                id=manifest.get("slug", scenario_dir.name),
                slug=manifest["slug"],
                title=manifest["title"],
                difficulty=self._normalize_difficulty(manifest["difficulty"]),
                section=manifest.get("section") or self._derive_section(topics),
                short_description=manifest["short_description"],
                access_tier=manifest.get("access_tier", "free"),
                topics=topics,
                validation_type="SQL_OUTPUT_MATCH",
                business_context=manifest["business_context"],
                problem_statement=manifest["problem_statement"],
                student_task=manifest["student_task"],
                learning_objectives=manifest.get("learning_objectives", []),
                broken_code=manifest["broken_pipeline_sql"],
                production_logs=manifest.get("production_logs", []),
                submission_instructions=manifest.get(
                    "submission_instructions",
                    "Submit your answer to validate it against the expected scenario output.",
                ),
                explanation=manifest["explanation"],
                common_mistakes=manifest.get("common_mistakes", []),
                hints=manifest.get("hints", []),
                validation_logic=manifest.get("validation_logic"),
                tables=[],
                rubric=[],
                solution_answer=expected_path.read_text(),
                setup_sql=setup_path.read_text(),
                solution_query=expected_path.read_text(),
                table_names=manifest.get("table_names", []),
            )
            loaded[scenario.slug] = scenario

        return loaded

    def _load_json_scenario(self, scenario_path: Path) -> ScenarioDefinition:
        manifest = json.loads(scenario_path.read_text())
        topics = self._normalize_topic_tags(
            manifest.get("topic_tags", []),
            manifest.get("section"),
        )
        tables = [
            TablePreview(
                name=table["name"],
                columns=table.get("columns", []),
                rows=table.get("rows", []),
            )
            for table in manifest.get("sample_tables", [])
        ]
        rubric = [
            RubricItem(point=item["point"], weight=item["weight"])
            for item in manifest.get("rubric", [])
        ]
        validation_type = manifest.get("validation_type", "SQL_OUTPUT_MATCH")
        submission_instructions = manifest.get("submission_instructions")
        if not submission_instructions:
            if validation_type == "SQL_OUTPUT_MATCH":
                submission_instructions = (
                    "Write a single read-only SQL query that returns the expected result."
                )
            else:
                submission_instructions = (
                    "Write your answer in the text area, then compare it against the model answer "
                    "and rubric after submission."
                )

        return ScenarioDefinition(
            id=manifest.get("id", manifest["slug"]),
            slug=manifest["slug"],
            title=manifest["title"],
            difficulty=self._normalize_difficulty(manifest["difficulty"]),
            section=manifest.get("section") or self._derive_section(topics),
            short_description=manifest["short_description"],
            access_tier=manifest.get("access_tier", "premium"),
            topics=topics,
            validation_type=validation_type,
            business_context=manifest["business_context"],
            problem_statement=manifest["problem_statement"],
            student_task=manifest["student_task"],
            learning_objectives=manifest.get("learning_goals", []),
            broken_code=manifest.get("broken_code", ""),
            production_logs=manifest.get("production_logs", []),
            submission_instructions=submission_instructions,
            explanation=manifest["explanation"],
            common_mistakes=manifest.get("common_mistakes", []),
            hints=manifest.get("hints", []),
            validation_logic=manifest.get("validation_logic"),
            tables=tables,
            rubric=rubric,
            solution_answer=manifest.get("solution_query", ""),
            solution_query=manifest.get("solution_query"),
            table_names=[],
        )

    def _normalize_difficulty(self, difficulty: str) -> str:
        normalized = difficulty.strip().lower()
        return normalized.capitalize() if normalized else "Beginner"

    def _normalize_topic_tags(self, tags: list[str], section: str | None) -> list[str]:
        normalized_tags = [tag.strip() for tag in tags if tag and tag.strip()]
        if section and section not in normalized_tags:
            normalized_tags.insert(0, section)

        deduped_tags: list[str] = []
        for tag in normalized_tags:
            if tag not in deduped_tags:
                deduped_tags.append(tag)

        return deduped_tags

    def _derive_section(self, tags: list[str]) -> str:
        for tag in tags:
            if tag in PRIMARY_TOPIC_TAGS:
                return tag
        return "SQL"
