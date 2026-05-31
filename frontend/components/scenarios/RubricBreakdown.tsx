import type { EvaluationRubric } from "../../lib/scenarios";

interface RubricBreakdownProps {
  rubric: EvaluationRubric;
  title?: string;
}

const LABELS: Array<[keyof EvaluationRubric, string]> = [
  ["rootCause", "Root cause"],
  ["correctness", "Correctness"],
  ["productionThinking", "Production thinking"],
  ["tradeoffs", "Trade-offs"],
  ["communication", "Communication"]
];

export function RubricBreakdown({ rubric, title = "Evaluation rubric" }: RubricBreakdownProps) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
        {title}
      </h3>
      <div className="mt-4 space-y-3">
        {LABELS.map(([key, label]) => (
          <div key={key}>
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>{label}</span>
              <span>{rubric[key]}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-300 to-amber-300"
                style={{ width: `${rubric[key]}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
