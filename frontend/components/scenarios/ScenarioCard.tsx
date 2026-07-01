import Link from "next/link";
import type { ReactNode } from "react";

import {
  formatDifficulty,
  formatDomain,
  formatScenarioType,
  type Scenario
} from "../../lib/scenarios";
import type { ScenarioProgressSummary } from "../../lib/progress";

interface ScenarioCardProps {
  scenario: Scenario;
  progress?: ScenarioProgressSummary;
  isLocked: boolean;
}

export function ScenarioCard({ scenario, progress, isLocked }: ScenarioCardProps) {
  const isCompleted = Boolean(progress?.completed);
  const status = progress?.completed
    ? "Completed"
    : (progress?.attemptCount ?? 0) > 0
      ? "Attempted"
      : "Not started";

  return (
    <article
      className={`group flex min-h-[390px] flex-col rounded-[2rem] border p-6 shadow-2xl shadow-slate-950/20 transition hover:-translate-y-1 ${
        isCompleted
          ? "border-teal-300/55 bg-teal-300/10 shadow-teal-950/20 hover:border-teal-200/70"
          : "border-slate-800 bg-slate-950/45 hover:border-teal-300/30"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{formatDomain(scenario.domain)}</Badge>
        {isCompleted ? (
          <span className="rounded-full border border-teal-200/40 bg-teal-300 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-950">
            Completed
          </span>
        ) : null}
        <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
          {formatDifficulty(scenario.difficulty)}
        </span>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
            scenario.isFree
              ? "border-teal-300/25 bg-teal-300/10 text-teal-100"
              : "border-amber-300/25 bg-amber-300/10 text-amber-100"
          }`}
        >
          {scenario.isFree ? "Free" : "Premium"}
        </span>
      </div>

      <h3 className="mt-5 text-xl font-semibold leading-8 text-slate-50">{scenario.title}</h3>
      <div
        className={`mt-3 rounded-2xl border px-4 py-3 ${
          isCompleted
            ? "border-teal-200/25 bg-teal-200/15"
            : "border-teal-300/15 bg-teal-300/10"
        }`}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-100">
          You will practice
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-100">
          {scenario.requirement ?? scenario.tasks[0] ?? formatScenarioType(scenario.scenarioType)}
        </p>
      </div>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-400">
        {scenario.problemStatement}
      </p>

      <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
        <MetaPill label="Type" value={formatScenarioType(scenario.scenarioType)} />
        <MetaPill label="Time" value={`${scenario.estimatedMinutes} min`} />
        <MetaPill label="Progress" value={status} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {scenario.tags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-slate-800 bg-slate-950/50 px-3 py-1 text-xs text-slate-300"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-6">
        <Link
          href={`/scenarios/${scenario.slug}`}
          className={`inline-flex w-full justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
            isLocked
              ? "border border-amber-300/30 text-amber-100 hover:bg-amber-300/10"
              : isCompleted
                ? "bg-teal-300 text-slate-950 hover:bg-teal-200"
              : "bg-amber-300 text-slate-950 hover:bg-amber-200"
          }`}
        >
          {isLocked ? "Unlock" : isCompleted ? "Review Lab" : "Start Lab"}
        </Link>
      </div>
    </article>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
      {children}
    </span>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/35 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-100">{value}</p>
    </div>
  );
}
