from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from typing import Any

from app.core.config import DEFAULT_POSTGRES_URL, get_settings
from app.schemas.auth import AuthUserProfile
from app.schemas.usage import (
    AnonymousUsageEventRequest,
    UsageAdminInsightsResponse,
    UsageContentInsight,
    UsageDailyInsight,
    UsageEventCount,
    UsageAdminSummaryResponse,
    UsageFunnelInsight,
    UsageVisitorDailyTotal,
    UsageVisitorSummaryResponse,
    UsageVisitorTopPage,
    UsageEventRequest,
    UsageEventResponse,
    UsageUserSummary,
)

QUESTION_SUBMITTED_EVENTS = {"coding_lab_submitted", "scenario_submitted"}
QUESTION_COMPLETED_EVENTS = {"coding_lab_completed", "scenario_completed"}
SESSION_EVENTS = {"session_start", "session_heartbeat", "page_view", "content_view"}
ANONYMOUS_USER_PREFIX = "visitor:"


class UsageStoreError(RuntimeError):
    pass


class UsageStore:
    def __init__(
        self,
        storage_path: Path | None = None,
        postgres_url: str | None = None,
    ) -> None:
        settings = get_settings()
        self.storage_path = storage_path or Path(settings.usage_store_path)
        configured_url = postgres_url if postgres_url is not None else settings.postgres_url
        self.postgres_url = self._active_postgres_url(configured_url)

    def record_event(
        self,
        user: AuthUserProfile | dict[str, Any],
        payload: UsageEventRequest,
    ) -> UsageEventResponse:
        record = self._build_record(user=user, payload=payload)
        if self.postgres_url:
            self._record_postgres(record)
        else:
            self._record_file(record)
        return UsageEventResponse(recorded=True)

    def record_anonymous_event(self, payload: AnonymousUsageEventRequest) -> UsageEventResponse:
        visitor_id = payload.visitor_id.strip()
        anonymous_payload = UsageEventRequest(
            event_name=payload.event_name,
            session_id=payload.session_id,
            page_url=payload.page_url,
            active_seconds=payload.active_seconds,
            metadata={
                **payload.metadata,
                "visitor_id": visitor_id,
                "anonymous": True,
            },
        )
        return self.record_event(
            user={
                "id": f"{ANONYMOUS_USER_PREFIX}{visitor_id}",
                "email": "",
                "full_name": "Anonymous visitor",
            },
            payload=anonymous_payload,
        )

    def record_login(self, user: AuthUserProfile | dict[str, Any]) -> None:
        payload = UsageEventRequest(
            event_name="login_success",
            session_id=f"login-{datetime.now(timezone.utc).timestamp()}",
            metadata={},
        )
        self.record_event(user=user, payload=payload)

    def admin_summary(self, days: int = 30, limit: int = 100) -> UsageAdminSummaryResponse:
        bounded_days = max(1, min(days, 365))
        bounded_limit = max(1, min(limit, 500))
        if self.postgres_url:
            return self._summary_postgres(days=bounded_days, limit=bounded_limit)
        return self._summary_file(days=bounded_days, limit=bounded_limit)

    def visitor_summary(self, days: int = 30, limit: int = 25) -> UsageVisitorSummaryResponse:
        bounded_days = max(1, min(days, 365))
        bounded_limit = max(1, min(limit, 100))
        if self.postgres_url:
            return self._visitor_summary_postgres(days=bounded_days, limit=bounded_limit)
        return self._visitor_summary_file(days=bounded_days, limit=bounded_limit)

    def admin_insights(self, days: int = 30, limit: int = 25) -> UsageAdminInsightsResponse:
        bounded_days = max(1, min(days, 365))
        bounded_limit = max(1, min(limit, 100))
        if self.postgres_url:
            return self._insights_postgres(days=bounded_days, limit=bounded_limit)
        return self._insights_file(days=bounded_days, limit=bounded_limit)

    def _build_record(
        self,
        user: AuthUserProfile | dict[str, Any],
        payload: UsageEventRequest,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        if isinstance(user, AuthUserProfile):
            user_id = user.id
            email = user.email
            full_name = user.full_name
        else:
            user_id = str(user.get("id", ""))
            email = str(user.get("email", ""))
            full_name = str(user.get("full_name", ""))

        return {
            "user_id": user_id,
            "email": email,
            "full_name": full_name or email,
            "event_name": payload.event_name,
            "session_id": payload.session_id,
            "page_url": payload.page_url,
            "active_seconds": min(max(payload.active_seconds, 0), 300),
            "metadata": self._safe_metadata(payload.metadata),
            "created_at": now,
        }

    def _record_file(self, record: dict[str, Any]) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        serializable = {
            **record,
            "created_at": record["created_at"].isoformat(),
        }
        with self.storage_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(serializable, sort_keys=True) + "\n")

    def _record_postgres(self, record: dict[str, Any]) -> None:
        try:
            import psycopg
        except ImportError as exc:
            raise UsageStoreError("Usage storage is unavailable.") from exc

        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    self._ensure_table(cursor)
                    cursor.execute(
                        """
                        INSERT INTO public.user_usage_events (
                            user_id, email, full_name, event_name, session_id,
                            page_url, active_seconds, metadata, created_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                        """,
                        (
                            record["user_id"],
                            record["email"],
                            record["full_name"],
                            record["event_name"],
                            record["session_id"],
                            record["page_url"],
                            record["active_seconds"],
                            json.dumps(record["metadata"]),
                            record["created_at"],
                        ),
                    )
                connection.commit()
        except Exception as exc:
            raise UsageStoreError("Unable to record usage event.") from exc

    def _summary_file(self, days: int, limit: int) -> UsageAdminSummaryResponse:
        if not self.storage_path.exists():
            return UsageAdminSummaryResponse(
                storage_backend="file",
                table_exists=False,
                days=days,
                total_users=0,
                rows=[],
            )

        now = datetime.now(timezone.utc)
        window_start = now - timedelta(days=days)
        seven_start = now - timedelta(days=7)
        thirty_start = now - timedelta(days=30)
        rows_by_user: dict[str, dict[str, Any]] = {}

        for record in self._read_file_records():
            created_at = self._parse_datetime(record.get("created_at"))
            user_id = str(record.get("user_id") or "")
            if (
                not user_id
                or self._is_anonymous_user_id(user_id)
                or created_at < thirty_start
            ):
                continue

            summary = rows_by_user.setdefault(
                user_id,
                {
                    "user_id": user_id,
                    "email": str(record.get("email") or ""),
                    "full_name": str(record.get("full_name") or record.get("email") or ""),
                    "total_active_seconds": 0,
                    "questions_submitted": 0,
                    "questions_completed": 0,
                    "logins_7d": 0,
                    "logins_30d": 0,
                    "sessions_7d": set(),
                    "sessions_30d": set(),
                    "last_seen_at": None,
                },
            )

            event_name = str(record.get("event_name") or "")
            session_id = str(record.get("session_id") or "")
            if created_at >= window_start:
                summary["total_active_seconds"] += int(record.get("active_seconds") or 0)
                if event_name in QUESTION_SUBMITTED_EVENTS:
                    summary["questions_submitted"] += 1
                if event_name in QUESTION_COMPLETED_EVENTS:
                    summary["questions_completed"] += 1
            if event_name == "login_success" and created_at >= seven_start:
                summary["logins_7d"] += 1
            if event_name == "login_success" and created_at >= thirty_start:
                summary["logins_30d"] += 1
            if event_name in SESSION_EVENTS and session_id and created_at >= seven_start:
                summary["sessions_7d"].add(session_id)
            if event_name in SESSION_EVENTS and session_id and created_at >= thirty_start:
                summary["sessions_30d"].add(session_id)
            if not summary["last_seen_at"] or created_at > summary["last_seen_at"]:
                summary["last_seen_at"] = created_at

        summaries = sorted(
            rows_by_user.values(),
            key=lambda row: row["last_seen_at"] or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        rows = [
            UsageUserSummary(
                user_id=row["user_id"],
                email=row["email"],
                full_name=row["full_name"],
                total_active_seconds=row["total_active_seconds"],
                questions_submitted=row["questions_submitted"],
                questions_completed=row["questions_completed"],
                logins_7d=row["logins_7d"],
                logins_30d=row["logins_30d"],
                sessions_7d=len(row["sessions_7d"]),
                sessions_30d=len(row["sessions_30d"]),
                last_seen_at=row["last_seen_at"].isoformat() if row["last_seen_at"] else None,
            )
            for row in summaries[:limit]
        ]
        return UsageAdminSummaryResponse(
            storage_backend="file",
            table_exists=True,
            days=days,
            total_users=len(summaries),
            rows=rows,
        )

    def _summary_postgres(self, days: int, limit: int) -> UsageAdminSummaryResponse:
        try:
            import psycopg
        except ImportError as exc:
            raise UsageStoreError("Usage storage is unavailable.") from exc

        now = datetime.now(timezone.utc)
        window_start = now - timedelta(days=days)
        seven_start = now - timedelta(days=7)
        thirty_start = now - timedelta(days=30)
        scan_start = min(window_start, thirty_start)

        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT to_regclass('public.user_usage_events') IS NOT NULL"
                    )
                    if not bool(cursor.fetchone()[0]):
                        return UsageAdminSummaryResponse(
                            storage_backend="postgres",
                            table_exists=False,
                            days=days,
                            total_users=0,
                            rows=[],
                        )
                    cursor.execute(
                        """
                        SELECT COUNT(DISTINCT user_id)
                        FROM public.user_usage_events
                        WHERE created_at >= %s
                          AND user_id NOT LIKE %s
                        """,
                        (scan_start, f"{ANONYMOUS_USER_PREFIX}%"),
                    )
                    total_users = int(cursor.fetchone()[0])
                    cursor.execute(
                        """
                        SELECT
                            user_id,
                            MAX(email) AS email,
                            MAX(full_name) AS full_name,
                            COALESCE(SUM(active_seconds)
                                FILTER (WHERE created_at >= %s), 0) AS total_active_seconds,
                            COUNT(*) FILTER (
                                WHERE created_at >= %s
                                  AND event_name IN ('coding_lab_submitted', 'scenario_submitted')
                            ) AS questions_submitted,
                            COUNT(*) FILTER (
                                WHERE created_at >= %s
                                  AND event_name IN ('coding_lab_completed', 'scenario_completed')
                            ) AS questions_completed,
                            COUNT(*) FILTER (
                                WHERE created_at >= %s AND event_name = 'login_success'
                            ) AS logins_7d,
                            COUNT(*) FILTER (
                                WHERE created_at >= %s AND event_name = 'login_success'
                            ) AS logins_30d,
                            COUNT(DISTINCT session_id) FILTER (
                                WHERE created_at >= %s
                                  AND event_name IN ('session_start', 'session_heartbeat', 'page_view', 'content_view')
                            ) AS sessions_7d,
                            COUNT(DISTINCT session_id) FILTER (
                                WHERE created_at >= %s
                                  AND event_name IN ('session_start', 'session_heartbeat', 'page_view', 'content_view')
                            ) AS sessions_30d,
                            MAX(created_at) AS last_seen_at
                        FROM public.user_usage_events
                        WHERE created_at >= %s
                          AND user_id NOT LIKE %s
                        GROUP BY user_id
                        ORDER BY last_seen_at DESC
                        LIMIT %s
                        """,
                        (
                            window_start,
                            window_start,
                            window_start,
                            seven_start,
                            thirty_start,
                            seven_start,
                            thirty_start,
                            scan_start,
                            f"{ANONYMOUS_USER_PREFIX}%",
                            limit,
                        ),
                    )
                    rows = [
                        UsageUserSummary(
                            user_id=str(row[0]),
                            email=row[1],
                            full_name=row[2],
                            total_active_seconds=int(row[3] or 0),
                            questions_submitted=int(row[4] or 0),
                            questions_completed=int(row[5] or 0),
                            logins_7d=int(row[6] or 0),
                            logins_30d=int(row[7] or 0),
                            sessions_7d=int(row[8] or 0),
                            sessions_30d=int(row[9] or 0),
                            last_seen_at=row[10].isoformat() if row[10] else None,
                        )
                        for row in cursor.fetchall()
                    ]
            return UsageAdminSummaryResponse(
                storage_backend="postgres",
                table_exists=True,
                days=days,
                total_users=total_users,
                rows=rows,
            )
        except Exception as exc:
            raise UsageStoreError("Unable to read usage summary.") from exc

    def _visitor_summary_file(self, days: int, limit: int) -> UsageVisitorSummaryResponse:
        if not self.storage_path.exists():
            return UsageVisitorSummaryResponse(
                storage_backend="file",
                table_exists=False,
                days=days,
                total_visits=0,
                unique_visitors=0,
                total_active_seconds=0,
                daily_totals=[],
                top_pages=[],
            )

        now = datetime.now(timezone.utc)
        window_start = now - timedelta(days=days)
        daily_totals: dict[str, dict[str, Any]] = {}
        pages: dict[str, dict[str, Any]] = {}
        visitors: set[str] = set()
        total_visits = 0
        total_active_seconds = 0

        for record in self._read_file_records():
            created_at = self._parse_datetime(record.get("created_at"))
            user_id = str(record.get("user_id") or "")
            if created_at < window_start or not self._is_anonymous_user_id(user_id):
                continue

            event_name = str(record.get("event_name") or "")
            page_url = str(record.get("page_url") or "/")
            active_seconds = int(record.get("active_seconds") or 0)
            date_key = created_at.date().isoformat()
            visitors.add(user_id)
            total_active_seconds += active_seconds

            daily = daily_totals.setdefault(
                date_key,
                {
                    "date": date_key,
                    "visits": 0,
                    "visitors": set(),
                    "total_active_seconds": 0,
                },
            )
            daily["visitors"].add(user_id)
            daily["total_active_seconds"] += active_seconds

            page = pages.setdefault(
                page_url,
                {
                    "page_url": page_url,
                    "visits": 0,
                    "visitors": set(),
                    "total_active_seconds": 0,
                },
            )
            page["visitors"].add(user_id)
            page["total_active_seconds"] += active_seconds

            if event_name == "page_view":
                total_visits += 1
                daily["visits"] += 1
                page["visits"] += 1

        daily_rows = [
            UsageVisitorDailyTotal(
                date=row["date"],
                visits=row["visits"],
                unique_visitors=len(row["visitors"]),
                total_active_seconds=row["total_active_seconds"],
            )
            for row in sorted(daily_totals.values(), key=lambda item: item["date"], reverse=True)
        ]
        page_rows = [
            UsageVisitorTopPage(
                page_url=row["page_url"],
                visits=row["visits"],
                unique_visitors=len(row["visitors"]),
                total_active_seconds=row["total_active_seconds"],
            )
            for row in sorted(
                pages.values(),
                key=lambda item: (item["visits"], item["total_active_seconds"]),
                reverse=True,
            )[:limit]
        ]

        return UsageVisitorSummaryResponse(
            storage_backend="file",
            table_exists=True,
            days=days,
            total_visits=total_visits,
            unique_visitors=len(visitors),
            total_active_seconds=total_active_seconds,
            daily_totals=daily_rows,
            top_pages=page_rows,
        )

    def _visitor_summary_postgres(self, days: int, limit: int) -> UsageVisitorSummaryResponse:
        try:
            import psycopg
        except ImportError as exc:
            raise UsageStoreError("Usage storage is unavailable.") from exc

        window_start = datetime.now(timezone.utc) - timedelta(days=days)
        visitor_pattern = f"{ANONYMOUS_USER_PREFIX}%"

        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT to_regclass('public.user_usage_events') IS NOT NULL"
                    )
                    if not bool(cursor.fetchone()[0]):
                        return UsageVisitorSummaryResponse(
                            storage_backend="postgres",
                            table_exists=False,
                            days=days,
                            total_visits=0,
                            unique_visitors=0,
                            total_active_seconds=0,
                            daily_totals=[],
                            top_pages=[],
                        )

                    cursor.execute(
                        """
                        SELECT
                            COUNT(*) FILTER (WHERE event_name = 'page_view') AS total_visits,
                            COUNT(DISTINCT user_id) AS unique_visitors,
                            COALESCE(SUM(active_seconds), 0) AS total_active_seconds
                        FROM public.user_usage_events
                        WHERE created_at >= %s
                          AND user_id LIKE %s
                        """,
                        (window_start, visitor_pattern),
                    )
                    total_row = cursor.fetchone()

                    cursor.execute(
                        """
                        SELECT
                            created_at::date::text AS visit_date,
                            COUNT(*) FILTER (WHERE event_name = 'page_view') AS visits,
                            COUNT(DISTINCT user_id) AS unique_visitors,
                            COALESCE(SUM(active_seconds), 0) AS total_active_seconds
                        FROM public.user_usage_events
                        WHERE created_at >= %s
                          AND user_id LIKE %s
                        GROUP BY visit_date
                        ORDER BY visit_date DESC
                        """,
                        (window_start, visitor_pattern),
                    )
                    daily_rows = [
                        UsageVisitorDailyTotal(
                            date=str(row[0]),
                            visits=int(row[1] or 0),
                            unique_visitors=int(row[2] or 0),
                            total_active_seconds=int(row[3] or 0),
                        )
                        for row in cursor.fetchall()
                    ]

                    cursor.execute(
                        """
                        SELECT
                            COALESCE(NULLIF(page_url, ''), '/') AS page_url,
                            COUNT(*) FILTER (WHERE event_name = 'page_view') AS visits,
                            COUNT(DISTINCT user_id) AS unique_visitors,
                            COALESCE(SUM(active_seconds), 0) AS total_active_seconds
                        FROM public.user_usage_events
                        WHERE created_at >= %s
                          AND user_id LIKE %s
                        GROUP BY COALESCE(NULLIF(page_url, ''), '/')
                        ORDER BY visits DESC, total_active_seconds DESC
                        LIMIT %s
                        """,
                        (window_start, visitor_pattern, limit),
                    )
                    page_rows = [
                        UsageVisitorTopPage(
                            page_url=str(row[0]),
                            visits=int(row[1] or 0),
                            unique_visitors=int(row[2] or 0),
                            total_active_seconds=int(row[3] or 0),
                        )
                        for row in cursor.fetchall()
                    ]

            return UsageVisitorSummaryResponse(
                storage_backend="postgres",
                table_exists=True,
                days=days,
                total_visits=int(total_row[0] or 0),
                unique_visitors=int(total_row[1] or 0),
                total_active_seconds=int(total_row[2] or 0),
                daily_totals=daily_rows,
                top_pages=page_rows,
            )
        except Exception as exc:
            raise UsageStoreError("Unable to read visitor usage summary.") from exc

    def _insights_file(self, days: int, limit: int) -> UsageAdminInsightsResponse:
        if not self.storage_path.exists():
            return self._empty_insights("file", table_exists=False, days=days)

        window_start = datetime.now(timezone.utc) - timedelta(days=days)
        records = [
            record
            for record in self._read_file_records()
            if self._parse_datetime(record.get("created_at")) >= window_start
        ]
        return self._build_insights_from_records(
            records=records,
            storage_backend="file",
            table_exists=True,
            days=days,
            limit=limit,
        )

    def _insights_postgres(self, days: int, limit: int) -> UsageAdminInsightsResponse:
        try:
            import psycopg
        except ImportError as exc:
            raise UsageStoreError("Usage storage is unavailable.") from exc

        window_start = datetime.now(timezone.utc) - timedelta(days=days)

        try:
            with psycopg.connect(self.postgres_url) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT to_regclass('public.user_usage_events') IS NOT NULL"
                    )
                    if not bool(cursor.fetchone()[0]):
                        return self._empty_insights("postgres", table_exists=False, days=days)

                    cursor.execute(
                        """
                        SELECT
                            user_id, email, full_name, event_name, session_id,
                            page_url, active_seconds, metadata, created_at
                        FROM public.user_usage_events
                        WHERE created_at >= %s
                        ORDER BY created_at DESC
                        LIMIT 50000
                        """,
                        (window_start,),
                    )
                    records = [
                        {
                            "user_id": row[0],
                            "email": row[1],
                            "full_name": row[2],
                            "event_name": row[3],
                            "session_id": row[4],
                            "page_url": row[5],
                            "active_seconds": row[6],
                            "metadata": row[7] if isinstance(row[7], dict) else {},
                            "created_at": row[8].isoformat() if row[8] else "",
                        }
                        for row in cursor.fetchall()
                    ]
            return self._build_insights_from_records(
                records=records,
                storage_backend="postgres",
                table_exists=True,
                days=days,
                limit=limit,
            )
        except Exception as exc:
            raise UsageStoreError("Unable to read usage insights.") from exc

    def _build_insights_from_records(
        self,
        records: list[dict[str, Any]],
        storage_backend: str,
        table_exists: bool,
        days: int,
        limit: int,
    ) -> UsageAdminInsightsResponse:
        event_counts: dict[str, int] = {}
        daily: dict[str, dict[str, Any]] = {}
        content: dict[str, dict[str, Any]] = {}
        anonymous_visitors: set[str] = set()
        logged_in_users: set[str] = set()
        sessions: set[str] = set()
        active_seconds = 0

        for record in records:
            event_name = str(record.get("event_name") or "")
            user_id = str(record.get("user_id") or "")
            session_id = str(record.get("session_id") or "")
            created_at = self._parse_datetime(record.get("created_at"))
            date_key = created_at.date().isoformat()
            metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
            record_active_seconds = int(record.get("active_seconds") or 0)

            event_counts[event_name] = event_counts.get(event_name, 0) + 1
            active_seconds += record_active_seconds
            if session_id:
                sessions.add(session_id)
            if user_id:
                if self._is_anonymous_user_id(user_id):
                    anonymous_visitors.add(user_id)
                else:
                    logged_in_users.add(user_id)

            daily_row = daily.setdefault(
                date_key,
                {
                    "date": date_key,
                    "page_views": 0,
                    "content_views": 0,
                    "submissions": 0,
                    "completions": 0,
                    "logins": 0,
                    "active_seconds": 0,
                },
            )
            daily_row["active_seconds"] += record_active_seconds
            if event_name == "page_view":
                daily_row["page_views"] += 1
            elif event_name == "content_view":
                daily_row["content_views"] += 1
            elif event_name in QUESTION_SUBMITTED_EVENTS:
                daily_row["submissions"] += 1
            elif event_name in QUESTION_COMPLETED_EVENTS:
                daily_row["completions"] += 1
            elif event_name == "login_success":
                daily_row["logins"] += 1

            content_key = self._content_key_for_event(event_name, metadata)
            if not content_key:
                continue

            content_id, content_type, track = content_key
            content_row = content.setdefault(
                f"{content_type}:{content_id}",
                {
                    "content_id": content_id,
                    "content_type": content_type,
                    "track": track,
                    "views": 0,
                    "submissions": 0,
                    "completions": 0,
                    "scores": [],
                    "active_seconds": 0,
                    "activity_count": 0,
                    "last_activity_at": None,
                },
            )
            content_row["track"] = content_row["track"] or track
            content_row["active_seconds"] += record_active_seconds
            content_row["activity_count"] += 1
            if not content_row["last_activity_at"] or created_at > content_row["last_activity_at"]:
                content_row["last_activity_at"] = created_at
            if event_name == "content_view":
                content_row["views"] += 1
            elif event_name in QUESTION_SUBMITTED_EVENTS:
                content_row["submissions"] += 1
                score = metadata.get("score")
                if isinstance(score, (int, float)):
                    content_row["scores"].append(float(score))
            elif event_name in QUESTION_COMPLETED_EVENTS:
                content_row["completions"] += 1

        content_rows = [
            self._to_content_insight(row)
            for row in content.values()
        ]
        top_content = sorted(
            content_rows,
            key=lambda row: (row.submissions + row.completions, row.views, row.last_activity_at or ""),
            reverse=True,
        )[:limit]
        friction_content = sorted(
            [
                row
                for row in content_rows
                if row.submissions >= 2 and row.completions < row.submissions
            ],
            key=lambda row: (row.completion_rate, -row.submissions, row.avg_score or 0),
        )[:limit]

        submissions = sum(event_counts.get(event, 0) for event in QUESTION_SUBMITTED_EVENTS)
        completions = sum(event_counts.get(event, 0) for event in QUESTION_COMPLETED_EVENTS)

        return UsageAdminInsightsResponse(
            storage_backend=storage_backend,  # type: ignore[arg-type]
            table_exists=table_exists,
            days=days,
            total_events=len(records),
            funnel=UsageFunnelInsight(
                anonymous_visitors=len(anonymous_visitors),
                logged_in_users=len(logged_in_users),
                total_sessions=len(sessions),
                page_views=event_counts.get("page_view", 0),
                content_views=event_counts.get("content_view", 0),
                logins=event_counts.get("login_success", 0),
                submissions=submissions,
                completions=completions,
                completion_rate=self._safe_rate(completions, submissions),
                active_seconds=active_seconds,
            ),
            event_counts=[
                UsageEventCount(event_name=name, count=count)
                for name, count in sorted(event_counts.items(), key=lambda item: item[1], reverse=True)
            ],
            daily=[
                UsageDailyInsight(**row)
                for row in sorted(daily.values(), key=lambda item: item["date"], reverse=True)
            ],
            top_content=top_content,
            friction_content=friction_content,
        )

    def _empty_insights(
        self,
        storage_backend: str,
        table_exists: bool,
        days: int,
    ) -> UsageAdminInsightsResponse:
        return UsageAdminInsightsResponse(
            storage_backend=storage_backend,  # type: ignore[arg-type]
            table_exists=table_exists,
            days=days,
            total_events=0,
            funnel=UsageFunnelInsight(
                anonymous_visitors=0,
                logged_in_users=0,
                total_sessions=0,
                page_views=0,
                content_views=0,
                logins=0,
                submissions=0,
                completions=0,
                completion_rate=0,
                active_seconds=0,
            ),
            event_counts=[],
            daily=[],
            top_content=[],
            friction_content=[],
        )

    def _content_key_for_event(
        self,
        event_name: str,
        metadata: dict[str, Any],
    ) -> tuple[str, str, str | None] | None:
        if event_name == "content_view":
            content_id = str(metadata.get("content_id") or "").strip()
            content_type = str(metadata.get("content_type") or "content").strip()
            track = metadata.get("track")
            if content_id:
                return content_id, content_type, str(track) if track else None
            return None

        if event_name.startswith("coding_lab_"):
            lab_slug = str(metadata.get("lab_slug") or metadata.get("lab") or "").strip()
            track = str(metadata.get("track") or "").strip() or None
            if lab_slug:
                return lab_slug, "coding_lab", track
            return None

        if event_name.startswith("scenario_"):
            scenario_slug = str(metadata.get("scenario_slug") or metadata.get("scenario") or "").strip()
            scenario_type = str(metadata.get("scenario_type") or metadata.get("type") or "scenario").strip()
            domain = str(metadata.get("domain") or "").strip() or None
            if scenario_slug:
                return scenario_slug, scenario_type, domain
            return None

        return None

    def _to_content_insight(self, row: dict[str, Any]) -> UsageContentInsight:
        scores = row.get("scores") or []
        submissions = int(row["submissions"])
        completions = int(row["completions"])
        activity_count = max(1, int(row["activity_count"]))
        last_activity_at = row.get("last_activity_at")
        return UsageContentInsight(
            content_id=str(row["content_id"]),
            content_type=str(row["content_type"]),
            track=row.get("track"),
            views=int(row["views"]),
            submissions=submissions,
            completions=completions,
            completion_rate=self._safe_rate(completions, submissions),
            avg_score=round(sum(scores) / len(scores), 1) if scores else None,
            avg_active_seconds=round(int(row["active_seconds"]) / activity_count),
            last_activity_at=last_activity_at.isoformat() if isinstance(last_activity_at, datetime) else None,
        )

    @staticmethod
    def _safe_rate(numerator: int, denominator: int) -> float:
        if denominator <= 0:
            return 0
        return round((numerator / denominator) * 100, 1)

    def _ensure_table(self, cursor: object) -> None:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS public.user_usage_events (
                id BIGSERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                email TEXT NOT NULL,
                full_name TEXT NOT NULL,
                event_name TEXT NOT NULL,
                session_id TEXT,
                page_url TEXT,
                active_seconds INTEGER NOT NULL DEFAULT 0,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT user_usage_active_seconds_range
                    CHECK (active_seconds BETWEEN 0 AND 300)
            )
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_user_usage_events_user_created
            ON public.user_usage_events (user_id, created_at DESC)
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_user_usage_events_event_created
            ON public.user_usage_events (event_name, created_at DESC)
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_user_usage_events_page_created
            ON public.user_usage_events (page_url, created_at DESC)
            """
        )
        cursor.execute("ALTER TABLE public.user_usage_events ENABLE ROW LEVEL SECURITY")

    def _read_file_records(self) -> list[dict[str, Any]]:
        if not self.storage_path.exists():
            return []
        records: list[dict[str, Any]] = []
        with self.storage_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(record, dict):
                    records.append(record)
        return records

    @staticmethod
    def _safe_metadata(metadata: dict[str, Any]) -> dict[str, str | int | float | bool | None]:
        safe: dict[str, str | int | float | bool | None] = {}
        for key, value in metadata.items():
            if len(safe) >= 30:
                break
            safe_key = str(key).strip()[:80]
            if not safe_key:
                continue
            if value is None or isinstance(value, bool):
                safe[safe_key] = value
            elif isinstance(value, (int, float)):
                safe[safe_key] = value
            else:
                safe[safe_key] = str(value)[:500]
        return safe

    @staticmethod
    def _is_anonymous_user_id(user_id: str) -> bool:
        return user_id.startswith(ANONYMOUS_USER_PREFIX)

    @staticmethod
    def _parse_datetime(value: object) -> datetime:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return datetime.min.replace(tzinfo=timezone.utc)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

    @staticmethod
    def _active_postgres_url(postgres_url: str | None) -> str | None:
        if not postgres_url or postgres_url == DEFAULT_POSTGRES_URL:
            return None
        if "supabase.com" in postgres_url and "sslmode=" not in postgres_url:
            separator = "&" if "?" in postgres_url else "?"
            return f"{postgres_url}{separator}sslmode=require"
        return postgres_url
