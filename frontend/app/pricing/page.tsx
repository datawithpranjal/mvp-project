import { PremiumUpgradePanel } from "../../components/premium-upgrade-panel";

const FREE_FEATURES = [
  "Selected free SQL, PySpark, and scenario labs",
  "Basic hints and model-answer previews where available",
  "Progress tracking on this device",
  "Starter practice for interviews and production thinking"
];

const PREMIUM_FEATURES = [
  "Full scenario library across SQL, PySpark, Airflow, AWS, and data quality",
  "Advanced labs, model answers, follow-ups, and interview framing",
  "Project simulator missions and deeper debugging practice",
  "Premium roadmap access as the platform expands"
];

export default function PricingPage() {
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
            <p className="text-sm font-semibold text-amber-100">Beta payment note</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Beta access is currently verified manually after UPI payment. Payment gateway
              coming soon.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <PlanCard
          title="Free"
          price="Rs 0"
          description="Best for trying the practice flow and building the first habit."
          features={FREE_FEATURES}
          tone="free"
        />
        <PlanCard
          title="Premium"
          price="Rs 500/year"
          compareAt="Rs 1999"
          description="Best for serious interview prep and production-style depth."
          features={PREMIUM_FEATURES}
          tone="premium"
        />
      </section>

      <div className="mt-8">
        <PremiumUpgradePanel
          title="The Data Foundry Premium"
          description="Annual access is Rs 500/year, marked down from Rs 1999. Monthly access is Rs 219/month. Complete payment through the manual UPI checkout; premium access is enabled after verification during beta."
        />
      </div>
    </main>
  );
}

function PlanCard({
  title,
  price,
  compareAt,
  description,
  features,
  tone
}: {
  title: string;
  price: string;
  compareAt?: string;
  description: string;
  features: string[];
  tone: "free" | "premium";
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
    </div>
  );
}
