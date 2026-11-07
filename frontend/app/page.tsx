import Link from "next/link";

import { CoreLabGrid } from "../components/core-lab-grid";
import { TrackedLink } from "../components/tracked-link";
import { OPERATIONS_LABS } from "../data/platform-operations-labs";
import { getCodingLabs } from "../lib/coding-labs";
import {
  AUDIENCE_SEGMENTS,
  BRAND
} from "../lib/product";
import { getRecommendedScenarioSlug, getScenarios } from "../lib/scenarios";
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
  const firstFreeScenarioHref = `/scenarios/${getRecommendedScenarioSlug()}`;
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
    <main className="mx-auto min-h-screen w-full max-w-7xl min-w-0 overflow-x-clip px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <section className="panel relative min-w-0 overflow-hidden rounded-[2rem] p-4 sm:p-8 lg:p-9">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,rgba(94,234,212,0.18),transparent_55%)] lg:block" />
        <div className="relative grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:items-center">
          <div className="min-w-0">
            <h1 className="max-w-3xl text-[30px] font-semibold leading-[1.1] tracking-tight text-slate-50 sm:text-5xl lg:text-[3.25rem]">
              Fix a wrong revenue report. Understand why it broke.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-[21px] text-slate-300 sm:text-base sm:leading-7">SQL practice for data engineers: inspect the data, correct the query, and check the visible sample.</p>
            <section aria-label="Recommended start" className="mt-3 rounded-3xl border border-slate-800 bg-slate-950/80 p-3 sm:p-5">
              <p className="text-xs font-semibold leading-[18px] text-teal-200 sm:text-sm">Start here · Free SQL practice</p>
              <h2 className="mt-1 text-lg font-semibold leading-6 text-slate-50 sm:text-[22px] sm:leading-7">Fix an inflated customer revenue report.</h2>
              <TrackedLink
                href={firstFreeScenarioHref}
                event="homepage_start_clicked"
                eventPayload={{ destination: "first_free_scenario" }}
                aria-describedby="free-sql-account"
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-teal-300 px-4 py-2.5 text-sm font-semibold leading-6 text-slate-950 transition hover:bg-teal-200 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[color:var(--accent)] sm:w-auto sm:px-5"
              >
                Try the free SQL scenario
              </TrackedLink>
              <p id="free-sql-account" className="mt-2 max-w-md text-[13px] leading-[18px] sm:text-sm sm:leading-[21px] text-slate-300">No sign-in for the sample. A free account is required to submit for evaluation.</p>
              <TrackedLink href="/pricing#unlock-premium" event="premium_unlock_clicked" eventPayload={{ source: "homepage_hero" }} className="mt-3 inline-flex text-sm font-semibold leading-5 text-amber-200 underline underline-offset-4 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[color:var(--accent)]">Choose Premium — ₹199/month or ₹999/year</TrackedLink>
              <p className="mt-1 text-[13px] leading-[18px] text-slate-300 sm:text-sm">Monthly: one month from activation. Yearly: 12 months from activation.</p>
            </section>
            <TrackedLink
              href="/labs"
              event="homepage_start_clicked"
              eventPayload={{ choice: "explore_labs" }}
              className="mt-2 inline-flex min-h-11 items-center text-base font-semibold leading-6 text-teal-200 underline underline-offset-4 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[color:var(--accent)]"
            >
              Explore all practice
            </TrackedLink>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {BRAND.trustLine}
            </p>
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
            A platform for practice, simulation, and stronger technical judgment.
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


      </section>

    </main>
  );
}

function ProductPreview() {
  return (
    <section aria-labelledby="free-walkthrough-title" className="w-full min-w-0 rounded-[1.75rem] border border-slate-800 bg-slate-950/60 p-4 shadow-2xl shadow-slate-950/40">
      <h2 id="free-walkthrough-title" className="text-lg font-semibold text-slate-50">Inside the free exercise</h2>
      <p className="mt-3 text-sm leading-6 text-slate-300">Inspect orders and customers → correct customer-level totals → run the visible sample.</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-teal-200">One row per customer. Completed-order revenue only.</p>
      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-teal-300/20 bg-teal-300/5 p-3">
          <h3 className="text-sm font-semibold text-teal-200">Free</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">Try customer-revenue SQL with the supplied data, hints and visible-sample check.</p>
        </div>
        <div className="rounded-2xl border border-amber-300/25 bg-amber-300/5 p-3">
          <p className="text-sm font-semibold text-amber-200">Premium</p>
          <h3 className="mt-2 text-base font-semibold leading-6 text-slate-100"><Link href="/scenarios/revenue-drop-new-successful-status" className="underline underline-offset-4 focus-visible:outline">Revenue Dropped 30% After New SUCCESSFUL Status</Link></h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">Work through a different revenue problem using payment records and supplied status definitions. Use hints, a model explanation and follow-up questions to compare approaches.</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-400">Guided practice, not an independent skill assessment. SQL checks cover the supplied example; explanation feedback is advisory.</p>
    </section>
  );
}
