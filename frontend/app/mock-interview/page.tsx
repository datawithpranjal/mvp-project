"use client";

import { useMemo, useState } from "react";

import { MOCK_INTERVIEW_QUESTIONS, type MockInterviewQuestion } from "../../lib/product";
import type { ScenarioDetail } from "../../lib/types";
import {
  evaluateScenarioAnswer,
  type AiEvaluationResult
} from "../../services/ai/evaluateScenarioAnswer";

const INTERVIEW_TYPES = [
  "SQL",
  "Spark",
  "Scenario",
  "Airflow",
  "Mixed Data Engineering"
] as const;

type InterviewType = (typeof INTERVIEW_TYPES)[number];

export default function MockInterviewPage() {
  const [interviewType, setInterviewType] = useState<InterviewType>("Mixed Data Engineering");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, AiEvaluationResult>>({});
  const [isEvaluating, setIsEvaluating] = useState<string | null>(null);

  const questions = useMemo(() => {
    const filtered =
      interviewType === "Mixed Data Engineering"
        ? MOCK_INTERVIEW_QUESTIONS
        : MOCK_INTERVIEW_QUESTIONS.filter((question) => question.type === interviewType);
    return filtered.slice(0, 3);
  }, [interviewType]);

  async function handleEvaluate(question: MockInterviewQuestion) {
    setIsEvaluating(question.id);
    const result = await evaluateScenarioAnswer({
      scenario: buildScenarioFromQuestion(question),
      userAnswer: answers[question.id] ?? "",
      hasScenarioAccess: true
    });
    setResults((currentResults) => ({
      ...currentResults,
      [question.id]: result
    }));
    setIsEvaluating(null);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          Mock Interview Room
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50">
          Practice saying the answer, not just knowing it.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Pick an interview type, answer three practical prompts, and get mock AI feedback.
          This v1 uses the same evaluator abstraction as scenarios.
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
              {type}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 space-y-6">
        {questions.map((question, index) => {
          const result = results[question.id];
          return (
            <article key={question.id} className="panel rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
                Question {index + 1} · {question.type}
              </p>
              <h2 className="mt-3 text-xl font-semibold leading-8 text-slate-50">
                {question.prompt}
              </h2>
              <textarea
                value={answers[question.id] ?? ""}
                onChange={(event) =>
                  setAnswers((currentAnswers) => ({
                    ...currentAnswers,
                    [question.id]: event.target.value
                  }))
                }
                rows={6}
                placeholder="Write your interview answer with root cause, fix, trade-offs, and validation."
                className="mt-5 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-100 outline-none transition focus:border-teal-300/50"
              />
              <button
                type="button"
                onClick={() => handleEvaluate(question)}
                disabled={isEvaluating === question.id}
                className="mt-4 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-amber-100"
              >
                {isEvaluating === question.id ? "Evaluating..." : "Evaluate answer"}
              </button>

              {result ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-[0.35fr_0.65fr]">
                  <div className="rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5">
                    <p className="text-sm font-semibold text-teal-100">Score</p>
                    <p className="mt-3 text-5xl font-semibold text-slate-50">
                      {result.totalScore}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                      mock evaluator
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
                    <p className="text-sm font-semibold text-slate-50">Feedback</p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      {result.improvedAnswerSuggestion}
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <FeedbackList title="Strengths" items={result.strengths} />
                      <FeedbackList title="Missing points" items={result.missingPoints} />
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
          <p key={item} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function buildScenarioFromQuestion(question: MockInterviewQuestion): ScenarioDetail {
  return {
    slug: question.id,
    title: question.prompt,
    difficulty: "Intermediate",
    section: question.type,
    short_description: question.prompt,
    access_tier: "free",
    topics: [question.type],
    validation_type: "DESIGN_RUBRIC",
    business_context: question.prompt,
    problem_statement: question.prompt,
    student_task: "Answer the interview prompt clearly.",
    learning_objectives: question.expectedSignals,
    tables: [],
    broken_code: "",
    production_logs: [],
    expected_output: null,
    submission_instructions: "Write a structured interview answer.",
    validation_logic: null,
    solution_answer: "",
    explanation: "",
    common_mistakes: [],
    rubric: question.expectedSignals.map((signal) => ({
      point: signal,
      weight: 10
    })),
    hints: []
  };
}

