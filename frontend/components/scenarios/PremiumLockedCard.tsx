import Link from "next/link";

import { PremiumUpgradePanel } from "../premium-upgrade-panel";
import { getScenarios, formatDomain, type Scenario } from "../../lib/scenarios";
import { PremiumAccessBadge } from "../premium-access-badge";

interface PremiumLockedCardProps {
  scenario: Scenario;
  accessUnavailable?: boolean;
}

export function PremiumLockedCard({ scenario, accessUnavailable = false }: PremiumLockedCardProps) {
  const showExercisePreview = scenario.id === "bpl-dq-001";
  const scenarios = getScenarios();
  const index = scenarios.findIndex((item) => item.slug === scenario.slug);
  const previous = index > 0 ? scenarios[index - 1] : null;
  const next = index >= 0 ? scenarios[index + 1] ?? null : null;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8 sm:p-10">
        <div className="flex flex-wrap gap-2">
          <PremiumAccessBadge locked />
          <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
            {formatDomain(scenario.domain)}
          </span>
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-50">
          {scenario.title}
        </h1>
        {accessUnavailable ? (
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            We could not confirm your Premium access right now. Check your access from Pricing and try again.
          </p>
        ) : !showExercisePreview ? (
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            Premium unlocks the task, source data, workspace, hints, validation and model answer.
          </p>
        ) : null}
        {showExercisePreview ? (
          <div className="mt-5 max-w-3xl space-y-2">
            <h2 className="text-lg font-semibold text-slate-50">In this Premium exercise</h2>
            <p className="text-sm leading-7 text-slate-300">
              Reconcile a fictional daily revenue report when a new payment provider uses a different label for successful transactions. Write SQL using the supplied payment records and status definitions, work through hints, then compare your approach with a model explanation and prevention questions.
            </p>
            <p className="text-sm leading-7 text-slate-300">
              This is guided practice. SQL checks cover the supplied example. Explanation feedback is advisory.
            </p>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {previous ? <Link href={`/scenarios/${previous.slug}`} className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200">← Previous</Link> : null}
          {next ? <Link href={`/scenarios/${next.slug}`} className="rounded-full border border-teal-300/30 px-5 py-3 text-sm font-semibold text-teal-100">Next →</Link> : null}
        </div>
      </section>

      <div className="mt-6">
        <PremiumUpgradePanel
          title="Unlock Broken Pipeline Lab"
          description="Premium unlock gives access to the full scenario library, hints, model answers, and practice feedback."
        />
      </div>
    </main>
  );
}
