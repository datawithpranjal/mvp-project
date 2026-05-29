import Link from "next/link";

import { estimateScenarioMinutes, formatValidationMode } from "../lib/product";
import type { ScenarioSummary } from "../lib/types";
import type { ScenarioProgressSummary } from "../lib/progress";

interface ScenarioCardProps {
  scenario: ScenarioSummary;
  progress?: ScenarioProgressSummary;
  isLocked: boolean;
}

export function ScenarioCard({ scenario, progress, isLocked }: ScenarioCardProps) {
  const extraTopics = scenario.topics.filter((topic) => topic !== scenario.section);
  const validationLabel = formatValidationMode(scenario.validation_type);
  const strengthLabel = progress?.selfRating ?? (progress?.completed ? "Strong" : "Not rated");

  return (
    <Link
      href={`/scenarios/${scenario.slug}`}
      className={`panel group flex h-full flex-col justify-between rounded-3xl p-6 transition duration-300 hover:-translate-y-1 hover:border-teal-300/30 hover:shadow-glow ${
        isLocked ? "border-amber-300/20" : ""
      }`}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
              {scenario.section}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              {validationLabel}
            </span>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              {scenario.difficulty}
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
              {estimateScenarioMinutes(scenario)} min
            </span>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${
                scenario.access_tier === "premium"
                  ? "border border-amber-300/25 bg-amber-300/10 text-amber-100"
                  : "border border-teal-300/20 bg-teal-300/10 text-teal-100"
              }`}
            >
              {scenario.access_tier === "premium" ? "Premium" : "Free"}
            </span>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-50">
            {scenario.title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {scenario.short_description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {extraTopics.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-8 space-y-3">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
          <span>
            {isLocked ? "Locked" : progress?.completed ? "Completed" : "Open"}
          </span>
          <span>{strengthLabel}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-teal-200">
          <span>
            {isLocked
              ? "Preview locked lab"
              : progress?.completed
                ? "Review scenario"
                : "Open playground"}
          </span>
          <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
            {progress?.attemptCount ?? 0} attempts
          </span>
          <span className="transition duration-300 group-hover:translate-x-1">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
