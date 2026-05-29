"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getScenarios } from "../../lib/api";
import { getOnboardingProfile, type OnboardingProfile } from "../../lib/onboarding";
import { LEARNING_PATHS } from "../../lib/product";
import { getScenarioProgressMap, type ScenarioProgressSummary } from "../../lib/progress";
import { calculateReadinessScore } from "../../lib/readiness";
import type { ScenarioSummary } from "../../lib/types";

export default function DashboardPage() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ScenarioProgressSummary>>({});
  const [onboarding, setOnboarding] = useState<OnboardingProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setIsLoading(true);
        setError(null);
        const nextScenarios = await getScenarios();
        setScenarios(nextScenarios);
        setProgressMap(getScenarioProgressMap());
        setOnboarding(getOnboardingProfile());
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load dashboard.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  const readiness = useMemo(
    () => calculateReadinessScore(scenarios, progressMap),
    [progressMap, scenarios]
  );
  const recommendedPath = LEARNING_PATHS.find(
    (path) => path.slug === onboarding?.recommendedPathSlug
  ) ?? LEARNING_PATHS[1];
  const completedScenarios = scenarios.filter((scenario) => progressMap[scenario.slug]?.completed);
  const continueScenario =
    scenarios.find(
      (scenario) =>
        (progressMap[scenario.slug]?.attemptCount ?? 0) > 0 &&
        !progressMap[scenario.slug]?.completed
    ) ??
    scenarios.find((scenario) => scenario.access_tier === "free") ??
    scenarios[0];
  const productionScenario =
    scenarios.find((scenario) => scenario.section !== "SQL" && scenario.access_tier === "free") ??
    continueScenario;

  if (isLoading) {
    return (
      <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
        <div className="panel rounded-3xl p-6 text-sm text-slate-300">Loading dashboard...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
        <div className="panel rounded-3xl border border-rose-400/20 p-6 text-sm text-rose-200">
          {error}
        </div>
      </main>
    );
  }

  if (!onboarding) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
        <section className="panel rounded-[2rem] p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
            New learner setup
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
            Your dashboard is ready after onboarding.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            Choose your stage, goal, daily time, and timeline. Then we will generate a
            practical daily mission and recommended learning path.
          </p>
          <Link
            href="/onboarding"
            className="mt-6 inline-flex rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Start onboarding
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel rounded-[2rem] p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
            Dashboard
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
            Today’s mission
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            Focus on one practice item, one production scenario, one interview answer, and
            one weak-area revision. Small reps, daily compounding.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <MissionCard
              label="SQL / PySpark"
              title="Complete one output-match lab"
              href={continueScenario ? `/scenarios/${continueScenario.slug}` : "/scenarios"}
            />
            <MissionCard
              label="Production scenario"
              title={productionScenario?.title ?? "Open a debugging scenario"}
              href={productionScenario ? `/scenarios/${productionScenario.slug}` : "/scenarios"}
            />
            <MissionCard
              label="Interview prompt"
              title="Explain root cause, fix, trade-offs, and monitoring"
              href="/mock-interview"
            />
            <MissionCard
              label="Weak-area revision"
              title={
                readiness.weakAreas[0]
                  ? `Review ${readiness.weakAreas[0]} fundamentals`
                  : "Create your first weak-area signal"
              }
              href="/scenarios"
            />
          </div>
        </div>

        <div className="panel rounded-[2rem] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
            Readiness Score
          </p>
          <div className="mt-5 flex items-end gap-3">
            <span className="text-6xl font-semibold text-slate-50">{readiness.score}</span>
            <span className="pb-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
              / 100
            </span>
          </div>
          <p className="mt-3 text-lg font-semibold text-teal-100">{readiness.label}</p>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-300 to-amber-300"
              style={{ width: `${readiness.score}%` }}
            />
          </div>
          <div className="mt-5 grid gap-3 text-sm text-slate-300">
            <MetricRow label="Scenario completion" value={readiness.scenarioCompletion} />
            <MetricRow label="AI score" value={readiness.averageAiScore} />
            <MetricRow label="Consistency" value={readiness.consistency} />
            <MetricRow label="Self confidence" value={readiness.confidence} />
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="panel rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-slate-50">Current Learning Path</h2>
          <p className="mt-3 text-sm font-semibold text-teal-100">{recommendedPath.name}</p>
          <p className="mt-3 text-sm leading-6 text-slate-300">{recommendedPath.description}</p>
          <Link
            href="/roadmap"
            className="mt-5 inline-flex rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
          >
            View path
          </Link>
        </div>

        <div className="panel rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-slate-50">Continue Scenario</h2>
          {continueScenario ? (
            <>
              <p className="mt-3 text-sm font-semibold text-amber-100">{continueScenario.title}</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                {continueScenario.short_description}
              </p>
              <Link
                href={`/scenarios/${continueScenario.slug}`}
                className="mt-5 inline-flex rounded-full bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-200"
              >
                Continue
              </Link>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-300">No scenarios loaded yet.</p>
          )}
        </div>

        <div className="panel rounded-3xl p-6">
          <h2 className="text-xl font-semibold text-slate-50">Streak / XP</h2>
          <p className="mt-4 text-3xl font-semibold text-slate-50">{readiness.xp} XP</p>
          <p className="mt-2 text-sm text-teal-100">{readiness.levelName}</p>
          <p className="mt-3 text-sm text-slate-300">{readiness.streakCount} day streak</p>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <DashboardList
          title="Weak Areas"
          items={readiness.weakAreas.length ? readiness.weakAreas : ["No weak areas yet. Attempt a scenario first."]}
        />
        <DashboardList
          title="Recently Practiced"
          items={
            completedScenarios.length
              ? completedScenarios.slice(0, 5).map((scenario) => scenario.title)
              : ["No completed scenarios yet."]
          }
        />
        <DashboardList
          title="Badges"
          items={readiness.badges.length ? readiness.badges : ["First Scenario Completed is waiting."]}
        />
      </section>

      <section className="panel mt-6 rounded-3xl p-6">
        <h2 className="text-xl font-semibold text-slate-50">Project Simulator Progress</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          E-commerce Orders Data Pipeline Simulator is available now. Mission persistence is
          local in v1 and will move to the backend when the account model is expanded.
        </p>
        <Link
          href="/projects/ecommerce-pipeline"
          className="mt-5 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Open simulator
        </Link>
      </section>
    </main>
  );
}

function MissionCard({ label, title, href }: { label: string; title: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5 transition hover:border-teal-300/30"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">{title}</p>
    </Link>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-teal-300" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function DashboardList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="panel rounded-3xl p-6">
      <h2 className="text-xl font-semibold text-slate-50">{title}</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

