"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ECOMMERCE_PROJECT_MISSIONS } from "../../../lib/product";
import { getScenarios } from "../../../lib/scenarios";

const STORAGE_KEY = "the-data-foundry-ecommerce-simulator-v1";
const STAGES = [
  "Source API",
  "Bronze",
  "Silver",
  "Gold",
  "Orchestration",
  "Dashboard",
  "Monitoring"
];

type MissionState = Record<string, { selectedLabel: string; completed: boolean }>;

function readMissionState(): MissionState {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as MissionState) : {};
  } catch {
    return {};
  }
}

function writeMissionState(state: MissionState): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

export default function EcommercePipelinePage() {
  const [missionState, setMissionState] = useState<MissionState>({});
  const labScenarios = getScenarios();

  useEffect(() => {
    setMissionState(readMissionState());
  }, []);

  const completedCount = Object.values(missionState).filter((mission) => mission.completed).length;
  const earnedXp = ECOMMERCE_PROJECT_MISSIONS.reduce((sum, mission) => {
    return sum + (missionState[mission.id]?.completed ? mission.xpReward : 0);
  }, 0);

  function handleSelect(missionId: string, label: string, isCorrect: boolean) {
    const nextState = {
      ...missionState,
      [missionId]: {
        selectedLabel: label,
        completed: isCorrect || missionState[missionId]?.completed || false
      }
    };
    setMissionState(nextState);
    writeMissionState(nextState);
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          Project Simulator
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
          E-commerce Orders Data Pipeline Simulator
        </h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">
          Move through a simulated pipeline from API events to dashboard incidents. Choose
          an approach, see the consequence, and build production judgment without spinning
          up real infrastructure.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Missions complete" value={`${completedCount}/${ECOMMERCE_PROJECT_MISSIONS.length}`} />
          <StatCard label="Simulator XP" value={`${earnedXp}`} />
          <StatCard label="Mode" value="Decision lab" />
        </div>
      </section>

      <section className="panel mt-8 overflow-hidden rounded-[2rem] p-6">
        <h2 className="text-xl font-semibold text-slate-50">Pipeline flow</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-7">
          {STAGES.map((stage, index) => (
            <div key={stage} className="relative rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <p className="text-sm font-semibold text-slate-100">{stage}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                Stage {index + 1}
              </p>
              {index < STAGES.length - 1 ? (
                <span className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-slate-500 md:block">
                  →
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-6">
        {ECOMMERCE_PROJECT_MISSIONS.map((mission, index) => {
          const selectedLabel = missionState[mission.id]?.selectedLabel ?? null;
          const selectedOption = mission.options.find((option) => option.label === selectedLabel);
          const relatedLab = labScenarios.find(
            (scenario) => scenario.relatedProjectMissionId === mission.id
          );

          return (
            <article key={mission.id} className="panel rounded-[2rem] p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
                    Mission {index + 1} · {mission.stage}
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-50">{mission.title}</h2>
                </div>
                <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                  {mission.xpReward} XP
                </span>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-300">{mission.context}</p>
              <p className="mt-3 text-sm font-semibold text-slate-100">{mission.task}</p>

              <div className="mt-5 grid gap-3 lg:grid-cols-3">
                {mission.options.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => handleSelect(mission.id, option.label, option.isCorrect)}
                    className={`rounded-2xl border p-4 text-left text-sm leading-6 transition ${
                      selectedLabel === option.label
                        ? option.isCorrect
                          ? "border-teal-300/40 bg-teal-300/10 text-teal-100"
                          : "border-rose-400/40 bg-rose-400/10 text-rose-100"
                        : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-teal-300/30"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {selectedOption ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  <InfoBox title="Feedback" body={selectedOption.feedback} />
                  <InfoBox title="Correct approach" body={mission.correctApproach} />
                  <InfoBox title="Production lesson" body={mission.productionLesson} />
                </div>
              ) : null}

              {relatedLab ? (
                <div className="mt-5 rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-100">
                    Practice related debugging lab
                  </p>
                  <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <p className="text-sm font-semibold text-slate-50">{relatedLab.title}</p>
                    <Link
                      href={`/scenarios/${relatedLab.slug}`}
                      className="inline-flex rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                    >
                      Open lab
                    </Link>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-50">{value}</p>
    </div>
  );
}

function InfoBox({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <p className="mt-3 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}
