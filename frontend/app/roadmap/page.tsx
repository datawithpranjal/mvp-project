"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PracticeStatusBadge } from "../../components/practice-status-badge";
import { trackEvent } from "../../lib/analytics";
import {
  getCorePathStatuses,
  type CorePathStatus
} from "../../lib/core-path-progress";
import {
  CORE_PATH_STAGES,
  GOLD_CORE_ITEMS,
  type CorePathStage,
  type GoldCoreItem
} from "../../lib/gold-core";

export default function RoadmapPage() {
  const [statuses, setStatuses] = useState<Record<string, CorePathStatus>>({});

  useEffect(() => {
    const refresh = () => setStatuses(getCorePathStatuses());
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const orderedItems = useMemo(
    () => CORE_PATH_STAGES.flatMap((stage) => stage.items),
    []
  );
  const completedCount = orderedItems.filter(
    (item) => statuses[item.slug] === "done"
  ).length;
  const inProgressCount = orderedItems.filter(
    (item) => statuses[item.slug] === "in_progress"
  ).length;
  const nextItem =
    orderedItems.find((item) => statuses[item.slug] === "in_progress") ??
    orderedItems.find((item) => statuses[item.slug] !== "done") ??
    null;
  const nextStage = nextItem
    ? CORE_PATH_STAGES.find((stage) => stage.items.some((item) => item.slug === nextItem.slug))
    : null;
  const completionPercent = Math.round(
    (completedCount / GOLD_CORE_ITEMS.length) * 100
  );

  function trackCoreOpen(item: GoldCoreItem, source: string) {
    const itemStage = CORE_PATH_STAGES.find((stage) =>
      stage.items.some((candidate) => candidate.slug === item.slug)
    );
    trackEvent("roadmap_core_exercise_opened", {
      source,
      lab: item.slug,
      track: item.track,
      stage: itemStage?.stage ?? null
    });
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <section className="panel overflow-hidden rounded-[2rem]">
        <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              Core Practice Path
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
              Know what to practise next without losing the full library.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Follow 30 reviewed exercises in a deliberate order, or open the complete SQL,
              Python, PySpark, Airflow, AWS, scenario, and system-design libraries whenever
              you need more repetition. The core is a recommendation, not an access limit.
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
              Progress comes from completed exercises. Completing this path records practice
              evidence; it does not guarantee an interview or job outcome.
            </p>
          </div>

          <div className="rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">
                  Core progress
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-50">
                  {completedCount}/{GOLD_CORE_ITEMS.length}
                </p>
                <p className="mt-1 text-sm text-slate-300">
                  {inProgressCount > 0
                    ? `${inProgressCount} currently in progress`
                    : "reviewed exercises completed"}
                </p>
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
            {nextItem ? (
              <Link
                href={nextItem.href}
                onClick={() => trackCoreOpen(nextItem, "roadmap_summary")}
                className="mt-5 inline-flex w-full justify-center rounded-full bg-amber-300 px-5 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                {statuses[nextItem.slug] === "in_progress" ? "Continue" : "Start"}: {nextItem.title}
              </Link>
            ) : (
              <Link
                href="/dashboard"
                className="mt-5 inline-flex w-full justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Review your practice evidence
              </Link>
            )}
          </div>
        </div>

        <div className="grid border-t border-slate-800/80 sm:grid-cols-3">
          <RoadmapPrinciple
            number="01"
            title="Core for direction"
            description="Use the reviewed sequence when you do not know what should come next."
          />
          <RoadmapPrinciple
            number="02"
            title="Library for depth"
            description="Open every track's full problem collection for repetition and interview drilling."
          />
          <RoadmapPrinciple
            number="03"
            title="Evidence for progress"
            description="Stages complete from actual exercise results, never from a manual checkbox."
          />
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
            Your learning sequence
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">
            Seven stages, thirty core exercises
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            The curated exercises establish a dependable foundation. The secondary action in
            every stage keeps the entire practice library available from the same place.
          </p>
        </div>

        <div className="space-y-5">
          {CORE_PATH_STAGES.map((stage) => (
            <StageCard
              key={stage.stage}
              stage={stage}
              statuses={statuses}
              isNext={stage.stage === nextStage?.stage}
              onOpen={trackCoreOpen}
            />
          ))}
        </div>
      </section>

      <section className="panel mt-8 rounded-[2rem] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
          Ongoing review loop
        </p>
        <div className="mt-3 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold text-slate-50">
              Reattempt weak areas instead of collecting completion badges.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              After every few exercises, use the dashboard to revisit failed attempts,
              explanations with gaps, and concepts that did not hold up on the first try.
              Review remains ongoing and is not presented as a final readiness claim.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex shrink-0 justify-center rounded-full border border-teal-300/30 px-5 py-3 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10"
          >
            Review practice evidence
          </Link>
        </div>
      </section>
    </main>
  );
}

function StageCard({
  stage,
  statuses,
  isNext,
  onOpen
}: {
  stage: CorePathStage;
  statuses: Record<string, CorePathStatus>;
  isNext: boolean;
  onOpen: (item: GoldCoreItem, source: string) => void;
}) {
  const completedCount = stage.items.filter(
    (item) => statuses[item.slug] === "done"
  ).length;
  const isDone = completedCount === stage.items.length;
  const nextItem =
    stage.items.find((item) => statuses[item.slug] === "in_progress") ??
    stage.items.find((item) => statuses[item.slug] !== "done") ??
    stage.items[0];

  return (
    <article
      className={`panel relative overflow-hidden rounded-[2rem] p-6 sm:p-8 ${
        isDone ? "border-teal-300/30" : ""
      }`}
    >
      <div
        className={`absolute inset-y-0 left-0 w-1 ${
          isDone ? "bg-teal-300" : isNext ? "bg-amber-300" : "bg-slate-700"
        }`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
            Stage {stage.stage}
          </span>
          {isDone ? (
            <span className="rounded-full bg-teal-300 px-3 py-1 text-xs font-semibold text-slate-950">
              Completed from practice
            </span>
          ) : isNext ? (
            <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-slate-950">
              Current stage
            </span>
          ) : null}
        </div>
        <p className="text-sm font-semibold text-teal-100">
          {completedCount}/{stage.items.length} core exercises
        </p>
      </div>

      <h3 className="mt-4 text-2xl font-semibold text-slate-50">{stage.title}</h3>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">{stage.description}</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)]">
        <div className="grid gap-3 sm:grid-cols-2">
          {stage.items.map((item) => (
            <CoreExerciseCard
              key={item.slug}
              item={item}
              status={statuses[item.slug] ?? "new"}
              onOpen={onOpen}
            />
          ))}
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            Ready to move on when you can
          </p>
          <ul className="mt-4 space-y-3">
            {stage.checkpoints.map((checkpoint) => (
              <li key={checkpoint} className="flex gap-3 text-sm leading-6 text-slate-300">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-teal-300" />
                <span>{checkpoint}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid gap-3">
            <Link
              href={nextItem.href}
              onClick={() => onOpen(nextItem, `roadmap_stage_${stage.stage}`)}
              className="inline-flex justify-center rounded-full bg-amber-300 px-5 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              {isDone ? "Review a core exercise" : "Continue core path"}
            </Link>
            <Link
              href={stage.exploreHref}
              className="inline-flex justify-center rounded-full border border-teal-300/30 px-5 py-3 text-center text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10"
            >
              {stage.exploreLabel}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function CoreExerciseCard({
  item,
  status,
  onOpen
}: {
  item: GoldCoreItem;
  status: CorePathStatus;
  onOpen: (item: GoldCoreItem, source: string) => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={() => onOpen(item, "roadmap_exercise_card")}
      className="rounded-3xl border border-slate-800 bg-slate-950/35 p-4 transition hover:border-teal-300/35"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PracticeStatusBadge status={status} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {item.isFree ? "Free" : "Premium"}
        </span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">{item.title}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{item.competency}</p>
      <p className="mt-3 text-xs text-slate-500">
        {item.difficulty} · {item.estimatedMinutes} min
      </p>
    </Link>
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
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">{number}</p>
      <h2 className="mt-2 text-base font-semibold text-slate-50">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}
