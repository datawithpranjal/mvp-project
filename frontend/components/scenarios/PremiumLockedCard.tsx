import { PremiumUpgradePanel } from "../premium-upgrade-panel";
import { formatDifficulty, formatDomain, formatScenarioType, type Scenario } from "../../lib/scenarios";

interface PremiumLockedCardProps {
  scenario: Scenario;
}

export function PremiumLockedCard({ scenario }: PremiumLockedCardProps) {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8 sm:p-10">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
            Premium locked
          </span>
          <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
            {formatDomain(scenario.domain)}
          </span>
          <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
            {formatDifficulty(scenario.difficulty)}
          </span>
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-50">
          {scenario.title}
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          {scenario.problemStatement}
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Info label="Practice type" value={formatScenarioType(scenario.scenarioType)} />
          <Info label="Estimated time" value={`${scenario.estimatedMinutes} min`} />
          <Info label="Skills" value={scenario.tags.slice(0, 3).join(", ")} />
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">{value}</p>
    </div>
  );
}
