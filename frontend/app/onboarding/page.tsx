"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  saveOnboardingProfile,
  type CurrentStage,
  type DailyTime,
  type TargetGoal,
  type Timeline
} from "../../lib/onboarding";

const STAGES: CurrentStage[] = [
  "Fresher",
  "Career switcher",
  "Junior Data Engineer",
  "Preparing for interviews",
  "Recently joined as Data Engineer"
];

const TARGETS: TargetGoal[] = [
  "Get interview calls",
  "Clear technical interviews",
  "Build projects",
  "Improve production thinking",
  "Survive first 90 days"
];

const DAILY_TIMES: DailyTime[] = ["30 min", "1 hour", "2 hours", "3+ hours"];
const TIMELINES: Timeline[] = ["7 days", "30 days", "60 days", "90 days"];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStage, setCurrentStage] = useState<CurrentStage>("Preparing for interviews");
  const [targetGoal, setTargetGoal] = useState<TargetGoal>("Clear technical interviews");
  const [dailyTime, setDailyTime] = useState<DailyTime>("1 hour");
  const [timeline, setTimeline] = useState<Timeline>("30 days");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveOnboardingProfile({
      currentStage,
      targetGoal,
      dailyTime,
      timeline
    });
    router.push("/dashboard");
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          Onboarding
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
          Build your practice path.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Answer four questions and The Data Foundry will recommend a focused plan.
          This v1 stores your path locally and keeps the product lightweight.
        </p>
      </section>

      <form onSubmit={handleSubmit} className="panel mt-6 rounded-[2rem] p-6">
        <ChoiceGroup
          title="Current stage"
          options={STAGES}
          selected={currentStage}
          onSelect={(value) => setCurrentStage(value as CurrentStage)}
        />
        <ChoiceGroup
          title="Target"
          options={TARGETS}
          selected={targetGoal}
          onSelect={(value) => setTargetGoal(value as TargetGoal)}
        />
        <ChoiceGroup
          title="Daily time available"
          options={DAILY_TIMES}
          selected={dailyTime}
          onSelect={(value) => setDailyTime(value as DailyTime)}
        />
        <ChoiceGroup
          title="Timeline"
          options={TIMELINES}
          selected={timeline}
          onSelect={(value) => setTimeline(value as Timeline)}
        />

        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <Link
            href="/dashboard"
            className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
          >
            Skip for now
          </Link>
          <button
            type="submit"
            className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Generate my path
          </button>
        </div>
      </form>
    </main>
  );
}

function ChoiceGroup({
  title,
  options,
  selected,
  onSelect
}: {
  title: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="border-b border-slate-800 py-6 first:pt-0 last:border-b-0">
      <h2 className="text-lg font-semibold text-slate-50">{title}</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              selected === option
                ? "bg-teal-300 text-slate-950"
                : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:border-teal-300/40"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

