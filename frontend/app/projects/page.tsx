import Link from "next/link";

export default function ProjectsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-8"><p className="text-sm font-semibold text-teal-200">Project Sandbox</p><h1 className="mt-3 text-3xl font-semibold text-slate-50">One Free guided project</h1><article className="panel mt-6 rounded-3xl p-6"><p className="text-xs font-semibold text-teal-200">Free · Guided project · SQLite</p><h2 className="mt-3 text-2xl font-semibold text-slate-50">Replay the order feed without changing revenue</h2><p className="mt-4 text-sm leading-7 text-slate-300">Build three linked SQL stages, test replay and late cancellations, and practise protecting the last good report in a browser simulation.</p><p className="mt-3 text-sm leading-7 text-slate-400">Original fictional public examples. Device-only simulation; no real warehouse, cloud pipeline, independent skill assessment or certificate.</p><Link href="/projects/ecommerce-pipeline" className="mt-5 inline-flex rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Open free project</Link></article></main>
  );
}
