from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from uuid import uuid4

from app.core.config import DEFAULT_POSTGRES_URL, get_settings
from app.schemas.content_audit import (
    AuditIssueStatus,
    ContentAuditBulkResponse,
    ContentAuditDetailResponse,
    ContentAuditIssue,
    ContentAuditItem,
    ContentAuditRun,
    ContentAuditSummaryResponse,
)
from app.services.scenario_loader import ScenarioLoader


class ContentAuditError(RuntimeError):
    pass


class ContentAuditService:
    def __init__(
        self,
        storage_path: Path | None = None,
        postgres_url: str | None = None,
    ) -> None:
        settings = get_settings()
        self.storage_path = storage_path or Path(settings.content_audit_store_path)
        configured_url = postgres_url if postgres_url is not None else settings.postgres_url
        self.postgres_url = self._active_postgres_url(configured_url)

    def audit_item(self, item: ContentAuditItem) -> ContentAuditDetailResponse:
        run, issues = self._evaluate_item(item)
        if self.postgres_url:
            self._store_postgres(run, issues)
            return ContentAuditDetailResponse(
                storage_backend="postgres",
                table_exists=True,
                run=run,
                issues=issues,
            )

        self._store_file(run, issues)
        return ContentAuditDetailResponse(
            storage_backend="file",
            table_exists=True,
            run=run,
            issues=issues,
        )

    def audit_items(self, items: list[ContentAuditItem]) -> ContentAuditBulkResponse:
        runs: list[ContentAuditRun] = []
        errors: list[str] = []
        for item in items:
            try:
                detail = self.audit_item(item)
                if detail.run:
                    runs.append(detail.run)
            except Exception as exc:  # noqa: BLE001 - admin report should keep auditing the rest.
                errors.append(f"{item.content_id}: {exc}")
        return ContentAuditBulkResponse(
            audited=len(runs),
            failed=len(errors),
            items=runs,
            errors=errors,
        )

    def audit_backend_catalog(self) -> ContentAuditBulkResponse:
        loader = ScenarioLoader()
        items: list[ContentAuditItem] = []
        for summary in loader.list_scenarios():
            scenario = loader.get_scenario(summary.slug)
            items.append(
                ContentAuditItem(
                    content_id=f"backend-scenario--{scenario.slug}",
                    content_type="backend_scenario",
                    title=scenario.title,
                    slug=scenario.slug,
                    topic=scenario.section,
                    difficulty=scenario.difficulty,
                    tags=scenario.topics,
                    problem_statement=scenario.problem_statement,
                    expected_output=scenario.solution_answer
                    if scenario.validation_type == "SQL_OUTPUT_MATCH"
                    else scenario.submission_instructions,
                    solution=scenario.solution_answer,
                    explanation=scenario.explanation,
                    body="\n\n".join(
                        [
                            scenario.business_context,
                            scenario.problem_statement,
                            scenario.student_task,
                            scenario.broken_code,
                            scenario.explanation,
                        ]
                    ),
                    prerequisites=scenario.learning_objectives,
                    estimated_minutes=None,
                    metadata={
                        "validation_type": scenario.validation_type,
                        "source": "backend_scenarios",
                    },
                )
            )
        return self.audit_items(items)

    def list_latest(self) -> ContentAuditSummaryResponse:
        if self.postgres_url:
            return self._list_latest_postgres()
        return self._list_latest_file()

    def get_latest_detail(self, content_id: str) -> ContentAuditDetailResponse:
        if self.postgres_url:
            return self._get_latest_detail_postgres(content_id)
        return self._get_latest_detail_file(content_id)

    def update_issue_status(
        self,
        content_id: str,
        issue_id: str,
        status: AuditIssueStatus,
    ) -> ContentAuditDetailResponse:
        if self.postgres_url:
            return self._update_issue_status_postgres(content_id, issue_id, status)
        return self._update_issue_status_file(content_id, issue_id, status)

    def _evaluate_item(
        self,
        item: ContentAuditItem,
    ) -> tuple[ContentAuditRun, list[ContentAuditIssue]]:
        now = datetime.now(timezone.utc)
        run_id = str(uuid4())
        issue_specs: list[tuple[str, str, str, str]] = []

        def add(severity: str, category: str, issue: str, suggestion: str) -> None:
            issue_specs.append((severity, category, issue, suggestion))

        title = (item.title or "").strip()
        slug = (item.slug or "").strip()
        topic = (item.topic or "").strip()
        difficulty = (item.difficulty or "").strip()
        problem_statement = (item.problem_statement or "").strip()
        expected_output = (item.expected_output or "").strip()
        solution = (item.solution or "").strip()
        explanation = (item.explanation or "").strip()
        body = self._content_body(item)

        if not title:
            add("critical", "metadata", "Missing title.", "Add a clear, specific learner-facing title.")
        if not slug:
            add("critical", "metadata", "Missing slug.", "Add a stable kebab-case slug for routing and tracking.")
        if not topic:
            add("warning", "metadata", "Missing topic.", "Assign a topic such as SQL, PySpark, Airflow, AWS, or Modeling.")
        if not difficulty:
            add("warning", "metadata", "Missing difficulty.", "Set beginner, intermediate, or advanced.")
        if not item.tags:
            add("warning", "metadata", "Missing tags.", "Add 2-6 skill tags so search and recommendations work.")
        if not problem_statement:
            add("critical", "content", "Missing problem statement.", "Explain the learner's task and production context.")
        if self._requires_expected_output(item) and not expected_output:
            add(
                "critical",
                "validation",
                "Missing expected output for a SQL/PySpark problem.",
                "Add expected rows, output schema, or behavior so validation and review are possible.",
            )
        if not solution:
            add("critical", "solution", "Missing solution.", "Add the model solution or reference answer.")
        if not explanation:
            add(
                "warning",
                "explanation",
                "Missing explanation.",
                "Explain why the solution works, edge cases, and common production mistakes.",
            )
        if len(body) < 300:
            add(
                "warning",
                "depth",
                "Content body is too short.",
                "Add business context, sample data or logs, constraints, and expected learner output.",
            )
        if self._title_is_generic(title):
            add(
                "suggestion",
                "metadata",
                "Title is too generic.",
                "Rename it with the production symptom or exact skill being tested.",
            )
        if not item.internal_links:
            add(
                "suggestion",
                "navigation",
                "Missing internal links.",
                "Link to a related lab, roadmap step, scenario, or project mission.",
            )
        if not item.prerequisites:
            add(
                "suggestion",
                "learning_design",
                "Missing prerequisites.",
                "Add prerequisites so beginners know what to review first.",
            )
        if item.estimated_minutes is None or item.estimated_minutes <= 0:
            add(
                "warning",
                "learning_design",
                "Missing estimated time.",
                "Add estimated_minutes so learners can choose practice by available time.",
            )

        issue_counts = {"critical": 0, "warning": 0, "suggestion": 0}
        for severity, _, _, _ in issue_specs:
            issue_counts[severity] += 1

        audit_score = self._score(issue_counts)
        content_hash = self._hash_item(item)
        issues = [
            ContentAuditIssue(
                id=str(uuid4()),
                run_id=run_id,
                content_id=item.content_id,
                severity=severity,  # type: ignore[arg-type]
                category=category,
                issue=issue,
                suggestion=suggestion,
                status="open",
                created_at=now.isoformat(),
                updated_at=now.isoformat(),
            )
            for severity, category, issue, suggestion in issue_specs
        ]
        run = ContentAuditRun(
            id=run_id,
            content_id=item.content_id,
            content_type=item.content_type,
            title=title or "Untitled content",
            slug=slug or item.content_id,
            topic=topic or "Unassigned",
            difficulty=difficulty or "Unassigned",
            tags=item.tags,
            audit_score=audit_score,
            issue_counts=issue_counts,
            content_hash=content_hash,
            audited_at=now.isoformat(),
            source_updated_at=item.updated_at,
        )
        return run, issues

    @staticmethod
    def _requires_expected_output(item: ContentAuditItem) -> bool:
        haystack = " ".join(
            [
                item.content_type,
                item.topic or "",
                item.slug or "",
                " ".join(item.tags),
            ]
        ).lower()
        return "sql" in haystack or "pyspark" in haystack or "spark" in haystack

    @staticmethod
    def _title_is_generic(title: str) -> bool:
        normalized = title.strip().lower()
        generic_titles = {
            "sql problem",
            "python problem",
            "pyspark problem",
            "data engineering question",
            "practice problem",
            "interview question",
            "coding question",
        }
        return normalized in generic_titles or (normalized and len(normalized.split()) <= 2)

    @staticmethod
    def _content_body(item: ContentAuditItem) -> str:
        parts = [
            item.title or "",
            item.problem_statement or "",
            item.body or "",
            item.expected_output or "",
            item.solution or "",
            item.explanation or "",
        ]
        return "\n".join(part.strip() for part in parts if part and part.strip())

    @staticmethod
    def _score(issue_counts: dict[str, int]) -> int:
        penalty = (
            issue_counts["critical"] * 18
            + issue_counts["warning"] * 7
            + issue_counts["suggestion"] * 3
        )
        return max(0, min(100, 100 - penalty))

    @staticmethod
    def _hash_item(item: ContentAuditItem) -> str:
        payload = item.model_dump(mode="json")
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()

    def _store_postgres(self, run: ContentAuditRun, issues: list[ContentAuditIssue]) -> None:
        try:
            import psycopg
        except ImportError as exc:
            raise ContentAuditError("Content audit storage is unavailable.") from exc

        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        INSERT INTO public.content_audit_runs (
                            id, content_id, content_type, title, slug, topic, difficulty,
                            tags, audit_score, issue_counts, content_hash, audited_at,
                            source_updated_at
                        )
                        VALUES (
                            %s, %s, %s, %s, %s, %s, %s,
                            %s::jsonb, %s, %s::jsonb, %s, %s, %s
                        )
                        """,
                        (
                            run.id,
                            run.content_id,
                            run.content_type,
                            run.title,
                            run.slug,
                            run.topic,
                            run.difficulty,
                            json.dumps(run.tags),
                            run.audit_score,
                            json.dumps(run.issue_counts),
                            run.content_hash,
                            run.audited_at,
                            run.source_updated_at,
                        ),
                    )
                    for issue in issues:
                        cursor.execute(
                            """
                            INSERT INTO public.content_audit_issues (
                                id, run_id, content_id, severity, category, issue,
                                suggestion, status, created_at, updated_at
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                issue.id,
                                issue.run_id,
                                issue.content_id,
                                issue.severity,
                                issue.category,
                                issue.issue,
                                issue.suggestion,
                                issue.status,
                                issue.created_at,
                                issue.updated_at,
                            ),
                        )
                connection.commit()
        except Exception as exc:
            raise ContentAuditError("Unable to store content audit run.") from exc

    def _list_latest_postgres(self) -> ContentAuditSummaryResponse:
        try:
            import psycopg
        except ImportError as exc:
            raise ContentAuditError("Content audit storage is unavailable.") from exc

        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT to_regclass('public.content_audit_runs') IS NOT NULL"
                    )
                    if not bool(cursor.fetchone()[0]):
                        return self._empty_summary("postgres", False)
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        SELECT DISTINCT ON (content_id)
                            id, content_id, content_type, title, slug, topic, difficulty,
                            tags, audit_score, issue_counts, content_hash, audited_at,
                            source_updated_at
                        FROM public.content_audit_runs
                        ORDER BY content_id, audited_at DESC
                        """
                    )
                    items = [self._run_from_row(row) for row in cursor.fetchall()]
                    return self._summary_from_runs("postgres", True, items, cursor)
        except Exception as exc:
            raise ContentAuditError("Unable to read content audit runs.") from exc

    def _get_latest_detail_postgres(self, content_id: str) -> ContentAuditDetailResponse:
        try:
            import psycopg
        except ImportError as exc:
            raise ContentAuditError("Content audit storage is unavailable.") from exc

        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT to_regclass('public.content_audit_runs') IS NOT NULL"
                    )
                    if not bool(cursor.fetchone()[0]):
                        return ContentAuditDetailResponse(
                            storage_backend="postgres",
                            table_exists=False,
                            run=None,
                            issues=[],
                        )
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        SELECT id, content_id, content_type, title, slug, topic, difficulty,
                               tags, audit_score, issue_counts, content_hash, audited_at,
                               source_updated_at
                        FROM public.content_audit_runs
                        WHERE content_id = %s
                        ORDER BY audited_at DESC
                        LIMIT 1
                        """,
                        (content_id,),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        return ContentAuditDetailResponse(
                            storage_backend="postgres",
                            table_exists=True,
                            run=None,
                            issues=[],
                        )
                    run = self._run_from_row(row)
                    cursor.execute(
                        """
                        SELECT id, run_id, content_id, severity, category, issue,
                               suggestion, status, created_at, updated_at
                        FROM public.content_audit_issues
                        WHERE run_id = %s
                        ORDER BY
                          CASE severity
                            WHEN 'critical' THEN 1
                            WHEN 'warning' THEN 2
                            ELSE 3
                          END,
                          created_at ASC
                        """,
                        (run.id,),
                    )
                    issues = [self._issue_from_row(issue_row) for issue_row in cursor.fetchall()]
            return ContentAuditDetailResponse(
                storage_backend="postgres",
                table_exists=True,
                run=run,
                issues=issues,
            )
        except Exception as exc:
            raise ContentAuditError("Unable to read content audit detail.") from exc

    def _update_issue_status_postgres(
        self,
        content_id: str,
        issue_id: str,
        status: AuditIssueStatus,
    ) -> ContentAuditDetailResponse:
        try:
            import psycopg
        except ImportError as exc:
            raise ContentAuditError("Content audit storage is unavailable.") from exc

        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    self._ensure_postgres_schema(cursor)
                    cursor.execute(
                        """
                        UPDATE public.content_audit_issues
                        SET status = %s, updated_at = NOW()
                        WHERE id = %s AND content_id = %s
                        """,
                        (status, issue_id, content_id),
                    )
                connection.commit()
        except Exception as exc:
            raise ContentAuditError("Unable to update content audit issue.") from exc
        return self.get_latest_detail(content_id)

    def _ensure_postgres_schema(self, cursor: object) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS public.content_audit_runs (
                id TEXT PRIMARY KEY,
                content_id TEXT NOT NULL,
                content_type TEXT NOT NULL,
                title TEXT NOT NULL,
                slug TEXT NOT NULL,
                topic TEXT NOT NULL,
                difficulty TEXT NOT NULL,
                tags JSONB NOT NULL DEFAULT '[]'::jsonb,
                audit_score INTEGER NOT NULL CHECK (audit_score BETWEEN 0 AND 100),
                issue_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
                content_hash TEXT NOT NULL,
                audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                source_updated_at TEXT
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS public.content_audit_issues (
                id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL REFERENCES public.content_audit_runs(id) ON DELETE CASCADE,
                content_id TEXT NOT NULL,
                severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'suggestion')),
                category TEXT NOT NULL,
                issue TEXT NOT NULL,
                suggestion TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'ignored')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_content_audit_runs_content_audited "
            "ON public.content_audit_runs (content_id, audited_at DESC)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_content_audit_issues_run "
            "ON public.content_audit_issues (run_id)"
        )
        cursor.execute("ALTER TABLE public.content_audit_runs ENABLE ROW LEVEL SECURITY")
        cursor.execute("ALTER TABLE public.content_audit_issues ENABLE ROW LEVEL SECURITY")

    def _store_file(self, run: ContentAuditRun, issues: list[ContentAuditIssue]) -> None:
        store = self._read_file_store()
        store["runs"].append(run.model_dump())
        store["issues"].extend(issue.model_dump() for issue in issues)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self.storage_path.write_text(json.dumps(store, indent=2), encoding="utf-8")

    def _list_latest_file(self) -> ContentAuditSummaryResponse:
        if not self.storage_path.exists():
            return self._empty_summary("file", False)
        store = self._read_file_store()
        latest = self._latest_runs_from_file(store["runs"])
        return self._summary_from_runs("file", True, latest)

    def _get_latest_detail_file(self, content_id: str) -> ContentAuditDetailResponse:
        if not self.storage_path.exists():
            return ContentAuditDetailResponse(
                storage_backend="file",
                table_exists=False,
                run=None,
                issues=[],
            )
        store = self._read_file_store()
        latest = self._latest_runs_from_file(store["runs"])
        run = next((item for item in latest if item.content_id == content_id), None)
        if run is None:
            return ContentAuditDetailResponse(
                storage_backend="file",
                table_exists=True,
                run=None,
                issues=[],
            )
        issues = [
            ContentAuditIssue.model_validate(issue)
            for issue in store["issues"]
            if issue.get("run_id") == run.id
        ]
        issues.sort(key=lambda issue: (self._severity_rank(issue.severity), issue.created_at))
        return ContentAuditDetailResponse(
            storage_backend="file",
            table_exists=True,
            run=run,
            issues=issues,
        )

    def _update_issue_status_file(
        self,
        content_id: str,
        issue_id: str,
        status: AuditIssueStatus,
    ) -> ContentAuditDetailResponse:
        store = self._read_file_store()
        now = datetime.now(timezone.utc).isoformat()
        for issue in store["issues"]:
            if issue.get("id") == issue_id and issue.get("content_id") == content_id:
                issue["status"] = status
                issue["updated_at"] = now
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self.storage_path.write_text(json.dumps(store, indent=2), encoding="utf-8")
        return self.get_latest_detail(content_id)

    def _read_file_store(self) -> dict[str, list[dict[str, object]]]:
        if not self.storage_path.exists():
            return {"runs": [], "issues": []}
        try:
            parsed = json.loads(self.storage_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"runs": [], "issues": []}
        runs = parsed.get("runs") if isinstance(parsed, dict) else []
        issues = parsed.get("issues") if isinstance(parsed, dict) else []
        return {
            "runs": runs if isinstance(runs, list) else [],
            "issues": issues if isinstance(issues, list) else [],
        }

    @staticmethod
    def _latest_runs_from_file(records: list[dict[str, object]]) -> list[ContentAuditRun]:
        latest: dict[str, ContentAuditRun] = {}
        for record in records:
            try:
                run = ContentAuditRun.model_validate(record)
            except Exception:
                continue
            existing = latest.get(run.content_id)
            if existing is None or run.audited_at > existing.audited_at:
                latest[run.content_id] = run
        return sorted(latest.values(), key=lambda run: (run.audit_score, run.title.lower()))

    def _summary_from_runs(
        self,
        storage_backend: str,
        table_exists: bool,
        items: list[ContentAuditRun],
        cursor: object | None = None,
    ) -> ContentAuditSummaryResponse:
        if not items:
            return self._empty_summary(storage_backend, table_exists)

        if cursor is not None:
            run_ids = [item.id for item in items]
            cursor.execute(
                """
                SELECT severity, COUNT(*)
                FROM public.content_audit_issues
                WHERE run_id = ANY(%s) AND status = 'open'
                GROUP BY severity
                """,
                (run_ids,),
            )
            counts = {row[0]: int(row[1]) for row in cursor.fetchall()}
        else:
            store = self._read_file_store()
            run_ids = {item.id for item in items}
            counts = {"critical": 0, "warning": 0, "suggestion": 0}
            for issue in store["issues"]:
                if issue.get("run_id") in run_ids and issue.get("status", "open") == "open":
                    severity = str(issue.get("severity", ""))
                    if severity in counts:
                        counts[severity] += 1

        ordered_items = sorted(items, key=lambda run: (run.audit_score, run.title.lower()))
        average = round(sum(item.audit_score for item in items) / len(items), 1)
        return ContentAuditSummaryResponse(
            storage_backend=storage_backend,  # type: ignore[arg-type]
            table_exists=table_exists,
            total_audited_content=len(items),
            average_audit_score=average,
            critical_issues=counts.get("critical", 0),
            warning_issues=counts.get("warning", 0),
            suggestion_issues=counts.get("suggestion", 0),
            items=ordered_items,
        )

    @staticmethod
    def _empty_summary(storage_backend: str, table_exists: bool) -> ContentAuditSummaryResponse:
        return ContentAuditSummaryResponse(
            storage_backend=storage_backend,  # type: ignore[arg-type]
            table_exists=table_exists,
            total_audited_content=0,
            average_audit_score=0,
            critical_issues=0,
            warning_issues=0,
            suggestion_issues=0,
            items=[],
        )

    @staticmethod
    def _run_from_row(row: object) -> ContentAuditRun:
        return ContentAuditRun(
            id=str(row[0]),
            content_id=str(row[1]),
            content_type=str(row[2]),
            title=str(row[3]),
            slug=str(row[4]),
            topic=str(row[5]),
            difficulty=str(row[6]),
            tags=list(row[7] or []),
            audit_score=int(row[8]),
            issue_counts=dict(row[9] or {}),
            content_hash=str(row[10]),
            audited_at=row[11].isoformat(),
            source_updated_at=row[12],
        )

    @staticmethod
    def _issue_from_row(row: object) -> ContentAuditIssue:
        return ContentAuditIssue(
            id=str(row[0]),
            run_id=str(row[1]),
            content_id=str(row[2]),
            severity=row[3],
            category=str(row[4]),
            issue=str(row[5]),
            suggestion=str(row[6]),
            status=row[7],
            created_at=row[8].isoformat(),
            updated_at=row[9].isoformat(),
        )

    @staticmethod
    def _severity_rank(severity: str) -> int:
        return {"critical": 0, "warning": 1, "suggestion": 2}.get(severity, 3)

    @staticmethod
    def _active_postgres_url(postgres_url: str | None) -> str | None:
        if not postgres_url or postgres_url == DEFAULT_POSTGRES_URL:
            return None
        if "supabase.com" in postgres_url and "sslmode=" not in postgres_url:
            separator = "&" if "?" in postgres_url else "?"
            return f"{postgres_url}{separator}sslmode=require"
        return postgres_url
