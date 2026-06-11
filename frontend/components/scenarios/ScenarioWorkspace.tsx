"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { trackEvent } from "../../lib/analytics";
import {
  AUTH_UPDATED_EVENT,
  getCurrentUser,
  type AuthUser
} from "../../lib/auth";
import {
  runReadOnlySql,
  validateSqlOutput,
  type BrowserSqlResultTable,
  type BrowserSqlValidationResult
} from "../../lib/browser-sql";
import {
  getScenarioProgress,
  markScenarioCompleted,
  recordScenarioAiFeedback,
  recordScenarioAttempt,
  saveScenarioDraft,
  setScenarioHintsRevealed,
  summarizeScenarioProgress,
  type ScenarioProgressSummary
} from "../../lib/progress";
import { evaluateScenarioAnswer, type ScenarioEvaluationResult } from "../../lib/scenarioEvaluator";
import {
  formatDifficulty,
  formatDomain,
  formatScenarioType,
  getScenarios,
  type ScenarioSampleTable,
  type Scenario
} from "../../lib/scenarios";
import { CodeBlock } from "./CodeBlock";
import { EvaluationPanel } from "./EvaluationPanel";
import { RubricBreakdown } from "./RubricBreakdown";
import { AuthDialog } from "../auth-dialog";

interface ScenarioWorkspaceProps {
  scenario: Scenario;
}

