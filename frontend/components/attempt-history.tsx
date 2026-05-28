"use client";

import type { AttemptHistoryEntry } from "../lib/progress";

interface AttemptHistoryProps {
  attempts: AttemptHistoryEntry[];
  onReuseAttempt: (answer: string) => void;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function summarizeAnswer(answer: string): string {
  return answer.replace(/\s+/g, " ").trim().slice(0, 140) || "Empty submission";
}

function getAttemptStatus(passed: boolean | null): {
  label: string;
  className: string;
} {
  if (passed === true) {
    return {
      label: "Passed",
      className: "badge"
    };
  }

  if (passed === null) {
    return {
      label: "Reviewed",
      className: "border border-sky-400/30 bg-sky-400/10 text-sky-100"
    };
  }

  return {
    label: "Needs work",
    className: "border border-rose-400/30 bg-rose-400/10 text-rose-200"
  };
}

export function AttemptHistory({ attempts, onReuseAttempt }: AttemptHistoryProps) {
  return (
    <div className="panel rounded-3xl p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-50">Attempt History</h3>
        <p className="mt-1 text-sm text-slate-400">
          Your local submissions for this scenario on this browser.
        </p>
      </div>

      {attempts.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-5 text-sm text-slate-400">
          No attempts yet. Submit an answer to start tracking your progress.
        </div>
      ) : (
        <div className="space-y-3">
          {attempts.map((attempt) => {
            const status = getAttemptStatus(attempt.passed);

            return (
              <div
                key={attempt.id}
                className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${status.className}`}
                    >
                      {status.label}
                    </span>
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {formatTimestamp(attempt.attemptedAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onReuseAttempt(attempt.answer)}
                    className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-teal-300/40 hover:text-teal-100"
                  >
                    Reuse answer
                  </button>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-200">{attempt.message}</p>
                <div className="mt-3 rounded-2xl border border-slate-900 bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-400">
                  {summarizeAnswer(attempt.answer)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
