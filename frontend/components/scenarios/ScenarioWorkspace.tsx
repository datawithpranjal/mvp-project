"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { trackEvent } from "../../lib/analytics";
import { evaluateScenarioWithAi, validatePysparkScenario } from "../../lib/api";
import {
  AUTH_UPDATED_EVENT,
  getAuthToken,
  getCurrentUser,
  type AuthUser
} from "../../lib/auth";
import {
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
import { sendUsageEvent } from "../../lib/usage";
import { handleTextareaTabKeyDown } from "../../lib/textarea-tab";
import type { PysparkValidationResponse } from "../../lib/types";
import {
  formatDifficulty,
  formatDomain,
  formatScenarioType,
  getScenarios,
  type ScenarioIncident,
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

const EXECUTABLE_PYSPARK_SCENARIOS = new Set([
  "yesterdays-sales-missing-late-source-arrival"
]);

const EXECUTABLE_PYSPARK_STARTERS: Record<string, string> = {
  "yesterdays-sales-missing-late-source-arrival": `from pyspark.sql import functions as F

# The validation runner already provides:
# - raw_sales: input DataFrame
# - run_date: business date to rebuild, for example "2026-05-07"
#
# Create a DataFrame named daily_sales with:
# business_date, order_count, gross_sales

daily_sales = (
    raw_sales
    # TODO: derive business_date from the sale timestamp, not ingested_at
    # TODO: keep only run_date and PAID rows
    # TODO: deduplicate orders before summing revenue
    # TODO: aggregate to order_count and gross_sales
)
`
};

export function ScenarioWorkspace({ scenario }: ScenarioWorkspaceProps) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [interviewAnswer, setInterviewAnswer] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [selectedDiagnosisId, setSelectedDiagnosisId] = useState("");
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [modelSolutionVisible, setModelSolutionVisible] = useState(false);
  const [evaluation, setEvaluation] = useState<ScenarioEvaluationResult | null>(null);
  const [progress, setProgress] = useState<ScenarioProgressSummary | null>(null);
  const [activeFollowUpIndex, setActiveFollowUpIndex] = useState(0);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [evaluationNotice, setEvaluationNotice] = useState<string | null>(null);
  const [sqlExecution, setSqlExecution] = useState<BrowserSqlValidationResult | null>(null);
  const [pysparkExecution, setPysparkExecution] = useState<PysparkValidationResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [showRevealConfirmation, setShowRevealConfirmation] = useState(false);
  const [hydratedScenarioSlug, setHydratedScenarioSlug] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState("Saved");

  useEffect(() => {
    setHydratedScenarioSlug(null);
    const savedProgress = getScenarioProgress(scenario.slug);
    const savedAnswer = savedProgress.draftAnswer;
    if (scenario.scenarioType === "mcq" && scenario.mcqOptions?.some((option) => option.id === savedAnswer)) {
      setSelectedOptionId(savedAnswer);
    } else {
      setAnswer(
        savedAnswer ||
          EXECUTABLE_PYSPARK_STARTERS[scenario.slug] ||
          scenario.brokenCode ||
          ""
      );
    }
    setInterviewAnswer(savedProgress.draftInterviewAnswer);
    setSelectedDiagnosisId("");
    setHintsRevealed(Math.min(savedProgress.hintsRevealed, scenario.hints.length));
    setProgress(summarizeScenarioProgress(savedProgress, scenario.slug));
    setSqlExecution(null);
    setPysparkExecution(null);
    setEvaluation(null);
    setEvaluationNotice(null);
    setModelSolutionVisible(false);
    setHydratedScenarioSlug(scenario.slug);
  }, [scenario]);

  useEffect(() => {
    if (hydratedScenarioSlug !== scenario.slug) return;
    const draft =
      scenario.scenarioType === "mcq" ? selectedOptionId : answer;
    setAutoSaveStatus("Saving...");
    const timer = window.setTimeout(() => {
      const nextProgress = saveScenarioDraft(
        scenario.slug,
        draft,
        interviewAnswer
      );
      setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
      setAutoSaveStatus(
        `Saved at ${new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit"
        }).format(new Date(nextProgress.draftSavedAt ?? Date.now()))}`
      );
    }, 500);

    return () => window.clearTimeout(timer);
  }, [
    answer,
    hydratedScenarioSlug,
    interviewAnswer,
    scenario.scenarioType,
    scenario.slug,
    selectedOptionId
  ]);

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
  const selectedDiagnosis = scenario.diagnosisOptions?.find(
    (option) => option.id === selectedDiagnosisId
  );
  const canRunSql =
    Boolean(scenario.expectedSql && scenario.sampleTables?.length) &&
    (scenario.scenarioType === "broken_sql" || scenario.scenarioType === "output_mismatch");
  const canRunPyspark = EXECUTABLE_PYSPARK_SCENARIOS.has(scenario.slug);
  const nextScenario = useMemo(() => {
    const scenarios = getScenarios();
    const index = scenarios.findIndex((item) => item.slug === scenario.slug);
    if (index < 0 || scenarios.length <= 1) return null;
    return scenarios[(index + 1) % scenarios.length];
  }, [scenario.slug]);
  const scenarioCompleted = Boolean(progress?.completed);
  const nextScenarioButtonClass = nextScenario && scenarioCompleted
    ? "rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(94,234,212,0.2)] transition hover:bg-teal-200"
    : "rounded-full border border-teal-300/30 px-5 py-3 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500";
  const promptLabel = useMemo(() => {
    if (scenario.scenarioType === "broken_sql") return "Write the corrected SQL";
    if (canRunPyspark) return "Write the corrected PySpark transformation";
    if (scenario.scenarioType === "broken_pyspark") return "Write the corrected PySpark approach";
    if (scenario.scenarioType === "log_analysis") return "Write your root-cause analysis";
    if (scenario.scenarioType === "output_mismatch") return "Explain and fix the mismatch";
    return "Write your answer";
  }, [canRunPyspark, scenario.scenarioType]);
  const submitLabel = useMemo(() => {
    if (canRunSql) return "Submit query";
    if (canRunPyspark) return "Submit fix";
    if (scenario.scenarioType === "broken_pyspark") return "Submit fix";
    if (scenario.scenarioType === "mcq") return "Submit answer";
    return "Submit answer";
  }, [canRunPyspark, canRunSql, scenario.scenarioType]);

  function revealHint() {
    const nextCount = Math.min(hintsRevealed + 1, scenario.hints.length);
    setHintsRevealed(nextCount);
    const nextProgress = setScenarioHintsRevealed(scenario.slug, nextCount);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
    trackEvent("hint_used", { scenario: scenario.slug, hint_number: nextCount });
  }

  function saveDraft() {
    const draft = scenario.scenarioType === "mcq" ? selectedOptionId : answer;
    const nextProgress = saveScenarioDraft(scenario.slug, draft, interviewAnswer);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
    setDraftMessage("Draft saved.");
  }

  function requireLoginForValidation(action: "run" | "submit") {
    const authToken = getAuthToken();
    const currentAuthUser = getCurrentUser();

    if (authToken && currentAuthUser) {
      return { authToken, currentAuthUser };
    }

    setDraftMessage(
      action === "run"
        ? "Log in or create an account to run this check."
        : "Log in or create an account to submit this answer."
    );
    setIsAuthOpen(true);
    trackEvent("signup_started", {
      source: action === "run" ? "scenario_run" : "scenario_submit",
      scenario: scenario.slug
    });
    return null;
  }

  async function checkAnswer() {
    const authSession = requireLoginForValidation("submit");
    if (!authSession) {
      return;
    }
    const { authToken } = authSession;

    const submittedAnswer =
      scenario.scenarioType === "mcq"
        ? selectedOptionId
        : `${answer}\n\nDiagnosis selected:\n${selectedDiagnosis ? `${selectedDiagnosis.id}. ${selectedDiagnosis.text}` : "Not selected"}\n\nInterview explanation:\n${interviewAnswer}`;
    setIsChecking(true);
    setSqlExecution(null);
    setPysparkExecution(null);
    setEvaluationNotice(null);

    try {
      let nextEvaluation = evaluateScenarioAnswer(scenario, submittedAnswer);
      let aiFallbackMessage: string | null = null;
      const runnableSqlResult =
        canRunSql && scenario.sampleTables && scenario.expectedSql
          ? await validateSqlOutput(scenario.sampleTables, answer, scenario.expectedSql)
          : null;
      const runnablePysparkResult = canRunPyspark
        ? await validatePysparkScenario(
            scenario.slug,
            {
              code: answer,
              mode: "hidden"
            },
            authToken
          )
        : null;

      if (runnableSqlResult) {
        setSqlExecution(runnableSqlResult);
      }
      if (runnablePysparkResult) {
        setPysparkExecution(runnablePysparkResult);
      }

      if (
        authToken &&
        scenario.scenarioType !== "mcq" &&
        submittedAnswer.trim().length > 0
      ) {
        try {
          const aiResult = await evaluateScenarioWithAi(authToken, {
            scenario_slug: scenario.slug,
            user_answer: submittedAnswer,
            context: {
              title: scenario.title,
              domain: scenario.domain,
              scenario_type: scenario.scenarioType,
              business_context: [
                scenario.businessContext,
                scenario.incident
                  ? `Incident ticket: ${scenario.incident.incidentId}
Severity: ${scenario.incident.severity}
Reported by: ${scenario.incident.reportedBy}
Reported at: ${scenario.incident.reportedAt}
Pipeline: ${scenario.incident.pipeline}
Expected: ${scenario.incident.expected}
Actual: ${scenario.incident.actual}
Impact: ${scenario.incident.impact}`
                  : ""
              ].filter(Boolean).join("\n\n").slice(0, 5000),
              problem_statement: scenario.problemStatement.slice(0, 7000),
              requirement: (scenario.requirement ?? scenario.tasks.join("\n")).slice(0, 5000),
              broken_code: [
                scenario.schema ? `Schema:\n${scenario.schema}` : "",
                scenario.sampleInput ? `Sample input:\n${scenario.sampleInput}` : "",
                scenario.evidence?.length
                  ? `Production evidence:\n${scenario.evidence
                      .map((item) => `- ${item.title} (${item.type}): ${item.summary} ${item.details}`)
                      .join("\n")}`
                  : "",
                scenario.brokenCode ? `Broken code:\n${scenario.brokenCode}` : ""
              ]
                .filter(Boolean)
                .join("\n\n")
                .slice(0, 12000),
              actual_output: (scenario.actualOutput ?? scenario.logs ?? "").slice(0, 5000),
              expected_output: (scenario.expectedOutput ?? "").slice(0, 5000),
              model_solution: scenario.modelSolution.slice(0, 12000),
              production_explanation: scenario.productionExplanation.slice(0, 10000),
              common_mistakes: scenario.commonMistakes.slice(0, 10),
              follow_ups: scenario.followUps.slice(0, 6),
              rubric: {
                root_cause: scenario.evaluationRubric.rootCause,
                correctness: scenario.evaluationRubric.correctness,
                production_thinking: scenario.evaluationRubric.productionThinking,
                tradeoffs: scenario.evaluationRubric.tradeoffs,
                communication: scenario.evaluationRubric.communication
              }
            }
          });
          nextEvaluation = {
            score: aiResult.score,
            verdict: aiResult.verdict,
            strengths: aiResult.strengths,
            gaps: aiResult.gaps,
            improvedAnswer: aiResult.improved_answer,
            rubricBreakdown: {
              rootCause: aiResult.rubric_breakdown.root_cause,
              correctness: aiResult.rubric_breakdown.correctness,
              productionThinking: aiResult.rubric_breakdown.production_thinking,
              tradeoffs: aiResult.rubric_breakdown.tradeoffs,
              communication: aiResult.rubric_breakdown.communication
            },
            mode: aiResult.mode,
            model: aiResult.model
          };
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : "The AI service returned an unknown error.";
          console.error("AI scenario evaluation failed:", reason);
          aiFallbackMessage = `AI evaluation could not run: ${reason} Rubric feedback is shown instead.`;
          setEvaluationNotice(aiFallbackMessage);
        }
      }

      const passed = runnableSqlResult
        ? runnableSqlResult.passed
        : runnablePysparkResult
          ? runnablePysparkResult.passed
          : nextEvaluation.score >= 70;
      const message = runnableSqlResult
        ? `${runnableSqlResult.passed ? "SQL passed" : "SQL output mismatch"} · ${nextEvaluation.score}/100 explanation score`
        : runnablePysparkResult
          ? `${runnablePysparkResult.passed ? "PySpark hidden tests passed" : "PySpark hidden tests failed"} · ${nextEvaluation.score}/100 explanation score`
        : `${nextEvaluation.verdict} · ${nextEvaluation.score}/100`;
      const nextProgress = recordScenarioAttempt(scenario.slug, {
        passed,
        answer: submittedAnswer,
        message
      });
      recordScenarioAiFeedback(scenario.slug, {
        totalScore:
          runnableSqlResult?.passed || runnablePysparkResult?.passed
            ? Math.max(nextEvaluation.score, 85)
            : nextEvaluation.score,
        strengths: runnableSqlResult?.passed
          ? ["Your SQL returned the expected result on the seeded data.", ...nextEvaluation.strengths]
          : runnablePysparkResult?.passed
            ? ["Your PySpark fix passed the hidden production-style tests.", ...nextEvaluation.strengths]
            : nextEvaluation.strengths,
        missingPoints:
          runnableSqlResult?.passed || runnablePysparkResult?.passed
            ? nextEvaluation.gaps
            : runnableSqlResult
              ? [runnableSqlResult.message, ...nextEvaluation.gaps]
              : runnablePysparkResult
                ? [
                    ...runnablePysparkResult.tests
                      .filter((test) => !test.passed)
                      .map((test) => `${test.name}: ${test.message}`),
                    ...nextEvaluation.gaps
                  ]
                : nextEvaluation.gaps,
        improvedAnswer: nextEvaluation.improvedAnswer,
        followUpQuestions: scenario.followUps
      });
      setEvaluation(nextEvaluation);
      setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
      setDraftMessage(aiFallbackMessage);
      sendUsageEvent("scenario_submitted", {
        metadata: {
          scenario_slug: scenario.slug,
          scenario_type: scenario.scenarioType,
          domain: scenario.domain,
          passed,
          score: nextEvaluation.score,
          sql_passed: runnableSqlResult?.passed ?? null,
          pyspark_passed: runnablePysparkResult?.passed ?? null
        }
      });
      trackEvent("first_lab_submitted", {
        scenario: scenario.slug,
        type: scenario.scenarioType,
        passed,
        evaluation_mode: nextEvaluation.mode
      });
      if (passed) {
        setDraftMessage(
          nextScenario
            ? "Correct. This scenario is completed. Use Next scenario when you are ready."
            : "Correct. This scenario is completed."
        );
        sendUsageEvent("scenario_completed", {
          metadata: {
            scenario_slug: scenario.slug,
            scenario_type: scenario.scenarioType,
            domain: scenario.domain
          }
        });
        trackEvent("lab_completed", { scenario: scenario.slug });
      } else {
        setDraftMessage("Not correct yet. Review the feedback, adjust your answer, and submit again.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The query checker could not run this answer.";
      const nextProgress = recordScenarioAttempt(scenario.slug, {
        passed: false,
        answer: submittedAnswer,
        message
      });
      setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
      if (canRunPyspark) {
        setPysparkExecution({
          validation_type: "PYSPARK_OUTPUT_MATCH",
          mode: "hidden",
          passed: false,
          message,
          tests: [
            {
              name: "executor",
              passed: false,
              message,
              actual_output: null,
              expected_output: null
            }
          ],
          execution_engine: "remote"
        });
      } else {
        setSqlExecution({
          passed: false,
          message,
          actual: { columns: [], rows: [] },
          expected: { columns: [], rows: [] }
        });
      }
      setDraftMessage(null);
    } finally {
      setIsChecking(false);
    }
  }

  async function runSampleCheck() {
    const authSession = requireLoginForValidation("run");
    if (!authSession) {
      return;
    }

    if (
      !canRunPyspark &&
      (!canRunSql || !scenario.sampleTables || !scenario.expectedSql)
    ) {
      return;
    }
    setIsChecking(true);
    setSqlExecution(null);
    setPysparkExecution(null);
    try {
      if (canRunPyspark) {
        const result = await validatePysparkScenario(scenario.slug, {
          code: answer,
          mode: "sample"
        }, authSession.authToken);
        setPysparkExecution(result);
        setDraftMessage(
          result.passed
            ? "Visible PySpark sample passed. Submit for hidden production-style tests."
            : "Visible PySpark sample found an output mismatch."
        );
      } else if (scenario.sampleTables && scenario.expectedSql) {
        const result = await validateSqlOutput(
          scenario.sampleTables,
          answer,
          scenario.expectedSql
        );
        setSqlExecution(result);
        setDraftMessage(
          result.passed
            ? "Visible sample check passed. Submit for the complete evaluation."
            : "Visible sample check found an output mismatch."
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The query could not be run.";
      if (canRunPyspark) {
        setPysparkExecution({
          validation_type: "PYSPARK_OUTPUT_MATCH",
          mode: "sample",
          passed: false,
          message,
          tests: [
            {
              name: "executor",
              passed: false,
              message,
              actual_output: null,
              expected_output: null
            }
          ],
          execution_engine: "remote"
        });
        setDraftMessage("PySpark sample execution failed.");
      } else {
        setSqlExecution({
          passed: false,
          message,
          actual: { columns: [], rows: [] },
          expected: { columns: [], rows: [] }
        });
        setDraftMessage("Query execution failed.");
      }
    } finally {
      setIsChecking(false);
    }
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
    sendUsageEvent("scenario_completed", {
      metadata: {
        scenario_slug: scenario.slug,
        scenario_type: scenario.scenarioType,
        domain: scenario.domain
      }
    });
    trackEvent("lab_completed", { scenario: scenario.slug });
    setDraftMessage(
      nextScenario
        ? "Marked complete. Use Next scenario when you are ready."
        : "Marked complete."
    );
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

  const scenarioSections = [
    ...(scenario.incident ? [["Incident", "#incident"] as const] : []),
    ["Context", "#context"] as const,
    ...(scenario.evidence?.length ? [["Evidence", "#evidence"] as const] : []),
    ...(scenario.diagnosisOptions?.length ? [["Diagnosis", "#diagnosis"] as const] : []),
    ["Data", "#data"] as const,
    ["Broken code", "#broken-code"] as const,
    ["Attempt", "#attempt"] as const,
    ["Explanation", "#explanation"] as const,
    ["Rubric", "#rubric"] as const
  ];

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
              {scenarioSections.map(([label, href]) => (
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

          {scenario.incident ? <IncidentCommandCenter incident={scenario.incident} /> : null}

          <InfoSection id="context" title="Scenario context" body={scenario.problemStatement} />
          <InfoSection title="Business requirement" body={scenario.requirement ?? ""} />

          {scenario.evidence?.length ? (
            <section id="evidence" className="panel scroll-mt-32 rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
                Production evidence board
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                Inspect the artifacts before touching code
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                This is how real incidents feel: business ticket, orchestration logs,
                source freshness, code review, and warehouse validation all point to the answer.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {scenario.evidence.map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    className="rounded-3xl border border-slate-800 bg-slate-950/40 p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-50">{item.title}</p>
                      <span className="rounded-full border border-teal-300/25 bg-teal-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-100">
                        {item.type}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-200">
                      {item.summary}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {item.details}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {scenario.diagnosisOptions?.length ? (
            <section id="diagnosis" className="panel scroll-mt-32 rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
                Step 1: diagnose like on-call
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                What is the most likely root cause?
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Choose your diagnosis before writing the fix. This builds the production
                judgment interviewers are actually testing.
              </p>
              <div className="mt-5 grid gap-3">
                {scenario.diagnosisOptions.map((option) => {
                  const isSelected = selectedDiagnosisId === option.id;
                  const showResult = Boolean(selectedDiagnosisId && isSelected);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedDiagnosisId(option.id)}
                      className={`rounded-3xl border p-4 text-left transition ${
                        isSelected
                          ? option.isCorrect
                            ? "border-teal-300/55 bg-teal-300/10"
                            : "border-amber-300/55 bg-amber-300/10"
                          : "border-slate-800 bg-slate-950/35 hover:border-teal-300/30"
                      }`}
                    >
                      <p className="text-sm font-semibold leading-6 text-slate-100">
                        {option.id}. {option.text}
                      </p>
                      {showResult ? (
                        <p
                          className={`mt-3 text-sm leading-6 ${
                            option.isCorrect ? "text-teal-100" : "text-amber-100"
                          }`}
                        >
                          {option.isCorrect ? "Good diagnosis. " : "Not the primary issue. "}
                          {option.explanation}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {scenario.sampleTables?.length ? (
            <section id="data" className="panel scroll-mt-32 rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
                Sample production data
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Use these small tables to reason about the bug before writing the fix.
                This data is used for the visible sample check when you click Run.
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
                    ? "Write the corrected query, run it against the sample tables, and compare the result with the expected output."
                    : canRunPyspark
                      ? "Create a DataFrame named daily_sales or fixed_daily_sales. Run checks the visible sample; Submit fix runs hidden late-data edge cases."
                    : "Think before revealing the answer. A partial but honest attempt is better practice than reading the model solution first."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {draftMessage ? (
                  <p className="text-sm font-semibold text-teal-100">{draftMessage}</p>
                ) : null}
                {canRunSql || canRunPyspark ? (
                  <>
                    {canRunSql ? (
                      <button
                        type="button"
                        onClick={copySchema}
                        className="rounded-full border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
                      >
                        Copy schema
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={runSampleCheck}
                      disabled={isChecking}
                      className="rounded-full border border-teal-300/35 px-5 py-3 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10 disabled:opacity-60"
                    >
                      {canRunPyspark ? "Run sample" : "Run"}
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
	                  className={nextScenarioButtonClass}
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
                    onClick={() => {
                      setSelectedOptionId(option.id);
                      setEvaluation(null);
                    }}
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
                onChange={(event) => {
                  setAnswer(event.target.value);
                  setSqlExecution(null);
                  setPysparkExecution(null);
                  setEvaluation(null);
                  setDraftMessage(null);
                }}
                onKeyDown={(event) =>
                  handleTextareaTabKeyDown(event, (nextValue) => {
                    setAnswer(nextValue);
                    setSqlExecution(null);
                    setPysparkExecution(null);
                    setEvaluation(null);
                    setDraftMessage(null);
                  })
                }
                rows={13}
                className="mt-5 w-full rounded-3xl border border-slate-800 bg-slate-950/80 p-5 font-mono text-sm leading-7 text-slate-100 outline-none transition focus:border-teal-300/50"
                placeholder="Write your fix, diagnosis, or production-safe approach here."
              />
            )}

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {autoSaveStatus}
            </p>
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
                onChange={(event) => {
                  setInterviewAnswer(event.target.value);
                  setEvaluation(null);
                }}
                onKeyDown={(event) =>
                  handleTextareaTabKeyDown(event, (nextValue) => {
                    setInterviewAnswer(nextValue);
                    setEvaluation(null);
                  })
                }
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
                className={nextScenarioButtonClass}
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

          {sqlExecution ? <ScenarioSqlResultPanel result={sqlExecution} /> : null}
          {pysparkExecution ? <ScenarioPysparkResultPanel result={pysparkExecution} /> : null}

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
              {evaluationNotice ? (
                <section
                  role="status"
                  className="rounded-[2rem] border border-amber-300/30 bg-amber-300/10 p-5"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
                    AI evaluation fallback
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-100">
                    {evaluationNotice}
                  </p>
                </section>
              ) : null}
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
	                      Mark complete
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
                      Your progress is saved. Create an account to build your learner profile
                      and unlock the complete practice journey.
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
                Mark completed
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

          {scenario.productionChecklist?.length ? (
            <div className="panel rounded-[2rem] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
                On-call checklist
              </p>
              <div className="mt-4 space-y-3">
                {scenario.productionChecklist.map((item, index) => (
                  <div
                    key={item}
                    className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950/35 p-3 text-sm leading-6 text-slate-300"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-300 text-xs font-black text-slate-950">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

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

function IncidentCommandCenter({ incident }: { incident: ScenarioIncident }) {
  const incidentStats = [
    ["Severity", incident.severity],
    ["Reported by", incident.reportedBy],
    ["Reported at", incident.reportedAt],
    ["Pipeline", incident.pipeline],
    ["Owner", incident.owner],
    ["Impact", incident.impact]
  ];

  return (
    <section
      id="incident"
      className="scroll-mt-32 overflow-hidden rounded-[2rem] border border-amber-300/25 bg-slate-950/60 shadow-2xl shadow-slate-950/30"
    >
      <div className="border-b border-slate-800 bg-amber-300/10 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
          Production incident room
        </p>
        <div className="mt-3 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-2xl font-semibold text-slate-50">{incident.incidentId}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              You are the data engineer on-call. Business is waiting for a clear diagnosis,
              a safe fix, and a prevention plan.
            </p>
          </div>
          <span className="w-fit rounded-full border border-amber-300/40 bg-amber-300 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-950">
            Live incident
          </span>
        </div>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {incidentStats.map(([label, value]) => (
          <div
            key={label}
            className="rounded-3xl border border-slate-800 bg-slate-950/45 p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-100">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 border-t border-slate-800 p-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-teal-300/20 bg-teal-300/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">
            Expected business state
          </p>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">
            {incident.expected}
          </p>
        </div>
        <div className="rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
            Current broken state
          </p>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">
            {incident.actual}
          </p>
        </div>
      </div>
    </section>
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
	          : "border-amber-300/30 bg-amber-300/10"
	      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-[0.24em] ${
	          result.passed ? "text-teal-100" : "text-amber-100"
        }`}
      >
        {result.passed ? "Correct answer" : "Wrong answer"}
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-200">{result.message}</p>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ResultTable title="Your output" table={result.actual} />
        <ResultTable title="Expected output" table={result.expected} />
      </div>
    </section>
  );
}

function ScenarioPysparkResultPanel({ result }: { result: PysparkValidationResponse }) {
  return (
    <section
      className={`rounded-[2rem] border p-6 ${
        result.passed
          ? "border-teal-300/25 bg-teal-300/10"
          : "border-amber-300/30 bg-amber-300/10"
      }`}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p
            className={`text-xs font-semibold uppercase tracking-[0.24em] ${
              result.passed ? "text-teal-100" : "text-amber-100"
            }`}
          >
            {result.passed ? "PySpark tests passed" : "PySpark tests failed"}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-200">{result.message}</p>
        </div>
        <span className="w-fit rounded-full border border-slate-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
          {result.mode === "sample" ? "Visible sample" : "Hidden tests"} · {result.execution_engine}
        </span>
      </div>
      <div className="mt-5 grid gap-4">
        {result.tests.map((test) => (
          <div
            key={test.name}
            className={`rounded-3xl border p-4 ${
              test.passed
                ? "border-teal-300/20 bg-slate-950/40"
                : "border-amber-300/25 bg-slate-950/50"
            }`}
          >
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <h3 className="text-sm font-semibold text-slate-100">{test.name}</h3>
              <span
                className={`w-fit rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${
                  test.passed
                    ? "bg-teal-300 text-slate-950"
                    : "bg-amber-300 text-slate-950"
                }`}
              >
                {test.passed ? "Passed" : "Mismatch"}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{test.message}</p>
            {test.actual_output && test.expected_output ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <ResultTable title="Your output" table={test.actual_output} />
                <ResultTable title="Expected output" table={test.expected_output} />
              </div>
            ) : null}
          </div>
        ))}
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
