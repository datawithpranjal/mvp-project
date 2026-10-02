"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getCodingLabDrafts, getCodingLabProgressMap } from "../lib/coding-lab-session";
import { GOLD_CORE_ITEMS, GOLD_CORE_MODULES, type GoldCoreItem } from "../lib/gold-core";
import { getScenarioProgressMap } from "../lib/progress";
import {
  getPracticeStatus,
  PracticeStatusBadge,
  type PracticeStatus
} from "./practice-status-badge";

interface SavedOperationsAnswer {
  optionId?: string;
  explanation?: string;
  completed?: boolean;
}

interface SavedSystemDesignProgress {
  completed?: boolean;
  draft?: string;
  selectedOptions?: Record<string, string>;
}

function readLocalRecord<T>(key: string): Record<string, T> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function loadStatuses(): Record<string, PracticeStatus> {
  const codingProgress = getCodingLabProgressMap();
  const codingDrafts = getCodingLabDrafts();
  const scenarioProgress = getScenarioProgressMap();
  const operationsProgress = readLocalRecord<SavedOperationsAnswer>(
    "data-foundry-operations-lab-session-v1"
  );
  const systemDesignProgress = readLocalRecord<SavedSystemDesignProgress>(
    "the-data-foundry-system-design-progress-v1"
  );

  return Object.fromEntries(
    GOLD_CORE_ITEMS.map((item) => {
      if (item.kind === "coding") {
        const progress = codingProgress[item.slug];
        return [
          item.slug,
          getPracticeStatus(
            Boolean(progress?.completed),
            Boolean((progress?.attemptCount ?? 0) > 0 || codingDrafts[item.slug])
          )
        ];
      }

      if (item.kind === "scenario") {
        const progress = scenarioProgress[item.slug];
        return [
          item.slug,
          getPracticeStatus(
            Boolean(progress?.completed),
            Boolean((progress?.attemptCount ?? 0) > 0 || progress?.draftSavedAt)
          )
        ];
      }

      if (item.kind === "operations") {
        const progress = operationsProgress[item.slug];
        return [
          item.slug,
          getPracticeStatus(
            Boolean(progress?.completed),
            Boolean(progress?.optionId || progress?.explanation?.trim())
          )
        ];
      }

      const progress = systemDesignProgress[item.slug];
      return [
        item.slug,
        getPracticeStatus(
          Boolean(progress?.completed),
          Boolean(
            progress?.draft?.trim() ||
              (progress?.selectedOptions && Object.keys(progress.selectedOptions).length > 0)
          )
        )
      ];
    })
  );
}

export function GoldCorePath() {
  const [statuses, setStatuses] = useState<Record<string, PracticeStatus>>({});

  useEffect(() => {
    const refresh = () => setStatuses(loadStatuses());
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const completedCount = useMemo(
    () => GOLD_CORE_ITEMS.filter((item) => statuses[item.slug] === "done").length,
    [statuses]
  );
  const inProgressCount = useMemo(
    () => GOLD_CORE_ITEMS.filter((item) => statuses[item.slug] === "in_progress").length,
    [statuses]
  );
  const nextItem =
    GOLD_CORE_ITEMS.find((item) => statuses[item.slug] === "in_progress") ??
    GOLD_CORE_ITEMS.find((item) => statuses[item.slug] !== "done") ??
    GOLD_CORE_ITEMS[0];

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
      <section className="panel overflow-hidden rounded-[2rem] p-7 sm:p-10">
        <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
              Gold Core v1
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
              Thirty reviewed exercises. One deliberate foundation.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              This is the curated starting path through SQL, Python, PySpark, production
              incidents, cloud judgment, and system design. It is intentionally smaller than
              the full library: every item has a defined competency, prerequisite, validation
              method, and production reason for being here.
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
              Completing the path records practice evidence. It does not guarantee an interview
              or job outcome.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Complete" value={completedCount} />
            <Stat label="In progress" value={inProgressCount} />
            <Stat label="Total" value={GOLD_CORE_ITEMS.length} />
          </div>
        </div>

        {nextItem ? (
          <div className="mt-8 flex flex-col justify-between gap-4 rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                {completedCount === GOLD_CORE_ITEMS.length ? "Review the core" : "Recommended next"}
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-50">
                {nextItem.order}. {nextItem.title}
              </p>
              <p className="mt-1 text-sm text-slate-300">{nextItem.competency}</p>
            </div>
            <Link
              href={nextItem.href}
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              {statuses[nextItem.slug] === "in_progress" ? "Continue" : "Start next"}
            </Link>
          </div>
        ) : null}
      </section>

      <div className="mt-8 space-y-8">
        {GOLD_CORE_MODULES.map((module, moduleIndex) => (
          <section key={module.name} className="panel rounded-[2rem] p-6 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
                  Module {moduleIndex + 1}
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-50">{module.name}</h2>
              </div>
              <p className="text-sm text-slate-400">{module.items.length} reviewed exercises</p>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {module.items.map((item) => (
                <GoldItemCard key={item.slug} item={item} status={statuses[item.slug] ?? "new"} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function GoldItemCard({ item, status }: { item: GoldCoreItem; status: PracticeStatus }) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
            Gold #{item.order}
          </span>
          <PracticeStatusBadge status={status} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {item.isFree ? "Free" : "Premium"}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-50">{item.title}</h3>
      <p className="mt-2 text-sm leading-6 text-teal-100">{item.competency}</p>
      <dl className="mt-4 grid gap-2 text-sm leading-6 text-slate-300">
        <Detail label="Prerequisite" value={item.prerequisite} />
        <Detail label="Validation" value={item.validation} />
        <Detail label="Effort" value={`${item.difficulty} · ${item.estimatedMinutes} min`} />
      </dl>
      <Link
        href={item.href}
        className="mt-5 inline-flex w-fit rounded-full border border-teal-300/30 px-4 py-2 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10"
      >
        {status === "done" ? "Review exercise" : status === "in_progress" ? "Continue exercise" : "Start exercise"}
      </Link>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[96px_1fr]">
      <dt className="text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4 text-center">
      <p className="text-2xl font-semibold text-slate-50">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
    </div>
  );
}
