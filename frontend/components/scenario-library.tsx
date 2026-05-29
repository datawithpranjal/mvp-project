"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getScenarios } from "../lib/api";
import { AUTH_UPDATED_EVENT } from "../lib/auth";
import { DIFFICULTY_FILTERS, TOPIC_FILTERS } from "../lib/product";
import { getScenarioProgressMap, type ScenarioProgressSummary } from "../lib/progress";
import {
  getPremiumAccess,
  PREMIUM_ACCESS_UPDATED_EVENT,
  type PremiumAccessRecord
} from "../lib/premium-access";
import type { ScenarioSummary } from "../lib/types";
import { PremiumUpgradePanel } from "./premium-upgrade-panel";
import { ScenarioCard } from "./scenario-card";

interface ScenarioLibraryProps {
  title?: string;
  description?: string;
  showUpgradePanel?: boolean;
  showHeaderCta?: boolean;
}

export function ScenarioLibrary({
  title = "Scenario Library",
  description = "Practice SQL bugs, Spark failures, Airflow incidents, Kafka edge cases, and data quality problems.",
  showUpgradePanel = true,
  showHeaderCta = true
}: ScenarioLibraryProps) {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ScenarioProgressSummary>>({});
  const [premiumAccess, setPremiumAccess] = useState<PremiumAccessRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState("All");
  const [selectedTopic, setSelectedTopic] = useState("All");

  useEffect(() => {
    async function loadScenarios() {
      try {
        setIsLoading(true);
        setError(null);
        const nextScenarios = await getScenarios();
        setScenarios(nextScenarios);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load scenarios.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadScenarios();
  }, []);

  useEffect(() => {
    function syncClientState() {
      setProgressMap(getScenarioProgressMap());
      setPremiumAccess(getPremiumAccess());
    }

    syncClientState();
    window.addEventListener("storage", syncClientState);
    window.addEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncClientState);
    window.addEventListener(AUTH_UPDATED_EVENT, syncClientState);

    return () => {
      window.removeEventListener("storage", syncClientState);
      window.removeEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncClientState);
      window.removeEventListener(AUTH_UPDATED_EVENT, syncClientState);
    };
  }, []);

  const counts = useMemo(() => {
    return {
      total: scenarios.length,
      free: scenarios.filter((scenario) => scenario.access_tier === "free").length,
      premium: scenarios.filter((scenario) => scenario.access_tier === "premium").length,
      completed: scenarios.filter((scenario) => progressMap[scenario.slug]?.completed).length,
      attempted: scenarios.filter((scenario) => (progressMap[scenario.slug]?.attemptCount ?? 0) > 0)
        .length
    };
  }, [progressMap, scenarios]);

  const filteredScenarios = scenarios.filter((scenario) => {
    const difficultyMatches =
      selectedDifficulty === "All" || scenario.difficulty === selectedDifficulty;
    const topicMatches =
      selectedTopic === "All" ||
      scenario.section === selectedTopic ||
      scenario.topics.includes(selectedTopic);
    return difficultyMatches && topicMatches;
  });

  const firstFreeScenarioSlug =
    scenarios.find((scenario) => scenario.access_tier === "free")?.slug ?? null;

  return (
    <section id="scenario-library" className="scroll-mt-24">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
            Practice Library
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">
            {title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
          {!isLoading && !error ? (
            <p className="mt-3 text-sm text-slate-300">
              Showing {counts.total} published scenarios: {counts.free} free and{" "}
              {counts.premium} premium locked labs.
            </p>
          ) : null}
        </div>
        {showHeaderCta ? (
          <div className="flex flex-wrap gap-3">
            <Link
              href={firstFreeScenarioSlug ? `/scenarios/${firstFreeScenarioSlug}` : "#scenario-library"}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Start Free Scenario
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
            >
              Premium Pricing
            </Link>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid gap-5 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="panel animate-pulse rounded-3xl p-6">
              <div className="h-4 w-28 rounded-full bg-slate-700/60" />
              <div className="mt-6 h-7 w-3/4 rounded-full bg-slate-700/60" />
              <div className="mt-4 h-4 w-full rounded-full bg-slate-800/80" />
              <div className="mt-2 h-4 w-2/3 rounded-full bg-slate-800/80" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="panel rounded-3xl border border-rose-400/20 p-6">
          <h3 className="text-lg font-semibold text-rose-100">Unable to load scenarios</h3>
          <p className="mt-2 text-sm leading-6 text-rose-200">{error}</p>
          <p className="mt-3 text-sm text-slate-400">
            Check that `NEXT_PUBLIC_API_BASE_URL` points to the live FastAPI backend and that
            CORS is enabled for this frontend domain.
          </p>
        </div>
      ) : scenarios.length === 0 ? (
        <div className="panel rounded-3xl p-6">
          <h3 className="text-lg font-semibold text-slate-50">No published scenarios yet</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            The API responded successfully, but returned an empty list. Add scenario JSON files
            or check publish filters before treating this as real product inventory.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-5">
            {[
              ["Total", counts.total],
              ["Free", counts.free],
              ["Premium", counts.premium],
              ["Completed", counts.completed],
              ["Attempted", counts.attempted]
            ].map(([label, value]) => (
              <div key={label} className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-50">{value}</p>
              </div>
            ))}
          </div>

          {showUpgradePanel && !premiumAccess ? (
            <div className="mb-6">
              <PremiumUpgradePanel
                title="Unlock premium scenarios"
                description="Sign in, choose `Rs 500/year` or `Rs 219/month`, and use the dummy UPI checkout to unlock the full premium interview library in this browser."
                onUnlocked={() => setPremiumAccess(getPremiumAccess())}
              />
            </div>
          ) : null}

          {premiumAccess ? (
            <div className="panel mb-6 rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5 text-sm text-teal-100">
              Premium unlocked for <span className="font-semibold">{premiumAccess.email}</span>{" "}
              on the <span className="font-semibold">{premiumAccess.plan_label}</span> plan.
            </div>
          ) : null}

          <div className="panel mb-6 rounded-3xl p-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <FilterGroup
                title="Difficulty"
                filters={DIFFICULTY_FILTERS}
                selected={selectedDifficulty}
                onSelect={setSelectedDifficulty}
                activeClassName="bg-teal-300 text-slate-950"
              />
              <FilterGroup
                title="Topic"
                filters={TOPIC_FILTERS}
                selected={selectedTopic}
                onSelect={setSelectedTopic}
                activeClassName="bg-amber-300 text-slate-950"
              />
            </div>
          </div>

          {filteredScenarios.length === 0 ? (
            <div className="panel rounded-3xl p-6 text-sm text-slate-300">
              No scenarios match the current filter combination.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredScenarios.map((scenario) => (
                <ScenarioCard
                  key={scenario.slug}
                  scenario={scenario}
                  progress={progressMap[scenario.slug]}
                  isLocked={scenario.access_tier === "premium" && !premiumAccess}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FilterGroup({
  title,
  filters,
  selected,
  onSelect,
  activeClassName
}: {
  title: string;
  filters: string[];
  selected: string;
  onSelect: (filter: string) => void;
  activeClassName: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        {title} Filter
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => onSelect(filter)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              selected === filter
                ? activeClassName
                : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:border-teal-300/40"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  );
}

