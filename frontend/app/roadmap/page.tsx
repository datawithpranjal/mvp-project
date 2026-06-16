"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { trackEvent } from "../../lib/analytics";
import { LEARNING_PATHS, type LearningPathStep } from "../../lib/product";
import {
  getRoadmapProgress,
  startRoadmap,
  toggleRoadmapDay,
  type RoadmapProgress
} from "../../lib/roadmap-progress";

const ROADMAP = LEARNING_PATHS[0];

export default function RoadmapPage() {
  const [progress, setProgress] = useState<RoadmapProgress>({
    activePathSlug: null,
    completedDays: {},
    updatedAt: null
  });

  useEffect(() => {
    setProgress(getRoadmapProgress());
  }, []);

  const completedStages = progress.completedDays[ROADMAP.slug] ?? [];
  const nextStage =
    ROADMAP.steps.find((step) => !completedStages.includes(step.stage)) ??
    ROADMAP.steps[ROADMAP.steps.length - 1];
  const completionPercent = Math.round(
    (completedStages.length / ROADMAP.steps.length) * 100
  );

  function handleStart() {
    setProgress(startRoadmap(ROADMAP.slug));
  }

  function handleToggle(stageNumber: number) {
    const nextProgress = toggleRoadmapDay(ROADMAP.slug, stageNumber);
    setProgress(nextProgress);
    if (nextProgress.completedDays[ROADMAP.slug]?.includes(stageNumber)) {
      trackEvent("roadmap_day_completed", {
        path: ROADMAP.slug,
        stage: stageNumber
      });
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <section className="panel overflow-hidden rounded-[2rem]">
        <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              Platform roadmap
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
              Use The Data Foundry in the right order.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              This is not a seven-day checklist or a race through random questions. It is
              one practical route from SQL fundamentals to production debugging and system
              design. Move forward when you can demonstrate the skill.
            </p>
          </div>

          <div className="rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">
                  Your progress
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-50">
                  {completedStages.length}/{ROADMAP.steps.length}
                </p>
                <p className="mt-1 text-sm text-slate-300">stages completed</p>
              </div>
              <span className="text-lg font-semibold text-amber-200">
                {completionPercent}%
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-950/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-300 to-amber-300 transition-all"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            <Link
              href={nextStage.href}
              onClick={handleStart}
              className="mt-5 inline-flex w-full justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              {completedStages.length === 0
                ? "Start with SQL foundations"
                : `Continue Stage ${nextStage.stage}`}
            </Link>
          </div>
        </div>

        <div className="grid border-t border-slate-800/80 sm:grid-cols-3">
          <RoadmapPrinciple
            number="01"
            title="Practice to evidence"
            description="Complete a target number of labs instead of merely opening one question."
          />
          <RoadmapPrinciple
            number="02"
            title="Build in layers"
            description="Use each skill in production scenarios before moving to architecture."
          />
          <RoadmapPrinciple
            number="03"
            title="Review weak signals"
            description="Let your dashboard and failed attempts decide what you practice next."
          />
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
            Your learning sequence
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">
            Eight stages, one coherent journey
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            The targets are guidance, not gates. If you already know a skill, use the
            checkpoints to verify it and continue.
          </p>
        </div>

        <div className="space-y-5">
          {ROADMAP.steps.map((step) => {
            const isDone = completedStages.includes(step.stage);
            const isNext = step.stage === nextStage.stage && !isDone;

            return (
              <article
                key={step.stage}
                className={`panel relative overflow-hidden rounded-[2rem] p-6 sm:p-8 ${
                  isDone ? "border-teal-300/30" : ""
                }`}
              >
                <div
                  className={`absolute inset-y-0 left-0 w-1 ${
                    isDone
                      ? "bg-teal-300"
                      : isNext
                        ? "bg-amber-300"
                        : "bg-slate-700"
                  }`}
                />
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.48fr)]">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                        Stage {step.stage}
                      </span>
                      <span className="rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-teal-100">
                        {formatTaskType(step.taskType)}
                      </span>
                      {isDone ? (
                        <span className="rounded-full bg-teal-300 px-3 py-1 text-xs font-semibold text-slate-950">
                          Completed
                        </span>
                      ) : isNext ? (
                        <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-slate-950">
                          Up next
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-4 text-2xl font-semibold text-slate-50">
                      {step.title}
                    </h3>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                      {step.description}
                    </p>
                    <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
                        Practice target
                      </p>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-100">
                        {step.practiceTarget}
                      </p>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        href={step.href}
                        onClick={handleStart}
                        className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                      >
                        {isDone ? "Practice again" : "Open this stage"}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleToggle(step.stage)}
                        className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40 hover:bg-teal-300/10"
                      >
                        {isDone ? "Mark incomplete" : "Mark stage complete"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Ready to move on when you can
                    </p>
                    <ul className="mt-4 space-y-3">
                      {step.checkpoints.map((checkpoint) => (
                        <li
                          key={checkpoint}
                          className="flex gap-3 text-sm leading-6 text-slate-300"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-teal-300"
                          />
                          <span>{checkpoint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel mt-8 rounded-[2rem] p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold text-slate-50">
              Need help choosing your first lab?
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              Onboarding uses your current stage, goal, available time, and interview
              timeline to recommend where you should enter this roadmap.
            </p>
          </div>
          <Link
            href="/onboarding"
            className="inline-flex shrink-0 justify-center rounded-full border border-teal-300/30 px-5 py-3 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10"
          >
            Get a starting recommendation
          </Link>
        </div>
      </section>
    </main>
  );
}

function RoadmapPrinciple({
  number,
  title,
  description
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-slate-800/80 p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">
        {number}
      </p>
      <h2 className="mt-2 text-base font-semibold text-slate-50">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}

function formatTaskType(taskType: LearningPathStep["taskType"]): string {
  if (taskType === "system-design") return "System design";
  if (taskType === "pyspark") return "PySpark";
  if (taskType === "airflow") return "Airflow";
  if (taskType === "aws") return "AWS";
  if (taskType === "sql") return "SQL";
  return taskType.charAt(0).toUpperCase() + taskType.slice(1);
}
