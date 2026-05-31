import Link from "next/link";

import { AUDIENCE_SEGMENTS, BRAND, CORE_LABS } from "../lib/product";
import { getRecommendedScenarioSlug } from "../lib/scenarios";

const WORKFLOW_STEPS = [
  "Think",
  "Attempt",
  "Get Feedback",
  "Reveal Answer",
  "Practice Follow-ups",
  "Track Progress"
];

export default function HomePage() {
  const recommendedScenarioSlug = getRecommendedScenarioSlug();

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="panel relative overflow-hidden rounded-[2rem] p-8 sm:p-12">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(94,234,212,0.18),transparent_55%)] lg:block" />
        <div className="relative max-w-4xl">
          <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em]">
            {BRAND.name}
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-50 sm:text-6xl">
            Practice Data Engineering like real work.
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
            Prepare for Data Engineering interviews and production scenarios through SQL,
            PySpark, Airflow, AWS, debugging cases, project simulations, mock interviews,
            and AI feedback.
          </p>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">
            {BRAND.trustLine}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/scenarios/${recommendedScenarioSlug}`}
              className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Start Free Scenario
            </Link>
            <Link
              href="/labs"
              className="rounded-full border border-slate-700 bg-slate-950/30 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-teal-300/50 hover:text-teal-100"
            >
              Open Labs
            </Link>
            <Link
              href="/roadmap"
              className="rounded-full border border-slate-700 bg-slate-950/30 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-teal-300/50 hover:text-teal-100"
            >
              View Roadmap
            </Link>
            <Link
              href="/projects/ecommerce-pipeline"
              className="rounded-full border border-slate-700 bg-slate-950/30 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-amber-300/50 hover:text-amber-100"
            >
              Explore Project Simulator
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="panel rounded-[2rem] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
            Why normal courses are not enough
          </p>
          <h2 className="mt-4 text-2xl font-semibold text-slate-50">
            Interviews test judgment, not only syntax.
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Real data engineering work means debugging late data, broken joins, retries,
            schema drift, orchestration gaps, and dashboard mismatches. The Data Foundry
            turns those situations into daily practice instead of passive watching.
          </p>
        </div>

        <div className="panel rounded-[2rem] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
            How it works
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {WORKFLOW_STEPS.map((step, index) => (
              <div
                key={step}
                className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"
              >
                <p className="text-xs font-semibold text-slate-500">Step {index + 1}</p>
                <p className="mt-2 text-sm font-semibold text-slate-100">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
            Core Labs
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">
            A platform for practice, simulation, and job readiness.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {CORE_LABS.map((lab) => (
            <div key={lab.title} className="panel rounded-3xl p-5">
              <h3 className="text-lg font-semibold text-slate-50">{lab.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{lab.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="panel rounded-[2rem] p-6">
          <h2 className="text-2xl font-semibold text-slate-50">Who it is for</h2>
          <div className="mt-5 space-y-3">
            {AUDIENCE_SEGMENTS.map((segment) => (
              <div
                key={segment}
                className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300"
              >
                {segment}
              </div>
            ))}
          </div>
        </div>

        <div className="panel rounded-[2rem] p-6">
          <h2 className="text-2xl font-semibold text-slate-50">Free vs Premium</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5">
              <p className="text-sm font-semibold text-teal-100">Free</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Start with selected SQL and production scenarios, hints, validation, and
                progress tracking.
              </p>
            </div>
            <div className="rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5">
              <p className="text-sm font-semibold text-amber-100">Premium</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Unlock the full library, deeper debugging labs, simulator missions, and
                interview-prep expansion.
              </p>
            </div>
          </div>
          <Link
            href="/pricing"
            className="mt-5 inline-flex rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-amber-300/40"
          >
            See pricing
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <div className="panel rounded-[2rem] p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
            Broken Pipeline Lab
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">
            Practice real production failures, not PDF-style Q&A.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            The new scenario lab includes MCQ diagnosis, broken SQL, PySpark fixes, log
            analysis, output mismatch debugging, hints, model answers, and interview-style
            evaluation.
          </p>
          <Link
            href="/scenarios"
            className="mt-6 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            See Scenario Library
          </Link>
        </div>
      </section>

      <section className="mt-10 panel rounded-[2rem] p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          Creator trust
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-50">
          Built from real interview and production patterns.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
          The platform is built by Data with Pranjal and will connect to YouTube lessons,
          walkthroughs, and community challenges as the product grows.
        </p>
      </section>

      <footer className="mt-10 flex flex-col justify-between gap-4 border-t border-slate-800 py-8 text-sm text-slate-400 sm:flex-row">
        <p>{BRAND.name}. {BRAND.trustLine}.</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/labs">Labs</Link>
          <Link href="/roadmap">Roadmap</Link>
          <Link href="/projects">Projects</Link>
          <Link href="/mock-interview">Mock Interview</Link>
        </div>
      </footer>
    </main>
  );
}
