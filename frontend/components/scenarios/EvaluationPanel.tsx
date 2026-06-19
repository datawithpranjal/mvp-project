import type { ScenarioEvaluationResult } from "../../lib/scenarioEvaluator";
import { RubricBreakdown } from "./RubricBreakdown";

interface EvaluationPanelProps {
  result: ScenarioEvaluationResult;
  commonMistakes: string[];
  followUps: string[];
}

export function EvaluationPanel({ result, commonMistakes, followUps }: EvaluationPanelProps) {
  return (
    <div className="panel rounded-[2rem] border border-teal-300/20 p-6">
      <div className="grid gap-5 lg:grid-cols-[0.35fr_0.65fr]">
        <div className="rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-teal-100">Score</p>
            <span className="rounded-full border border-teal-200/25 bg-slate-950/25 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-100">
              {result.mode === "openai" ? "OpenAI evaluation" : "Local evaluation"}
            </span>
          </div>
          <p className="mt-3 text-6xl font-semibold text-slate-50">{result.score}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
            {result.verdict}
          </p>
          {result.mode === "openai" && result.model ? (
            <p className="mt-2 text-xs text-slate-400">Model: {result.model}</p>
          ) : null}
        </div>
        <div className="space-y-4">
          <FeedbackList title="What you did well" items={result.strengths} tone="teal" />
          <FeedbackList title="What is missing" items={result.gaps} tone="amber" />
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
        <p className="text-sm font-semibold text-slate-50">Better production-grade answer</p>
        <p className="mt-3 text-sm leading-7 text-slate-300">{result.improvedAnswer}</p>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <RubricBreakdown rubric={result.rubricBreakdown} title="Your rubric score" />
        <FeedbackList title="Common mistakes" items={commonMistakes} tone="rose" />
        <FeedbackList title="Follow-up challenge" items={followUps} tone="slate" />
      </div>
    </div>
  );
}

function FeedbackList({
  title,
  items,
  tone
}: {
  title: string;
  items: string[];
  tone: "teal" | "amber" | "rose" | "slate";
}) {
  const toneClass = {
    teal: "border-teal-300/20 bg-teal-300/10 text-teal-100",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    rose: "border-rose-400/20 bg-rose-400/10 text-rose-100",
    slate: "border-slate-800 bg-slate-950/40 text-slate-300"
  }[tone];

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {title}
      </p>
      <div className="mt-3 space-y-2">
        {(items.length ? items : ["No items yet."]).map((item) => (
          <p key={item} className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClass}`}>
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}
