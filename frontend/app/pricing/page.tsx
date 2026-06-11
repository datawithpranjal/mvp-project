import { PremiumUpgradePanel } from "../../components/premium-upgrade-panel";
import { TrackedLink } from "../../components/tracked-link";
import { getCodingLabs } from "../../lib/coding-labs";
import { getScenarios } from "../../lib/scenarios";

const FREE_FEATURES = [
  "Selected free SQL, PySpark, and scenario labs",
  "Basic hints and feedback on starter labs",
  "Progress tracking on this device",
  "Starter roadmap and interview practice"
];

const FAQ_ITEMS = [
  {
    question: "How does UPI activation work?",
    answer:
      "Choose a plan, scan the UPI QR, and submit the payment reference. Access is activated after the payment is verified."
  },
  {
    question: "How long does access last?",
    answer:
      "Annual access lasts 12 months from activation. Monthly access lasts one month from activation."
  },
  {
    question: "When will my access be activated?",
    answer:
      "Most payments are reviewed within 24 hours. Keep the UPI reference so support can locate the payment quickly."
  },
  {
    question: "What is the refund policy?",
    answer:
      "If activation cannot be completed, contact support with your payment reference. Refund and access requests are reviewed individually during this early-access period."
  }
];

export default function PricingPage() {
  const codingLabs = getCodingLabs();
  const scenarios = getScenarios();
  const premiumCount =
    codingLabs.filter((lab) => !lab.isFree).length +
    scenarios.filter((scenario) => !scenario.isFree).length;
  const freeCount =
    codingLabs.filter((lab) => lab.isFree).length +
    scenarios.filter((scenario) => scenario.isFree).length;

  const premiumFeatures = [
    `${premiumCount}+ premium labs and production scenarios`,
    "Full scenario library across SQL, PySpark, Airflow, AWS, and data quality",
    "Advanced labs, model answers, follow-ups, and interview framing",
    "Advanced system design cases and complete progress dashboard",
    "Detailed model answers, follow-ups, and production explanations"
  ];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10">
      <section className="panel overflow-hidden rounded-[2rem] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
              Premium
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
              Unlock deeper interview practice.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Start free, then upgrade when you want the full scenario library, advanced
              debugging labs, project simulator depth, and stronger interview framing.
            </p>
          </div>
          <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
            <p className="text-sm font-semibold text-amber-100">Simple UPI activation</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Pay via UPI and access will be activated after verification. Your payment
              reference is recorded securely for support and activation.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <PlanCard
          title="Free"
          price="Rs 0"
          description={`Start with ${freeCount} free labs and learn the complete attempt-feedback flow.`}
          features={FREE_FEATURES}
          tone="free"
          action={
            <TrackedLink
              href="/onboarding"
              event="homepage_start_clicked"
              eventPayload={{ source: "pricing_free" }}
              className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-teal-300/30 bg-teal-300/10 px-5 py-3 text-sm font-semibold text-teal-50 transition hover:bg-teal-300/20"
            >
              Start free
            </TrackedLink>
          }
        />
        <PlanCard
          title="Premium"
          price="Rs 500/year"
          compareAt="Rs 1999"
          description="Best for serious interview prep and production-style depth."
          features={premiumFeatures}
          tone="premium"
          action={
            <TrackedLink
              href="#unlock-premium"
              event="premium_unlock_clicked"
              eventPayload={{ source: "pricing_plan" }}
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Unlock premium
            </TrackedLink>
          }
        />
      </section>

      <div id="unlock-premium" className="mt-8 scroll-mt-28">
        <PremiumUpgradePanel
          title="The Data Foundry Premium"
          description="Annual access is Rs 500/year, marked down from Rs 1999. Monthly access is Rs 219/month. Pay through UPI and submit the payment reference for activation."
        />
      </div>

      <section className="mt-10">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
            Questions
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-50">Before you unlock</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {FAQ_ITEMS.map((item) => (
            <article
              key={item.question}
              className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5"
            >
              <h3 className="font-semibold text-slate-50">{item.question}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{item.answer}</p>
            </article>
          ))}
        </div>
        <p className="mt-5 text-sm text-slate-400">
          Need activation help? Contact the Data with Pranjal support channel with your
          registered email and UPI reference.
        </p>
      </section>
    </main>
  );
}

function PlanCard({
  title,
  price,
  compareAt,
  description,
  features,
  tone,
  action
}: {
  title: string;
  price: string;
  compareAt?: string;
  description: string;
  features: string[];
  tone: "free" | "premium";
  action: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-[2rem] border p-6 ${
        tone === "premium"
          ? "border-amber-300/25 bg-amber-300/10"
          : "border-teal-300/20 bg-teal-300/10"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p
            className={`text-xs font-semibold uppercase tracking-[0.24em] ${
              tone === "premium" ? "text-amber-100" : "text-teal-100"
            }`}
          >
            {title}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <p className="text-4xl font-semibold text-slate-50">{price}</p>
            {compareAt ? (
              <p className="pb-1 text-sm text-slate-400">
                <span className="line-through">{compareAt}</span>
              </p>
            ) : null}
          </div>
        </div>
        {tone === "premium" ? (
          <span className="rounded-full border border-amber-300/30 bg-slate-950/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
            Best value
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-300">{description}</p>
      <div className="mt-5 space-y-3">
        {features.map((feature) => (
          <div
            key={feature}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm leading-6 text-slate-300"
          >
            {feature}
          </div>
        ))}
      </div>
      {action}
    </div>
  );
}
