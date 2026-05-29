"use client";

import { useEffect, useState } from "react";

import { AUTH_UPDATED_EVENT } from "../lib/auth";
import { PremiumUpgradePanel } from "../components/premium-upgrade-panel";
import { ScenarioCard } from "../components/scenario-card";
import { getScenarios } from "../lib/api";
import { getScenarioProgressMap, type ScenarioProgressSummary } from "../lib/progress";
import {
  getPremiumAccess,
  PREMIUM_ACCESS_UPDATED_EVENT,
  type PremiumAccessRecord
} from "../lib/premium-access";
import type { ScenarioSummary } from "../lib/types";

const DIFFICULTY_FILTERS = ["All", "Beginner", "Intermediate", "Advanced"];
const TOPIC_FILTERS = ["All", "SQL", "Spark", "Airflow", "Kafka", "Lakehouse", "Data Quality"];

export default function HomePage() {
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
        const nextScenarios = await getScenarios();
        setScenarios(nextScenarios);
      } catch (loadError) {
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Failed to load scenarios.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadScenarios();
  }, []);

  useEffect(() => {
    function syncProgress() {
      setProgressMap(getScenarioProgressMap());
    }

    syncProgress();
    window.addEventListener("storage", syncProgress);

    return () => window.removeEventListener("storage", syncProgress);
  }, []);

  useEffect(() => {
    function syncPremiumAccess() {
      setPremiumAccess(getPremiumAccess());
    }

    syncPremiumAccess();
    window.addEventListener("storage", syncPremiumAccess);
    window.addEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncPremiumAccess);
    window.addEventListener(AUTH_UPDATED_EVENT, syncPremiumAccess);

    return () => {
      window.removeEventListener("storage", syncPremiumAccess);
      window.removeEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncPremiumAccess);
      window.removeEventListener(AUTH_UPDATED_EVENT, syncPremiumAccess);
    };
  }, []);

  const filteredScenarios = scenarios.filter((scenario) => {
    const difficultyMatches =
      selectedDifficulty === "All" || scenario.difficulty === selectedDifficulty;
    const topicMatches =
      selectedTopic === "All" ||
      scenario.section === selectedTopic ||
      scenario.topics.includes(selectedTopic);
    return difficultyMatches && topicMatches;
  });

  const completedCount = scenarios.filter((scenario) => progressMap[scenario.slug]?.completed).length;
  const attemptedCount = scenarios.filter(
    (scenario) => (progressMap[scenario.slug]?.attemptCount ?? 0) > 0
  ).length;
  const freeCount = scenarios.filter((scenario) => scenario.access_tier === "free").length;
  const premiumCount = scenarios.filter((scenario) => scenario.access_tier === "premium").length;
  const totalCount = scenarios.length;
  const firstFreeScenarioSlug =
    scenarios.find((scenario) => scenario.access_tier === "free")?.slug ?? null;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="panel relative overflow-hidden rounded-[2rem] p-8 sm:p-12">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-amber-400/10 to-transparent lg:block" />
        <div className="relative max-w-3xl">
          <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em]">
            MVP Playground
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-50 sm:text-6xl">
            Practice real Data Engineering interview scenarios, not just theory.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
            Debug SQL bugs, Spark failures, Airflow issues, Kafka edge cases, and data
            quality problems exactly like production.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={firstFreeScenarioSlug ? `/scenarios/${firstFreeScenarioSlug}` : "#scenario-library"}
              className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Start Free Scenario
            </a>
            <a
              href="#scenario-library"
              className="rounded-full border border-slate-700 bg-slate-950/30 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-teal-300/50 hover:text-teal-100"
            >
              See Scenario Library
            </a>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Total Scenarios
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-50">{totalCount}</p>
            </div>
            <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Completed
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-50">{completedCount}</p>
            </div>
            <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Attempted
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-50">{attemptedCount}</p>
            </div>
            <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Premium Library
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-50">
                {premiumAccess ? `${premiumCount} unlocked` : `${premiumCount} locked`}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="scenario-library" className="mt-10 scroll-mt-24">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-50">Scenario Library</h2>
            <p className="mt-2 text-sm text-slate-400">
              Browse {totalCount} scenarios: {freeCount} free and {premiumCount} premium labs for deeper interview prep.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="panel rounded-3xl p-6 text-sm text-slate-300">
            Loading scenarios...
          </div>
        ) : error ? (
          <div className="panel rounded-3xl border border-rose-400/20 p-6 text-sm text-rose-200">
            {error}
          </div>
        ) : (
          <>
            {premiumAccess ? (
              <div className="panel mb-6 rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5 text-sm text-teal-100">
                Premium unlocked for <span className="font-semibold">{premiumAccess.email}</span>{" "}
                on the <span className="font-semibold">{premiumAccess.plan_label}</span> plan. You can now open every premium scenario in this browser.
              </div>
            ) : (
              <div className="mb-6">
                <PremiumUpgradePanel
                  title="Unlock premium scenarios"
                  description="Sign in, choose `Rs 500/year` or `Rs 219/month`, and use the dummy UPI checkout to unlock the full premium interview library in this browser."
                  onUnlocked={() => setPremiumAccess(getPremiumAccess())}
                />
              </div>
            )}

            <div className="panel mb-6 rounded-3xl p-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Difficulty Filter
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {DIFFICULTY_FILTERS.map((difficulty) => (
                      <button
                        key={difficulty}
                        type="button"
                        onClick={() => setSelectedDifficulty(difficulty)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          selectedDifficulty === difficulty
                            ? "bg-teal-300 text-slate-950"
                            : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:border-teal-300/40"
                        }`}
                      >
                        {difficulty}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Topic Filter
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {TOPIC_FILTERS.map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => setSelectedTopic(topic)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                          selectedTopic === topic
                            ? "bg-amber-300 text-slate-950"
                            : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:border-amber-300/40"
                        }`}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
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
    </main>
  );
}
