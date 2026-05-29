import Link from "next/link";

import { LEARNING_PATHS } from "../../lib/product";

export default function RoadmapPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          Roadmap
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
          Choose a practice path.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          These v1 paths are lightweight templates. They guide daily practice without
          turning the platform into a generic video course.
        </p>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        {LEARNING_PATHS.map((path) => (
          <article key={path.slug} className="panel rounded-[2rem] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]">
                {path.durationDays} days
              </span>
              <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                {path.targetUser}
              </span>
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-slate-50">{path.name}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">{path.description}</p>
            <div className="mt-5 space-y-3">
              {path.steps.map((step) => (
                <div
                  key={`${path.slug}-${step.day}`}
                  className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-100">
                      Day {step.day}: {step.title}
                    </p>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {step.taskType}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{step.description}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="panel mt-8 rounded-[2rem] p-6">
        <h2 className="text-2xl font-semibold text-slate-50">Not sure where to start?</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Complete onboarding and the dashboard will pick the best starting path based on
          your stage, goal, available time, and timeline.
        </p>
        <Link
          href="/onboarding"
          className="mt-5 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Start onboarding
        </Link>
      </section>
    </main>
  );
}

