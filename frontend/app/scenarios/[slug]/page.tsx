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
import { AUTH_UPDATED_EVENT } from "../../../lib/auth";
import {
  getScenarioProgress,
  recordScenarioAttempt,
  setScenarioHintsRevealed,
  summarizeScenarioProgress,
  type AttemptHistoryEntry,
  type ScenarioProgressSummary
} from "../../../lib/progress";
import {
  getPremiumAccess,
  PREMIUM_ACCESS_UPDATED_EVENT,
  type PremiumAccessRecord
} from "../../../lib/premium-access";
import type { ScenarioDetail, ValidationResponse, ValidationType } from "../../../lib/types";

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
        const nextScenario = await getScenario(slug);
        const nextProgress = getScenarioProgress(nextScenario.slug);
        setScenario(nextScenario);
        setAnswer(
          nextScenario.validation_type === "SQL_OUTPUT_MATCH" ? nextScenario.broken_code : ""
        );
        setResult(null);
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
      const nextResult = await validateScenario(slug, { answer });
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

  const isLocked = scenario.access_tier === "premium" && !premiumAccess;
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
                Sign in and use the dummy UPI checkout to unlock the full premium scenario library in this browser.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-6">
          <PremiumUpgradePanel
            title="Unlock this premium scenario"
            description="Create a demo account, then choose `Rs 500/year` or `Rs 219/month` and confirm the dummy UPI payment to unlock this scenario and the rest of the premium library."
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

        <ResultPanel scenario={scenario} result={result} />
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
