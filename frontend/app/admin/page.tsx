"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getAdminAiStatus,
  getAdminFeedback,
  getAdminPremiumPurchases,
  getAdminUsageSummary,
  getAdminVisitorSummary,
  getContentAuditSummary
} from "../../lib/api";
import type {
  AdminAiStatusResponse,
  AdminFeedbackResponse,
  AdminPremiumPurchasesResponse,
  AdminUsageSummaryResponse,
  AdminVisitorSummaryResponse,
  ContentAuditSummaryResponse
} from "../../lib/types";

const ADMIN_TOKEN_STORAGE_KEY = "data-foundry-admin-token";

interface AdminDashboardData {
  aiStatus: AdminAiStatusResponse | null;
  contentAudit: ContentAuditSummaryResponse | null;
  feedback: AdminFeedbackResponse | null;
  purchases: AdminPremiumPurchasesResponse | null;
  usage: AdminUsageSummaryResponse | null;
  visitors: AdminVisitorSummaryResponse | null;
}

const emptyAdminData: AdminDashboardData = {
  aiStatus: null,
  contentAudit: null,
  feedback: null,
  purchases: null,
  usage: null,
  visitors: null
};

export default function AdminConsolePage() {
  const [adminToken, setAdminToken] = useState("");
  const [data, setData] = useState<AdminDashboardData>(emptyAdminData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (savedToken) {
      setAdminToken(savedToken);
      void loadAdminDashboard(savedToken);
    }
  }, []);

  const purchaseRevenue = useMemo(
    () => data.purchases?.records.reduce((total, record) => total + record.amount_inr, 0) ?? 0,
    [data.purchases]
  );
  const completedQuestions = useMemo(
    () => data.usage?.rows.reduce((total, row) => total + row.questions_completed, 0) ?? 0,
    [data.usage]
  );

  async function loadAdminDashboard(token = adminToken) {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setErrors({ token: "Paste your admin token first." });
      return;
    }

    setIsLoading(true);
    setErrors({});
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, trimmedToken);

    const requests = {
      aiStatus: getAdminAiStatus(trimmedToken),
      contentAudit: getContentAuditSummary(trimmedToken),
      feedback: getAdminFeedback(trimmedToken, 25),
      purchases: getAdminPremiumPurchases(trimmedToken),
      usage: getAdminUsageSummary(trimmedToken, 30, 50),
      visitors: getAdminVisitorSummary(trimmedToken, 30, 15)
    } satisfies Record<keyof AdminDashboardData, Promise<unknown>>;

    const entries = await Promise.all(
      Object.entries(requests).map(async ([key, request]) => {
        try {
          return [key, await request, null] as const;
        } catch (error) {
          return [
            key,
            null,
            error instanceof Error ? error.message : "Unable to load this admin section."
          ] as const;
        }
      })
    );

    const nextData: AdminDashboardData = { ...emptyAdminData };
    const nextErrors: Record<string, string> = {};

    for (const [key, value, error] of entries) {
      if (error) {
        nextErrors[key] = error;
        continue;
      }
      nextData[key as keyof AdminDashboardData] = value as never;
    }

    setData(nextData);
    setErrors(nextErrors);
    setLastLoadedAt(new Date().toLocaleString());
    setIsLoading(false);
  }

  function clearToken() {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setAdminToken("");
    setData(emptyAdminData);
    setErrors({});
    setLastLoadedAt(null);
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
          Internal Admin Console
        </p>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_420px] lg:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-50">
              The Data Foundry admin
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              One private place to check visitor activity, learner usage, payments, feedback,
              AI status, and content QA. Keep this URL and token private.
            </p>
            {lastLoadedAt ? (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Last refreshed {lastLoadedAt}
              </p>
            ) : null}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4">
            <label
              htmlFor="admin-token"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
            >
              Admin token
            </label>
            <input
              id="admin-token"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Paste X-Admin-Token"
              type="password"
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-teal-300/50"
            />
            {errors.token ? (
              <p className="mt-2 text-sm font-semibold text-rose-200">{errors.token}</p>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={() => void loadAdminDashboard()}
                disabled={isLoading || !adminToken.trim()}
                className="rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Loading admin console..." : "Load admin console"}
              </button>
              <button
                type="button"
                onClick={clearToken}
                className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Visits"
          value={formatNumber(data.visitors?.total_visits ?? 0)}
          hint="Last 30 days"
        />
        <MetricCard
          label="Visitors"
          value={formatNumber(data.visitors?.unique_visitors ?? 0)}
          hint="Anonymous ids"
        />
        <MetricCard
          label="Learners"
          value={formatNumber(data.usage?.total_users ?? 0)}
          hint="Logged-in"
        />
        <MetricCard
          label="Completed"
          value={formatNumber(completedQuestions)}
          hint="Questions"
        />
        <MetricCard
          label="Revenue"
          value={`Rs ${formatNumber(purchaseRevenue)}`}
          hint={`${data.purchases?.count ?? 0} purchases`}
        />
        <MetricCard
          label="Content score"
          value={data.contentAudit?.average_audit_score ?? 0}
          hint={`${data.contentAudit?.critical_issues ?? 0} critical`}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminPanel
          title="Visitor analytics"
          eyebrow="Anonymous traffic"
          error={errors.visitors}
          actionHref={null}
        >
          {data.visitors ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniMetric label="Active time" value={formatDuration(data.visitors.total_active_seconds)} />
                <MiniMetric label="Backend" value={data.visitors.storage_backend} />
                <MiniMetric label="Window" value={`${data.visitors.days} days`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Top pages</h3>
                <div className="mt-3 space-y-2">
                  {data.visitors.top_pages.slice(0, 8).map((page) => (
                    <RowCard
                      key={page.page_url}
                      title={page.page_url}
                      meta={`${page.visits} visits · ${page.unique_visitors} visitors · ${formatDuration(page.total_active_seconds)}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyAdminState label="Load the admin console to see visitor data." />
          )}
        </AdminPanel>

        <AdminPanel
          title="AI evaluator"
          eyebrow="Provider status"
          error={errors.aiStatus}
          actionHref={null}
        >
          {data.aiStatus ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
              <p className="text-2xl font-semibold text-slate-50">
                {data.aiStatus.provider.toUpperCase()}
              </p>
              <p className="mt-2 text-sm text-slate-400">{data.aiStatus.model}</p>
              <span
                className={`mt-5 inline-flex rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] ${
                  data.aiStatus.configured
                    ? "bg-teal-300 text-slate-950"
                    : "bg-rose-300 text-slate-950"
                }`}
              >
                {data.aiStatus.configured ? "Configured" : "Not configured"}
              </span>
            </div>
          ) : (
            <EmptyAdminState label="AI status will appear after loading the console." />
          )}
        </AdminPanel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminPanel
          title="Learner usage"
          eyebrow="Logged-in users"
          error={errors.usage}
          actionHref={null}
        >
          {data.usage?.rows.length ? (
            <div className="space-y-2">
              {data.usage.rows.slice(0, 8).map((learner) => (
                <RowCard
                  key={learner.user_id}
                  title={learner.full_name || learner.email}
                  meta={`${learner.email} · ${learner.questions_completed} completed · ${formatDuration(learner.total_active_seconds)} active · ${learner.logins_30d} logins/30d`}
                />
              ))}
            </div>
          ) : (
            <EmptyAdminState label="No logged-in learner usage loaded yet." />
          )}
        </AdminPanel>

        <AdminPanel
          title="Payments"
          eyebrow="Premium purchase ledger"
          error={errors.purchases}
          actionHref={null}
        >
          {data.purchases?.records.length ? (
            <div className="space-y-2">
              {data.purchases.records.slice(0, 8).map((purchase) => (
                <RowCard
                  key={`${purchase.payment_provider}-${purchase.payment_reference}`}
                  title={`${purchase.email} · Rs ${formatNumber(purchase.amount_inr)}`}
                  meta={`${purchase.plan_label} · ${purchase.payment_provider} · paid ${formatDate(purchase.purchased_at)} · valid till ${formatDate(purchase.access_expires_at)}`}
                />
              ))}
            </div>
          ) : (
            <EmptyAdminState label="No purchase records loaded yet." />
          )}
        </AdminPanel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminPanel
          title="Customer feedback"
          eyebrow={`${data.feedback?.count ?? 0} messages`}
          error={errors.feedback}
          actionHref={null}
        >
          {data.feedback?.rows.length ? (
            <div className="space-y-2">
              {data.feedback.rows.slice(0, 8).map((feedback) => (
                <RowCard
                  key={feedback.id}
                  title={`${feedback.category.toUpperCase()} · ${feedback.name}`}
                  meta={`${feedback.email} · ${formatDate(feedback.created_at)} · ${feedback.message}`}
                />
              ))}
            </div>
          ) : (
            <EmptyAdminState label="No feedback loaded yet." />
          )}
        </AdminPanel>

        <AdminPanel
          title="Content auditor"
          eyebrow="Quality control"
          error={errors.contentAudit}
          actionHref="/admin/content-auditor"
        >
          {data.contentAudit ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniMetric label="Audited" value={formatNumber(data.contentAudit.total_audited_content)} />
              <MiniMetric label="Average score" value={data.contentAudit.average_audit_score} />
              <MiniMetric label="Critical" value={data.contentAudit.critical_issues} tone="critical" />
              <MiniMetric label="Warnings" value={data.contentAudit.warning_issues} tone="warning" />
            </div>
          ) : (
            <EmptyAdminState label="Load the console or open the full content auditor." />
          )}
        </AdminPanel>
      </section>
    </main>
  );
}

function AdminPanel({
  actionHref,
  children,
  error,
  eyebrow,
  title
}: {
  actionHref: string | null;
  children: ReactNode;
  error?: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="panel rounded-[2rem] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-50">{title}</h2>
        </div>
        {actionHref ? (
          <Link
            href={actionHref}
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300 transition hover:border-teal-300/60 hover:text-teal-100"
          >
            Open
          </Link>
        ) : null}
      </div>
      {error ? (
        <p className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-300/10 p-3 text-sm font-semibold text-rose-100">
          {error}
        </p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-slate-50">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function MiniMetric({
  label,
  tone = "default",
  value
}: {
  label: string;
  tone?: "default" | "critical" | "warning";
  value: string | number;
}) {
  const toneClass =
    tone === "critical"
      ? "border-rose-300/30 bg-rose-300/10 text-rose-100"
      : tone === "warning"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
        : "border-slate-800 bg-slate-950/35 text-slate-100";

  return (
    <div className={`rounded-3xl border p-4 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function RowCard({ meta, title }: { meta: string; title: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-4">
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{meta}</p>
    </div>
  );
}

function EmptyAdminState({ label }: { label: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-800 p-5 text-sm text-slate-400">
      {label}
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}