export function ScenarioWorkspace({ scenario }: ScenarioWorkspaceProps) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [interviewAnswer, setInterviewAnswer] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [modelSolutionVisible, setModelSolutionVisible] = useState(false);
  const [evaluation, setEvaluation] = useState<ScenarioEvaluationResult | null>(null);
  const [progress, setProgress] = useState<ScenarioProgressSummary | null>(null);
  const [activeFollowUpIndex, setActiveFollowUpIndex] = useState(0);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [sqlExecution, setSqlExecution] = useState<BrowserSqlValidationResult | null>(null);
  const [sqlPreview, setSqlPreview] = useState<BrowserSqlResultTable | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [showRevealConfirmation, setShowRevealConfirmation] = useState(false);

  useEffect(() => {
    const savedProgress = getScenarioProgress(scenario.slug);
    const savedAnswer = savedProgress.draftAnswer;
    if (scenario.scenarioType === "mcq" && scenario.mcqOptions?.some((option) => option.id === savedAnswer)) {
      setSelectedOptionId(savedAnswer);
    } else {
      setAnswer(savedAnswer || scenario.brokenCode || "");
    }
    setHintsRevealed(Math.min(savedProgress.hintsRevealed, scenario.hints.length));
    setProgress(summarizeScenarioProgress(savedProgress, scenario.slug));
    setSqlExecution(null);
    setSqlPreview(null);
    setEvaluation(null);
    setModelSolutionVisible(false);
  }, [scenario]);

  useEffect(() => {
    function syncUser() {
      setCurrentUser(getCurrentUser());
    }
    syncUser();
    window.addEventListener(AUTH_UPDATED_EVENT, syncUser);
    window.addEventListener("storage", syncUser);
    return () => {
      window.removeEventListener(AUTH_UPDATED_EVENT, syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, []);

  useEffect(() => {
    if (evaluation && !currentUser) {
      trackEvent("signup_prompt_seen", { source: "scenario_feedback", scenario: scenario.slug });
    }
  }, [currentUser, evaluation, scenario.slug]);

  const visibleHints = scenario.hints.slice(0, hintsRevealed);
  const canRunSql =
    Boolean(scenario.expectedSql && scenario.sampleTables?.length) &&
    (scenario.scenarioType === "broken_sql" || scenario.scenarioType === "output_mismatch");
  const nextScenario = useMemo(() => {
    const scenarios = getScenarios();
    const index = scenarios.findIndex((item) => item.slug === scenario.slug);
    if (index < 0 || scenarios.length <= 1) return null;
    return scenarios[(index + 1) % scenarios.length];
  }, [scenario.slug]);
  const promptLabel = useMemo(() => {
    if (scenario.scenarioType === "broken_sql") return "Write the corrected SQL";
    if (scenario.scenarioType === "broken_pyspark") return "Write the corrected PySpark approach";
    if (scenario.scenarioType === "log_analysis") return "Write your root-cause analysis";
    if (scenario.scenarioType === "output_mismatch") return "Explain and fix the mismatch";
    return "Write your answer";
  }, [scenario.scenarioType]);
  const submitLabel = useMemo(() => {
    if (canRunSql) return "Submit query";
    if (scenario.scenarioType === "broken_pyspark") return "Submit fix";
    if (scenario.scenarioType === "mcq") return "Submit answer";
    return "Submit answer";
  }, [canRunSql, scenario.scenarioType]);

  function revealHint() {
    const nextCount = Math.min(hintsRevealed + 1, scenario.hints.length);
    setHintsRevealed(nextCount);
    const nextProgress = setScenarioHintsRevealed(scenario.slug, nextCount);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
    trackEvent("hint_used", { scenario: scenario.slug, hint_number: nextCount });
  }

  function saveDraft() {
    const draft = scenario.scenarioType === "mcq" ? selectedOptionId : answer;
    const nextProgress = saveScenarioDraft(scenario.slug, draft);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
    setDraftMessage("Draft saved locally.");
  }

  async function checkAnswer() {
    const submittedAnswer =
      scenario.scenarioType === "mcq"
        ? selectedOptionId
        : `${answer}\n\nInterview explanation:\n${interviewAnswer}`;
    setIsChecking(true);
    setSqlExecution(null);

    try {
      const nextEvaluation = evaluateScenarioAnswer(scenario, submittedAnswer);
      const runnableSqlResult =
        canRunSql && scenario.sampleTables && scenario.expectedSql
          ? await validateSqlOutput(scenario.sampleTables, answer, scenario.expectedSql)
          : null;

      if (runnableSqlResult) {
        setSqlExecution(runnableSqlResult);
      }

      const passed = runnableSqlResult ? runnableSqlResult.passed : nextEvaluation.score >= 70;
      const message = runnableSqlResult
        ? `${runnableSqlResult.passed ? "SQL passed" : "SQL output mismatch"} · ${nextEvaluation.score}/100 explanation score`
        : `${nextEvaluation.verdict} · ${nextEvaluation.score}/100`;
      const nextProgress = recordScenarioAttempt(scenario.slug, {
        passed,
        answer: submittedAnswer,
        message
      });
      recordScenarioAiFeedback(scenario.slug, {
        totalScore: runnableSqlResult?.passed ? Math.max(nextEvaluation.score, 85) : nextEvaluation.score,
        strengths: runnableSqlResult?.passed
          ? ["Your SQL returned the expected result on the seeded data.", ...nextEvaluation.strengths]
          : nextEvaluation.strengths,
        missingPoints: runnableSqlResult?.passed
          ? nextEvaluation.gaps
          : runnableSqlResult
            ? [runnableSqlResult.message, ...nextEvaluation.gaps]
            : nextEvaluation.gaps,
        improvedAnswer: nextEvaluation.improvedAnswer,
        followUpQuestions: scenario.followUps
      });
      setEvaluation(nextEvaluation);
      setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
      setDraftMessage(null);
      trackEvent("first_lab_submitted", {
        scenario: scenario.slug,
        type: scenario.scenarioType,
        passed
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The browser checker could not run this answer.";
      const nextProgress = recordScenarioAttempt(scenario.slug, {
        passed: false,
        answer: submittedAnswer,
        message
      });
      setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
      setSqlExecution({
        passed: false,
        message,
        actual: { columns: [], rows: [] },
        expected: { columns: [], rows: [] }
      });
      setDraftMessage(null);
    } finally {
      setIsChecking(false);
    }
  }

  async function runSqlPreview() {
    if (!canRunSql || !scenario.sampleTables) return;
    setIsChecking(true);
    setSqlExecution(null);
    try {
      const result = await runReadOnlySql(scenario.sampleTables, answer);
      setSqlPreview(result);
      setDraftMessage("Query ran against a fresh copy of the sample database.");
    } catch (error) {
      setSqlPreview(null);
      setDraftMessage(error instanceof Error ? error.message : "The query could not be run.");
    } finally {
      setIsChecking(false);
    }
  }

  function resetSqlWorkspace() {
    setAnswer(scenario.brokenCode || "");
    setSqlPreview(null);
    setSqlExecution(null);
    setEvaluation(null);
    setDraftMessage("Sample database and editor reset.");
  }

  async function copySchema() {
    const schemaText =
      scenario.schema ||
      scenario.sampleTables
        ?.map((table) => `${table.name}(${table.columns.join(", ")})`)
        .join("\n") ||
      "";
    await navigator.clipboard.writeText(schemaText);
    setDraftMessage("Schema copied.");
  }

  function completeLab() {
    const nextProgress = markScenarioCompleted(scenario.slug);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
    trackEvent("lab_completed", { scenario: scenario.slug });
    if (nextScenario) {
      router.push(`/scenarios/${nextScenario.slug}`);
    }
  }

  function requestModelSolution() {
    const hasAttempted = Boolean(evaluation || (progress?.attemptCount ?? 0) > 0);
    if (!hasAttempted) {
      setShowRevealConfirmation(true);
      return;
    }
    revealModelSolution();
  }

  function revealModelSolution() {
    setModelSolutionVisible(true);
    setShowRevealConfirmation(false);
    trackEvent("model_solution_revealed", { scenario: scenario.slug });
  }

  function goToNextScenario() {
    if (!nextScenario) return;
    router.push(`/scenarios/${nextScenario.slug}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function tryFollowUp() {
    setActiveFollowUpIndex((current) => (current + 1) % Math.max(1, scenario.followUps.length));
    setEvaluation(null);
    setModelSolutionVisible(false);
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="panel rounded-[2rem] p-8">
            <div className="flex flex-wrap gap-2">
              <Badge>{formatDomain(scenario.domain)}</Badge>
              <Badge>{formatDifficulty(scenario.difficulty)}</Badge>
              <Badge>{formatScenarioType(scenario.scenarioType)}</Badge>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                  scenario.isFree
                    ? "border-teal-300/25 bg-teal-300/10 text-teal-100"
                    : "border-amber-300/25 bg-amber-300/10 text-amber-100"
                }`}
              >
                {scenario.isFree ? "Free" : "Premium"}
              </span>
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-50">
              {scenario.title}
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              {scenario.businessContext}
            </p>
            <nav
              aria-label="Scenario sections"
              className="mt-6 flex flex-wrap gap-2 border-t border-slate-800 pt-5"
            >
              {[
                ["Context", "#context"],
                ["Data", "#data"],
                ["Broken code", "#broken-code"],
                ["Attempt", "#attempt"],
                ["Explanation", "#explanation"],
                ["Rubric", "#rubric"]
              ].map(([label, href]) => (
                <a
                  key={href}
                  href={href}
                  className="rounded-full border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-teal-300/40 hover:text-teal-100"
                >
                  {label}
                </a>
              ))}
            </nav>
          </section>

          <InfoSection id="context" title="Scenario context" body={scenario.problemStatement} />
          <InfoSection title="Business requirement" body={scenario.requirement ?? ""} />

          {scenario.sampleTables?.length ? (
            <section id="data" className="panel scroll-mt-32 rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
                Sample production data
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Use these small tables to reason about the bug before writing the fix.
                The browser checker seeds this data when you click Check Answer.
              </p>
              <div className="mt-5 grid min-w-0 gap-5">
                {scenario.sampleTables.map((table) => (
                  <ScenarioTablePreview key={table.name} table={table} />
                ))}
              </div>
            </section>
          ) : null}

          <div id="broken-code" className="grid scroll-mt-32 gap-5 lg:grid-cols-2">
            <CodeBlock title="Schema" code={scenario.schema ?? ""} />
            <CodeBlock title="Sample input" code={scenario.sampleInput ?? ""} />
          </div>
          <CodeBlock title="Broken logic / code" code={scenario.brokenCode ?? ""} />
          <CodeBlock title="Logs / error" code={scenario.logs ?? ""} />
          <div className="grid gap-5 lg:grid-cols-2">
            <CodeBlock title="Actual output" code={scenario.actualOutput ?? ""} />
            <CodeBlock title="Expected output / expected logic" code={scenario.expectedOutput ?? ""} />
          </div>

          <section id="attempt" className="panel scroll-mt-32 rounded-[2rem] p-6">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
                  Your attempt
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-50">{promptLabel}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {canRunSql
                    ? "Write the corrected query. The browser will run it against the sample tables and compare the result with the expected output."
                    : "Think before revealing the answer. A partial but honest attempt is better practice than reading the model solution first."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {draftMessage ? (
                  <p className="text-sm font-semibold text-teal-100">{draftMessage}</p>
                ) : null}
                {canRunSql ? (
                  <>
                    <button
                      type="button"
                      onClick={resetSqlWorkspace}
                      className="rounded-full border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
                    >
                      Reset sample DB
                    </button>
                    <button
                      type="button"
                      onClick={copySchema}
                      className="rounded-full border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
                    >
                      Copy schema
                    </button>
                    <button
                      type="button"
                      onClick={runSqlPreview}
                      disabled={isChecking}
                      className="rounded-full border border-teal-300/35 px-5 py-3 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10 disabled:opacity-60"
                    >
                      Run query
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={checkAnswer}
                  disabled={isChecking}
                  className="rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-wait disabled:opacity-70"
                >
                  {isChecking ? "Submitting..." : submitLabel}
                </button>
                <button
                  type="button"
                  onClick={goToNextScenario}
                  disabled={!nextScenario}
                  className="rounded-full border border-teal-300/30 px-5 py-3 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                >
                  Next scenario
                </button>
              </div>
            </div>

            {scenario.scenarioType === "mcq" ? (
              <div className="mt-5 grid gap-3">
                {scenario.mcqOptions?.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedOptionId(option.id)}
                    className={`rounded-2xl border p-4 text-left text-sm leading-6 transition ${
                      selectedOptionId === option.id
                        ? "border-teal-300/40 bg-teal-300/10 text-teal-100"
                        : "border-slate-800 bg-slate-950/45 text-slate-300 hover:border-teal-300/30"
                    }`}
                  >
                    <span className="font-semibold">{option.id}.</span> {option.text}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={13}
                className="mt-5 w-full rounded-3xl border border-slate-800 bg-slate-950/80 p-5 font-mono text-sm leading-7 text-slate-100 outline-none transition focus:border-teal-300/50"
                placeholder="Write your fix, diagnosis, or production-safe approach here."
              />
            )}

            <div
              id="explanation"
              className="mt-5 scroll-mt-32 rounded-3xl border border-slate-800 bg-slate-950/35 p-5"
            >
              <h3 className="text-lg font-semibold text-slate-50">
                Interview-style explanation
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Now explain your solution as if you are in an interview: symptom, root cause,
                fix, edge cases, trade-offs, monitoring, and prevention.
              </p>
              <textarea
                value={interviewAnswer}
                onChange={(event) => setInterviewAnswer(event.target.value)}
                rows={6}
                className="mt-4 w-full rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-100 outline-none transition focus:border-amber-300/50"
                placeholder="I would first confirm..., the root cause is..., the safe fix is..., and I would monitor..."
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveDraft}
                className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={revealHint}
                disabled={hintsRevealed >= scenario.hints.length}
                className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-amber-300/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Show Hint
              </button>
              <button
                type="button"
                onClick={checkAnswer}
                disabled={isChecking}
                className="rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-wait disabled:opacity-70"
              >
                {isChecking ? "Submitting..." : submitLabel}
              </button>
              <button
                type="button"
                onClick={goToNextScenario}
                disabled={!nextScenario}
                className="rounded-full border border-teal-300/30 px-5 py-3 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                Next scenario
              </button>
              <button
                type="button"
                onClick={requestModelSolution}
                className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Reveal Model Solution
              </button>
              <button
                type="button"
                onClick={tryFollowUp}
                className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
              >
                Try Follow-up
              </button>
            </div>

            {showRevealConfirmation ? (
              <div className="mt-5 rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5">
                <p className="text-sm font-semibold text-amber-100">
                  Try once before revealing the solution?
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  You have not submitted an attempt yet. Revealing now can reduce the value
                  of the exercise, but you can continue if you are intentionally reviewing.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setShowRevealConfirmation(false)}
                    className="rounded-full bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950"
                  >
                    Return to attempt
                  </button>
                  <button
                    type="button"
                    onClick={revealModelSolution}
                    className="rounded-full border border-amber-300/35 px-4 py-2 text-sm font-semibold text-amber-100"
                  >
                    Reveal anyway
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {sqlPreview ? (
            <section className="panel rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
                Query preview
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                This is your current result. Submit when you are ready to compare it with the
                expected output and edge-case rules.
              </p>
              <div className="mt-5">
                <ResultTable title="Current output" table={sqlPreview} />
              </div>
            </section>
          ) : null}

          {sqlExecution ? <ScenarioSqlResultPanel result={sqlExecution} /> : null}

          {visibleHints.length > 0 ? (
            <section className="panel rounded-[2rem] p-6">
              <h2 className="text-xl font-semibold text-slate-50">Hints revealed</h2>
              <div className="mt-4 space-y-3">
                {visibleHints.map((hint, index) => (
                  <p
                    key={hint}
                    className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100"
                  >
                    Hint {index + 1}: {hint}
                  </p>
                ))}
              </div>
            </section>
          ) : null}

          {evaluation ? (
            <>
              <EvaluationPanel
                result={evaluation}
                commonMistakes={scenario.commonMistakes}
                followUps={scenario.followUps}
              />
              <section className="panel rounded-[2rem] border border-teal-300/20 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
                  Attempt complete
                </p>
                <div className="mt-3 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-50">
                      Score: {evaluation.score}/100
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                      Review the gaps above, mark this lab complete, or move to the next
                      recommended scenario and revisit this one later.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={completeLab}
                      className="rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200"
                    >
                      Mark complete & go next
                    </button>
                    <button
                      type="button"
                      onClick={goToNextScenario}
                      className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200"
                    >
                      Next scenario
                    </button>
                  </div>
                </div>
                {!currentUser ? (
                  <div className="mt-5 rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5">
                    <p className="text-sm font-semibold text-amber-100">
                      Save this practice journey
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Your progress is saved on this device now. Create an account to prepare
                      for future cross-device progress and account-backed practice history.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        trackEvent("signup_started", { source: "scenario_feedback" });
                        setIsAuthOpen(true);
                      }}
                      className="mt-4 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950"
                    >
                      Sign up to save progress
                    </button>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

          {modelSolutionVisible ? (
            <section className="panel rounded-[2rem] p-6">
              <h2 className="text-2xl font-semibold text-slate-50">Model solution</h2>
              <CodeBlock code={scenario.modelSolution} />
              <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/40 p-5">
                <p className="text-sm font-semibold text-slate-50">Production explanation</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  {scenario.productionExplanation}
                </p>
              </div>
              <button
                type="button"
                onClick={completeLab}
                className="mt-5 rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200"
              >
                {nextScenario ? "Mark completed & go next" : "Mark completed"}
              </button>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-32 xl:self-start">
          <div className="panel rounded-[2rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              Output contract
            </p>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">
              {scenario.requirement || scenario.problemStatement}
            </p>
            {scenario.expectedOutput ? (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Expected grain / columns
                </p>
                <p className="mt-2 line-clamp-5 whitespace-pre-line font-mono text-xs leading-5 text-slate-300">
                  {scenario.expectedOutput}
                </p>
              </div>
            ) : null}
          </div>

          <div className="panel rounded-[2rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              Lab checklist
            </p>
            <div className="mt-4 space-y-3">
              {[
                ["Read context", true],
                ["Attempted", Boolean(evaluation || (progress?.attemptCount ?? 0) > 0)],
                ["Hint used", hintsRevealed > 0],
                ["Model revealed", modelSolutionVisible],
                ["Completed", Boolean(progress?.completed)]
              ].map(([label, done]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/35 px-4 py-3 text-sm"
                >
                  <span className="text-slate-300">{label}</span>
                  <span className={done ? "text-teal-100" : "text-slate-600"}>
                    {done ? "Done" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel rounded-[2rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
              Skills tested
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {scenario.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-800 bg-slate-950/45 px-3 py-1 text-xs text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div id="rubric" className="scroll-mt-32">
            <RubricBreakdown rubric={scenario.evaluationRubric} />
          </div>

          <div className="panel rounded-[2rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Current follow-up
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {scenario.followUps[activeFollowUpIndex] ?? "No follow-up configured yet."}
            </p>
          </div>
        </aside>
      </section>
      <AuthDialog isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </main>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200">
      {children}
    </span>
  );
}

function ScenarioTablePreview({ table }: { table: ScenarioSampleTable }) {
  return (
    <div className="w-full min-w-0 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/40">
      <div className="border-b border-slate-800 px-4 py-3">
        <p className="font-mono text-sm font-semibold text-teal-100">{table.name}</p>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="min-w-full table-auto text-left text-sm">
          <thead className="bg-slate-950/70 text-slate-400">
            <tr>
              {table.columns.map((column) => (
                <th
                  key={column}
                  className="min-w-32 whitespace-nowrap px-5 py-4 align-top font-semibold"
                  style={{ whiteSpace: "nowrap" }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {table.rows.map((row, rowIndex) => (
              <tr key={`${table.name}-${rowIndex}`}>
                {table.columns.map((column, columnIndex) => (
                  <td
                    key={column}
                    className="min-w-32 whitespace-nowrap px-5 py-4 align-top font-mono"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {String(row[columnIndex] ?? "NULL")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScenarioSqlResultPanel({ result }: { result: BrowserSqlValidationResult }) {
  return (
    <section
      className={`rounded-[2rem] border p-6 ${
        result.passed
          ? "border-teal-300/25 bg-teal-300/10"
          : "border-rose-300/25 bg-rose-300/10"
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-[0.24em] ${
          result.passed ? "text-teal-100" : "text-rose-100"
        }`}
      >
        {result.passed ? "Executable check passed" : "Executable check failed"}
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-200">{result.message}</p>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ResultTable title="Your output" table={result.actual} />
        <ResultTable title="Expected output" table={result.expected} />
      </div>
    </section>
  );
}

function ResultTable({ title, table }: { title: string; table: BrowserSqlResultTable }) {
  if (table.columns.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">
        {title}: no rows returned or query failed before producing output.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/50">
      <div className="border-b border-slate-800 px-4 py-3">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs text-slate-200">
          <thead className="bg-slate-950/70 text-slate-400">
            <tr>
              {table.columns.map((column) => (
                <th key={column} className="px-4 py-3 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="whitespace-nowrap px-4 py-3 font-mono">
                    {String(cell ?? "NULL")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfoSection({ id, title, body }: { id?: string; title: string; body: string }) {
  if (!body.trim()) {
    return null;
  }

  return (
    <section id={id} className="panel scroll-mt-32 rounded-[2rem] p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
        {title}
      </p>
      <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-300">{body}</p>
    </section>
  );
}
