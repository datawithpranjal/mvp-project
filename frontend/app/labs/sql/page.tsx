"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ScenarioCard } from "../../../components/scenario-card";
import { getScenarios } from "../../../lib/api";
import { AUTH_UPDATED_EVENT } from "../../../lib/auth";
import { getScenarioProgressMap, type ScenarioProgressSummary } from "../../../lib/progress";
import {
  getPremiumAccess,
  PREMIUM_ACCESS_UPDATED_EVENT,
  type PremiumAccessRecord
} from "../../../lib/premium-access";
import type { ScenarioSummary } from "../../../lib/types";

const SQL_LAB_TOPICS = ["All", "Ranking", "Window Functions", "Aggregation", "Anti Join", "Metrics"];

export default function SqlLabPage() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ScenarioProgressSummary>>({});
  const [premiumAccess, setPremiumAccess] = useState<PremiumAccessRecord | null>(null);
  const [selectedTopic, setSelectedTopic] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSqlLabs() {
      try {
        setIsLoading(true);
        setError(null);
        const nextScenarios = await getScenarios();
        setScenarios(
          nextScenarios.filter(
            (scenario) =>
              scenario.section === "SQL Lab" || scenario.slug.startsWith("sql-lab-")
          )
        );
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load SQL labs.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadSqlLabs();
  }, []);

  useEffect(() => {
    function syncClientState() {
      setProgressMap(getScenarioProgressMap());
      setPremiumAccess(getPremiumAccess());
    }

    syncClientState();
    window.addEventListener("storage", syncClientState);
    window.addEventListener(AUTH_UPDATED_EVENT, syncClientState);
    window.addEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncClientState);

    return () => {
      window.removeEventListener("storage", syncClientState);
      window.removeEventListener(AUTH_UPDATED_EVENT, syncClientState);
      window.removeEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncClientState);
    };
  }, []);

  const filteredScenarios = scenarios.filter((scenario) => {
    return selectedTopic === "All" || scenario.topics.includes(selectedTopic);
  });

  const stats = useMemo(() => {
    const completed = scenarios.filter((scenario) => progressMap[scenario.slug]?.completed).length;
    const free = scenarios.filter((scenario) => scenario.access_tier === "free").length;
    const premium = scenarios.filter((scenario) => scenario.access_tier === "premium").length;
    return { total: scenarios.length, completed, free, premium };
  }, [progressMap, scenarios]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <div className="mb-6">
        <Link href="/labs" className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">
          ← Back to labs
        </Link>
      </div>

      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          SQL Lab
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
          SQL coding practice with real tables and validation.
        </h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">
          This lab converts the SQL coding practice PDF into interactive exercises. Open
          a problem, inspect the seeded table, write a query, run validation, then compare
          with the model solution and explanation.
        </p>
        {!isLoading && !error ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <StatCard label="Exercises" value={stats.total} />
            <StatCard label="Free" value={stats.free} />
            <StatCard label="Premium" value={stats.premium} />
            <StatCard label="Completed" value={stats.completed} />
          </div>
        ) : null}
      </section>

      <section className="panel mt-6 rounded-3xl p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          Topic filter
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SQL_LAB_TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => setSelectedTopic(topic)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                selectedTopic === topic
                  ? "bg-teal-300 text-slate-950"
                  : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:border-teal-300/40"
              }`}
            >
              {topic}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        {isLoading ? (
          <div className="grid gap-5 md:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="panel animate-pulse rounded-3xl p-6">
                <div className="h-4 w-28 rounded-full bg-slate-700/60" />
                <div className="mt-6 h-7 w-3/4 rounded-full bg-slate-700/60" />
                <div className="mt-4 h-4 w-full rounded-full bg-slate-800/80" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="panel rounded-3xl border border-rose-400/20 p-6 text-sm text-rose-200">
            {error}
          </div>
        ) : filteredScenarios.length === 0 ? (
          <div className="panel rounded-3xl p-6 text-sm text-slate-300">
            No SQL lab exercises match this filter yet.
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
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-50">{value}</p>
    </div>
  );
}

