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
  const status = progress?.completed
    ? "Completed"
    : (progress?.attemptCount ?? 0) > 0
      ? "Attempted"
      : "Not started";

  return (
    <article className="group flex min-h-[360px] flex-col rounded-[2rem] border border-slate-800 bg-slate-950/45 p-6 shadow-2xl shadow-slate-950/20 transition hover:-translate-y-1 hover:border-teal-300/30">
      <div className="flex flex-wrap gap-2">
        <Badge>{formatDomain(scenario.domain)}</Badge>
        <Badge>{formatDifficulty(scenario.difficulty)}</Badge>
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
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-400">
        {scenario.problemStatement}
      </p>

      <div className="mt-5 grid gap-3 text-sm text-slate-300">
        <MetaRow label="Practice" value={formatScenarioType(scenario.scenarioType)} />
        <MetaRow label="Time" value={`${scenario.estimatedMinutes} min`} />
        <MetaRow label="Progress" value={status} />
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
              : "bg-amber-300 text-slate-950 hover:bg-amber-200"
          }`}
        >
          {isLocked ? "Preview Locked Lab" : "Start Lab"}
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/35 px-4 py-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-100">{value}</span>
    </div>
  );
}
