"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  auditContentItem,
  getContentAuditDetail,
  updateContentAuditIssueStatus
} from "../../../../lib/api";
import { getContentAuditCatalogItem } from "../../../../lib/content-audit-catalog";
import type {
  ContentAuditDetailResponse,
  ContentAuditIssue,
  ContentAuditIssueStatus
} from "../../../../lib/types";

const ADMIN_TOKEN_STORAGE_KEY = "data-foundry-admin-token";

export default function ContentAuditDetailPage() {
  const params = useParams<{ contentId: string }>();
  const contentId = params.contentId;
  const catalogItem = useMemo(() => getContentAuditCatalogItem(contentId), [contentId]);
  const [adminToken, setAdminToken] = useState("");
  const [detail, setDetail] = useState<ContentAuditDetailResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (savedToken) {
      setAdminToken(savedToken);
      void loadDetail(savedToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId]);

  async function loadDetail(token = adminToken) {
    if (!token.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim());
      setDetail(await getContentAuditDetail(token.trim(), contentId));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load audit detail.");
    } finally {
      setIsLoading(false);
    }
  }

  async function reAudit() {
    if (!catalogItem) {
      setError("This content item is not present in the current frontend catalog.");
      return;
    }
    if (!adminToken.trim()) {
      setError("Enter the admin token before re-auditing.");
      return;
    }
    setIsAuditing(true);
    setError("");
    try {
      setDetail(await auditContentItem(adminToken.trim(), catalogItem));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to re-audit content.");
    } finally {
      setIsAuditing(false);
    }
  }

  async function updateIssue(issue: ContentAuditIssue, status: ContentAuditIssueStatus) {
    if (!adminToken.trim()) return;
    setError("");
    try {
      setDetail(
        await updateContentAuditIssueStatus(
          adminToken.trim(),
          contentId,
          issue.id,
          status
        )
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update issue status.");
    }
  }

  const run = detail?.run;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10">
      <Link
        href="/admin/content-auditor"
        className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-200"
      >
        Back to auditor
      </Link>

      <section className="panel mt-5 rounded-[2rem] p-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
              Content audit detail
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
              {run?.title ?? catalogItem?.title ?? "Unaudited content"}
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              {run
                ? `${run.content_type} · ${run.topic} · ${run.difficulty} · audited ${new Date(run.audited_at).toLocaleString()}`
                : "No stored audit exists yet for this content item."}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-4">
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
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadDetail()}
                disabled={isLoading || !adminToken.trim()}
                className="rounded-full border border-teal-300/35 px-4 py-2 text-sm font-semibold text-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Loading..." : "Reload"}
              </button>
              <button
                type="button"
                onClick={() => void reAudit()}
                disabled={isAuditing || !adminToken.trim() || !catalogItem}
                className="rounded-full bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAuditing ? "Auditing..." : "Re-audit"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="mt-5 rounded-[2rem] border border-rose-300/25 bg-rose-300/10 p-5 text-sm font-semibold text-rose-100">
          {error}
        </section>
      ) : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Audit score" value={run?.audit_score ?? 0} />
        <MetricCard label="Critical" value={run?.issue_counts.critical ?? 0} tone="critical" />
        <MetricCard label="Warnings" value={run?.issue_counts.warning ?? 0} tone="warning" />
        <MetricCard label="Suggestions" value={run?.issue_counts.suggestion ?? 0} tone="suggestion" />
      </section>

      <section className="mt-6">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
            Issues and suggestions
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-50">
            {detail?.issues.length ?? 0} findings
          </h2>
        </div>

        {detail?.issues.length ? (
          <div className="space-y-4">
            {detail.issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} onUpdate={updateIssue} />
            ))}
          </div>
        ) : (
          <div className="panel rounded-[2rem] p-8 text-sm leading-6 text-slate-300">
            No issues found for the latest audit. If this content has not been audited yet, click
            Re-audit.
          </div>
        )}
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string | number;
  tone?: "default" | "critical" | "warning" | "suggestion";
}) {
  const toneClass =
    tone === "critical"
      ? "border-rose-300/30 bg-rose-300/10 text-rose-100"
      : tone === "warning"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
        : tone === "suggestion"
          ? "border-sky-300/30 bg-sky-300/10 text-sky-100"
          : "border-slate-800 bg-slate-950/35 text-slate-100";

  return (
    <div className={`rounded-3xl border p-5 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-75">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function IssueCard({
  issue,
  onUpdate
}: {
  issue: ContentAuditIssue;
  onUpdate: (issue: ContentAuditIssue, status: ContentAuditIssueStatus) => Promise<void>;
}) {
  const severityClass =
    issue.severity === "critical"
      ? "border-rose-300/35 bg-rose-300/10 text-rose-100"
      : issue.severity === "warning"
        ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
        : "border-sky-300/35 bg-sky-300/10 text-sky-100";

  return (
    <article className="panel rounded-[2rem] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] ${severityClass}`}>
              {issue.severity}
            </span>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {issue.category}
            </span>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {issue.status}
            </span>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-50">{issue.issue}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-300">{issue.suggestion}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["open", "fixed", "ignored"] as ContentAuditIssueStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => void onUpdate(issue, status)}
              disabled={issue.status === status}
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:border-teal-300/40 disabled:cursor-not-allowed disabled:border-teal-300/25 disabled:text-teal-100"
            >
              {status}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}
