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
import { GUIDED_SCENARIO_PATHS } from "../../lib/product";
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
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
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
    const difficultyOrder = { beginner: 0, intermediate: 1, advanced: 2 };
    const search = query.trim().toLowerCase();
    const matching = scenarios.filter((scenario) => {
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
        const searchMatches =
          !search ||
          [
            scenario.title,
            scenario.businessContext,
            DOMAIN_LABELS[scenario.domain],
            SCENARIO_TYPE_LABELS[scenario.scenarioType],
            scenario.difficulty,
            ...scenario.tags
          ]
            .join(" ")
            .toLowerCase()
            .includes(search);
        return domainMatches && difficultyMatches && typeMatches && accessMatches && searchMatches;
      });

    return [...matching].sort((left, right) => {
      if (sort === "beginner") {
        return difficultyOrder[left.difficulty] - difficultyOrder[right.difficulty];
      }
      if (sort === "shortest") return left.estimatedMinutes - right.estimatedMinutes;
      if (sort === "free") return Number(right.isFree) - Number(left.isFree);
      if (sort === "interview") {
        const score = (scenario: Scenario) =>
          scenario.tags.some((tag) => /sql|pyspark|airflow|interview/i.test(tag)) ? 1 : 0;
        return score(right) - score(left);
      }
      const progressDifference =
        Number(Boolean(progressMap[right.slug]?.attemptCount)) -
        Number(Boolean(progressMap[left.slug]?.attemptCount));
      return progressDifference || Number(right.isFree) - Number(left.isFree);
    });
  }, [filters, progressMap, query, scenarios, sort]);

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
                href="/roadmap"
                className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
              >
                View guided roadmap
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

      <section className="panel rounded-[2rem] p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
              Start here
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-50">
              Choose the path closest to your current goal.
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-400">
            These shortcuts set the filters for you so the library feels like a guided
            practice plan, not a wall of cards.
          </p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {GUIDED_SCENARIO_PATHS.map((path) => (
            <button
              key={path.title}
              type="button"
              onClick={() => setFilters(path.filters as ScenarioFilterState)}
              className="rounded-3xl border border-slate-800 bg-slate-950/40 p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-300/35"
            >
              <p className="text-sm font-semibold text-slate-50">{path.title}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">{path.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="panel rounded-[2rem] p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div>
            <label htmlFor="scenario-search" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Search scenarios
            </label>
            <input
              id="scenario-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search SQL, joins, CDC, Airflow, difficulty..."
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/45 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-teal-300/45"
            />
          </div>
          <div>
            <label htmlFor="scenario-sort" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Sort
            </label>
            <select
              id="scenario-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/45 px-4 py-3 text-sm text-slate-100 outline-none focus:border-teal-300/45"
            >
              <option value="recommended">Recommended</option>
              <option value="beginner">Beginner first</option>
              <option value="interview">Most interview-relevant</option>
              <option value="shortest">Shortest first</option>
              <option value="free">Free first</option>
            </select>
          </div>
        </div>
      </section>

      <details className="panel rounded-[2rem] p-4 lg:hidden">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-100">
          Advanced filters
        </summary>
        <div className="mt-4">
          <ScenarioFilters value={filters} onChange={setFilters} />
        </div>
      </details>
      <div className="hidden lg:block">
        <ScenarioFilters value={filters} onChange={setFilters} />
      </div>

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-2xl font-semibold text-slate-50">Scenario cards</h2>
          <p className="mt-2 text-sm text-slate-400">
            Showing {filteredScenarios.length} of {counts.total} labs. Attempted {counts.attempted}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFilters(INITIAL_FILTERS);
            setQuery("");
            setSort("recommended");
          }}
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
