import { PremiumUpgradePanel } from "../../components/premium-upgrade-panel";
import { TrackedLink } from "../../components/tracked-link";
import { getCodingLabs } from "../../lib/coding-labs";
import { getScenarios } from "../../lib/scenarios";

const FREE_FEATURES = [
  "Selected free SQL, PySpark, and scenario labs",
  "Basic hints and feedback on starter labs",
  "Practice progress tracking",
  "Starter roadmap and interview practice"
];

const FAQ_ITEMS = [
  {
    question: "How does Razorpay checkout work?",
    answer:
      "Choose a plan and pay securely through Razorpay using UPI, cards, wallets, or net banking. Premium access unlocks after payment verification."
  },
  {
    question: "How long does access last?",
    answer:
      "Annual access lasts 12 months from activation. Monthly access lasts one month from activation."
  },
  {
    question: "When will my access be activated?",
    answer:
      "Razorpay payments usually unlock instantly after signature and amount verification. If anything looks stuck, contact support with your registered email."
  },
  {
    question: "How do coupon codes work?",
    answer:
      "Choose your plan, enter the coupon, and select Apply coupon before checkout. Razorpay will charge only the discounted amount shown."
  },
  {
    question: "What is the refund policy?",
    answer:
      "If activation cannot be completed, contact support with your payment reference. Refund and access requests are reviewed individually under our access and activation policy."
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
  const monthlyFeatures = [
    `${premiumCount}+ premium labs and production scenarios`,
    "Full scenario library for focused short-term interview prep",
    "Advanced labs, model answers, follow-ups, and interview framing",
    "Month-to-month access with the same premium practice depth"
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
            <p className="text-sm font-semibold text-amber-100">Secure Razorpay activation</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Pay through Razorpay using UPI, cards, wallets, or net banking. Premium
              access unlocks after verified payment confirmation.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3 lg:items-stretch">
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
          title="Premium Yearly"
          price="Rs 999/year"
          compareAt="Rs 2499"
          description="Best for serious interview prep and production-style depth across the year."
          features={premiumFeatures}
          tone="yearly"
          badge="Best value"
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
        <PlanCard
          title="Premium Monthly"
          price="Rs 199/month"
          compareAt="Rs 499"
          description="A flexible option for short-term interview prep or trying premium depth first."
          features={monthlyFeatures}
          tone="monthly"
          badge="Flexible"
          action={
            <TrackedLink
              href="#unlock-premium"
              event="premium_unlock_clicked"
              eventPayload={{ source: "pricing_monthly_plan" }}
              className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-amber-300/35 bg-amber-300/10 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20"
            >
              Choose monthly
            </TrackedLink>
          }
        />
      </section>

      <div id="unlock-premium" className="mt-8 scroll-mt-28">
        <PremiumUpgradePanel
          title="The Data Foundry Premium"
          description="Annual access is Rs 999/year, marked down from Rs 2499. Monthly access is Rs 199/month, marked down from Rs 499. Pay securely through Razorpay and unlock premium after verification."
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
        <div className="mt-6 rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5">
          <p className="text-sm font-semibold text-teal-100">
            Need payment or activation help?
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Email{" "}
            <a
              href="mailto:datawithpranjal@gmail.com?subject=The%20Data%20Foundry%20Payment%20Support"
              className="font-semibold text-teal-100 underline decoration-teal-300/40 underline-offset-4"
            >
              datawithpranjal@gmail.com
            </a>{" "}
            with your registered email and Razorpay payment reference. You can also use this address
            for general queries or complaints.
          </p>
        </div>
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
  badge,
  action
}: {
  title: string;
  price: string;
  compareAt?: string;
  description: string;
  features: string[];
  tone: "free" | "yearly" | "monthly";
  badge?: string;
  action: React.ReactNode;
}) {
  return (
    <div
      className={`relative rounded-[2rem] border p-6 ${
        tone === "yearly"
          ? "border-amber-300/45 bg-amber-300/15 shadow-[0_0_50px_rgba(251,191,36,0.12)] lg:-mt-4 lg:pb-10 lg:pt-8"
          : tone === "monthly"
            ? "border-slate-700 bg-slate-950/35"
            : "border-teal-300/20 bg-teal-300/10"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p
            className={`text-xs font-semibold uppercase tracking-[0.24em] ${
              tone === "free" ? "text-teal-100" : "text-amber-100"
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
        {badge ? (
          <span className="rounded-full border border-amber-300/30 bg-slate-950/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
            {badge}
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
