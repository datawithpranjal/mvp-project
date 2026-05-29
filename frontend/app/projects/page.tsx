import Link from "next/link";

export default function ProjectsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          Project Simulator
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
          Simulate real pipeline decisions.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          No real Spark, Kafka, or Airflow infrastructure yet. This v1 focuses on decision
          quality: what you choose, why it works, and what production consequence follows.
        </p>
      </section>

      <section className="panel mt-8 rounded-[2rem] p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]">
              MVP Simulator
            </span>
            <h2 className="mt-4 text-2xl font-semibold text-slate-50">
              E-commerce Orders Data Pipeline Simulator
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Practice raw event ingestion, partition strategy, deduplication, late arriving
              records, gold marts, Airflow debugging, and dashboard mismatch triage.
            </p>
          </div>
          <Link
            href="/projects/ecommerce-pipeline"
            className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Open simulator
          </Link>
        </div>
      </section>
    </main>
  );
}

