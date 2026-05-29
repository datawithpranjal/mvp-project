import Link from "next/link";

import { LAB_TRACKS } from "../../lib/labs";

export default function LabsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          Labs
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
          Practice directly, not passively.
        </h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">
          Labs are focused practice tracks for hands-on skill building. SQL Lab is live
          now with exercises converted from the Data with Pranjal coding practice PDF
          into real DuckDB-validated problems.
        </p>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {LAB_TRACKS.map((lab) => (
          <Link
            key={lab.slug}
            href={lab.href}
            className={`panel group flex min-h-[280px] flex-col justify-between rounded-[2rem] p-6 transition duration-300 hover:-translate-y-1 hover:border-teal-300/30 ${
              lab.status === "coming-soon" ? "opacity-80" : ""
            }`}
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]">
                  {lab.status === "active" ? "Live" : "Coming soon"}
                </span>
                {lab.status === "active" ? (
                  <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                    Practice now
                  </span>
                ) : null}
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-slate-50">{lab.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{lab.description}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {lab.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-8 flex items-center justify-between text-sm font-semibold text-teal-200">
              <span>{lab.status === "active" ? "Open lab" : "Track planned"}</span>
              <span className="transition duration-300 group-hover:translate-x-1">→</span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}

