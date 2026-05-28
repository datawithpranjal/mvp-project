"use client";

interface HintPanelProps {
  hints: string[];
  revealedCount: number;
  onRevealNext: () => void;
}

export function HintPanel({ hints, revealedCount, onRevealNext }: HintPanelProps) {
  if (hints.length === 0) {
    return null;
  }

  const revealedHints = hints.slice(0, revealedCount);
  const hasMoreHints = revealedCount < hints.length;

  return (
    <div className="panel rounded-3xl p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">Hints</h3>
          <p className="mt-1 text-sm text-slate-400">
            Reveal hints gradually if you want a nudge without jumping straight to the solution.
          </p>
        </div>
        {hasMoreHints ? (
          <button
            type="button"
            onClick={onRevealNext}
            className="rounded-full bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-200"
          >
            Reveal hint {revealedCount + 1}
          </button>
        ) : (
          <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
            All hints revealed
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {revealedHints.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
            No hints revealed yet.
          </div>
        ) : (
          revealedHints.map((hint, index) => (
            <div
              key={`${index + 1}-${hint}`}
              className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
                Hint {index + 1}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-200">{hint}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

