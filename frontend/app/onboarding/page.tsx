"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import {
  getOnboardingRecommendation,
  saveOnboardingProfile,
  type CurrentStage,
  type DailyTime,
  type OnboardingProfile,
  type TargetGoal,
  type Timeline
} from "../../lib/onboarding";
import { LEARNING_PATHS } from "../../lib/product";
import { trackEvent } from "../../lib/analytics";

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

const OPTION_DETAILS: Record<string, string> = {
  Fresher: "Build interview confidence and production vocabulary from the beginning.",
  "Career switcher": "Connect your existing experience to data engineering decisions.",
  "Junior Data Engineer": "Strengthen debugging, ownership, and production judgment.",
  "Preparing for interviews": "Prioritize high-frequency questions and clear explanation.",
  "Recently joined as Data Engineer": "Practice incidents and decisions from the first 90 days.",
  "Get interview calls": "Build demonstrable skills and project-ready practice signals.",
  "Clear technical interviews": "Focus on SQL, debugging, trade-offs, and communication.",
  "Build projects": "Learn through end-to-end pipeline decisions and consequences.",
  "Improve production thinking": "Practice failures, reconciliation, monitoring, and safe fixes.",
  "Survive first 90 days": "Build operational confidence for real pipeline ownership.",
  "30 min": "One focused lab or revision mission per day.",
  "1 hour": "One lab plus explanation or follow-up practice.",
  "2 hours": "A deeper lab block with simulator or mock interview.",
  "3+ hours": "An intensive interview-prep or job-readiness routine.",
  "7 days": "A focused interview sprint.",
  "30 days": "Balanced interview preparation.",
  "60 days": "Fundamentals plus project and scenario depth.",
  "90 days": "A complete job-ready practice journey."
};

export default function OnboardingPage() {
  const [currentStage, setCurrentStage] = useState<CurrentStage>("Preparing for interviews");
  const [targetGoal, setTargetGoal] = useState<TargetGoal>("Clear technical interviews");
  const [dailyTime, setDailyTime] = useState<DailyTime>("1 hour");
  const [timeline, setTimeline] = useState<Timeline>("30 days");
  const [recommendationProfile, setRecommendationProfile] =
    useState<OnboardingProfile | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const profile = saveOnboardingProfile({
      currentStage,
      targetGoal,
      dailyTime,
      timeline
    });
    setRecommendationProfile(profile);
    trackEvent("onboarding_completed", {
      stage: currentStage,
      target: targetGoal,
      daily_time: dailyTime,
      timeline,
      path: profile.recommendedPathSlug
    });
  }

  if (recommendationProfile) {
    const path =
      LEARNING_PATHS.find(
        (learningPath) =>
          learningPath.slug === recommendationProfile.recommendedPathSlug
      ) ?? LEARNING_PATHS[0];
    const recommendation = getOnboardingRecommendation(recommendationProfile);

    return (
      <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
        <section className="panel rounded-[2rem] p-8 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
            Your recommendation
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
            Start with {recommendation.title}.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            You can complete your first lab before deciding whether to create an account.
            Start with the recommendation below and build momentum immediately.
          </p>

          <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-[2rem] border border-teal-300/20 bg-teal-300/10 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-100">
                First lab
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                {recommendation.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {recommendation.reason}
              </p>
              <p className="mt-4 text-sm font-semibold text-teal-100">
                Estimated time: {recommendation.estimatedMinutes} minutes
              </p>
            </div>

            <div className="rounded-[2rem] border border-slate-800 bg-slate-950/40 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Suggested path
              </p>
              <h2 className="mt-3 text-xl font-semibold text-slate-50">{path.name}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{path.description}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
                Recommended pace: {dailyTime} per practice session
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Follow the stages at your own pace and move forward after reaching each
                practice target.
              </p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={recommendation.href}
              onClick={() =>
                trackEvent("first_lab_started", {
                  source: "onboarding",
                  path: path.slug,
                  lab: recommendation.title
                })
              }
              className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Start first lab
            </Link>
            <Link
              href="/roadmap"
              className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
            >
              View platform roadmap
            </Link>
            <button
              type="button"
              onClick={() => setRecommendationProfile(null)}
              className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition hover:border-slate-500"
            >
              Change answers
            </button>
          </div>
        </section>
      </main>
    );
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
          Answer four questions and The Data Foundry will recommend your first practice
          based on your current goal. Everyone follows the same practical platform roadmap
          at a pace that fits them.
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
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className={`rounded-3xl border p-4 text-left transition ${
              selected === option
                ? "border-teal-300/60 bg-teal-300/15"
                : "border-slate-700 bg-slate-950/30 hover:border-teal-300/40"
            }`}
          >
            <span
              className={`block text-sm font-semibold ${
                selected === option ? "text-teal-100" : "text-slate-100"
              }`}
            >
              {option}
            </span>
            <span className="mt-2 block text-xs leading-5 text-slate-400">
              {OPTION_DETAILS[option]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
