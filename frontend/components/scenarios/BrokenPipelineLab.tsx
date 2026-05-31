"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AUTH_UPDATED_EVENT } from "../../lib/auth";
import {
  getPremiumAccess,
  PREMIUM_ACCESS_UPDATED_EVENT,
  type PremiumAccessRecord
} from "../../lib/premium-access";
import { getScenarioProgressMap, type ScenarioProgressSummary } from "../../lib/progress";
import {
  DOMAIN_LABELS,
  SCENARIO_TYPE_LABELS,
  getScenarios,
  type Scenario
} from "../../lib/scenarios";
import { PremiumUpgradePanel } from "../premium-upgrade-panel";
import { ScenarioCard } from "./ScenarioCard";
import { ScenarioFilters, type ScenarioFilterState } from "./ScenarioFilters";

const INITIAL_FILTERS: ScenarioFilterState = {
  domain: "All",
  difficulty: "All",
  type: "All",
  access: "All"
};

export function BrokenPipelineLab() {
  const [filters, setFilters] = useState<ScenarioFilterState>(INITIAL_FILTERS);
  const [progressMap, setProgressMap] = useState<Record<string, ScenarioProgressSummary>>({});
  const [premiumAccess, setPremiumAccess] = useState<PremiumAccessRecord | null>(null);
  const scenarios = getScenarios();

  useEffect(() => {
    function syncState() {
      setProgressMap(getScenarioProgressMap());
      setPremiumAccess(getPremiumAccess());
    }

    syncState();
    window.addEventListener("storage", syncState);
    window.addEventListener(AUTH_UPDATED_EVENT, syncState);
    window.addEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncState);

    return () => {
      window.removeEventListener("storage", syncState);
      window.removeEventListener(AUTH_UPDATED_EVENT, syncState);
      window.removeEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncState);
    };
  }, []);

  const counts = useMemo(
    () => ({
      total: scenarios.length,
      free: scenarios.filter((scenario) => scenario.isFree).length,
      premium: scenarios.filter((scenario) => !scenario.isFree).length,
      attempted: scenarios.filter(
        (scenario) => (progressMap[scenario.slug]?.attemptCount ?? 0) > 0
      ).length,
      completed: scenarios.filter((scenario) => progressMap[scenario.slug]?.completed).length
    }),
    [progressMap, scenarios]
  );

  const filteredScenarios = useMemo(() => {
    return scenarios.filter((scenario) => {
      const domainMatches =
        filters.domain === "All" || DOMAIN_LABELS[scenario.domain] === filters.domain;
      const difficultyMatches =
        filters.difficulty === "All" || scenario.difficulty === filters.difficulty;
      const typeMatches =
        filters.type === "All" || SCENARIO_TYPE_LABELS[scenario.scenarioType] === filters.type;
      const accessMatches =
        filters.access === "All" ||
        (filters.access === "Free" && scenario.isFree) ||
        (filters.access === "Premium" && !scenario.isFree);
      return domainMatches && difficultyMatches && typeMatches && accessMatches;
    });
  }, [filters, scenarios]);

  const firstFreeScenario = scenarios.find((scenario) => scenario.isFree);

  return (
    <section className="space-y-8">
      <section className="panel overflow-hidden rounded-[2rem] p-8 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              The Data Foundry
            </p>
            <h1 className="mt-4 text-5xl font-semibold tracking-tight text-slate-50">
              Broken Pipeline Lab
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300">
              Fix SQL bugs, PySpark mistakes, Airflow failures, and production data issues
              before interviews test you.
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
              Practice Data Engineering the way it actually breaks in production: diagnose,
              attempt, evaluate, reveal, and explain.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={firstFreeScenario ? `/scenarios/${firstFreeScenario.slug}` : "/scenarios"}
                className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Start Free Lab
              </Link>
              <Link
                href="/projects/ecommerce-pipeline"
                className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
              >
                Explore Project Simulator
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label="Total labs" value={counts.total} />
            <Stat label="Free labs" value={counts.free} />
            <Stat label="Premium labs" value={counts.premium} />
            <Stat label="Completed" value={counts.completed} />
          </div>
        </div>
      </section>

      <ScenarioFilters value={filters} onChange={setFilters} />

      {!premiumAccess ? (
        <PremiumUpgradePanel
          title="Unlock the full debugging library"
          description="Free labs are open now. Premium labs show the skill and production failure, then unlock with manual UPI verification while the payment gateway is still MVP."
        />
      ) : null}

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-semibold text-slate-50">Scenario cards</h2>
          <p className="mt-2 text-sm text-slate-400">
            Showing {filteredScenarios.length} of {counts.total} labs. Attempted {counts.attempted}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFilters(INITIAL_FILTERS)}
          className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
        >
          Reset filters
        </button>
      </div>

      {filteredScenarios.length === 0 ? (
        <div className="panel rounded-3xl p-6 text-sm text-slate-300">
          No labs match this filter combination.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredScenarios.map((scenario: Scenario) => (
            <ScenarioCard
              key={scenario.slug}
              scenario={scenario}
              progress={progressMap[scenario.slug]}
              isLocked={!scenario.isFree && !premiumAccess}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/45 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-semibold text-slate-50">{value}</p>
    </div>
  );
}
