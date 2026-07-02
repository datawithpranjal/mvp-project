"use client";

import { FeedbackDialog } from "./feedback-dialog";

export function BetaNotice() {
  return (
    <section
      aria-label="Public beta notice"
      className="border-b border-amber-300/15 bg-amber-300/[0.08] px-4 py-3 sm:px-8"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="w-fit rounded-full border border-amber-300/35 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            Public Beta
          </span>
          <p className="text-sm leading-6 text-slate-300">
            The Data Foundry is improving every week. If something feels unclear,
            broken, or missing, tell us and we will use it to improve the platform.
          </p>
        </div>
        <FeedbackDialog
          defaultCategory="bug"
          triggerLabel="Report bug"
          triggerClassName="inline-flex w-fit rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        />
      </div>
    </section>
  );
}
