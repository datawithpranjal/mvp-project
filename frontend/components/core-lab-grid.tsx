"use client";

import Link from "next/link";
import { useState } from "react";

import { CORE_LABS } from "../lib/product";

type CoreLab = (typeof CORE_LABS)[number];

export function CoreLabGrid() {
  const [comingSoonLab, setComingSoonLab] = useState<CoreLab | null>(null);

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {CORE_LABS.map((lab) =>
          lab.status === "available" ? (
            <Link
              key={lab.title}
              href={lab.href}
              className="panel group flex min-h-[210px] flex-col justify-between rounded-3xl p-5 transition hover:-translate-y-1 hover:border-teal-300/35"
            >
              <CoreLabCardContent lab={lab} cta="Open lab" />
            </Link>
          ) : (
            <button
              key={lab.title}
              type="button"
              onClick={() => setComingSoonLab(lab)}
              className="panel group flex min-h-[210px] flex-col justify-between rounded-3xl p-5 text-left transition hover:-translate-y-1 hover:border-amber-300/35"
            >
              <CoreLabCardContent lab={lab} cta="Coming soon" />
            </button>
          )
        )}
      </div>

      {comingSoonLab ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm"
          onClick={() => setComingSoonLab(null)}
        >
          <div
            className="w-full max-w-lg rounded-[2rem] border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
              Coming soon
            </p>
            <h3 className="mt-3 text-2xl font-semibold text-slate-50">
              {comingSoonLab.title} is being prepared.
            </h3>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              This lab is on the roadmap and will be released with practical, production-style
              exercises. For now, start with SQL, PySpark, Scenario Playground, System Design,
              or the guided Roadmap.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/labs/sql"
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Start SQL Lab
              </Link>
              <button
                type="button"
                onClick={() => setComingSoonLab(null)}
                className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CoreLabCardContent({ lab, cta }: { lab: CoreLab; cta: string }) {
  return (
    <>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
              lab.status === "available"
                ? "border-teal-300/25 bg-teal-300/10 text-teal-100"
                : "border-amber-300/25 bg-amber-300/10 text-amber-100"
            }`}
          >
            {lab.status === "available" ? "Available" : "Planned"}
          </span>
        </div>
        <h3 className="mt-5 text-lg font-semibold text-slate-50">{lab.title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-300">{lab.description}</p>
      </div>
      <div className="mt-6 flex items-center justify-between text-sm font-semibold text-teal-200">
        <span>{cta}</span>
        <span className="transition group-hover:translate-x-1">-&gt;</span>
      </div>
    </>
  );
}
