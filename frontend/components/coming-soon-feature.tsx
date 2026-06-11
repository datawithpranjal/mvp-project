import Link from "next/link";

interface ComingSoonFeatureProps {
  eyebrow: string;
  title: string;
  description: string;
  plannedFeatures: string[];
}

export function ComingSoonFeature({
  eyebrow,
  title,
  description,
  plannedFeatures
}: ComingSoonFeatureProps) {
  return (
    <main className="mx-auto flex min-h-[75vh] max-w-5xl items-center px-6 py-12 sm:px-10">
      <section className="panel w-full overflow-hidden rounded-[2rem] p-8 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-100">
              Coming soon
            </span>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              We are polishing this experience before opening it to customers. The current
              practice labs and production scenarios are available now.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/labs"
                className="rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Continue practicing
              </Link>
              <Link
                href="/roadmap"
                className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
              >
                View roadmap
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-800 bg-slate-950/45 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Planned experience
            </p>
            <div className="mt-4 space-y-3">
              {plannedFeatures.map((feature) => (
                <div
                  key={feature}
                  className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-slate-300"
                >
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
