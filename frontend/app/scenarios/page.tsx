import { ScenarioLibrary } from "../../components/scenario-library";
import { BRAND } from "../../lib/product";

export default function ScenariosPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="panel mb-10 rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          {BRAND.name}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
          Scenario Playground
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Open a free lab or preview locked premium scenarios. Every card is designed around
          production symptoms, broken logic, logs, sample data, and interview-ready explanation.
        </p>
      </section>

      <ScenarioLibrary showHeaderCta={false} />
    </main>
  );
}

