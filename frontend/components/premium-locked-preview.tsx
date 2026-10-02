import Link from "next/link";

import { PremiumAccessBadge } from "./premium-access-badge";

interface PremiumLockedPreviewProps {
  title: string;
  category: string;
  accessUnavailable?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  itemLabel?: string;
}

export function PremiumLockedPreview({
  title,
  category,
  accessUnavailable = false,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  itemLabel = "problem"
}: PremiumLockedPreviewProps) {
  return (
    <section className="panel rounded-[2rem] border border-amber-300/25 p-7 sm:p-9">
      <div className="flex flex-wrap items-center gap-2">
        <PremiumAccessBadge locked />
        <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
          {category}
        </span>
      </div>
      <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-50">{title}</h2>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
        {accessUnavailable
          ? "We could not confirm your Premium access right now. Please retry from Pricing before opening this problem."
          : `This ${itemLabel} is included with Premium. Unlock it to view the task, data, workspace, hints, validation and model answer.`}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/pricing#unlock-premium"
          className="rounded-full bg-amber-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-200"
        >
          {accessUnavailable ? "Check Premium access" : "Unlock Premium"}
        </Link>
        {onPrevious ? (
          <button
            type="button"
            onClick={onPrevious}
            disabled={!hasPrevious}
            className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40 disabled:cursor-not-allowed disabled:text-slate-600"
          >
            ← Previous
          </button>
        ) : null}
        {onNext ? (
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            className="rounded-full border border-teal-300/30 px-5 py-3 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-600"
          >
            Next →
          </button>
        ) : null}
      </div>
    </section>
  );
}
