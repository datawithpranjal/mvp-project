"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { evaluateScenarioAnswer, type ScenarioEvaluationResult } from "../../lib/scenarioEvaluator";
import {
  formatDomain,
  getScenarios,
  type Scenario,
  type ScenarioDomain
} from "../../lib/scenarios";

const INTERVIEW_TYPES: Array<"mixed" | ScenarioDomain> = [
  "mixed",
  "sql",
  "pyspark",
  "airflow",
  "data_quality",
  "aws"
];

export default function MockInterviewPage() {
  const [interviewType, setInterviewType] = useState<"mixed" | ScenarioDomain>("mixed");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, ScenarioEvaluationResult>>({});

  const questions = useMemo(() => {
    const scenarios = getScenarios();
    const filtered =
      interviewType === "mixed"
        ? scenarios
        : scenarios.filter((scenario) => scenario.domain === interviewType);
    return filtered.slice(0, 3);
  }, [interviewType]);

  function handleEvaluate(scenario: Scenario) {
    const result = evaluateScenarioAnswer(scenario, answers[scenario.slug] ?? "");
    setResults((currentResults) => ({
      ...currentResults,
      [scenario.slug]: result
    }));
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          Mock Interview Room
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
          Explain production fixes like an engineer.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          These prompts now come from Broken Pipeline Lab scenarios. Practice the spoken/written
          explanation after solving the technical issue.
        </p>
      </section>

      <section className="panel mt-6 rounded-3xl p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
          Interview type
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {INTERVIEW_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setInterviewType(type)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                interviewType === type
                  ? "bg-teal-300 text-slate-950"
                  : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:border-teal-300/40"
              }`}
            >
              {type === "mixed" ? "Mixed Data Engineering" : formatDomain(type)}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 space-y-6">
        {questions.map((scenario, index) => {
          const result = results[scenario.slug];
          return (
            <article key={scenario.slug} className="panel rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
                Question {index + 1} · {formatDomain(scenario.domain)}
              </p>
              <h2 className="mt-3 text-xl font-semibold leading-8 text-slate-50">
                Explain this scenario: {scenario.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                {scenario.problemStatement}
              </p>
              <textarea
                value={answers[scenario.slug] ?? ""}
                onChange={(event) =>
                  setAnswers((currentAnswers) => ({
                    ...currentAnswers,
                    [scenario.slug]: event.target.value
                  }))
                }
                rows={7}
                placeholder="Frame it as: symptom, root cause, fix, validation, trade-offs, monitoring."
                className="mt-5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-100 outline-none transition focus:border-teal-300/50"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleEvaluate(scenario)}
                  className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
                >
                  Evaluate answer
                </button>
                <Link
                  href={`/scenarios/${scenario.slug}`}
                  className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
                >
                  Open full lab
                </Link>
              </div>

              {result ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-[0.35fr_0.65fr]">
                  <div className="rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5">
                    <p className="text-sm font-semibold text-teal-100">Score</p>
                    <p className="mt-3 text-5xl font-semibold text-slate-50">{result.score}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                      {result.verdict}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
                    <p className="text-sm font-semibold text-slate-50">Feedback</p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      {result.improvedAnswer}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <FeedbackList title="Strengths" items={result.strengths} />
                      <FeedbackList title="Gaps" items={result.gaps} />
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </main>
  );
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <p
            key={item}
            className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300"
          >
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}
