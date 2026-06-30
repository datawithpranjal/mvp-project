"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  auditContentItems,
  getContentAuditSummary
} from "../../../lib/api";
import { getContentAuditCatalog } from "../../../lib/content-audit-catalog";
import type { ContentAuditRun, ContentAuditSummaryResponse } from "../../../lib/types";

const ADMIN_TOKEN_STORAGE_KEY = "data-foundry-admin-token";
const AUDIT_CHUNK_SIZE = 40;

export default function ContentAuditorPage() {
  const catalog = useMemo(() => getContentAuditCatalog(), []);
  const [adminToken, setAdminToken] = useState("");
  const [summary, setSummary] = useState<ContentAuditSummaryResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState("");

  useEffect(() => {
    const savedToken = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (savedToken) {
      setAdminToken(savedToken);
      void loadSummary(savedToken);
    }
  }, []);

  async function loadSummary(token = adminToken) {
    if (!token.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim());
      setSummary(await getContentAuditSummary(token.trim()));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load content audits.");
    } finally {
      setIsLoading(false);
    }
  }

  async function runAuditForAllContent() {
    if (!adminToken.trim()) {
      setError("Enter the admin token before running an audit.");
      return;
    }
    setIsAuditing(true);
    setError("");
    setAuditProgress("");
    try {
      for (let index = 0; index < catalog.length; index += AUDIT_CHUNK_SIZE) {
        const chunk = catalog.slice(index, index + AUDIT_CHUNK_SIZE);
        setAuditProgress(
          `Auditing ${Math.min(index + chunk.length, catalog.length)} of ${catalog.length} content items...`
        );
        await auditContentItems(adminToken.trim(), chunk);
      }
      setAuditProgress("Audit complete. Refreshing report...");
      await loadSummary(adminToken.trim());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to run content audit.");
    } finally {
      setIsAuditing(false);
    }
  }

  const auditedIds = new Set(summary?.items.map((item) => item.content_id) ?? []);
  const unauditedCount = catalog.filter((item) => !auditedIds.has(item.content_id)).length;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
          Internal admin
        </p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-50">
              Content Auditor
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Rule-based QA for SQL, Python, PySpark, Airflow, AWS, scenarios, and system design
              content. The first version checks completeness, metadata quality, validation fields,
              and learner guidance.
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
            <button
              type="button"
              onClick={() => void loadSummary()}
              disabled={isLoading || !adminToken.trim()}
              className="mt-3 w-full rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "Loading..." : "Load audit report"}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Audited content" value={summary?.total_audited_content ?? 0} />
        <MetricCard label="Average score" value={summary?.average_audit_score ?? 0} />
        <MetricCard label="Critical" value={summary?.critical_issues ?? 0} tone="critical" />
        <MetricCard label="Warnings" value={summary?.warning_issues ?? 0} tone="warning" />
        <MetricCard label="Suggestions" value={summary?.suggestion_issues ?? 0} tone="suggestion" />
      </section>

      <section className="panel mt-6 rounded-[2rem] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-50">Audit bundled content</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Catalog size: {catalog.length}. Unaudited in the latest report: {unauditedCount}.
            </p>
            {auditProgress ? (
              <p className="mt-2 text-sm font-semibold text-teal-100">{auditProgress}</p>
            ) : null}
            {error ? <p className="mt-2 text-sm font-semibold text-rose-200">{error}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => void runAuditForAllContent()}
            disabled={isAuditing || !adminToken.trim()}
            className="rounded-full bg-amber-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAuditing ? "Auditing..." : "Run audit for all content"}
          </button>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              Lowest score first
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-50">Content items</h2>
          </div>
          <p className="text-sm text-slate-400">
            Storage: {summary?.storage_backend ?? "not loaded"}
          </p>
        </div>

        {summary?.items.length ? (
          <div className="grid gap-4">
            {summary.items.map((item) => (
              <AuditItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="panel rounded-[2rem] p-8 text-sm leading-6 text-slate-300">
            No audit runs yet. Enter the admin token and run the first audit.
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

function AuditItemCard({ item }: { item: ContentAuditRun }) {
  return (
    <Link
      href={`/admin/content-auditor/${encodeURIComponent(item.content_id)}`}
      className="panel group grid gap-4 rounded-[2rem] p-5 transition hover:-translate-y-1 hover:border-teal-300/40 lg:grid-cols-[110px_minmax(0,1fr)_260px]"
    >
      <div>
        <p
          className={`inline-flex rounded-full px-4 py-2 text-lg font-bold ${
            item.audit_score < 60
              ? "bg-rose-300 text-slate-950"
              : item.audit_score < 80
                ? "bg-amber-300 text-slate-950"
                : "bg-teal-300 text-slate-950"
          }`}
        >
          {item.audit_score}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold text-slate-50">{item.title}</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {item.content_type} · {item.topic} · {item.difficulty}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <IssuePill label="Critical" value={item.issue_counts.critical ?? 0} tone="critical" />
        <IssuePill label="Warn" value={item.issue_counts.warning ?? 0} tone="warning" />
        <IssuePill label="Suggest" value={item.issue_counts.suggestion ?? 0} tone="suggestion" />
      </div>
    </Link>
  );
}

function IssuePill({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "critical" | "warning" | "suggestion";
}) {
  const toneClass =
    tone === "critical"
      ? "border-rose-300/30 text-rose-100"
      : tone === "warning"
        ? "border-amber-300/30 text-amber-100"
        : "border-sky-300/30 text-sky-100";
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}>
      {label}: {value}
    </span>
  );
}
