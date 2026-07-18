from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PythonTestCase:
    name: str
    args: list[Any]
    expected: Any


@dataclass(frozen=True)
class PythonLabSpec:
    slug: str
    function_name: str
    solution_code: str
    explanation: str
    sample_cases: tuple[PythonTestCase, ...]
    hidden_cases: tuple[PythonTestCase, ...]


def case(name: str, args: list[Any], expected: Any) -> PythonTestCase:
    return PythonTestCase(name=name, args=args, expected=expected)


PYTHON_LAB_SPECS: dict[str, PythonLabSpec] = {
    "python-foundry-01-normalize-payment-statuses": PythonLabSpec(
        slug="python-foundry-01-normalize-payment-statuses",
        function_name="normalize_payment_statuses",
        solution_code="""def normalize_payment_statuses(events):
    mapping = {
        "paid": "success",
        "success": "success",
        "successful": "success",
        "captured": "success",
        "failed": "failed",
        "failure": "failed",
        "declined": "failed",
        "pending": "pending",
        "initiated": "pending",
    }
    counts = {"success": 0, "failed": 0, "pending": 0, "unknown": 0}
    for event in events:
        raw_status = str(event.get("status", "")).strip().lower()
        counts[mapping.get(raw_status, "unknown")] += 1
    return counts""",
        explanation=(
            "This tests dictionary normalization for messy operational status values. "
            "The safe solution strips whitespace, lowercases values, maps known aliases, "
            "and keeps unexpected statuses in an unknown bucket instead of crashing or "
            "silently dropping records."
        ),
        sample_cases=(
            case(
                "visible mixed payment statuses",
                [[
                    {"payment_id": "p1", "status": "PAID"},
                    {"payment_id": "p2", "status": " successful "},
                    {"payment_id": "p3", "status": "DECLINED"},
                    {"payment_id": "p4", "status": "waiting"},
                ]],
                {"success": 2, "failed": 1, "pending": 0, "unknown": 1},
            ),
        ),
        hidden_cases=(
            case(
                "hidden nulls and pending aliases",
                [[
                    {"payment_id": "p10", "status": "initiated"},
                    {"payment_id": "p11", "status": None},
                    {"payment_id": "p12", "status": "Captured"},
                    {"payment_id": "p13", "status": "failure"},
                ]],
                {"success": 1, "failed": 1, "pending": 1, "unknown": 1},
            ),
        ),
    ),
    "python-foundry-02-extract-failed-job-ids": PythonLabSpec(
        slug="python-foundry-02-extract-failed-job-ids",
        function_name="extract_failed_job_ids",
        solution_code="""import re

def extract_failed_job_ids(log_lines):
    failed_ids = []
    seen = set()
    for line in log_lines:
        upper_line = line.upper()
        if "FAILED" not in upper_line and "ERROR" not in upper_line:
            continue
        match = re.search(r"\\b(?:job_id|job)=([A-Za-z0-9_-]+)", line)
        if match:
            job_id = match.group(1)
            if job_id not in seen:
                seen.add(job_id)
                failed_ids.append(job_id)
    return failed_ids""",
        explanation=(
            "This tests log parsing without relying on fixed positions. A production-safe "
            "parser looks for failure words and extracts either job_id= or job= tokens, "
            "while preserving first-seen order and avoiding duplicate alerts."
        ),
        sample_cases=(
            case(
                "visible scheduler log extract",
                [[
                    "2026-06-01 INFO job_id=orders_daily started",
                    "2026-06-01 ERROR job_id=orders_daily FAILED missing partition",
                    "2026-06-01 WARN job=inventory_sync retrying",
                    "2026-06-01 FAILED job=inventory_sync timeout",
                    "2026-06-01 ERROR job_id=orders_daily retry failed",
                ]],
                ["orders_daily", "inventory_sync"],
            ),
        ),
        hidden_cases=(
            case(
                "hidden no false positives",
                [[
                    "INFO job_id=healthy completed",
                    "ERROR request_id=abc no job token here",
                    "FAILED job=refund-load",
                    "error job_id=late_sales source delayed",
                ]],
                ["refund-load", "late_sales"],
            ),
        ),
    ),
    "python-foundry-03-deduplicate-event-ids": PythonLabSpec(
        slug="python-foundry-03-deduplicate-event-ids",
        function_name="deduplicate_event_ids",
        solution_code="""def deduplicate_event_ids(events):
    unique_events = []
    seen_ids = set()
    for event in events:
        event_id = event.get("event_id")
        if event_id is None or event_id in seen_ids:
            continue
        seen_ids.add(event_id)
        unique_events.append(event)
    return unique_events""",
        explanation=(
            "This tests idempotency for repeated ingestion events. The safe approach keeps "
            "the first valid event_id in arrival order and skips duplicate or missing keys, "
            "which prevents reruns from double-counting the same business event."
        ),
        sample_cases=(
            case(
                "visible duplicate events",
                [[
                    {"event_id": "e1", "amount": 100},
                    {"event_id": "e2", "amount": 200},
                    {"event_id": "e1", "amount": 100},
                    {"event_id": None, "amount": 999},
                ]],
                [{"event_id": "e1", "amount": 100}, {"event_id": "e2", "amount": 200}],
            ),
        ),
        hidden_cases=(
            case(
                "hidden repeated late retry",
                [[
                    {"event_id": "a", "amount": 1},
                    {"event_id": "b", "amount": 2},
                    {"event_id": "b", "amount": 3},
                    {"event_id": "c", "amount": 4},
                ]],
                [
                    {"event_id": "a", "amount": 1},
                    {"event_id": "b", "amount": 2},
                    {"event_id": "c", "amount": 4},
                ],
            ),
        ),
    ),
    "python-foundry-04-find-missing-required-fields": PythonLabSpec(
        slug="python-foundry-04-find-missing-required-fields",
        function_name="find_missing_required_fields",
        solution_code="""def find_missing_required_fields(records, required_fields):
    invalid = []
    for record in records:
        missing = []
        for field in required_fields:
            if record.get(field) in (None, ""):
                missing.append(field)
        if missing:
            invalid.append({
                "record_id": record.get("record_id"),
                "missing_fields": missing,
            })
    return invalid""",
        explanation=(
            "This tests basic data-quality validation. The safe implementation treats None "
            "and empty strings as missing, checks every required field, and returns a "
            "structured reject list instead of failing the whole batch."
        ),
        sample_cases=(
            case(
                "visible missing required fields",
                [[
                    {"record_id": 1, "customer_id": "c1", "amount": 100, "event_date": "2026-06-01"},
                    {"record_id": 2, "customer_id": "", "amount": 200, "event_date": "2026-06-01"},
                    {"record_id": 3, "customer_id": "c3", "amount": None, "event_date": "2026-06-02"},
                ], ["customer_id", "amount", "event_date"]],
                [
                    {"record_id": 2, "missing_fields": ["customer_id"]},
                    {"record_id": 3, "missing_fields": ["amount"]},
                ],
            ),
        ),
        hidden_cases=(
            case(
                "hidden multiple missing fields",
                [[
                    {"record_id": "a", "customer_id": None, "amount": "", "event_date": "2026-06-03"},
                    {"record_id": "b", "customer_id": "c2", "amount": 0, "event_date": ""},
                ], ["customer_id", "amount", "event_date"]],
                [
                    {"record_id": "a", "missing_fields": ["customer_id", "amount"]},
                    {"record_id": "b", "missing_fields": ["event_date"]},
                ],
            ),
        ),
    ),
    "python-foundry-05-summarize-inventory-by-sku": PythonLabSpec(
        slug="python-foundry-05-summarize-inventory-by-sku",
        function_name="summarize_inventory_by_sku",
        solution_code="""def summarize_inventory_by_sku(movements):
    totals = {}
    for movement in movements:
        sku = movement.get("sku")
        quantity = movement.get("quantity", 0) or 0
        movement_type = str(movement.get("movement_type", "")).lower()
        if not sku:
            continue
        signed_quantity = -quantity if movement_type in {"out", "sale", "ship"} else quantity
        totals[sku] = totals.get(sku, 0) + signed_quantity
    return [{"sku": sku, "on_hand": totals[sku]} for sku in sorted(totals)]""",
        explanation=(
            "This tests aggregation with business signs. A safe inventory utility handles "
            "outbound movements as negative, skips bad keys, and sorts the result so downstream "
            "tests and reconciliation reports are deterministic."
        ),
        sample_cases=(
            case(
                "visible stock movements",
                [[
                    {"sku": "A", "movement_type": "in", "quantity": 10},
                    {"sku": "A", "movement_type": "sale", "quantity": 3},
                    {"sku": "B", "movement_type": "ship", "quantity": 2},
                    {"sku": "B", "movement_type": "in", "quantity": 8},
                ]],
                [{"sku": "A", "on_hand": 7}, {"sku": "B", "on_hand": 6}],
            ),
        ),
        hidden_cases=(
            case(
                "hidden missing sku and zero quantity",
                [[
                    {"sku": "Z", "movement_type": "OUT", "quantity": 5},
                    {"sku": "Z", "movement_type": "in", "quantity": 5},
                    {"sku": "", "movement_type": "in", "quantity": 99},
                    {"sku": "Y", "movement_type": "in", "quantity": None},
                ]],
                [{"sku": "Y", "on_hand": 0}, {"sku": "Z", "on_hand": 0}],
            ),
        ),
    ),
    "python-foundry-06-parse-partition-dates": PythonLabSpec(
        slug="python-foundry-06-parse-partition-dates",
        function_name="parse_partition_dates",
        solution_code="""import re

def parse_partition_dates(paths):
    dates = set()
    for path in paths:
        match = re.search(r"(?:dt|date)=(\\d{4}-\\d{2}-\\d{2})", path)
        if match:
            dates.add(match.group(1))
    return sorted(dates)""",
        explanation=(
            "This tests extracting partition metadata from object-storage paths. The safe "
            "solution supports both dt= and date= conventions, ignores malformed paths, "
            "deduplicates retries, and returns sorted dates for stable comparison."
        ),
        sample_cases=(
            case(
                "visible partition paths",
                [[
                    "s3://lake/orders/dt=2026-06-01/file1.parquet",
                    "s3://lake/orders/dt=2026-06-01/file2.parquet",
                    "s3://lake/orders/date=2026-06-02/file.parquet",
                    "s3://lake/orders/no-date/file.parquet",
                ]],
                ["2026-06-01", "2026-06-02"],
            ),
        ),
        hidden_cases=(
            case(
                "hidden mixed folders",
                [[
                    "/bronze/events/hour=10",
                    "/bronze/events/dt=2026-07-10/part-0",
                    "/bronze/events/date=2026-07-09/part-1",
                ]],
                ["2026-07-09", "2026-07-10"],
            ),
        ),
    ),
    "python-foundry-07-mask-customer-emails": PythonLabSpec(
        slug="python-foundry-07-mask-customer-emails",
        function_name="mask_customer_emails",
        solution_code="""def mask_customer_emails(emails):
    masked = []
    for email in emails:
        if not isinstance(email, str) or "@" not in email:
            masked.append(None)
            continue
        local, domain = email.strip().split("@", 1)
        if not local or not domain:
            masked.append(None)
            continue
        masked.append(f"{local[0].lower()}***@{domain.lower()}")
    return masked""",
        explanation=(
            "This tests small PII-safe transformations. The safe solution validates the "
            "shape, avoids exposing full local parts, normalizes case, and returns None for "
            "bad values instead of throwing during a batch job."
        ),
        sample_cases=(
            case(
                "visible email masking",
                [["Asha.Kumar@Example.COM", "bad-email", "", None]],
                ["a***@example.com", None, None, None],
            ),
        ),
        hidden_cases=(
            case(
                "hidden whitespace and empty domain",
                [[" user@DOMAIN.in ", "x@", "@domain.com"]],
                ["u***@domain.in", None, None],
            ),
        ),
    ),
    "python-foundry-08-calculate-success-rate": PythonLabSpec(
        slug="python-foundry-08-calculate-success-rate",
        function_name="calculate_success_rate",
        solution_code="""def calculate_success_rate(runs):
    if not runs:
        return 0.0
    successful = 0
    for run in runs:
        status = str(run.get("status", "")).strip().lower()
        if status in {"success", "successful", "passed"}:
            successful += 1
    return round((successful / len(runs)) * 100, 2)""",
        explanation=(
            "This tests metric calculation with empty input and status aliases. Returning "
            "0.0 for no runs prevents division-by-zero incidents, and rounding produces "
            "stable dashboard values."
        ),
        sample_cases=(
            case(
                "visible run success rate",
                [[
                    {"run_id": "r1", "status": "SUCCESS"},
                    {"run_id": "r2", "status": "failed"},
                    {"run_id": "r3", "status": "passed"},
                ]],
                66.67,
            ),
        ),
        hidden_cases=(
            case("hidden empty run list", [[]], 0.0),
            case(
                "hidden status aliases",
                [[{"status": "successful"}, {"status": "SUCCESS"}, {"status": "SKIPPED"}, {"status": ""}]],
                50.0,
            ),
        ),
    ),
    "python-foundry-09-latest-customer-updates": PythonLabSpec(
        slug="python-foundry-09-latest-customer-updates",
        function_name="latest_customer_updates",
        solution_code="""def latest_customer_updates(updates):
    latest = {}
    for update in updates:
        customer_id = update.get("customer_id")
        if customer_id is None:
            continue
        current = latest.get(customer_id)
        sort_key = (str(update.get("updated_at", "")), update.get("sequence", 0) or 0)
        if current is None or sort_key > current[0]:
            latest[customer_id] = (sort_key, update)
    return [latest[key][1] for key in sorted(latest)]""",
        explanation=(
            "This tests deterministic latest-record selection. The safe solution partitions "
            "by customer_id, orders by updated_at and sequence as a tie-breaker, skips bad "
            "keys, and sorts output for repeatable validation."
        ),
        sample_cases=(
            case(
                "visible same timestamp tie",
                [[
                    {"customer_id": 10, "status": "silver", "updated_at": "2026-06-01T10:00:00", "sequence": 1},
                    {"customer_id": 10, "status": "gold", "updated_at": "2026-06-01T10:00:00", "sequence": 2},
                    {"customer_id": 11, "status": "active", "updated_at": "2026-06-01T09:00:00", "sequence": 1},
                ]],
                [
                    {"customer_id": 10, "status": "gold", "updated_at": "2026-06-01T10:00:00", "sequence": 2},
                    {"customer_id": 11, "status": "active", "updated_at": "2026-06-01T09:00:00", "sequence": 1},
                ],
            ),
        ),
        hidden_cases=(
            case(
                "hidden older late arrival ignored",
                [[
                    {"customer_id": 5, "status": "new", "updated_at": "2026-06-01T01:00:00", "sequence": 9},
                    {"customer_id": 5, "status": "active", "updated_at": "2026-06-02T01:00:00", "sequence": 1},
                    {"customer_id": None, "status": "bad", "updated_at": "2026-06-03T01:00:00", "sequence": 1},
                ]],
                [{"customer_id": 5, "status": "active", "updated_at": "2026-06-02T01:00:00", "sequence": 1}],
            ),
        ),
    ),
    "python-foundry-10-reconcile-snapshot-keys": PythonLabSpec(
        slug="python-foundry-10-reconcile-snapshot-keys",
        function_name="reconcile_snapshot_keys",
        solution_code="""def reconcile_snapshot_keys(source_keys, warehouse_keys):
    source = set(source_keys)
    warehouse = set(warehouse_keys)
    return {
        "missing_in_warehouse": sorted(source - warehouse),
        "extra_in_warehouse": sorted(warehouse - source),
        "matched": sorted(source & warehouse),
    }""",
        explanation=(
            "This tests reconciliation thinking. Sets make key comparison clear, while "
            "sorted lists keep the output deterministic for audit reports and tests."
        ),
        sample_cases=(
            case(
                "visible source versus warehouse",
                [[1001, 1002, 1003, 1003], [1002, 1003, 1004]],
                {"missing_in_warehouse": [1001], "extra_in_warehouse": [1004], "matched": [1002, 1003]},
            ),
        ),
        hidden_cases=(
            case(
                "hidden all matched after dedupe",
                [["a", "b", "b"], ["b", "a"]],
                {"missing_in_warehouse": [], "extra_in_warehouse": [], "matched": ["a", "b"]},
            ),
        ),
    ),
    "python-foundry-11-sessionize-clickstream-events": PythonLabSpec(
        slug="python-foundry-11-sessionize-clickstream-events",
        function_name="sessionize_clickstream_events",
        solution_code="""from datetime import datetime

def sessionize_clickstream_events(events, gap_minutes):
    by_user = {}
    for event in events:
        by_user.setdefault(event["user_id"], []).append(event)

    sessions = []
    for user_id in sorted(by_user):
        ordered = sorted(by_user[user_id], key=lambda event: event["event_ts"])
        session_number = 0
        current = None
        previous_ts = None
        for event in ordered:
            event_ts = datetime.fromisoformat(event["event_ts"])
            starts_new = previous_ts is None or (event_ts - previous_ts).total_seconds() > gap_minutes * 60
            if starts_new:
                if current:
                    sessions.append(current)
                session_number += 1
                current = {
                    "user_id": user_id,
                    "session_id": f"{user_id}-{session_number}",
                    "event_count": 0,
                    "start_ts": event["event_ts"],
                    "end_ts": event["event_ts"],
                }
            current["event_count"] += 1
            current["end_ts"] = event["event_ts"]
            previous_ts = event_ts
        if current:
            sessions.append(current)
    return sessions""",
        explanation=(
            "This tests sessionization by user and event time. Sorting within each user and "
            "starting a new session only when the gap is greater than the threshold avoids "
            "wrong splits from out-of-order clickstream arrival."
        ),
        sample_cases=(
            case(
                "visible thirty minute sessions",
                [[
                    {"user_id": "u1", "event_ts": "2026-06-01T10:00:00"},
                    {"user_id": "u1", "event_ts": "2026-06-01T10:20:00"},
                    {"user_id": "u1", "event_ts": "2026-06-01T11:00:01"},
                    {"user_id": "u2", "event_ts": "2026-06-01T09:00:00"},
                ], 30],
                [
                    {"user_id": "u1", "session_id": "u1-1", "event_count": 2, "start_ts": "2026-06-01T10:00:00", "end_ts": "2026-06-01T10:20:00"},
                    {"user_id": "u1", "session_id": "u1-2", "event_count": 1, "start_ts": "2026-06-01T11:00:01", "end_ts": "2026-06-01T11:00:01"},
                    {"user_id": "u2", "session_id": "u2-1", "event_count": 1, "start_ts": "2026-06-01T09:00:00", "end_ts": "2026-06-01T09:00:00"},
                ],
            ),
        ),
        hidden_cases=(
            case(
                "hidden out-of-order events",
                [[
                    {"user_id": "u1", "event_ts": "2026-06-01T10:10:00"},
                    {"user_id": "u1", "event_ts": "2026-06-01T10:00:00"},
                    {"user_id": "u1", "event_ts": "2026-06-01T10:40:00"},
                ], 30],
                [
                    {"user_id": "u1", "session_id": "u1-1", "event_count": 3, "start_ts": "2026-06-01T10:00:00", "end_ts": "2026-06-01T10:40:00"},
                ],
            ),
        ),
    ),
    "python-foundry-12-detect-delayed-jobs": PythonLabSpec(
        slug="python-foundry-12-detect-delayed-jobs",
        function_name="detect_delayed_jobs",
        solution_code="""from datetime import datetime, timedelta

def detect_delayed_jobs(runs, sla_minutes):
    delayed = []
    for run in runs:
        expected_at = datetime.fromisoformat(run["expected_at"])
        completed_at = run.get("completed_at")
        if completed_at is None:
            delayed.append(run["job_id"])
            continue
        completed_time = datetime.fromisoformat(completed_at)
        if completed_time > expected_at + timedelta(minutes=sla_minutes):
            delayed.append(run["job_id"])
    return sorted(delayed)""",
        explanation=(
            "This tests SLA checks for orchestration metadata. Missing completion times and "
            "late completions both indicate delayed jobs, and sorting gives an operator-friendly "
            "deterministic alert list."
        ),
        sample_cases=(
            case(
                "visible delayed jobs",
                [[
                    {"job_id": "orders", "expected_at": "2026-06-01T02:00:00", "completed_at": "2026-06-01T02:08:00"},
                    {"job_id": "payments", "expected_at": "2026-06-01T02:00:00", "completed_at": "2026-06-01T02:40:00"},
                    {"job_id": "refunds", "expected_at": "2026-06-01T02:00:00", "completed_at": None},
                ], 15],
                ["payments", "refunds"],
            ),
        ),
        hidden_cases=(
            case(
                "hidden boundary is not late",
                [[
                    {"job_id": "a", "expected_at": "2026-06-01T00:00:00", "completed_at": "2026-06-01T00:15:00"},
                    {"job_id": "b", "expected_at": "2026-06-01T00:00:00", "completed_at": "2026-06-01T00:15:01"},
                ], 15],
                ["b"],
            ),
        ),
    ),
    "python-foundry-13-build-retry-summary": PythonLabSpec(
        slug="python-foundry-13-build-retry-summary",
        function_name="build_retry_summary",
        solution_code="""def build_retry_summary(attempts):
    grouped = {}
    for attempt in attempts:
        key = (attempt["dag_id"], attempt["task_id"])
        current = grouped.setdefault(key, {
            "dag_id": attempt["dag_id"],
            "task_id": attempt["task_id"],
            "max_attempt": 0,
            "failed_attempts": 0,
            "final_status": "",
        })
        attempt_number = attempt.get("attempt", 0) or 0
        status = str(attempt.get("status", "")).lower()
        if status == "failed":
            current["failed_attempts"] += 1
        if attempt_number >= current["max_attempt"]:
            current["max_attempt"] = attempt_number
            current["final_status"] = status
    return sorted(grouped.values(), key=lambda row: (row["dag_id"], row["task_id"]))""",
        explanation=(
            "This tests grouping retry attempts into a task-level summary. The safe approach "
            "counts failed attempts separately from final status and uses the highest attempt "
            "number as the final state."
        ),
        sample_cases=(
            case(
                "visible retry attempts",
                [[
                    {"dag_id": "sales", "task_id": "load", "attempt": 1, "status": "failed"},
                    {"dag_id": "sales", "task_id": "load", "attempt": 2, "status": "success"},
                    {"dag_id": "sales", "task_id": "quality", "attempt": 1, "status": "failed"},
                ]],
                [
                    {"dag_id": "sales", "task_id": "load", "max_attempt": 2, "failed_attempts": 1, "final_status": "success"},
                    {"dag_id": "sales", "task_id": "quality", "max_attempt": 1, "failed_attempts": 1, "final_status": "failed"},
                ],
            ),
        ),
        hidden_cases=(
            case(
                "hidden multiple dags",
                [[
                    {"dag_id": "a", "task_id": "t2", "attempt": 1, "status": "success"},
                    {"dag_id": "a", "task_id": "t1", "attempt": 1, "status": "failed"},
                    {"dag_id": "a", "task_id": "t1", "attempt": 2, "status": "failed"},
                ]],
                [
                    {"dag_id": "a", "task_id": "t1", "max_attempt": 2, "failed_attempts": 2, "final_status": "failed"},
                    {"dag_id": "a", "task_id": "t2", "max_attempt": 1, "failed_attempts": 0, "final_status": "success"},
                ],
            ),
        ),
    ),
    "python-foundry-14-aggregate-daily-net-revenue": PythonLabSpec(
        slug="python-foundry-14-aggregate-daily-net-revenue",
        function_name="aggregate_daily_net_revenue",
        solution_code="""def aggregate_daily_net_revenue(events):
    totals = {}
    for event in events:
        status = str(event.get("status", "")).upper()
        if status not in {"SUCCESS", "SUCCESSFUL", "PAID"}:
            continue
        event_date = event["event_date"]
        amount = event.get("amount", 0) or 0
        event_type = str(event.get("event_type", "SALE")).upper()
        signed_amount = -amount if event_type == "REFUND" else amount
        totals[event_date] = totals.get(event_date, 0) + signed_amount
    return [{"event_date": day, "net_revenue": totals[day]} for day in sorted(totals)]""",
        explanation=(
            "This tests finance-friendly aggregation. A safe net revenue calculation filters "
            "to successful financial events, subtracts refunds, and returns the daily grain "
            "that dashboards expect."
        ),
        sample_cases=(
            case(
                "visible sales and refunds",
                [[
                    {"event_date": "2026-06-01", "event_type": "SALE", "status": "SUCCESS", "amount": 100},
                    {"event_date": "2026-06-01", "event_type": "REFUND", "status": "SUCCESS", "amount": 20},
                    {"event_date": "2026-06-02", "event_type": "SALE", "status": "FAILED", "amount": 999},
                    {"event_date": "2026-06-02", "event_type": "SALE", "status": "SUCCESSFUL", "amount": 50},
                ]],
                [{"event_date": "2026-06-01", "net_revenue": 80}, {"event_date": "2026-06-02", "net_revenue": 50}],
            ),
        ),
        hidden_cases=(
            case(
                "hidden paid alias and cancellation",
                [[
                    {"event_date": "2026-07-01", "event_type": "SALE", "status": "PAID", "amount": 200},
                    {"event_date": "2026-07-01", "event_type": "REFUND", "status": "PAID", "amount": 35},
                    {"event_date": "2026-07-01", "event_type": "SALE", "status": "CANCELLED", "amount": 1000},
                ]],
                [{"event_date": "2026-07-01", "net_revenue": 165}],
            ),
        ),
    ),
    "python-foundry-15-find-missing-partitions": PythonLabSpec(
        slug="python-foundry-15-find-missing-partitions",
        function_name="find_missing_partitions",
        solution_code="""import re

def find_missing_partitions(expected_dates, available_paths):
    available_dates = set()
    for path in available_paths:
        match = re.search(r"(?:dt|date)=(\\d{4}-\\d{2}-\\d{2})", path)
        if match:
            available_dates.add(match.group(1))
    return [date for date in expected_dates if date not in available_dates]""",
        explanation=(
            "This tests partition completeness checks. The safe solution extracts dates from "
            "available paths, deduplicates files within a partition, and preserves the expected "
            "date order in the missing list."
        ),
        sample_cases=(
            case(
                "visible missing date",
                [["2026-06-01", "2026-06-02", "2026-06-03"], [
                    "s3://bucket/orders/dt=2026-06-01/part-0",
                    "s3://bucket/orders/date=2026-06-03/part-0",
                ]],
                ["2026-06-02"],
            ),
        ),
        hidden_cases=(
            case(
                "hidden duplicate files",
                [["2026-07-01", "2026-07-02"], [
                    "/x/dt=2026-07-01/a",
                    "/x/dt=2026-07-01/b",
                ]],
                ["2026-07-02"],
            ),
        ),
    ),
    "python-foundry-16-normalize-schema-drift-records": PythonLabSpec(
        slug="python-foundry-16-normalize-schema-drift-records",
        function_name="normalize_schema_drift_records",
        solution_code="""def normalize_schema_drift_records(records, expected_fields):
    normalized = []
    for record in records:
        output = {}
        for field in expected_fields:
            output[field] = record.get(field)
        normalized.append(output)
    return normalized""",
        explanation=(
            "This tests schema-drift tolerance for semi-structured records. The safe solution "
            "projects only expected fields, fills missing columns with None, and ignores extra "
            "fields so a new upstream column does not break the pipeline."
        ),
        sample_cases=(
            case(
                "visible extra and missing fields",
                [[
                    {"order_id": 1, "amount": 100, "currency": "INR", "coupon": "NEW"},
                    {"order_id": 2, "currency": "INR"},
                ], ["order_id", "amount", "currency"]],
                [
                    {"order_id": 1, "amount": 100, "currency": "INR"},
                    {"order_id": 2, "amount": None, "currency": "INR"},
                ],
            ),
        ),
        hidden_cases=(
            case(
                "hidden empty input",
                [[], ["id", "value"]],
                [],
            ),
        ),
    ),
    "python-foundry-17-build-compaction-plan": PythonLabSpec(
        slug="python-foundry-17-build-compaction-plan",
        function_name="build_compaction_plan",
        solution_code="""def build_compaction_plan(files, target_mb):
    by_partition = {}
    for file_info in files:
        by_partition.setdefault(file_info["partition"], []).append(file_info)

    plan = []
    for partition in sorted(by_partition):
        current_files = []
        current_size = 0
        for file_info in sorted(by_partition[partition], key=lambda item: item["path"]):
            size = file_info.get("size_mb", 0) or 0
            if current_files and current_size + size > target_mb:
                plan.append({
                    "partition": partition,
                    "files": current_files,
                    "total_mb": current_size,
                })
                current_files = []
                current_size = 0
            current_files.append(file_info["path"])
            current_size += size
        if current_files:
            plan.append({
                "partition": partition,
                "files": current_files,
                "total_mb": current_size,
            })
    return plan""",
        explanation=(
            "This tests practical file-layout reasoning. The solution groups files by partition, "
            "creates deterministic compactable batches under the target size, and avoids mixing "
            "different partitions in one compaction output."
        ),
        sample_cases=(
            case(
                "visible small file groups",
                [[
                    {"partition": "dt=2026-06-01", "path": "b.parquet", "size_mb": 40},
                    {"partition": "dt=2026-06-01", "path": "a.parquet", "size_mb": 50},
                    {"partition": "dt=2026-06-01", "path": "c.parquet", "size_mb": 30},
                    {"partition": "dt=2026-06-02", "path": "d.parquet", "size_mb": 20},
                ], 100],
                [
                    {"partition": "dt=2026-06-01", "files": ["a.parquet", "b.parquet"], "total_mb": 90},
                    {"partition": "dt=2026-06-01", "files": ["c.parquet"], "total_mb": 30},
                    {"partition": "dt=2026-06-02", "files": ["d.parquet"], "total_mb": 20},
                ],
            ),
        ),
        hidden_cases=(
            case(
                "hidden exact boundary",
                [[
                    {"partition": "p", "path": "1", "size_mb": 60},
                    {"partition": "p", "path": "2", "size_mb": 40},
                    {"partition": "p", "path": "3", "size_mb": 1},
                ], 100],
                [
                    {"partition": "p", "files": ["1", "2"], "total_mb": 100},
                    {"partition": "p", "files": ["3"], "total_mb": 1},
                ],
            ),
        ),
    ),
    "python-foundry-18-top-customers-with-ties": PythonLabSpec(
        slug="python-foundry-18-top-customers-with-ties",
        function_name="top_customers_with_ties",
        solution_code="""def top_customers_with_ties(transactions, n):
    totals = {}
    for transaction in transactions:
        customer_id = transaction["customer_id"]
        totals[customer_id] = totals.get(customer_id, 0) + (transaction.get("amount", 0) or 0)
    ranked = sorted(totals.items(), key=lambda item: (-item[1], item[0]))
    if n <= 0 or not ranked:
        return []
    cutoff_index = min(n, len(ranked)) - 1
    cutoff_revenue = ranked[cutoff_index][1]
    return [
        {"customer_id": customer_id, "revenue": revenue}
        for customer_id, revenue in ranked
        if revenue >= cutoff_revenue
    ]""",
        explanation=(
            "This tests Top-N logic with ties. The safe implementation aggregates first, "
            "uses the Nth revenue as a cutoff, includes tied customers, and sorts by revenue "
            "then customer_id for deterministic output."
        ),
        sample_cases=(
            case(
                "visible top two with tie",
                [[
                    {"customer_id": 1, "amount": 100},
                    {"customer_id": 2, "amount": 80},
                    {"customer_id": 3, "amount": 80},
                    {"customer_id": 4, "amount": 10},
                ], 2],
                [
                    {"customer_id": 1, "revenue": 100},
                    {"customer_id": 2, "revenue": 80},
                    {"customer_id": 3, "revenue": 80},
                ],
            ),
        ),
        hidden_cases=(
            case("hidden zero n", [[{"customer_id": 1, "amount": 10}], 0], []),
        ),
    ),
    "python-foundry-19-apply-cdc-events": PythonLabSpec(
        slug="python-foundry-19-apply-cdc-events",
        function_name="apply_cdc_events",
        solution_code="""def apply_cdc_events(events):
    latest = {}
    for event in events:
        key = event["key"]
        if key not in latest or event["sequence"] > latest[key]["sequence"]:
            latest[key] = event

    current_rows = []
    for key in sorted(latest):
        event = latest[key]
        if event["op"] == "DELETE":
            continue
        row = {"key": key}
        row.update(event.get("payload") or {})
        current_rows.append(row)
    return current_rows""",
        explanation=(
            "This tests CDC current-state materialization. The safe solution picks the latest "
            "event by sequence for each key, treats DELETE as a tombstone, and returns only "
            "active rows at the requested key grain."
        ),
        sample_cases=(
            case(
                "visible update and delete",
                [[
                    {"key": "c1", "op": "INSERT", "sequence": 1, "payload": {"status": "new"}},
                    {"key": "c1", "op": "UPDATE", "sequence": 2, "payload": {"status": "active"}},
                    {"key": "c2", "op": "INSERT", "sequence": 1, "payload": {"status": "new"}},
                    {"key": "c2", "op": "DELETE", "sequence": 3, "payload": None},
                ]],
                [{"key": "c1", "status": "active"}],
            ),
        ),
        hidden_cases=(
            case(
                "hidden out-of-order CDC",
                [[
                    {"key": "a", "op": "UPDATE", "sequence": 5, "payload": {"score": 2}},
                    {"key": "a", "op": "UPDATE", "sequence": 3, "payload": {"score": 1}},
                    {"key": "b", "op": "INSERT", "sequence": 1, "payload": {"score": 9}},
                ]],
                [{"key": "a", "score": 2}, {"key": "b", "score": 9}],
            ),
        ),
    ),
    "python-foundry-20-build-dependency-run-order": PythonLabSpec(
        slug="python-foundry-20-build-dependency-run-order",
        function_name="build_dependency_run_order",
        solution_code="""def build_dependency_run_order(tasks):
    dependencies = {task["task_id"]: set(task.get("depends_on", [])) for task in tasks}
    order = []

    while dependencies:
        ready = sorted(task_id for task_id, deps in dependencies.items() if not deps)
        if not ready:
            return ["CYCLE_DETECTED"]
        for task_id in ready:
            order.append(task_id)
            dependencies.pop(task_id)
        for deps in dependencies.values():
            deps.difference_update(ready)
    return order""",
        explanation=(
            "This tests DAG dependency reasoning. The safe solution repeatedly runs tasks "
            "whose dependencies are satisfied, sorts ready tasks for deterministic output, "
            "and returns a clear cycle marker instead of looping forever."
        ),
        sample_cases=(
            case(
                "visible DAG order",
                [[
                    {"task_id": "gold", "depends_on": ["silver"]},
                    {"task_id": "bronze", "depends_on": []},
                    {"task_id": "silver", "depends_on": ["bronze"]},
                ]],
                ["bronze", "silver", "gold"],
            ),
        ),
        hidden_cases=(
            case(
                "hidden parallel dependencies",
                [[
                    {"task_id": "c", "depends_on": ["a", "b"]},
                    {"task_id": "b", "depends_on": []},
                    {"task_id": "a", "depends_on": []},
                ]],
                ["a", "b", "c"],
            ),
            case(
                "hidden cycle detection",
                [[
                    {"task_id": "a", "depends_on": ["b"]},
                    {"task_id": "b", "depends_on": ["a"]},
                ]],
                ["CYCLE_DETECTED"],
            ),
        ),
    ),
    "python-foundry-21-rolling-error-rate": PythonLabSpec(
        slug="python-foundry-21-rolling-error-rate",
        function_name="rolling_error_rate",
        solution_code="""def rolling_error_rate(events, window_size):
    rates = []
    for index in range(len(events)):
        window = events[max(0, index - window_size + 1): index + 1]
        errors = sum(1 for event in window if str(event.get("status", "")).lower() in {"error", "failed"})
        rates.append(round(errors / len(window), 2))
    return rates""",
        explanation=(
            "This tests sliding-window metric calculation. The safe solution uses a trailing "
            "window at each event, handles the warm-up period before the window is full, and "
            "rounds rates for stable alerting comparisons."
        ),
        sample_cases=(
            case(
                "visible trailing error rate",
                [[
                    {"status": "ok"},
                    {"status": "error"},
                    {"status": "failed"},
                    {"status": "ok"},
                ], 3],
                [0.0, 0.5, 0.67, 0.67],
            ),
        ),
        hidden_cases=(
            case(
                "hidden one event window",
                [[{"status": "failed"}, {"status": "ok"}], 1],
                [1.0, 0.0],
            ),
        ),
    ),
    "python-foundry-22-deduplicate-exactly-once-events": PythonLabSpec(
        slug="python-foundry-22-deduplicate-exactly-once-events",
        function_name="deduplicate_exactly_once_events",
        solution_code="""def deduplicate_exactly_once_events(events):
    latest = {}
    for event in events:
        event_id = event["event_id"]
        sort_key = (event.get("batch_id", 0) or 0, event.get("offset", 0) or 0)
        if event_id not in latest or sort_key > latest[event_id][0]:
            latest[event_id] = (sort_key, event)
    return [latest[event_id][1] for event_id in sorted(latest)]""",
        explanation=(
            "This tests exactly-once style deduplication across retries. The safe solution "
            "keeps the highest batch and offset per event_id, which protects downstream "
            "tables from replayed lower-offset records."
        ),
        sample_cases=(
            case(
                "visible replayed events",
                [[
                    {"event_id": "e1", "batch_id": 1, "offset": 10, "amount": 100},
                    {"event_id": "e1", "batch_id": 2, "offset": 3, "amount": 100},
                    {"event_id": "e2", "batch_id": 1, "offset": 11, "amount": 50},
                ]],
                [
                    {"event_id": "e1", "batch_id": 2, "offset": 3, "amount": 100},
                    {"event_id": "e2", "batch_id": 1, "offset": 11, "amount": 50},
                ],
            ),
        ),
        hidden_cases=(
            case(
                "hidden same batch higher offset wins",
                [[
                    {"event_id": "x", "batch_id": 4, "offset": 1, "amount": 1},
                    {"event_id": "x", "batch_id": 4, "offset": 2, "amount": 2},
                ]],
                [{"event_id": "x", "batch_id": 4, "offset": 2, "amount": 2}],
            ),
        ),
    ),
    "python-foundry-23-prepare-scd2-changes": PythonLabSpec(
        slug="python-foundry-23-prepare-scd2-changes",
        function_name="prepare_scd2_changes",
        solution_code="""def prepare_scd2_changes(existing_rows, incoming_rows):
    current_by_customer = {
        row["customer_id"]: row
        for row in existing_rows
        if row.get("current_flag") is True
    }
    expire_keys = []
    new_rows = []
    for incoming in incoming_rows:
        customer_id = incoming["customer_id"]
        current = current_by_customer.get(customer_id)
        if current is None or current.get("hash") != incoming.get("hash"):
            if current is not None:
                expire_keys.append(customer_id)
            new_rows.append({
                "customer_id": customer_id,
                "hash": incoming.get("hash"),
                "effective_start_date": incoming.get("effective_date"),
                "effective_end_date": None,
                "current_flag": True,
            })
    return {
        "expire_keys": sorted(expire_keys),
        "new_rows": sorted(new_rows, key=lambda row: row["customer_id"]),
    }""",
        explanation=(
            "This tests SCD Type 2 change detection. The safe solution compares incoming "
            "hashes to only current dimension rows, expires changed existing customers, and "
            "creates new current rows for changed or brand-new customers."
        ),
        sample_cases=(
            case(
                "visible changed and new customer",
                [[
                    {"customer_id": 1, "hash": "h_old", "current_flag": True},
                    {"customer_id": 2, "hash": "h_same", "current_flag": True},
                ], [
                    {"customer_id": 1, "hash": "h_new", "effective_date": "2026-06-01"},
                    {"customer_id": 2, "hash": "h_same", "effective_date": "2026-06-01"},
                    {"customer_id": 3, "hash": "h3", "effective_date": "2026-06-01"},
                ]],
                {
                    "expire_keys": [1],
                    "new_rows": [
                        {"customer_id": 1, "hash": "h_new", "effective_start_date": "2026-06-01", "effective_end_date": None, "current_flag": True},
                        {"customer_id": 3, "hash": "h3", "effective_start_date": "2026-06-01", "effective_end_date": None, "current_flag": True},
                    ],
                },
            ),
        ),
        hidden_cases=(
            case(
                "hidden no changes",
                [[{"customer_id": 10, "hash": "a", "current_flag": True}], [{"customer_id": 10, "hash": "a", "effective_date": "2026-07-01"}]],
                {"expire_keys": [], "new_rows": []},
            ),
        ),
    ),
    "python-foundry-24-detect-metric-drift": PythonLabSpec(
        slug="python-foundry-24-detect-metric-drift",
        function_name="detect_metric_drift",
        solution_code="""def detect_metric_drift(baseline, current, threshold_pct):
    drifted = []
    for metric in sorted(set(baseline) | set(current)):
        base_value = baseline.get(metric, 0) or 0
        current_value = current.get(metric, 0) or 0
        if base_value == 0:
            change_pct = 0.0 if current_value == 0 else 100.0
        else:
            change_pct = round(((current_value - base_value) / base_value) * 100, 2)
        if abs(change_pct) > threshold_pct:
            drifted.append({
                "metric": metric,
                "baseline": base_value,
                "current": current_value,
                "change_pct": change_pct,
            })
    return drifted""",
        explanation=(
            "This tests metric drift checks for daily monitoring. The safe solution compares "
            "both increases and drops, handles zero baselines explicitly, and returns only "
            "metrics beyond the configured tolerance."
        ),
        sample_cases=(
            case(
                "visible metric drift",
                [{"orders": 1000, "revenue": 50000, "refunds": 10}, {"orders": 900, "revenue": 42000, "refunds": 30}, 15],
                [
                    {"metric": "refunds", "baseline": 10, "current": 30, "change_pct": 200.0},
                    {"metric": "revenue", "baseline": 50000, "current": 42000, "change_pct": -16.0},
                ],
            ),
        ),
        hidden_cases=(
            case(
                "hidden zero baseline",
                [{"bad_records": 0}, {"bad_records": 5}, 50],
                [{"metric": "bad_records", "baseline": 0, "current": 5, "change_pct": 100.0}],
            ),
        ),
    ),
    "python-foundry-25-allocate-backfill-windows": PythonLabSpec(
        slug="python-foundry-25-allocate-backfill-windows",
        function_name="allocate_backfill_windows",
        solution_code="""from datetime import date, timedelta

def allocate_backfill_windows(start_date, end_date, max_days, blackout_dates):
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    blackouts = {date.fromisoformat(day) for day in blackout_dates}
    windows = []
    current_start = None
    current_end = None

    day = start
    while day <= end:
        if day in blackouts:
            if current_start is not None:
                windows.append([current_start.isoformat(), current_end.isoformat()])
                current_start = None
                current_end = None
            day += timedelta(days=1)
            continue

        if current_start is None:
            current_start = current_end = day
        elif (day - current_start).days >= max_days:
            windows.append([current_start.isoformat(), current_end.isoformat()])
            current_start = current_end = day
        else:
            current_end = day
        day += timedelta(days=1)

    if current_start is not None:
        windows.append([current_start.isoformat(), current_end.isoformat()])
    return windows""",
        explanation=(
            "This tests operational backfill planning. The safe solution creates bounded "
            "date windows, skips blackout dates, and keeps ranges contiguous so operators "
            "can rerun old partitions without overloading the warehouse."
        ),
        sample_cases=(
            case(
                "visible blackout-aware windows",
                ["2026-06-01", "2026-06-07", 3, ["2026-06-04"]],
                [["2026-06-01", "2026-06-03"], ["2026-06-05", "2026-06-07"]],
            ),
        ),
        hidden_cases=(
            case(
                "hidden split by max days",
                ["2026-07-01", "2026-07-05", 2, []],
                [["2026-07-01", "2026-07-02"], ["2026-07-03", "2026-07-04"], ["2026-07-05", "2026-07-05"]],
            ),
        ),
    ),
}

