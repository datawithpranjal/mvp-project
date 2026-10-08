"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { getAdminReport, getAdminFeedback } from "../../lib/api";
import type { AdminReport, ActivityMetrics } from "../../lib/admin-reporting";
import type { AdminFeedbackResponse } from "../../lib/types";

const tabs = [
  "Overview",
  "Acquisition",
  "Authentication",
  "Learning & retention",
  "Premium & access",
  "Feedback & health",
] as const;
type Tab = (typeof tabs)[number];
const field =
  "rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-300";
const button =
  "rounded-xl bg-teal-300 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40";
const fmt = (value: number | null | undefined) =>
  value == null ? "Unavailable" : value.toLocaleString("en-IN");
const stamp = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
const day = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
  });

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 md:p-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {note && (
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-400">
          {note}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}
function Metric({
  label,
  value,
  note,
  previous,
}: {
  label: string;
  value: number | null | undefined;
  note?: string;
  previous?: number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{fmt(value)}</p>
      {previous !== undefined && value != null && (
        <p className="mt-2 text-xs text-teal-200">
          {value - previous >= 0 ? "+" : ""}
          {fmt(value - previous)} vs previous period ({fmt(previous)})
        </p>
      )}
      {note && (
        <p className="mt-2 text-xs leading-relaxed text-slate-400">{note}</p>
      )}
    </div>
  );
}
function Table({
  headers,
  rows,
  empty = "No matching records in this period.",
}: {
  headers: string[];
  rows: ReactNode[][];
  empty?: string;
}) {
  if (!rows.length) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                scope="col"
                className="border-b border-white/10 px-3 py-3 font-medium text-slate-400"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="max-w-sm px-3 py-3 align-top text-slate-200 [overflow-wrap:anywhere]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Unavailable({ source }: { source: string }) {
  return (
    <p
      role="status"
      className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100"
    >
      {source} data is unavailable. This is not an observed zero. Check data
      health below.
    </p>
  );
}

export default function AdminConsolePage() {
  const [token, setToken] = useState("");
  const [role, setRole] = useState<"reader" | "admin">("reader");
  const [days, setDays] = useState(30);
  const [endDate, setEndDate] = useState("");
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<AdminReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [support, setSupport] = useState<AdminFeedbackResponse | null>(null);
  const [supportError, setSupportError] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const generation = useRef(0);

  function clearReport() {
    generation.current += 1;
    setData(null);
    setSupport(null);
    setError("");
    setSupportError("");
    setLoading(false);
    setSupportLoading(false);
  }
  async function load() {
    clearReport();
    const request = generation.current;
    setLoading(true);
    try {
      const result = await getAdminReport(
        token.trim(),
        role,
        days,
        endDate || undefined,
      );
      if (request === generation.current) setData(result);
    } catch (cause) {
      if (request === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Report could not be loaded.",
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  async function loadSupport() {
    const request = generation.current;
    setSupportLoading(true);
    setSupportError("");
    try {
      const result = await getAdminFeedback(token.trim(), 25);
      if (request === generation.current) setSupport(result);
    } catch {
      if (request === generation.current)
        setSupportError(
          "Support feedback could not be loaded. Full admin access is required.",
        );
    } finally {
      if (request === generation.current) setSupportLoading(false);
    }
  }
  function exportReport() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "tdf-aggregate-report.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  const usage = data?.usage;
  const current = usage?.current;
  const previous = usage?.previous;
  const overviewMetrics: [keyof ActivityMetrics, string, string][] = [
    ["page_views", "Page views", "Event count, not unique people."],
    [
      "anonymous_browsers",
      "Anonymous browsers",
      "Estimated browser identities; may later appear as accounts.",
    ],
    [
      "observed_accounts",
      "Observed accounts",
      "Authenticated accounts with recorded activity, not all registrations.",
    ],
    [
      "practising_accounts",
      "Practising accounts",
      "Unique authenticated accounts that submitted an attempt.",
    ],
    [
      "submission_events",
      "Submitted attempts",
      "Retries are separate attempts, not additional learners.",
    ],
    [
      "checkout_sessions",
      "Checkout intent sessions",
      "Browser intent, not a captured payment.",
    ],
  ];

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-300">
            The Data Foundry · Admin
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            What needs our attention?
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Acquisition, useful practice, return usage and reliable Premium
            access.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-teal-200 underline underline-offset-4"
        >
          Back to TDF
        </Link>
      </header>
      <section
        aria-label="Reporting access and dates"
        className="rounded-2xl border border-white/10 bg-slate-900 p-5"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-2 text-xs text-slate-400">
            Access scope
            <select
              className={field}
              value={role}
              onChange={(e) => {
                clearReport();
                setRole(e.target.value as "reader" | "admin");
                setToken("");
              }}
            >
              <option value="reader">Read-only reporting</option>
              <option value="admin">Full admin</option>
            </select>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-2 text-xs text-slate-400">
            {role === "reader" ? "Reporting key" : "Admin key"}
            <input
              autoComplete="off"
              type="password"
              className={field}
              value={token}
              onChange={(e) => {
                clearReport();
                setToken(e.target.value);
              }}
              placeholder="Enter privately"
            />
          </label>
          <label className="flex flex-col gap-2 text-xs text-slate-400">
            Period
            <select
              className={field}
              value={days}
              onChange={(e) => {
                clearReport();
                setDays(Number(e.target.value));
              }}
            >
              {[7, 14, 30, 60, 90].map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-xs text-slate-400">
            Through (IST)
            <input
              aria-label="Report end date"
              type="date"
              value={endDate}
              className={field}
              onChange={(e) => {
                clearReport();
                setEndDate(e.target.value);
              }}
            />
          </label>
          <button
            type="submit"
            disabled={!token.trim() || loading}
            className={button}
          >
            {loading ? "Loading…" : "Load report"}
          </button>
          <button
            type="button"
            className="px-2 py-2 text-sm text-slate-400 underline"
            onClick={() => {
              clearReport();
              setToken("");
            }}
          >
            Clear session
          </button>
        </form>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Keys stay in this page’s memory only. No automatic loading or browser
          storage. Blank end date means yesterday: complete IST days. The
          previous period has the same number of calendar days.
        </p>
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-rose-200"
        >
          {error} No previous values are being shown as current.
        </p>
      )}
      {!data && (
        <Panel
          title={loading ? "Loading platform evidence…" : "No report loaded"}
          note="Totals appear only after a successful read. Missing records, unavailable sources and observed zeros are different states."
        >
          <p className="text-sm text-slate-400">
            Use a privately configured reporting key. Production credentials are
            not supplied by this page.
          </p>
        </Panel>
      )}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <p>
              {day(data.start)} →{" "}
              {day(
                new Date(
                  new Date(data.end_exclusive).getTime() - 1,
                ).toISOString(),
              )}{" "}
              · IST · Loaded {stamp(data.generated_at)}
              <span className="mt-1 block">Source: {data.storage}</span>
              {data.partial_day &&
                " · PARTIAL DAY: not a like-for-like full-period comparison"}
            </p>
            <button className="text-teal-200 underline" onClick={exportReport}>
              Export safe aggregate report
            </button>
          </div>
          <nav
            aria-label="Dashboard sections"
            className="sticky top-24 z-20 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/95 p-2 backdrop-blur"
          >
            {tabs.map((name) => (
              <button
                key={name}
                aria-pressed={tab === name}
                onClick={() => setTab(name)}
                className={`shrink-0 rounded-xl px-4 py-3 text-sm ${tab === name ? "bg-teal-300 font-semibold text-slate-950" : "text-slate-300 hover:bg-white/5"}`}
              >
                {name}
              </button>
            ))}
          </nav>
          {tab === "Overview" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {overviewMetrics.map(([key, label, note]) => (
                  <Metric
                    key={key}
                    label={label}
                    value={current?.[key]}
                    previous={data.partial_day ? undefined : previous?.[key]}
                    note={note}
                  />
                ))}
              </div>
              {!usage && <Unavailable source="Usage" />}
              <Panel
                title="Decision queue"
                note="Evidence to investigate—not automatic conclusions about the cause."
              >
                <ul className="space-y-3 text-sm text-slate-300">
                  {Object.entries(data.sources)
                    .filter(
                      ([, status]) => !["ready", "empty"].includes(status),
                    )
                    .map(([source, status]) => (
                      <li key={source}>
                        • Restore {source} coverage:{" "}
                        {status.replaceAll("_", " ")}. Do not make decisions
                        from this missing section.
                      </li>
                    ))}
                  {usage && (
                    <li>
                      •{" "}
                      {fmt(
                        usage.learning.reduce(
                          (n, r) => n + r.without_reported_pass,
                          0,
                        ),
                      )}{" "}
                      account–exercise pairs have attempts without a reported
                      pass in this period. Review the Learning tab; these are
                      not necessarily unique people or broken exercises.
                    </li>
                  )}
                  {data.payments?.paid_without_active_grant_now != null &&
                    data.payments.paid_without_active_grant_now > 0 && (
                      <li className="text-amber-200">
                        • Investigate{" "}
                        {data.payments.paid_without_active_grant_now} recorded
                        buyers whose unexpired paid record has no active grant
                        now.
                      </li>
                    )}
                  <li>
                    • New-account conversion, validated learning and provider
                    payment reconciliation remain unmeasured. Do not treat
                    intent, Done or app purchase records as those outcomes.
                  </li>
                </ul>
              </Panel>
              <Panel
                title="Daily activity"
                note="Full selected-window aggregates. Nothing here is calculated from a paginated learner list."
              >
                {usage ? (
                  <Table
                    headers={[
                      "Date (IST)",
                      "Page views",
                      "Accounts",
                      "Practising accounts",
                      "Attempts",
                      "Done events",
                    ]}
                    rows={usage.daily.map((r) => [
                      r.date,
                      r.page_views,
                      r.observed_accounts,
                      r.practising_accounts,
                      r.submission_events,
                      r.completion_events,
                    ])}
                  />
                ) : (
                  <Unavailable source="Usage" />
                )}
              </Panel>
            </>
          )}
          {tab === "Acquisition" && (
            <Panel
              title="Which sources lead to practice?"
              note="Each row starts with a session’s first recorded page view in this period. Later stages must follow that view in the same session. Sessions can contain returning accounts. These are not signup rates or unique-person conversion. UTM content identifies the video only when your link is tagged."
            >
              {usage ? (
                <>
                  <Table
                    headers={[
                      "Source / video tag",
                      "Landing sessions",
                      "Then viewed content",
                      "Then account practice",
                      "Then checkout intent",
                    ]}
                    rows={usage.acquisition.map((r) => [
                      r.source,
                      r.landing_sessions,
                      r.content_sessions,
                      r.account_practice_sessions,
                      r.checkout_sessions,
                    ])}
                  />
                  <p className="mt-4 text-xs text-slate-400">
                    {usage.ambiguous_sessions} multi-account sessions excluded
                    from account-practice attribution. Cross-device and
                    cross-session acquisition are not stitched. Untagged traffic
                    stays unknown.
                  </p>
                </>
              ) : (
                <Unavailable source="Usage" />
              )}
            </Panel>
          )}
          {tab === "Authentication" && (
            <Panel
              title="Does sign-in interrupt practice?"
              note="Distinct session-method pairs. Success counts only after a recorded start. Errors can overlap successful sessions. This is client telemetry, not verified new-account creation; Google redirects can break same-session coverage."
            >
              {usage ? (
                <Table
                  headers={[
                    "Method",
                    "Started",
                    "Succeeded after start",
                    "Had error",
                    "Practice after success",
                  ]}
                  rows={usage.authentication.map((r) => [
                    r.method,
                    r.started_sessions,
                    r.succeeded_after_start,
                    r.sessions_with_error,
                    r.practice_after_success,
                  ])}
                />
              ) : (
                <Unavailable source="Usage" />
              )}
              <p className="mt-5 text-sm text-amber-100">
                Not yet measured: new versus returning account, abandoned draft
                recovery and server-confirmed signup conversion. Signup behavior
                has not changed.
              </p>
            </Panel>
          )}
          {tab === "Learning & retention" && (
            <>
              <Panel
                title="Return to meaningful practice"
                note={`Cohort: first observed authenticated submission in the selected period, using history since ${day(data.history_start)}. W1 = another submitted attempt on days 2–7; W4 = days 22–28. Only fully observed windows enter the rate. This is not a signup cohort.`}
              >
                {usage ? (
                  <Table
                    headers={[
                      "Window",
                      "Mature accounts",
                      "Returned",
                      "Still maturing",
                      "Return rate",
                    ]}
                    rows={usage.retention.map((r) => [
                      r.window,
                      r.eligible,
                      r.returned,
                      r.pending,
                      r.rate == null ? "Not enough mature data" : `${r.rate}%`,
                    ])}
                  />
                ) : (
                  <Unavailable source="Usage" />
                )}
              </Panel>
              <Panel
                title="Exercises to inspect"
                note="Sorted by accounts with an attempt but no reported pass in the selected period. Done can include self-completion; reported pass can include heuristic feedback. Neither proves job readiness. Each table is paginated for readability; totals use all records."
              >
                {usage ? (
                  <LearningTable rows={usage.learning} />
                ) : (
                  <Unavailable source="Usage" />
                )}
              </Panel>
            </>
          )}
          {tab === "Premium & access" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Metric
                  label="Recorded Razorpay gross · INR"
                  value={data.payments?.recorded_gross_inr}
                  note="Paid INR records in this period. Before fees/tax; not provider-reconciled revenue."
                />
                <Metric
                  label="Recorded paying buyers"
                  value={data.payments?.recorded_buyers}
                  note="Distinct buyers across those paid records. Not checkout intent."
                />
                <Metric
                  label="Recorded paid orders"
                  value={data.payments?.recorded_paid_orders}
                />
                <Metric
                  label="Other purchase/grant records"
                  value={data.payments?.other_records}
                  note="Manual, free, non-paid or other-provider records excluded from paid gross."
                />
                <Metric
                  label="Active grants now"
                  value={data.payments?.active_grants_now}
                  note="All current grants, including manual/free. Not a historical snapshot."
                />
                <Metric
                  label="Paid record / access mismatch now"
                  value={data.payments?.paid_without_active_grant_now}
                  note="Buyers in this period with an unexpired paid record but no active grant now. Investigate before acting."
                />
              </div>
              <Panel
                title="Recorded purchase mix"
                note="This report does not contact Razorpay. It cannot detect a provider-captured payment that never reached the app ledger, provider failures, duplicate charges or unrecorded refunds."
              >
                {data.payments ? (
                  <Table
                    headers={["Provider", "Status", "Plan", "Records"]}
                    rows={data.payments.breakdown.map((r) => [
                      r.provider,
                      r.status,
                      r.plan,
                      r.count,
                    ])}
                  />
                ) : (
                  <Unavailable source="Purchase ledger" />
                )}
              </Panel>
            </>
          )}
          {tab === "Feedback & health" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Metric
                  label="Feedback received"
                  value={data.feedback?.total}
                  note="All records in the selected period, not only the recent support list."
                />
                <Metric
                  label="Ratings of 1–2"
                  value={data.feedback?.low_ratings}
                />
              </div>
              <Panel
                title="Feedback categories"
                note="Submitted categories, not AI-inferred themes. Aggregate reporting excludes names, emails and raw messages."
              >
                {data.feedback ? (
                  <Table
                    headers={["Category", "Reports"]}
                    rows={data.feedback.categories.map((r) => [
                      r.category,
                      r.count,
                    ])}
                  />
                ) : (
                  <Unavailable source="Feedback" />
                )}
              </Panel>
              {role === "admin" && (
                <Panel
                  title="Restricted support tools"
                  note="Full-admin only. Raw feedback may contain personal data. It is never included in the reporting export."
                >
                  <div className="flex flex-wrap gap-4">
                    <button
                      className={button}
                      disabled={supportLoading}
                      onClick={() => void loadSupport()}
                    >
                      {supportLoading
                        ? "Loading…"
                        : "Load 25 recent support messages"}
                    </button>
                    <Link
                      className="self-center text-teal-200 underline"
                      href="/admin/content-auditor"
                    >
                      Open content audit
                    </Link>
                  </div>
                  {supportError && (
                    <p role="alert" className="mt-4 text-rose-200">
                      {supportError}
                    </p>
                  )}
                  {support && (
                    <div className="mt-5">
                      <p className="mb-3 text-xs text-slate-400">
                        Recent sample across all dates, independent of report
                        period. Not a total.
                      </p>
                      <Table
                        headers={["Date", "Category", "Message"]}
                        rows={support.rows.map((r) => [
                          stamp(r.created_at),
                          r.category,
                          r.message,
                        ])}
                      />
                    </div>
                  )}
                </Panel>
              )}
            </>
          )}
          <Panel
            title="Data health & measurement boundaries"
            note={`Storage: ${data.storage}. Latest observed usage event in the query window: ${usage?.latest_event ? stamp(usage.latest_event) : "Unavailable / no events"}.`}
          >
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.sources).map(([source, status]) => (
                <span
                  key={source}
                  className={`rounded-full border px-3 py-1 text-xs ${["ready", "empty"].includes(status) ? "border-teal-300/20 text-teal-200" : "border-amber-300/30 text-amber-200"}`}
                >
                  {source}:{" "}
                  {status === "empty"
                    ? "no matching records"
                    : status.replaceAll("_", " ")}
                </span>
              ))}
            </div>
            <details className="mt-5 text-sm text-slate-400">
              <summary className="cursor-pointer text-slate-200">
                Definitions, blind spots and access safeguards
              </summary>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {data.limitations.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <p className="mt-4">
                Reporting API: GET /api/v1/admin/reporting. Dedicated read-only
                access is configured privately using REPORTING_API_TOKEN,
                distinct from ADMIN_API_TOKEN. It cannot authorize existing
                administrative write routes. This page does not provision
                production access.
              </p>
            </details>
          </Panel>
        </>
      )}
    </main>
  );
}

function LearningTable({
  rows,
}: {
  rows: NonNullable<AdminReport["usage"]>["learning"];
}) {
  const [page, setPage] = useState(0);
  const limit = 20;
  return (
    <>
      <Table
        headers={[
          "Exercise",
          "Type",
          "Views",
          "Accounts attempting",
          "Attempts",
          "Reported pass accounts",
          "No reported pass",
          "Done events",
        ]}
        rows={rows
          .slice(page * limit, (page + 1) * limit)
          .map((r) => [
            r.content,
            r.kind,
            r.views,
            r.starters,
            r.attempts,
            r.reported_pass_accounts,
            r.without_reported_pass,
            r.completion_events,
          ])}
      />
      <div className="mt-4 flex items-center gap-4 text-sm">
        <button
          className="text-teal-200 disabled:text-slate-600"
          disabled={!page}
          onClick={() => setPage((n) => n - 1)}
        >
          Previous
        </button>
        <span className="text-slate-400">
          {rows.length ? page * limit + 1 : 0}–
          {Math.min((page + 1) * limit, rows.length)} of {rows.length}
        </span>
        <button
          className="text-teal-200 disabled:text-slate-600"
          disabled={(page + 1) * limit >= rows.length}
          onClick={() => setPage((n) => n + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
