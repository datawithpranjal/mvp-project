"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AttemptHistory } from "../../../components/attempt-history";
import { DataTable } from "../../../components/data-table";
import { HintPanel } from "../../../components/hint-panel";
import { LogPanel } from "../../../components/log-panel";
import { PremiumUpgradePanel } from "../../../components/premium-upgrade-panel";
import { ResultPanel } from "../../../components/result-panel";
import { SqlEditor } from "../../../components/sql-editor";
import { getScenario, validateScenario } from "../../../lib/api";
import { AUTH_UPDATED_EVENT, getAuthToken } from "../../../lib/auth";
import {
  getScenarioProgress,
  markScenarioCompleted,
  recordScenarioAttempt,
  recordScenarioAiFeedback,
  saveScenarioDraft,
  scheduleScenarioReattempt,
  setScenarioHintsRevealed,
  setScenarioSelfRating,
  summarizeScenarioProgress,
  type AttemptHistoryEntry,
  type ScenarioSelfRating,
  type ScenarioProgressSummary
} from "../../../lib/progress";
import {
  getPremiumAccess,
  PREMIUM_ACCESS_UPDATED_EVENT,
  type PremiumAccessRecord
} from "../../../lib/premium-access";
import type { ScenarioDetail, ValidationResponse, ValidationType } from "../../../lib/types";
import {
  evaluateScenarioAnswer,
  type AiEvaluationResult
} from "../../../services/ai/evaluateScenarioAnswer";

