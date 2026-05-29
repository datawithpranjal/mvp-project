import { PremiumUpgradePanel } from "../../components/premium-upgrade-panel";

export default function PricingPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
          Premium
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
          Unlock deeper interview practice.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Premium scenarios stay visible as locked cards so learners can see what they will
          unlock. Payment uses a manual UPI flow for MVP and can be swapped for a real
          payment gateway later.
        </p>
      </section>

      <div className="mt-8">
        <PremiumUpgradePanel
          title="The Data Foundry Premium"
          description="Annual access is Rs 500/year, marked down from Rs 1999. Monthly access is Rs 219/month. Use the manual Paytm UPI checkout now; a real payment gateway can replace this later."
        />
      </div>
    </main>
  );
}
