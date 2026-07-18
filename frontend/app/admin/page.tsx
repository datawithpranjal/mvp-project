"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getAdminAiStatus,
  getAdminFeedback,
  getAdminPremiumPurchases,
  getAdminUsageInsights,
  getAdminUsageSummary,
  getAdminVisitorSummary,
  getContentAuditSummary
} from "../../lib/api";
import type {
  AdminAiStatusResponse,
  AdminFeedbackResponse,
  AdminPremiumPurchasesResponse,
  AdminUsageInsightsResponse,
  AdminUsageSummaryResponse,
  AdminVisitorSummaryResponse,
  ContentAuditSummaryResponse
} from "../../lib/types";

const ADMIN_TOKEN_STORAGE_KEY = "data-foundry-admin-token";

interface AdminDashboardData {
  aiStatus: AdminAiStatusResponse | null;
  contentAudit: ContentAuditSummaryResponse | null;
  feedback: AdminFeedbackResponse | null;
  insights: AdminUsageInsightsResponse | null;
  purchases: AdminPremiumPurchasesResponse | null;
  usage: AdminUsageSummaryResponse | null;
  visitors: AdminVisitorSummaryResponse | null;
}

const emptyAdminData: AdminDashboardData = {
  aiStatus: null,
  contentAudit: null,
  feedback: null,
  insights: null,
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
  const submissions = data.insights?.funnel.submissions ?? 0;
  const completionRate = data.insights?.funnel.completion_rate ?? 0;
  const frictionItems = data.insights?.friction_content.length ?? 0;
  const eventsTracked = data.insights?.total_events ?? 0;
  const payingCustomers = useMemo(
    () => new Set(data.purchases?.records.map((record) => record.email) ?? []).size,
    [data.purchases]
  );
  const expiringSoon = useMemo(() => {
    const now = Date.now();
    const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
    return (
      data.purchases?.records.filter((record) => {
        const expiresAt = new Date(record.access_expires_at).getTime();
        return Number.isFinite(expiresAt) && expiresAt >= now && expiresAt <= sevenDaysFromNow;
      }).length ?? 0
    );
  }, [data.purchases]);
  const lowRatingFeedback = useMemo(
    () => data.feedback?.rows.filter((row) => typeof row.rating === "number" && row.rating <= 2).length ?? 0,
    [data.feedback]
  );
  const inactiveLearners = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return (
      data.usage?.rows.filter((row) => {
        if (!row.last_seen_at) return true;
        const lastSeenAt = new Date(row.last_seen_at).getTime();
        return Number.isFinite(lastSeenAt) && lastSeenAt < sevenDaysAgo;
      }).length ?? 0
    );
  }, [data.usage]);
  const activeLearners7d = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return (
      data.usage?.rows.filter((row) => {
        if (!row.last_seen_at) return false;
        const lastSeenAt = new Date(row.last_seen_at).getTime();
        return Number.isFinite(lastSeenAt) && lastSeenAt >= sevenDaysAgo;
      }).length ?? 0
    );
  }, [data.usage]);
  const powerLearners = useMemo(
    () => data.usage?.rows.filter((row) => row.questions_completed >= 5 || row.sessions_30d >= 5).length ?? 0,
    [data.usage]
  );
  const stuckLearners = useMemo(
    () =>
      data.usage?.rows.filter(
        (row) => row.questions_submitted >= 3 && row.questions_completed === 0
      ).length ?? 0,
    [data.usage]
  );
  const averageOrderValue = data.purchases?.records.length
    ? Math.round(purchaseRevenue / data.purchases.records.length)
    : 0;
  const yearlyPurchases =
    data.purchases?.records.filter((record) => record.billing_interval === "yearly").length ?? 0;
  const monthlyPurchases =
    data.purchases?.records.filter((record) => record.billing_interval === "monthly").length ?? 0;
  const couponPurchases =
    data.purchases?.records.filter((record) => Boolean(record.coupon_code)).length ?? 0;
  const totalDiscount = data.purchases?.records.reduce(
    (total, record) => total + record.discount_amount_inr,
    0
  ) ?? 0;
  const razorpayPurchases =
    data.purchases?.records.filter((record) => record.payment_provider === "razorpay").length ?? 0;

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
      insights: getAdminUsageInsights(trimmedToken, 30, 25),
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
          label="Submissions"
          value={formatNumber(submissions)}
          hint={`${formatNumber(completedQuestions)} completed`}
        />
        <MetricCard
          label="Completion"
          value={formatPercent(completionRate)}
          hint={`${frictionItems} friction items`}
        />
        <MetricCard
          label="Events"
          value={formatNumber(eventsTracked)}
          hint="Tracked actions"
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          label="Revenue"
          value={`Rs ${formatNumber(purchaseRevenue)}`}
          hint={`${data.purchases?.count ?? 0} purchases`}
        />
        <MetricCard
          label="Paying users"
          value={formatNumber(payingCustomers)}
          hint={`${expiringSoon} expiring soon`}
        />
        <MetricCard
          label="Feedback risk"
          value={formatNumber(lowRatingFeedback)}
          hint="Low ratings"
        />
        <MetricCard
          label="Inactive"
          value={formatNumber(inactiveLearners)}
          hint="No activity 7d"
        />
        <MetricCard
          label="AI"
          value={data.aiStatus?.configured ? "On" : "Off"}
          hint={data.aiStatus?.provider ?? "Not loaded"}
        />
        <MetricCard
          label="Content score"
          value={data.contentAudit?.average_audit_score ?? 0}
          hint={`${data.contentAudit?.critical_issues ?? 0} critical`}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <AdminPanel
          title="Product funnel"
          eyebrow="Where users move or drop"
          error={errors.insights}
          actionHref={null}
        >
          {data.insights ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <MiniMetric
                  label="Anonymous visitors"
                  value={formatNumber(data.insights.funnel.anonymous_visitors)}
                />
                <MiniMetric
                  label="Logged-in users"
                  value={formatNumber(data.insights.funnel.logged_in_users)}
                />
                <MiniMetric
                  label="Sessions"
                  value={formatNumber(data.insights.funnel.total_sessions)}
                />
                <MiniMetric
                  label="Active time"
                  value={formatDuration(data.insights.funnel.active_seconds)}
                />
              </div>
              <div className="space-y-3">
                <FunnelRow
                  label="Page views"
                  value={data.insights.funnel.page_views}
                  max={Math.max(data.insights.funnel.page_views, 1)}
                />
                <FunnelRow
                  label="Content views"
                  value={data.insights.funnel.content_views}
                  max={Math.max(data.insights.funnel.page_views, data.insights.funnel.content_views, 1)}
                />
                <FunnelRow
                  label="Logins"
                  value={data.insights.funnel.logins}
                  max={Math.max(data.insights.funnel.content_views, data.insights.funnel.logins, 1)}
                />
                <FunnelRow
                  label="Submissions"
                  value={data.insights.funnel.submissions}
                  max={Math.max(data.insights.funnel.content_views, data.insights.funnel.submissions, 1)}
                />
                <FunnelRow
                  label="Completed"
                  value={data.insights.funnel.completions}
                  max={Math.max(data.insights.funnel.submissions, data.insights.funnel.completions, 1)}
                  tone="success"
                />
              </div>
              {data.insights.event_counts.length ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    Event mix
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.insights.event_counts.slice(0, 8).map((event) => (
                      <span
                        key={event.event_name}
                        className="rounded-full border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-300"
                      >
                        {event.event_name.replace(/_/g, " ")}: {formatNumber(event.count)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyAdminState label="Load the admin console to see funnel movement." />
          )}
        </AdminPanel>

        <AdminPanel
          title="Daily engagement trend"
          eyebrow="Last 30 days"
          error={errors.insights}
          actionHref={null}
        >
          {data.insights?.daily.length ? (
            <div className="overflow-hidden rounded-3xl border border-slate-800">
              <div className="grid grid-cols-[1.1fr_repeat(5,minmax(72px,1fr))] gap-0 bg-slate-950/60 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                <span>Date</span>
                <span>Views</span>
                <span>Content</span>
                <span>Submit</span>
                <span>Done</span>
                <span>Time</span>
              </div>
              {data.insights.daily.slice(0, 10).map((day) => (
                <div
                  key={day.date}
                  className="grid grid-cols-[1.1fr_repeat(5,minmax(72px,1fr))] gap-0 border-t border-slate-800 px-4 py-3 text-xs text-slate-300"
                >
                  <span className="font-semibold text-slate-100">{day.date}</span>
                  <span>{formatNumber(day.page_views)}</span>
                  <span>{formatNumber(day.content_views)}</span>
                  <span>{formatNumber(day.submissions)}</span>
                  <span>{formatNumber(day.completions)}</span>
                  <span>{formatDuration(day.active_seconds)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyAdminState label="Daily trend will appear after usage events are recorded." />
          )}
        </AdminPanel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminPanel
          title="Conversion health"
          eyebrow="Are users reaching the practice loop?"
          error={errors.insights}
          actionHref={null}
        >
          {data.insights ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <ConversionCard
                label="Page to content"
                value={data.insights.conversion.page_to_content_rate}
                description="Are visitors opening actual labs after landing?"
              />
              <ConversionCard
                label="Visitor to login"
                value={data.insights.conversion.visitor_to_login_rate}
                description="Are enough people creating or using accounts?"
              />
              <ConversionCard
                label="Content to submit"
                value={data.insights.conversion.content_to_submission_rate}
                description="Are learners attempting instead of only reading?"
              />
              <ConversionCard
                label="Submit to complete"
                value={data.insights.conversion.submission_to_completion_rate}
                description="Are labs solvable with the current hints and data?"
              />
            </div>
          ) : (
            <EmptyAdminState label="Load insights to see conversion health." />
          )}
        </AdminPanel>

        <AdminPanel
          title="Audience signals"
          eyebrow="Source, device, and content interest"
          error={errors.insights}
          actionHref={null}
        >
          {data.insights ? (
            <div className="grid gap-5 lg:grid-cols-3">
              <BreakdownList title="Traffic sources" rows={data.insights.traffic_sources} />
              <BreakdownList title="Devices" rows={data.insights.device_breakdown} />
              <BreakdownList title="Tracks" rows={data.insights.track_breakdown} />
            </div>
          ) : (
            <EmptyAdminState label="Audience breakdowns will appear after page views are tracked." />
          )}
        </AdminPanel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminPanel
          title="Where learners may be stuck"
          eyebrow="Low completion after attempts"
          error={errors.insights}
          actionHref={null}
        >
          {data.insights?.friction_content.length ? (
            <div className="space-y-2">
              {data.insights.friction_content.slice(0, 8).map((content) => (
                <ContentInsightCard key={`${content.content_type}-${content.content_id}`} content={content} />
              ))}
            </div>
          ) : (
            <EmptyAdminState label="No repeated stuck content detected yet. This is good unless traffic is low." />
          )}
        </AdminPanel>

        <AdminPanel
          title="Most used content"
          eyebrow="What learners actually open"
          error={errors.insights}
          actionHref={null}
        >
          {data.insights?.top_content.length ? (
            <div className="space-y-2">
              {data.insights.top_content.slice(0, 8).map((content) => (
                <ContentInsightCard key={`${content.content_type}-${content.content_id}`} content={content} />
              ))}
            </div>
          ) : (
            <EmptyAdminState label="Top content will appear once learners view or submit labs." />
          )}
        </AdminPanel>
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
          title="Learner health"
          eyebrow={`${inactiveLearners} inactive for 7d`}
          error={errors.usage}
          actionHref={null}
        >
          {data.usage?.rows.length ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <MiniMetric label="Active 7d" value={formatNumber(activeLearners7d)} />
                <MiniMetric label="Power users" value={formatNumber(powerLearners)} />
                <MiniMetric
                  label="Stuck users"
                  value={formatNumber(stuckLearners)}
                  tone={stuckLearners > 0 ? "warning" : "default"}
                />
                <MiniMetric
                  label="Inactive 7d"
                  value={formatNumber(inactiveLearners)}
                  tone={inactiveLearners > 0 ? "warning" : "default"}
                />
              </div>
              <div className="space-y-2">
                {data.usage.rows.slice(0, 8).map((learner) => (
                  <RowCard
                    key={learner.user_id}
                    title={learner.full_name || learner.email}
                    meta={`${learner.email} · ${learner.questions_completed} completed · ${learner.questions_submitted} submitted · ${formatDuration(learner.total_active_seconds)} active · ${learner.sessions_30d} sessions/30d · ${learner.logins_30d} logins/30d`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <EmptyAdminState label="No logged-in learner usage loaded yet." />
          )}
        </AdminPanel>

        <AdminPanel
          title="Payments"
          eyebrow={`${payingCustomers} paying users · ${expiringSoon} expiring soon`}
          error={errors.purchases}
          actionHref={null}
        >
          {data.purchases?.records.length ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <MiniMetric label="AOV" value={`Rs ${formatNumber(averageOrderValue)}`} />
                <MiniMetric label="Yearly" value={formatNumber(yearlyPurchases)} />
                <MiniMetric label="Monthly" value={formatNumber(monthlyPurchases)} />
                <MiniMetric label="Coupons" value={formatNumber(couponPurchases)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <MiniMetric label="Razorpay" value={formatNumber(razorpayPurchases)} />
                <MiniMetric label="Discount given" value={`Rs ${formatNumber(totalDiscount)}`} />
              </div>
              <div className="space-y-2">
                {data.purchases.records.slice(0, 8).map((purchase) => (
                  <RowCard
                    key={`${purchase.payment_provider}-${purchase.payment_reference}`}
                    title={`${purchase.email} · Rs ${formatNumber(purchase.amount_inr)}`}
                    meta={`${purchase.plan_label} · ${purchase.billing_interval} · ${purchase.payment_provider} · ${purchase.coupon_code ? `coupon ${purchase.coupon_code} · ` : ""}paid ${formatDate(purchase.purchased_at)} · valid till ${formatDate(purchase.access_expires_at)}`}
                  />
                ))}
              </div>
            </div>
          ) : (
            <EmptyAdminState label="No purchase records loaded yet." />
          )}
        </AdminPanel>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        <AdminPanel
          title="Customer feedback"
          eyebrow={`${data.feedback?.count ?? 0} messages · ${lowRatingFeedback} low ratings`}
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

function ConversionCard({
  description,
  label,
  value
}: {
  description: string;
  label: string;
  value: number;
}) {
  const tone =
    value >= 55 ? "bg-teal-300 text-slate-950" : value >= 25 ? "bg-amber-300 text-slate-950" : "bg-rose-300 text-slate-950";
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{formatPercent(value)}</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={value >= 55 ? "h-full rounded-full bg-teal-300" : value >= 25 ? "h-full rounded-full bg-amber-300" : "h-full rounded-full bg-rose-300"}
          style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
        />
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function BreakdownList({
  rows,
  title
}: {
  rows: AdminUsageInsightsResponse["device_breakdown"];
  title: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      {rows.length ? (
        <div className="mt-3 space-y-3">
          {rows.slice(0, 6).map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="line-clamp-1 font-semibold capitalize text-slate-200">{row.label}</span>
                <span className="text-slate-500">
                  {formatNumber(row.count)} · {formatPercent(row.percentage)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-teal-300"
                  style={{ width: `${Math.max(4, Math.min(100, row.percentage))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed border-slate-800 p-3 text-xs text-slate-500">
          No data yet
        </p>
      )}
    </div>
  );
}

function FunnelRow({
  label,
  max,
  tone = "default",
  value
}: {
  label: string;
  max: number;
  tone?: "default" | "success";
  value: number;
}) {
  const width = Math.max(4, Math.min(100, (value / Math.max(max, 1)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
        <span className="font-semibold text-slate-100">{formatNumber(value)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${tone === "success" ? "bg-teal-300" : "bg-amber-300"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function ContentInsightCard({ content }: { content: AdminUsageInsightsResponse["top_content"][number] }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="line-clamp-1 text-sm font-semibold text-slate-100">
            {humanizeContentId(content.content_id)}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
            {content.content_type}
            {content.track ? ` · ${content.track}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
            content.completion_rate >= 80
              ? "bg-teal-300 text-slate-950"
              : content.completion_rate >= 40
                ? "bg-amber-300 text-slate-950"
                : "bg-rose-300 text-slate-950"
          }`}
        >
          {formatPercent(content.completion_rate)}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <TinyStat label="Views" value={formatNumber(content.views)} />
        <TinyStat label="Submitted" value={formatNumber(content.submissions)} />
        <TinyStat label="Done" value={formatNumber(content.completions)} />
        <TinyStat
          label="Avg score"
          value={content.avg_score === null || content.avg_score === undefined ? "NA" : `${content.avg_score}`}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Avg time {formatDuration(content.avg_active_seconds)}
        {content.last_activity_at ? ` · Last activity ${formatDate(content.last_activity_at)}` : ""}
      </p>
    </div>
  );
}

function TinyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
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

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
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

function humanizeContentId(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