function formatProgressTimestamp(value: string | null): string {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default function ScenarioDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [scenario, setScenario] = useState<ScenarioDetail | null>(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<ValidationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptHistory, setAttemptHistory] = useState<AttemptHistoryEntry[]>([]);
  const [progress, setProgress] = useState<ScenarioProgressSummary | null>(null);
  const [revealedHintsCount, setRevealedHintsCount] = useState(0);
  const [premiumAccess, setPremiumAccess] = useState<PremiumAccessRecord | null>(null);
  const [isModelAnswerVisible, setIsModelAnswerVisible] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<AiEvaluationResult | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  useEffect(() => {
    function syncPremiumAccess() {
      setPremiumAccess(getPremiumAccess());
    }

    syncPremiumAccess();
    window.addEventListener("storage", syncPremiumAccess);
    window.addEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncPremiumAccess);
    window.addEventListener(AUTH_UPDATED_EVENT, syncPremiumAccess);

    return () => {
      window.removeEventListener("storage", syncPremiumAccess);
      window.removeEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncPremiumAccess);
      window.removeEventListener(AUTH_UPDATED_EVENT, syncPremiumAccess);
    };
  }, []);

  useEffect(() => {
    async function loadScenario() {
      if (!slug) {
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const nextScenario = await getScenario(slug, getAuthToken());
        const nextProgress = getScenarioProgress(nextScenario.slug);
        setScenario(nextScenario);
        setAnswer(
          nextProgress.draftAnswer ||
            (nextScenario.validation_type === "SQL_OUTPUT_MATCH" ? nextScenario.broken_code : "")
        );
        setResult(null);
        setAiFeedback(null);
        setIsModelAnswerVisible(false);
        setDraftMessage(null);
        setAttemptHistory(nextProgress.attempts);
        setProgress(summarizeScenarioProgress(nextProgress, nextScenario.slug));
        setRevealedHintsCount(Math.min(nextProgress.hintsRevealed, nextScenario.hints.length));
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load scenario.";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadScenario();
  }, [slug]);

  async function handleSubmit() {
    if (!slug || !scenario) {
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const nextResult = await validateScenario(slug, { answer }, getAuthToken());
      const nextProgress = recordScenarioAttempt(slug, {
        passed: nextResult.passed,
        answer,
        message: nextResult.message
      });
      setResult(nextResult);
      setAttemptHistory(nextProgress.attempts);
      setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Failed to submit answer.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRevealNextHint() {
    if (!slug || !scenario || revealedHintsCount >= scenario.hints.length) {
      return;
    }

    const nextCount = revealedHintsCount + 1;
    const nextProgress = setScenarioHintsRevealed(slug, nextCount);
    setRevealedHintsCount(nextCount);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
  }

  function handleSaveDraft() {
    if (!slug || !scenario) {
      return;
    }

    const nextProgress = saveScenarioDraft(slug, answer);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
    setDraftMessage("Draft saved in this browser.");
  }

  async function handleEvaluateWithAi() {
    if (!slug || !scenario) {
      return;
    }

    try {
      setIsEvaluating(true);
      setError(null);
      const evaluation = await evaluateScenarioAnswer({
        scenario,
        userAnswer: answer,
        hasScenarioAccess: true
      });
      const nextProgress = recordScenarioAiFeedback(slug, {
        totalScore: evaluation.totalScore,
        strengths: evaluation.strengths,
        missingPoints: evaluation.missingPoints,
        improvedAnswer: evaluation.improvedAnswerSuggestion,
        followUpQuestions: evaluation.followUpQuestions
      });
      setAiFeedback(evaluation);
      setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
    } catch (evaluationError) {
      const message =
        evaluationError instanceof Error
          ? evaluationError.message
          : "Unable to evaluate answer right now.";
      setError(message);
    } finally {
      setIsEvaluating(false);
    }
  }

  function handleSelfRating(selfRating: ScenarioSelfRating) {
    if (!slug || !scenario) {
      return;
    }

    const nextProgress = setScenarioSelfRating(slug, selfRating);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
  }

  function handleMarkCompleted() {
    if (!slug || !scenario) {
      return;
    }

    const nextProgress = markScenarioCompleted(slug);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
  }

  function handleReattemptLater() {
    if (!slug || !scenario) {
      return;
    }

    const nextProgress = scheduleScenarioReattempt(slug);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
  }

  if (isLoading) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10">
        <div className="panel rounded-3xl p-6 text-sm text-slate-300">Loading scenario...</div>
      </main>
    );
  }

  if (error && !scenario) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-10 sm:px-10">
        <div className="panel rounded-3xl border border-rose-400/20 p-6 text-sm text-rose-200">
          {error}
        </div>
      </main>
    );
  }

  if (!scenario) {
    return null;
  }

  const isLocked = Boolean(scenario.is_locked) || (scenario.access_tier === "premium" && !premiumAccess);
  const editorConfig = getEditorConfig(scenario.validation_type);
  const progressStatus =
    progress?.completed || result?.passed === null ? "Completed" : "In progress";

  if (isLocked) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
        <div className="mb-6">
          <Link href="/" className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">
            ← Back to scenarios
          </Link>
        </div>

        <section className="panel rounded-[2rem] p-8 sm:p-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">
              Premium
            </span>
            <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-rose-100">
              Locked
            </span>
            <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
              {scenario.difficulty}
            </span>
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-50">
            {scenario.title}
          </h1>
          <p className="mt-4 text-base leading-8 text-slate-300">
            {scenario.short_description}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {scenario.topics.map((topic) => (
              <span
                key={topic}
                className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200"
              >
                {topic}
              </span>
            ))}
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Includes
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Full sample data, broken logic, hints, validation feedback, and the model answer.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Focus
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Practical production debugging patterns that show up in real data engineering interviews.
              </p>
            </div>
            <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Unlock
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Sign in and submit your manual UPI payment reference for premium activation.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-6">
          <PremiumUpgradePanel
            title="Unlock this premium scenario"
            description="Create an account, then choose `Rs 500/year` or `Rs 219/month` and submit your manual UPI payment reference for review."
            onUnlocked={() => setPremiumAccess(getPremiumAccess())}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <div className="mb-6">
        <Link href="/" className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">
          ← Back to scenarios
        </Link>
      </div>

      <section className="panel rounded-[2rem] p-8 sm:p-10">
        <div className="flex flex-wrap items-center gap-3">
          <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
            {scenario.section}
          </span>
          <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
            {scenario.difficulty}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] ${
              scenario.access_tier === "premium"
                ? "border border-amber-300/25 bg-amber-300/10 text-amber-100"
                : "border border-teal-300/20 bg-teal-300/10 text-teal-100"
            }`}
          >
            {scenario.access_tier === "premium" ? "Premium" : "Free"}
          </span>
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-50">
          {scenario.title}
        </h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
            {formatValidationLabel(scenario.validation_type)}
          </span>
          {scenario.topics.map((topic) => (
            <span
              key={topic}
              className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200"
            >
              {topic}
            </span>
          ))}
        </div>
        <div className="mt-6 rounded-3xl border border-slate-700/70 bg-slate-950/30 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-200">
            Business Context
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-300">
            {scenario.business_context}
          </p>
        </div>
        <p className="mt-4 max-w-4xl whitespace-pre-line text-base leading-8 text-slate-300">
          {scenario.problem_statement}
        </p>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          {scenario.learning_objectives.map((objective) => (
            <div
              key={objective}
              className="rounded-2xl border border-slate-700/60 bg-slate-950/30 px-4 py-3 text-sm text-slate-200"
            >
              {objective}
            </div>
          ))}
        </div>
      </section>

      {error ? (
        <div className="panel mt-6 rounded-3xl border border-rose-400/20 p-5 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="mx-auto mt-6 max-w-5xl space-y-6">
        <div className="panel rounded-3xl p-5">
          <h3 className="text-lg font-semibold text-slate-50">Student Task</h3>
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-300">
            {scenario.student_task}
          </p>
          <p className="mt-4 break-words text-sm leading-6 text-slate-400">
            {scenario.submission_instructions}
          </p>
        </div>

        <SqlEditor
          value={answer}
          onChange={setAnswer}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          title={editorConfig.title}
          description={editorConfig.description}
          placeholder={editorConfig.placeholder}
          submitLabel={editorConfig.submitLabel}
        />

        <div className="panel rounded-3xl p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h3 className="text-lg font-semibold text-slate-50">Practice Controls</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Save your attempt, get evaluator feedback, then reveal the model answer only
                after you have thought through the scenario.
              </p>
              {draftMessage ? (
                <p className="mt-2 text-sm font-semibold text-teal-100">{draftMessage}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={handleEvaluateWithAi}
                disabled={isEvaluating}
                className="rounded-full bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:bg-teal-100"
              >
                {isEvaluating ? "Evaluating..." : "Submit for Evaluation"}
              </button>
              <button
                type="button"
                onClick={() => setIsModelAnswerVisible(true)}
                className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Reveal Model Answer
              </button>
            </div>
          </div>
        </div>

        {aiFeedback ? <AiFeedbackPanel feedback={aiFeedback} /> : null}

        <ResultPanel scenario={scenario} result={result} />

        {isModelAnswerVisible ? <ModelAnswerPanel scenario={scenario} /> : null}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="min-w-0 space-y-6">
          {scenario.tables.map((table) => (
            <DataTable
              key={table.name}
              title={table.name}
              subtitle="Seeded sample data for the scenario."
              columns={table.columns}
              rows={table.rows}
            />
          ))}

          {scenario.broken_code ? (
            <div className="panel rounded-3xl p-5">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-50">
                  {getBrokenCodeHeading(scenario.validation_type)}
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  This is the current implementation or context that is causing the production issue.
                </p>
              </div>
              <div className="panel-strong max-w-full overflow-hidden rounded-2xl">
                <pre className="m-0 overflow-x-auto p-4 text-sm leading-7 text-amber-100">
                  {scenario.broken_code}
                </pre>
              </div>
            </div>
          ) : null}

          {scenario.production_logs.length > 0 ? <LogPanel logs={scenario.production_logs} /> : null}

          {scenario.expected_output ? (
            <DataTable
              title="Expected Output"
              subtitle="This is the result the corrected query should return."
              columns={scenario.expected_output.columns}
              rows={scenario.expected_output.rows}
            />
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          <div className="panel rounded-3xl p-5">
            <h3 className="text-lg font-semibold text-slate-50">Progress Tracking</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Status
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-50">
                  {progressStatus}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Attempts
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-50">
                  {progress?.attemptCount ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Hints Revealed
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-50">
                  {revealedHintsCount}/{scenario.hints.length}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-400">
              <p>Last attempt: {formatProgressTimestamp(progress?.lastAttemptedAt ?? null)}</p>
              <p>Last pass: {formatProgressTimestamp(progress?.lastPassedAt ?? null)}</p>
              <p>Draft saved: {formatProgressTimestamp(progress?.draftSavedAt ?? null)}</p>
              <p>Re-attempt: {formatProgressTimestamp(progress?.revisitAt ?? null)}</p>
            </div>
            <div className="mt-5 border-t border-slate-800 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Self-rating
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["Weak", "Okay", "Strong"] as ScenarioSelfRating[]).map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => handleSelfRating(rating)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      progress?.selfRating === rating
                        ? "bg-teal-300 text-slate-950"
                        : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:border-teal-300/40"
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleMarkCompleted}
                className="rounded-full bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-200"
              >
                Mark completed
              </button>
              <button
                type="button"
                onClick={handleReattemptLater}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-amber-300/40"
              >
                Re-attempt later
              </button>
            </div>
          </div>

          {scenario.validation_logic ? (
            <div className="panel rounded-3xl p-5">
              <h3 className="text-lg font-semibold text-slate-50">Validation Logic</h3>
              <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-slate-300">
                {scenario.validation_logic}
              </p>
            </div>
          ) : null}

          <HintPanel
            hints={scenario.hints}
            revealedCount={revealedHintsCount}
            onRevealNext={handleRevealNextHint}
          />

          <AttemptHistory attempts={attemptHistory} onReuseAttempt={setAnswer} />
        </div>
      </section>
    </main>
  );
}

function AiFeedbackPanel({ feedback }: { feedback: AiEvaluationResult }) {
  const dimensions = [
    ["Problem understanding", feedback.dimensionScores.problemUnderstanding],
    ["Root-cause thinking", feedback.dimensionScores.rootCauseThinking],
    ["Solution design", feedback.dimensionScores.solutionDesign],
    ["Trade-offs", feedback.dimensionScores.tradeOffs],
    ["Monitoring/testing", feedback.dimensionScores.monitoringTesting],
    ["Interview clarity", feedback.dimensionScores.interviewClarity]
  ];

  return (
    <div className="panel rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">AI Evaluation</h3>
          <p className="mt-1 text-sm text-slate-400">
            Mock deterministic evaluator. Replace with a provider later without changing the UI.
          </p>
        </div>
        <span className="rounded-full border border-teal-300/25 bg-teal-300/10 px-4 py-2 text-sm font-semibold text-teal-100">
          {feedback.totalScore}/100
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {dimensions.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <FeedbackList title="Strengths" items={feedback.strengths} />
        <FeedbackList title="Missing points" items={feedback.missingPoints} />
      </div>
      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Improved answer structure
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {feedback.improvedAnswerSuggestion}
        </p>
      </div>
    </div>
  );
}

function ModelAnswerPanel({ scenario }: { scenario: ScenarioDetail }) {
  return (
    <div className="panel rounded-3xl p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-50">Model Answer</h3>
        <p className="mt-1 text-sm text-slate-400">
          Use this after your attempt to compare reasoning, not as the first step.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <AnswerSection title="Understand the problem" body={scenario.problem_statement} />
        <AnswerSection title="Possible root causes" body={scenario.explanation} />
        <AnswerSection title="Solution design" body={scenario.solution_answer} preserveFormatting />
        <AnswerSection
          title="Trade-offs"
          body={
            scenario.common_mistakes.length
              ? scenario.common_mistakes.join("\n")
              : "Name correctness, latency, cost, operational risk, and replay safety."
          }
        />
        <AnswerSection
          title="Monitoring and testing"
          body="Add reconciliation checks, row-count checks, duplicate/null checks, alerting, and a replay/rollback plan."
        />
        <AnswerSection
          title="Strong interview framing"
          body="Start with the business symptom, isolate the failing assumption, propose the safest fix, describe validation, and close with how you would prevent recurrence."
        />
      </div>
      {scenario.rubric.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Follow-up questions
          </p>
          <div className="mt-3 space-y-2">
            {scenario.rubric.slice(0, 4).map((item) => (
              <p key={item.point} className="text-sm leading-6 text-slate-300">
                {item.point}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AnswerSection({
  title,
  body,
  preserveFormatting = false
}: {
  title: string;
  body: string;
  preserveFormatting?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <p
        className={`mt-3 break-words text-sm leading-6 text-slate-300 ${
          preserveFormatting ? "whitespace-pre-wrap" : "whitespace-pre-line"
        }`}
      >
        {body}
      </p>
    </div>
  );
}

function FeedbackList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="mt-3 space-y-2">
        {(items.length ? items : ["No specific notes yet."]).map((item) => (
          <p key={item} className="text-sm leading-6 text-slate-300">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function formatValidationLabel(validationType: ValidationType): string {
  if (validationType === "SQL_OUTPUT_MATCH") {
    return "SQL Output Match";
  }
  if (validationType === "DEBUG_RUBRIC") {
    return "Debug Rubric";
  }
  if (validationType === "CODE_REVIEW_RUBRIC") {
    return "Code Review Rubric";
  }
  return "Design Rubric";
}

function getBrokenCodeHeading(validationType: ValidationType): string {
  if (validationType === "CODE_REVIEW_RUBRIC") {
    return "Code Under Review";
  }
  return "Broken Logic";
}

function getEditorConfig(validationType: ValidationType): {
  title: string;
  description: string;
  placeholder: string;
  submitLabel: string;
} {
  if (validationType === "SQL_OUTPUT_MATCH") {
    return {
      title: "SQL Fix Workspace",
      description:
        "Submit a single read-only query that returns the exact result needed for this scenario.",
      placeholder: "Write your query here...",
      submitLabel: "Run validation"
    };
  }

  return {
    title: "Answer Workspace",
    description:
      "Submit your reasoning, debugging notes, or review comments to compare against the model answer and rubric.",
    placeholder: "Write your answer here...",
    submitLabel: "Submit answer"
  };
}
