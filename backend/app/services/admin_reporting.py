"""Read-only, bounded operational reporting. No schema creation or customer mutations."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
import json
import re
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

from app.core.config import get_settings
from app.services.usage_store import UsageStore, QUESTION_SUBMITTED_EVENTS, QUESTION_COMPLETED_EVENTS

IST = ZoneInfo("Asia/Kolkata")
MAX_ROWS = 200_000


def timestamp(value):
    try:
        result = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result
    except (TypeError, ValueError):
        return None


def safe_label(value, fallback="unknown"):
    # Never echo arbitrary URLs, messages, names, emails, or credentials in reporting.
    value = str(value or "")
    return value if re.fullmatch(r"[a-zA-Z0-9_.:/-]{1,100}", value) and "://" not in value else fallback


def source_label(record):
    try:
        query = parse_qs(urlsplit(str(record.get("page_url") or "")).query)
        host = urlsplit(str((record.get("metadata") or {}).get("referrer") or "")).hostname or ""
    except ValueError:
        return "invalid / unknown"
    source = safe_label(query.get("utm_source", [""])[0])
    video = safe_label(query.get("utm_content", [""])[0])
    if source != "unknown":
        return f"{source} / {video}"
    if host == "youtube.com" or host.endswith(".youtube.com") or host == "youtu.be":
        return "youtube / untagged"
    if host == "google.com" or host.endswith(".google.com"):
        return "google / untagged"
    return "direct / unknown" if not host else "other referral / untagged"


def metric_set(records):
    accounts = {r["user_id"] for r in records if not str(r.get("user_id", "")).startswith("visitor:") and r.get("user_id")}
    attempts = [r for r in records if r.get("event_name") in QUESTION_SUBMITTED_EVENTS]
    return {
        "events": len(records),
        "page_views": sum(r.get("event_name") == "page_view" for r in records),
        "anonymous_browsers": len({r["user_id"] for r in records if str(r.get("user_id", "")).startswith("visitor:")}),
        "observed_accounts": len(accounts),
        "practising_accounts": len({r["user_id"] for r in attempts if r.get("user_id") in accounts}),
        "submission_events": len(attempts),
        "completion_events": sum(r.get("event_name") in QUESTION_COMPLETED_EVENTS for r in records),
        "checkout_sessions": len({r["session_id"] for r in records if r.get("event_name") == "checkout_started" and r.get("session_id")}),
    }


def usage_report(records, start, end, previous_start):
    records = sorted(records, key=lambda r: r["at"])
    current = [r for r in records if start <= r["at"] < end]
    previous = [r for r in records if previous_start <= r["at"] < start]
    sessions = defaultdict(list)
    content = defaultdict(list)
    daily = defaultdict(list)
    account_attempts = defaultdict(list)
    for record in records:
        if record.get("event_name") in QUESTION_SUBMITTED_EVENTS and record.get("user_id") and not record["user_id"].startswith("visitor:"):
            account_attempts[record["user_id"]].append(record["at"])
    for record in current:
        if record.get("session_id"):
            sessions[record["session_id"]].append(record)
        daily[record["at"].astimezone(IST).date().isoformat()].append(record)
        meta = record.get("metadata") or {}
        slug = meta.get("lab_slug") or meta.get("scenario_slug")
        if slug:
            kind = "lab" if meta.get("lab_slug") else "scenario"
            content[(kind, safe_label(slug))].append(record)

    acquisition = defaultdict(Counter)
    auth = defaultdict(Counter)
    ambiguous_sessions = 0
    for items in sessions.values():
        accounts = {r["user_id"] for r in items if r.get("user_id") and not r["user_id"].startswith("visitor:")}
        ambiguous_sessions += len(accounts) > 1
        landing = next((r for r in items if r.get("event_name") == "page_view"), None)
        if landing:
            row = acquisition[source_label(landing)]
            row["landing_sessions"] += 1
            after = [r for r in items if r["at"] >= landing["at"]]
            row["content_sessions"] += any(r.get("event_name") == "content_view" for r in after)
            # Do not stitch multiple accounts on a shared browser session.
            row["account_practice_sessions"] += len(accounts) == 1 and any(r.get("event_name") in QUESTION_SUBMITTED_EVENTS and r.get("user_id") in accounts for r in after)
            row["checkout_sessions"] += any(r.get("event_name") == "checkout_started" for r in after)
        methods = {safe_label((r.get("metadata") or {}).get("method")) for r in items if r.get("event_name", "").startswith("auth_")}
        for method in methods:
            events = [r for r in items if safe_label((r.get("metadata") or {}).get("method")) == method]
            started = next((r for r in events if r.get("event_name") == "auth_started"), None)
            succeeded = next((r for r in events if r.get("event_name") == "auth_succeeded" and started and r["at"] >= started["at"]), None)
            row = auth[method]
            row["started_sessions"] += started is not None
            row["succeeded_after_start"] += succeeded is not None
            row["sessions_with_error"] += any(r.get("event_name") == "auth_failed" for r in events)
            row["practice_after_success"] += succeeded is not None and any(r.get("event_name") in QUESTION_SUBMITTED_EVENTS and r["at"] >= succeeded["at"] for r in items)

    learning = []
    for (kind, slug), items in content.items():
        attempted = [r for r in items if r.get("event_name") in QUESTION_SUBMITTED_EVENTS]
        starters = {r["user_id"] for r in attempted if r.get("user_id") and not r["user_id"].startswith("visitor:")}
        reported_passes = {r["user_id"] for r in attempted if (r.get("metadata") or {}).get("passed") is True and r.get("user_id") in starters}
        learning.append({"content": slug, "kind": kind, "views": sum(r.get("event_name") == "content_view" for r in items), "starters": len(starters), "attempts": len(attempted), "reported_pass_accounts": len(reported_passes), "completion_events": sum(r.get("event_name") in QUESTION_COMPLETED_EVENTS for r in items), "without_reported_pass": len(starters - reported_passes)})

    retention = []
    for label, first_day, last_day in [("W1", 2, 7), ("W4", 22, 28)]:
        eligible = returned = pending = 0
        for attempts in account_attempts.values():
            first = attempts[0]
            if not start <= first < end:
                continue
            first_date = first.astimezone(IST).date()
            mature_at = datetime.combine(first_date + timedelta(days=last_day + 1), time.min, IST)
            if mature_at > end:
                pending += 1
                continue
            eligible += 1
            returned += any(first_day <= (at.astimezone(IST).date() - first_date).days <= last_day for at in attempts if at < end)
        retention.append({"window": label, "eligible": eligible, "returned": returned, "pending": pending, "rate": round(100 * returned / eligible, 1) if eligible else None})
    return {
        "current": metric_set(current), "previous": metric_set(previous),
        "latest_event": max((r["at"] for r in records), default=None),
        "acquisition": [{"source": k, **v} for k, v in sorted(acquisition.items(), key=lambda item: -item[1]["landing_sessions"])],
        "authentication": [{"method": k, **v} for k, v in sorted(auth.items())],
        "learning": sorted(learning, key=lambda row: (-row["without_reported_pass"], -row["attempts"], row["content"])),
        "retention": retention, "ambiguous_sessions": ambiguous_sessions,
        "daily": [{"date": day, **metric_set(items)} for day, items in sorted(daily.items())],
    }


class AdminReporting:
    """All queries have fixed columns, date bounds and an explicit overflow failure."""
    def __init__(self, settings=None):
        self.settings = settings or get_settings()
        self.postgres_url = UsageStore._active_postgres_url(self.settings.postgres_url)

    def read(self, source, start, end):
        specs = {
            "usage": ("user_usage_events", "user_id,event_name,session_id,page_url,metadata,created_at", "created_at", self.settings.usage_store_path),
            "feedback": ("product_feedback", "category,rating,created_at", "created_at", self.settings.feedback_store_path),
            "purchases": ("premium_purchase_records", "email,amount_inr,payment_provider,purchase_status,currency,billing_interval,purchased_at,access_expires_at", "purchased_at", None),
            "grants": ("premium_access_grants", "email,expires_at", "expires_at", None),
        }
        table, columns, date_column, file_path = specs[source]
        if self.postgres_url:
            import psycopg
            from psycopg.rows import dict_row
            with psycopg.connect(self.postgres_url, connect_timeout=5, row_factory=dict_row) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SET TRANSACTION READ ONLY")
                    cursor.execute("SET LOCAL statement_timeout = '10000ms'")
                    cursor.execute("SELECT to_regclass(%s) AS present", (f"public.{table}",))
                    if not cursor.fetchone()["present"]:
                        return None, "missing"
                    # Identifiers come exclusively from the fixed internal specs above.
                    condition = f"{date_column} >= %s" if source == "grants" else f"{date_column} >= %s AND {date_column} < %s"
                    params = (start, MAX_ROWS + 1) if source == "grants" else (start, end, MAX_ROWS + 1)
                    cursor.execute(f"SELECT {columns} FROM public.{table} WHERE {condition} LIMIT %s", params)
                    rows = cursor.fetchall()
        elif file_path:
            from pathlib import Path
            path = Path(file_path)
            if not path.exists():
                return None, "missing"
            rows = []
            with path.open() as handle:
                for line in handle:
                    row = json.loads(line)
                    at = timestamp(row.get(date_column))
                    if not at:
                        return None, "invalid_data"
                    if start <= at < end:
                        rows.append({key: row.get(key) for key in columns.split(",")})
                    if len(rows) > MAX_ROWS:
                        return None, "capacity_exceeded"
        else:
            # In-memory dev grants are not a durable production ledger.
            return None, "unavailable"
        if len(rows) > MAX_ROWS:
            return None, "capacity_exceeded"
        return rows, "ready" if rows else "empty"

    def report(self, days=30, end_date=None, now=None):
        now = now or datetime.now(timezone.utc)
        last_day = end_date or (now.astimezone(IST).date() - timedelta(days=1))
        end = min(datetime.combine(last_day + timedelta(days=1), time.min, IST), now)
        start = datetime.combine(last_day - timedelta(days=days - 1), time.min, IST)
        previous_start = start - timedelta(days=days)
        history_start = previous_start - timedelta(days=365)
        sources = {}
        rows = {}
        for source in ("usage", "purchases", "grants", "feedback"):
            try:
                since = history_start if source == "usage" else (now if source == "grants" else previous_start)
                until = now if source == "grants" else end
                rows[source], status = self.read(source, since, until)
            except Exception:
                rows[source], status = None, "unavailable"
            sources[source] = status
        usage = None
        if rows["usage"] is not None:
            records = [{**row, "at": timestamp(row.get("created_at"))} for row in rows["usage"]]
            if any(not row["at"] or not isinstance(row.get("metadata") or {}, dict) for row in records):
                sources["usage"] = "invalid_data"
            else:
                usage = usage_report(records, start, end, previous_start)
        payments = None
        if rows["purchases"] is not None:
            purchases = [r for r in rows["purchases"] if timestamp(r.get("purchased_at")) and start <= timestamp(r["purchased_at"]) < end]
            paid = [r for r in purchases if r.get("purchase_status") == "paid" and r.get("payment_provider") == "razorpay" and r.get("currency") == "INR" and (r.get("amount_inr") or 0) > 0]
            grants = rows["grants"]
            active = {r["email"] for r in grants or [] if timestamp(r.get("expires_at")) and timestamp(r["expires_at"]) > now}
            expected = {r["email"] for r in paid if timestamp(r.get("access_expires_at")) and timestamp(r["access_expires_at"]) > now}
            groups = Counter(
                (r.get("payment_provider") or "unknown", r.get("purchase_status") or "unknown", r.get("billing_interval") or "unknown")
                for r in purchases
            )
            payments = {
                "recorded_paid_orders": len(paid),
                "recorded_gross_inr": sum(r["amount_inr"] for r in paid),
                "recorded_buyers": len({r["email"] for r in paid}),
                "other_records": len(purchases) - len(paid),
                "active_grants_now": len(active) if grants is not None else None,
                "paid_without_active_grant_now": len(expected - active) if grants is not None else None,
                "breakdown": [
                    {"provider": safe_label(key[0]), "status": safe_label(key[1]), "plan": safe_label(key[2]), "count": value}
                    for key, value in sorted(groups.items())
                ],
            }
        feedback = None
        if rows["feedback"] is not None:
            items = [r for r in rows["feedback"] if timestamp(r.get("created_at")) and start <= timestamp(r["created_at"]) < end]
            categories = {"general", "content", "bug", "feature", "other"}
            feedback = {"total": len(items), "low_ratings": sum(isinstance(r.get("rating"), int) and r["rating"] <= 2 for r in items), "categories": [{"category": key, "count": count} for key, count in sorted(Counter(r.get("category") if r.get("category") in categories else "other" for r in items).items())]}
        return {"generated_at": now.isoformat(), "timezone": "Asia/Kolkata", "start": start.isoformat(), "end_exclusive": end.isoformat(), "previous_start": previous_start.isoformat(), "partial_day": last_day == now.astimezone(IST).date(), "history_start": history_start.isoformat(), "storage": "postgres" if self.postgres_url else "local file (development)", "sources": sources, "usage": usage, "payments": payments, "feedback": feedback, "limitations": [
            "Usage is browser-reported activity, not an authoritative signup or payment ledger. Blocked tracking and deleted cookies reduce coverage.",
            "Anonymous browsers and observed accounts overlap. Never add them together as people. Acquisition uses ordered same-session activity, not person-level conversion.",
            "No test/admin exclusion flag exists in historical events; totals may include internal traffic.",
            "Retention uses first observed authenticated submission in the displayed history window, not account creation or guaranteed first-ever activation. Only mature cohorts enter the denominator.",
            "Pass flags and Done events are not audited correctness. Solution review and heuristic feedback may be included. Validated outcomes, hint/reveal usage and runner reliability remain unmeasured.",
            "Google redirect and cross-device auth may span sessions. Auth success is browser-reported; new signup versus returning login is not yet measured here.",
            "Revenue is recorded Razorpay paid INR orders, before fees, tax and unrecorded refunds; not take-home or provider reconciliation. Manual/free/other records are separate.",
            "Provider capture/failure/refund reconciliation, activation latency, source-to-payment attribution, paid retention and AI costs are unavailable. Active grants are a current snapshot, not historical entitlement state.",
            "Read limit is 200,000 records per source. Overflow fails that section explicitly; totals are never silently truncated.",
        ]}
