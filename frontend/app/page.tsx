import Link from "next/link";

import { CoreLabGrid } from "../components/core-lab-grid";
import { TrackedLink } from "../components/tracked-link";
import { OPERATIONS_LABS } from "../data/platform-operations-labs";
import { getCodingLabs } from "../lib/coding-labs";
import {
  AUDIENCE_SEGMENTS,
  BRAND,
  PRODUCT_PREVIEW_STEPS
} from "../lib/product";
import { getScenarios } from "../lib/scenarios";
import { SYSTEM_DESIGN_CASES } from "../lib/system-design";

export default function HomePage() {
  const codingLabs = getCodingLabs();
  const scenarios = getScenarios();
  const totalQuestionCount =
    codingLabs.length +
    scenarios.length +
    OPERATIONS_LABS.length +
    SYSTEM_DESIGN_CASES.length;
  const freeQuestionCount =
    codingLabs.filter((lab) => lab.isFree).length +
    scenarios.filter((scenario) => scenario.isFree).length +
    OPERATIONS_LABS.filter((lab) => lab.isFree).length +
    SYSTEM_DESIGN_CASES.filter((item) => item.isFree).length;
  const homepageStats = [
    {
      value: `${totalQuestionCount.toLocaleString("en-IN")}+`,
      label: "Practice questions",
      detail: "Coding labs, production scenarios, platform decisions, and system design cases"
    },
    {
      value: "Data Engineering",
      label: "Complete practice platform",
      detail: "SQL, Python, PySpark, Airflow, AWS, system design, and production debugging"
    },
    {
      value: "Production",
      label: "Debugging mindset",
      detail: "Broken logic, logs, trade-offs, data quality, and monitoring"
    },
    {
      value: `${freeQuestionCount.toLocaleString("en-IN")}+`,
      label: "Free practice questions",
      detail: "Start guided practice before choosing a premium plan"
    }
  ];

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl min-w-0 overflow-x-clip px-4 py-6 sm:px-6 lg:px-8">
      <section className="panel relative min-w-0 overflow-hidden rounded-[2rem] p-6 sm:p-8 lg:p-9">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(94,234,212,0.18),transparent_55%)] lg:block" />
        <div className="relative grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:items-center">
          <div className="min-w-0">
            <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em]">
              {BRAND.name}
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-slate-50 sm:text-5xl lg:text-[3.25rem]">
              Practice Data Engineering like real work.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              Practice real data engineering scenarios, get feedback, and build
              interview-ready judgment across SQL, PySpark, Airflow, AWS, and production
              debugging.
            </p>
            <p className="mt-3 text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">
              {BRAND.trustLine}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <TrackedLink
                href="/onboarding"
                event="homepage_start_clicked"
                className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Start Free Practice
              </TrackedLink>
              <TrackedLink
                href="/labs"
                event="homepage_start_clicked"
                eventPayload={{ choice: "explore_labs" }}
                className="rounded-full border border-slate-700 bg-slate-950/30 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-teal-300/50 hover:text-teal-100"
              >
                Explore Labs
              </TrackedLink>
            </div>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {homepageStats.map((stat) => (
          <div key={stat.label} className="panel rounded-3xl p-5">
            <p className="text-3xl font-semibold text-slate-50">{stat.value}</p>
            <p className="mt-2 text-sm font-semibold text-teal-100">{stat.label}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">{stat.detail}</p>
          </div>
        ))}
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
        <CoreLabGrid />
      </section>

      <section className="mt-10">
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
                Unlock the full library, deeper debugging labs, model answers, follow-ups,
                and advanced system design practice.
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

    </main>
  );
}

function ProductPreview() {
  return (
    <div className="w-full min-w-0 rounded-[1.75rem] border border-slate-800 bg-slate-950/60 p-4 shadow-2xl shadow-slate-950/40">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
          Product preview
        </p>
        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">
          Practice loop
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {PRODUCT_PREVIEW_STEPS.map((step, index) => (
          <div
            key={step.label}
            className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950/50 p-3"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-300 text-xs font-bold text-slate-950">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {step.label}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-100">{step.title}</p>
                <p className="mt-1 text-xs leading-4 text-slate-400">{step.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
