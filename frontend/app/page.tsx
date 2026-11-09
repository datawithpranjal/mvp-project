import Link from "next/link";
import { TrackedLink } from "../components/tracked-link";
import { BRAND } from "../lib/product";
import { getRecommendedScenarioSlug } from "../lib/scenarios";

const focus = "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[color:var(--accent)]";
const primary = `inline-flex min-h-11 w-full items-center justify-center rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-teal-200 sm:w-auto ${focus}`;
const quiet = `inline-flex min-h-11 items-center text-sm font-semibold leading-5 text-teal-200 underline underline-offset-4 ${focus}`;

export default function HomePage() {
  const firstFreeScenarioHref = `/scenarios/${getRecommendedScenarioSlug()}`;
  const starts = [
    { label: "SQL · Free", title: "Fix inflated customer revenue", description: "Inspect the supplied data, repair the query and check the sample.", action: "Open SQL scenario", href: firstFreeScenarioHref },
    { label: "Data modelling · Free", title: "Handle a backdated territory change", description: "Write sale-time and effective-as-of reports without losing or duplicating order lines.", action: "Open modelling lab", href: "/labs/data-modelling" },
    { label: "Project · Free", title: "Replay an order feed safely", description: "Build three linked SQL stages and test replay and late cancellations in a browser simulation.", action: "Open project", href: "/projects/ecommerce-pipeline" }
  ];

  return (
    <main className="mx-auto min-h-screen w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <section aria-labelledby="home-title" className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center lg:gap-10">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">Data engineering practice</p>
          <h1 id="home-title" className="mt-3 max-w-2xl text-[32px] font-semibold leading-[1.12] tracking-tight text-slate-50 lg:text-5xl">
            Fix a wrong revenue report. Understand why it broke.
          </h1>
          <p className="mt-4 max-w-[60ch] text-base leading-6 text-slate-300">Inspect the data, correct the SQL, and check the visible sample.</p>
          <TrackedLink
            id="homepage-primary-start"
            href={firstFreeScenarioHref}
            event="homepage_start_clicked"
            eventPayload={{ destination: "first_free_scenario" }}
            aria-describedby="free-sql-account"
            className={`${primary} mt-6`}
          >
            Try the free SQL scenario
          </TrackedLink>
          <p id="free-sql-account" className="mt-2 max-w-[60ch] text-[13px] leading-5 text-slate-300">No sign-in for the sample. A free account is required to submit for evaluation.</p>
          <div className="mt-2">
            <TrackedLink id="homepage-premium-link" href="/pricing#unlock-premium" event="premium_unlock_clicked" eventPayload={{ source: "homepage_hero" }} aria-describedby="premium-duration" className={quiet}>
              Explore Premium — ₹199/month or ₹999/year
            </TrackedLink>
            <p id="premium-duration" className="max-w-[60ch] text-[13px] leading-5 text-slate-300">Monthly: one month from activation. Yearly: 12 months from activation.</p>
          </div>
          <p className="mt-4 text-[13px] leading-5 text-slate-400">{BRAND.trustLine}</p>
        </div>
        <section aria-labelledby="free-walkthrough-title" className="min-w-0 rounded-2xl border border-slate-700 p-4 sm:p-5">
          <h2 id="free-walkthrough-title" className="text-lg font-semibold text-slate-50">Inside the free exercise</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-300">
            <li>Inspect orders and customers.</li>
            <li>Correct customer-level revenue.</li>
            <li>Run the visible sample.</li>
          </ol>
          <p className="mt-3 text-[13px] leading-5 text-slate-300">Expected result: one row per customer, completed-order revenue only.</p>
        </section>
      </section>

      <section aria-labelledby="practice-starts-title" className="mt-10 lg:mt-14">
        <h2 id="practice-starts-title" className="text-2xl font-semibold tracking-tight text-slate-50 lg:text-3xl">Choose your next practice</h2>
        <p className="mt-2 max-w-[60ch] text-base leading-6 text-slate-300">Start with SQL, then try a modelling problem or a linked pipeline.</p>
        <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-3">
          {starts.map(start => (
            <Link key={start.href} href={start.href} className={`group flex min-w-0 flex-col rounded-2xl border border-slate-700 p-4 hover:border-teal-300 sm:p-5 ${focus}`}>
              <p className="text-xs font-semibold text-teal-200">{start.label}</p>
              <h3 className="mt-3 text-xl font-semibold leading-7 text-slate-50">{start.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{start.description}</p>
              <span className="mt-auto inline-flex min-h-11 items-center pt-3 text-sm font-semibold text-teal-200 underline underline-offset-4">{start.action}</span>
            </Link>
          ))}
        </div>
        <TrackedLink id="homepage-catalogue-link" href="/labs" event="homepage_start_clicked" eventPayload={{ choice: "explore_labs" }} className={`${quiet} mt-4`}>Explore all practice</TrackedLink>
      </section>

      <section aria-labelledby="practice-comparison-title" className="mt-10 lg:mt-14">
        <h2 id="practice-comparison-title" className="max-w-3xl text-2xl font-semibold tracking-tight text-slate-50 lg:text-3xl">Try free practice. Choose Premium when it fits.</h2>
        <div className="mt-5 grid min-w-0 gap-6 md:grid-cols-2">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-slate-100">Start with customer-revenue SQL</h3>
            <p className="mt-2 max-w-[60ch] text-sm leading-6 text-slate-300">Use the supplied data, hints and visible-sample check.</p>
          </div>
          <div className="min-w-0 border-t border-slate-700 pt-6 md:border-l md:border-t-0 md:pl-6 md:pt-0">
            <h3 className="text-lg font-semibold text-slate-100">Continue with guided practice</h3>
            <Link href="/scenarios/revenue-drop-new-successful-status" className={`mt-1 inline-flex min-h-11 max-w-full items-center break-words text-sm font-semibold leading-6 text-teal-200 underline underline-offset-4 ${focus}`}>Revenue Dropped 30% After New SUCCESSFUL Status</Link>
            <p className="mt-1 max-w-[60ch] text-sm leading-6 text-slate-300">Investigate a different revenue problem using payment records and status definitions, with hints, a model explanation and follow-up questions.</p>
          </div>
        </div>
        <p className="mt-4 max-w-4xl text-[13px] leading-5 text-slate-400">Guided practice, not an independent skill assessment. SQL checks cover the supplied example; explanation feedback is advisory.</p>
        <Link href="/pricing#unlock-premium" className={`${quiet} mt-1`}>View Premium plans</Link>
      </section>

      <section aria-labelledby="final-start-title" className="mt-10 border-t border-slate-700 pt-8 lg:mt-14">
        <h2 id="final-start-title" className="text-2xl font-semibold tracking-tight text-slate-50">Start with one useful problem.</h2>
        <Link id="homepage-final-start" href={firstFreeScenarioHref} aria-describedby="free-sql-account" className={`${primary} mt-4`}>Try the free SQL scenario</Link>
      </section>
    </main>
  );
}
