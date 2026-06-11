"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { trackEvent } from "../../lib/analytics";
import { getOnboardingProfile } from "../../lib/onboarding";
import { LEARNING_PATHS, type LearningPathStep } from "../../lib/product";
import {
  getRoadmapProgress,
  startRoadmap,
  toggleRoadmapDay,
  type RoadmapProgress
} from "../../lib/roadmap-progress";

export default function RoadmapPage() {
  const [progress, setProgress] = useState<RoadmapProgress>({
    activePathSlug: null,
    completedDays: {},
    updatedAt: null
  });
  const [recommendedPathSlug, setRecommendedPathSlug] = useState<string | null>(null);

  useEffect(() => {
    setProgress(getRoadmapProgress());
    setRecommendedPathSlug(getOnboardingProfile()?.recommendedPathSlug ?? null);
  }, []);

  const activePath = useMemo(
    () =>
      LEARNING_PATHS.find((path) => path.slug === progress.activePathSlug) ??
      LEARNING_PATHS.find((path) => path.slug === recommendedPathSlug) ??
      null,
    [progress.activePathSlug, recommendedPathSlug]
  );

  function handleStart(pathSlug: string) {
    setProgress(startRoadmap(pathSlug));
  }

  function handleToggle(pathSlug: string, day: number) {
    const nextProgress = toggleRoadmapDay(pathSlug, day);
    setProgress(nextProgress);
    if (nextProgress.completedDays[pathSlug]?.includes(day)) {
      trackEvent("roadmap_day_completed", { path: pathSlug, day });
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          Roadmap
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
          Turn the plan into daily execution.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Every roadmap step now links to a lab, project mission, revision block, or mock
          interview. Guest progress is saved locally and appears on your dashboard.
        </p>
        {activePath ? (
          <div className="mt-6 flex flex-col justify-between gap-4 rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">
                Current path
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-50">{activePath.name}</p>
            </div>
            <Link
              href={getNextPathHref(activePath.steps, progress.completedDays[activePath.slug] ?? [])}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950"
            >
              Continue path
            </Link>
          </div>
        ) : null}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        {LEARNING_PATHS.map((path) => {
          const completedDays = progress.completedDays[path.slug] ?? [];
          const isActive = progress.activePathSlug === path.slug;
          const isRecommended = recommendedPathSlug === path.slug;

          return (
            <article
              key={path.slug}
              className={`panel rounded-[2rem] p-6 ${
                isActive ? "border-teal-300/35" : ""
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]">
                    {path.durationDays} days
                  </span>
                  {isRecommended ? (
                    <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  {completedDays.length}/{path.steps.length} done
                </span>
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-slate-50">{path.name}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{path.description}</p>

              <div className="mt-5 space-y-3">
                {path.steps.map((step) => {
                  const isDone = completedDays.includes(step.day);
                  return (
                    <div
                      key={`${path.slug}-${step.day}`}
                      className={`rounded-2xl border p-4 ${
                        isDone
                          ? "border-teal-300/25 bg-teal-300/10"
                          : "border-slate-800 bg-slate-950/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">
                            Day {step.day}: {step.title}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-400">
                            {step.description}
                          </p>
                        </div>
                        <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {step.taskType}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={getStepHref(step)}
                          className="rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-slate-950"
                        >
                          Start task
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleToggle(path.slug, step.day)}
                          className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200"
                        >
                          {isDone ? "Mark not done" : "Mark done"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleStart(path.slug)}
                  className="rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950"
                >
                  {isActive ? "Path active" : "Start Day 1"}
                </button>
                <Link
                  href={getNextPathHref(path.steps, completedDays)}
                  className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200"
                >
                  Continue path
                </Link>
              </div>
            </article>
          );
        })}
      </section>

      <section className="panel mt-8 rounded-[2rem] p-6">
        <h2 className="text-2xl font-semibold text-slate-50">Not sure where to start?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Complete onboarding and the platform will recommend a path and first lab based on
          your stage, goal, available time, and timeline.
        </p>
        <Link
          href="/onboarding"
          className="mt-5 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Take onboarding
        </Link>
      </section>
    </main>
  );
}

function getStepHref(step: LearningPathStep): string {
  if (step.taskType === "sql") return "/labs/sql";
  if (step.taskType === "project") return "/scenarios";
  if (step.taskType === "interview") return "/scenarios";
  if (step.taskType === "revision") return "/dashboard";
  return "/scenarios";
}

function getNextPathHref(steps: LearningPathStep[], completedDays: number[]): string {
  const nextStep = steps.find((step) => !completedDays.includes(step.day)) ?? steps[0];
  return getStepHref(nextStep);
}
