"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { trackEvent } from "../../lib/analytics";
import {
  evaluateScenarioWithAi,
  getLearnerProgress,
  saveLearnerAttempt,
  saveLearnerDraft,
  validatePysparkScenario
} from "../../lib/api";
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
  migrateGuestScenarioProgressToUser,
  recordScenarioAiFeedback,
  recordScenarioAttempt,
  saveScenarioDraft,
  setScenarioHintsRevealed,
  summarizeScenarioProgress,
  type ScenarioProgressSummary
} from "../../lib/progress";
import { scenarioProgressFromRemote } from "../../lib/learner-progress";
import { evaluateScenarioAnswer, type ScenarioEvaluationResult } from "../../lib/scenarioEvaluator";
import { sendUsageEvent } from "../../lib/usage";
import { handleTextareaTabKeyDown } from "../../lib/textarea-tab";
import type { PysparkValidationResponse } from "../../lib/types";
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
import { rememberAuthIntent } from "../../lib/auth-flow";
import { useAuthContinuation, useAuthDraftFlush } from "../../lib/use-auth-continuation";
import { PremiumAccessBadge } from "../premium-access-badge";
import { getPracticeStatus, PracticeStatusBadge } from "../practice-status-badge";

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
  const [referenceTab, setReferenceTab] = useState<"task" | "data" | "broken">("task");
  const [workspaceStep, setWorkspaceStep] = useState<"fix" | "explain" | "review">("fix");
  const [mobileReferenceOpen, setMobileReferenceOpen] = useState(false);
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
  const [autoSaveStatus, setAutoSaveStatus] = useState("Preparing save...");
  const [completionStatus, setCompletionStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [authEpoch, setAuthEpoch] = useState(0);
  const draftRevisionRef = useRef(0);
  const pendingAttemptRef = useRef({ slug: "", answer: "", key: "" });
  const authIntentKey = `scenario:${scenario.slug}`;
  useAuthDraftFlush(() => {
    if (hydratedScenarioSlug === scenario.slug) {
      saveScenarioDraft(scenario.slug, scenario.scenarioType === "mcq" ? selectedOptionId : answer, interviewAnswer, selectedDiagnosisId);
    }
  });
  useAuthContinuation(authIntentKey, persistenceReady && hydratedScenarioSlug === scenario.slug && !isChecking, (action) => {
    if (action === "submit") void checkAnswer();
    if (action === "run") void runSampleCheck();
  });

  useEffect(() => {
    const syncAuth = () => setAuthEpoch((value) => value + 1);
    window.addEventListener(AUTH_UPDATED_EVENT, syncAuth);
    window.addEventListener("storage", syncAuth);
    return () => {
      window.removeEventListener(AUTH_UPDATED_EVENT, syncAuth);
      window.removeEventListener("storage", syncAuth);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrateProgress() {
      const authToken = getAuthToken();
      const authUser = getCurrentUser();
      setPersistenceReady(!authToken);
      setHydratedScenarioSlug(null);
      const migrated =
        authToken && authUser ? migrateGuestScenarioProgressToUser(authUser.id) : null;
      const savedProgress = migrated?.[scenario.slug] ?? getScenarioProgress(scenario.slug);
      const savedAnswer = savedProgress.draftAnswer;
      if (
        scenario.scenarioType === "mcq" &&
        scenario.mcqOptions?.some((option) => option.id === savedAnswer)
      ) {
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
      setSelectedDiagnosisId(scenario.diagnosisOptions?.some((option) => option.id === savedProgress.draftDiagnosisId) ? savedProgress.draftDiagnosisId ?? "" : "");
      setHintsRevealed(Math.min(savedProgress.hintsRevealed, scenario.hints.length));
      setProgress(summarizeScenarioProgress(savedProgress, scenario.slug));
      setCompletionStatus(savedProgress.completed ? "saved" : "idle");
      setCompletionMessage(null);
      setSqlExecution(null);
      setPysparkExecution(null);
      setEvaluation(null);
      setEvaluationNotice(null);
      setModelSolutionVisible(false);

      if (!authToken) {
        setAutoSaveStatus("Saved on this device");
        setHydratedScenarioSlug(scenario.slug);
        return;
      }

      try {
        const response = await getLearnerProgress(authToken);
        if (cancelled) return;
        const record = response.items.find(
          (item) => item.content_type === "scenario" && item.content_id === scenario.slug
        );
        const localRevision = Date.parse(savedProgress.draftSavedAt ?? "") || 0;
        const remoteRevision = record?.draft_revision ?? 0;
        const localHasState = Boolean(
          savedProgress.draftSavedAt ||
            savedProgress.completed ||
            savedProgress.hintsRevealed > 0
        );
        const localShouldSync = Boolean(
          localHasState &&
            (!record ||
              localRevision > remoteRevision ||
              (savedProgress.completed && !record.completed) ||
              savedProgress.hintsRevealed > record.hints_revealed)
        );

        let resolvedProgress = record
          ? scenarioProgressFromRemote(record)
          : savedProgress;
        if (record && (localRevision > remoteRevision || savedProgress.completed)) {
          resolvedProgress = {
            ...resolvedProgress,
            completed: resolvedProgress.completed || savedProgress.completed,
            completedAt: resolvedProgress.completedAt ?? savedProgress.completedAt,
            hintsRevealed: Math.max(
              resolvedProgress.hintsRevealed,
              savedProgress.hintsRevealed
            ),
            draftAnswer:
              localRevision > remoteRevision
                ? savedProgress.draftAnswer
                : resolvedProgress.draftAnswer,
            draftInterviewAnswer:
              localRevision > remoteRevision
                ? savedProgress.draftInterviewAnswer
                : resolvedProgress.draftInterviewAnswer,
            draftSavedAt:
              localRevision > remoteRevision
                ? savedProgress.draftSavedAt
                : resolvedProgress.draftSavedAt,
            attempts:
              resolvedProgress.attempts.length > 0
                ? resolvedProgress.attempts
                : savedProgress.attempts,
            latestResult: resolvedProgress.latestResult ?? savedProgress.latestResult,
            aiFeedback: resolvedProgress.aiFeedback ?? savedProgress.aiFeedback,
            aiScore: resolvedProgress.aiScore ?? savedProgress.aiScore
          };
        }

        if (localShouldSync) {
          const saved = await saveLearnerDraft(authToken, "scenario", scenario.slug, {
            draft_answer: resolvedProgress.draftAnswer,
            draft_interview_answer: resolvedProgress.draftInterviewAnswer,
            hints_revealed: resolvedProgress.hintsRevealed,
            client_revision: Math.max(localRevision, Date.now()),
            completed: resolvedProgress.completed || undefined
          });
          resolvedProgress = scenarioProgressFromRemote(saved.item);
        }

        if (cancelled) return;
        const resolvedAnswer = resolvedProgress.draftAnswer;
        if (
          scenario.scenarioType === "mcq" &&
          scenario.mcqOptions?.some((option) => option.id === resolvedAnswer)
        ) {
          setSelectedOptionId(resolvedAnswer);
        } else if (resolvedAnswer) {
          setAnswer(resolvedAnswer);
        }
        setInterviewAnswer(resolvedProgress.draftInterviewAnswer);
        setHintsRevealed(
          Math.min(resolvedProgress.hintsRevealed, scenario.hints.length)
        );
        setProgress(summarizeScenarioProgress(resolvedProgress, scenario.slug));
        setCompletionStatus(resolvedProgress.completed ? "saved" : "idle");
        setAutoSaveStatus("Saved to your account");
        const snapshot = resolvedProgress.latestResult as {
          evaluation?: ScenarioEvaluationResult;
          sqlExecution?: BrowserSqlValidationResult | null;
          pysparkExecution?: PysparkValidationResponse | null;
          evaluationNotice?: string | null;
        } | null;
        if (snapshot) {
          setEvaluation(snapshot.evaluation ?? null);
          setSqlExecution(snapshot.sqlExecution ?? null);
          setPysparkExecution(snapshot.pysparkExecution ?? null);
          setEvaluationNotice(snapshot.evaluationNotice ?? null);
        }
      } catch {
        if (!cancelled) {
          setAutoSaveStatus("Account sync failed — local recovery copy kept");
        }
      } finally {
        if (!cancelled) {
          setPersistenceReady(true);
          setHydratedScenarioSlug(scenario.slug);
        }
      }
    }

    void hydrateProgress();

    return () => {
      cancelled = true;
    };
  }, [authEpoch, scenario]);

  useEffect(() => {
    if (hydratedScenarioSlug !== scenario.slug || !persistenceReady) return;
    const draft =
      scenario.scenarioType === "mcq" ? selectedOptionId : answer;
    const authToken = getAuthToken();
    setAutoSaveStatus(
      authToken ? "Saving to your account..." : "Saving on this device..."
    );
    const timer = window.setTimeout(() => {
      const nextProgress = saveScenarioDraft(
        scenario.slug,
        draft,
        interviewAnswer,
        selectedDiagnosisId
      );
      setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
      const authToken = getAuthToken();
      if (!authToken) {
        setAutoSaveStatus(
          `Saved on this device at ${new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit"
          }).format(new Date(nextProgress.draftSavedAt ?? Date.now()))}`
        );
        return;
      }

      const revision = Date.now();
      draftRevisionRef.current = revision;
      saveLearnerDraft(authToken, "scenario", scenario.slug, {
        draft_answer: draft,
        draft_interview_answer: interviewAnswer,
        hints_revealed: hintsRevealed,
        client_revision: revision
      })
        .then(() => {
          if (draftRevisionRef.current === revision) {
            setAutoSaveStatus(
              `Saved to your account at ${new Intl.DateTimeFormat(undefined, {
                hour: "numeric",
                minute: "2-digit"
              }).format(new Date())}`
            );
          }
        })
        .catch(() => {
          if (draftRevisionRef.current === revision) {
            setAutoSaveStatus("Account sync failed — retry save");
          }
        });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [
    answer,
    hydratedScenarioSlug,
    interviewAnswer,
    hintsRevealed,
    persistenceReady,
    scenario.scenarioType,
    scenario.slug,
    selectedOptionId,
    selectedDiagnosisId
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
  const allScenarios = useMemo(() => getScenarios(), []);
  const nextScenario = useMemo(() => {
    const index = allScenarios.findIndex((item) => item.slug === scenario.slug);
    if (index < 0) return null;
    return allScenarios[index + 1] ?? null;
  }, [allScenarios, scenario.slug]);
  const previousScenario = useMemo(() => {
    const index = allScenarios.findIndex((item) => item.slug === scenario.slug);
    return index > 0 ? allScenarios[index - 1] ?? null : null;
  }, [allScenarios, scenario.slug]);
  const scenarioCompleted = Boolean(progress?.completed);
  const initialAnswer =
    EXECUTABLE_PYSPARK_STARTERS[scenario.slug] ?? scenario.brokenCode ?? "";
  const scenarioInProgress = Boolean(
    (progress?.attemptCount ?? 0) > 0 ||
      hintsRevealed > 0 ||
      selectedDiagnosisId ||
      selectedOptionId ||
      interviewAnswer.trim() ||
      evaluation ||
      modelSolutionVisible ||
      (scenario.scenarioType !== "mcq" && answer.trim() !== initialAnswer.trim())
  );
  const scenarioStatus = getPracticeStatus(scenarioCompleted, scenarioInProgress);
  const completionButtonLabel =
    completionStatus === "saving"
      ? "Saving..."
      : completionStatus === "error"
        ? "Retry completion"
        : scenarioCompleted
          ? "Completed"
          : "Mark complete";
  const completionButtonDisabled =
    completionStatus === "saving" || (scenarioCompleted && completionStatus !== "error");
  const completionButtonClass = scenarioCompleted && completionStatus !== "error"
    ? "rounded-full border border-teal-300/30 bg-teal-300/10 px-5 py-3 text-sm font-semibold text-teal-100"
    : completionStatus === "error"
      ? "rounded-full border border-amber-300/50 bg-amber-300/10 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20"
      : "rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-wait disabled:opacity-70";
  const canGoToNextScenario = Boolean(nextScenario);
  const nextScenarioButtonClass = canGoToNextScenario
    ? "rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(94,234,212,0.2)] transition hover:bg-teal-200"
    : "rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-500 disabled:cursor-not-allowed";
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

  useEffect(() => {
    if (evaluation) setWorkspaceStep("review");
  }, [evaluation]);

  function revealHint() {
    const nextCount = Math.min(hintsRevealed + 1, scenario.hints.length);
    setHintsRevealed(nextCount);
    const nextProgress = setScenarioHintsRevealed(scenario.slug, nextCount);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
    const authToken = getAuthToken();
    if (authToken && persistenceReady) {
      const draft = scenario.scenarioType === "mcq" ? selectedOptionId : answer;
      saveLearnerDraft(authToken, "scenario", scenario.slug, {
        draft_answer: draft,
        draft_interview_answer: interviewAnswer,
        hints_revealed: nextCount,
        client_revision: Date.now()
      }).catch(() => setAutoSaveStatus("Account sync failed — retry save"));
    }
    trackEvent("hint_used", { scenario: scenario.slug, hint_number: nextCount });
  }

  function saveDraft() {
    const draft = scenario.scenarioType === "mcq" ? selectedOptionId : answer;
    const nextProgress = saveScenarioDraft(scenario.slug, draft, interviewAnswer, selectedDiagnosisId);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
    const authToken = getAuthToken();
    if (!authToken) {
      setAutoSaveStatus("Saved on this device");
      setDraftMessage("Draft saved on this device.");
      return;
    }
    setAutoSaveStatus("Saving to your account...");
    saveLearnerDraft(authToken, "scenario", scenario.slug, {
      draft_answer: draft,
      draft_interview_answer: interviewAnswer,
      hints_revealed: hintsRevealed,
      client_revision: Date.now()
    })
      .then(() => setAutoSaveStatus("Saved to your account"))
      .then(() => setDraftMessage("Draft saved to your account."))
      .catch(() => setAutoSaveStatus("Account sync failed — retry save"));
  }

  function getAttemptKey(answerText: string): string {
    if (pendingAttemptRef.current.slug === scenario.slug && pendingAttemptRef.current.answer === answerText) {
      return pendingAttemptRef.current.key;
    }
    const key = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingAttemptRef.current = { slug: scenario.slug, answer: answerText, key };
    return key;
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
    saveDraft();
    rememberAuthIntent(authIntentKey, action);
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
      const aiFeedback = {
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
        followUpQuestions: scenario.followUps,
        evaluatedAt: new Date().toISOString()
      };
      const latestResult = {
        evaluation: nextEvaluation,
        sqlExecution: runnableSqlResult,
        pysparkExecution: runnablePysparkResult,
        evaluationNotice: aiFallbackMessage
      };
      const nextProgress = recordScenarioAttempt(scenario.slug, {
        passed,
        answer: submittedAnswer,
        message,
        latestResult
      });
      const feedbackEntry = recordScenarioAiFeedback(scenario.slug, aiFeedback);
      setEvaluation(nextEvaluation);
      setProgress(summarizeScenarioProgress(feedbackEntry ?? nextProgress, scenario.slug));
      setDraftMessage(aiFallbackMessage);
      if (authToken && persistenceReady) {
        try {
          const persisted = await saveLearnerAttempt(authToken, "scenario", scenario.slug, {
            idempotency_key: getAttemptKey(submittedAnswer),
            answer: submittedAnswer,
            passed,
            message,
            result: latestResult,
            ai_feedback: aiFeedback
          });
          const persistedProgress = scenarioProgressFromRemote(persisted.item);
          setProgress(summarizeScenarioProgress(persistedProgress, scenario.slug));
          if (passed) {
            setCompletionStatus("saved");
            setCompletionMessage("Completed and saved to your account.");
            setAutoSaveStatus("Saved to your account");
          }
          pendingAttemptRef.current = { slug: "", answer: "", key: "" };
        } catch {
          setDraftMessage("Feedback is shown, but it could not be saved to your account. Please retry submit.");
          setAutoSaveStatus("Account sync failed — retry save");
          if (passed) {
            setCompletionStatus("error");
            setCompletionMessage(
              "Completed on this device, but not saved to your account. Retry submit."
            );
          }
        }
      }
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
      if (authToken && persistenceReady) {
        try {
          await saveLearnerAttempt(authToken, "scenario", scenario.slug, {
            idempotency_key: getAttemptKey(submittedAnswer),
            answer: submittedAnswer,
            passed: false,
            message,
            result: {
              evaluation: null,
              sqlExecution: null,
              pysparkExecution: null,
              evaluationNotice: message
            },
            ai_feedback: null
          });
        } catch {
          setAutoSaveStatus("Account sync failed — retry save");
        }
      }
      setDraftMessage(null);
    } finally {
      setIsChecking(false);
    }
  }

  async function runSampleCheck() {
    const authSession = scenario.isFree ? { authToken: getAuthToken() } : requireLoginForValidation("run");
    if (!authSession) {
      return;
    }

    if (
      !canRunPyspark &&
      (!canRunSql || !scenario.sampleTables || !scenario.expectedSql)
    ) {
      return;
    }
    sendUsageEvent("sample_run_started", { metadata: { content_id: scenario.slug, content_type: "scenario" } });
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

  async function completeLab() {
    if (completionStatus === "saving") return;
    const nextProgress = markScenarioCompleted(scenario.slug);
    setProgress(summarizeScenarioProgress(nextProgress, scenario.slug));
    setCompletionMessage(null);
    const authToken = getAuthToken();
    if (authToken && persistenceReady) {
      const draft = scenario.scenarioType === "mcq" ? selectedOptionId : answer;
      setCompletionStatus("saving");
      setAutoSaveStatus("Saving completion to your account...");
      try {
        const response = await saveLearnerDraft(authToken, "scenario", scenario.slug, {
          draft_answer: draft,
          draft_interview_answer: interviewAnswer,
          hints_revealed: hintsRevealed,
          client_revision: Date.now(),
          completed: true
        });
        const persistedProgress = scenarioProgressFromRemote(response.item);
        setProgress(summarizeScenarioProgress(persistedProgress, scenario.slug));
        setCompletionStatus("saved");
        setCompletionMessage("Completed and saved to your account.");
        setAutoSaveStatus("Saved to your account");
      } catch {
        setCompletionStatus("error");
        setCompletionMessage(
          "Completed on this device, but not saved to your account. Retry completion."
        );
        setAutoSaveStatus("Account sync failed — retry save");
        return;
      }
    } else {
      setCompletionStatus("saved");
      setCompletionMessage(
        authToken
          ? "Completed on this device. Account sync will retry when loading finishes."
          : "Completed on this device. Sign in to keep it across devices."
      );
      setAutoSaveStatus("Saved on this device");
    }
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
    setWorkspaceStep("review");
    trackEvent("model_solution_revealed", { scenario: scenario.slug });
  }

  function goToNextScenario() {
    if (!nextScenario) return;
    router.push(`/scenarios/${nextScenario.slug}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToPreviousScenario() {
    if (!previousScenario) return;
    router.push(`/scenarios/${previousScenario.slug}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function tryFollowUp() {
    setActiveFollowUpIndex((current) => (current + 1) % Math.max(1, scenario.followUps.length));
    setEvaluation(null);
    setModelSolutionVisible(false);
    setWorkspaceStep("fix");
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <header className="mb-3 rounded-[2rem] border border-slate-800 bg-slate-950/45 p-4 sm:mb-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:gap-5 xl:flex-row xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <PracticeStatusBadge status={scenarioStatus} />
              <div className="hidden flex-wrap items-center gap-2 sm:flex">
                <Badge>{formatDomain(scenario.domain)}</Badge>
                <Badge>{formatDifficulty(scenario.difficulty)}</Badge>
                <Badge>{formatScenarioType(scenario.scenarioType)}</Badge>
              </div>
              {scenario.isFree ? <span className="hidden rounded-full border border-teal-300/25 bg-teal-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-100 sm:inline-flex">Free</span> : <PremiumAccessBadge locked={false} />}
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-slate-50 sm:mt-4 sm:text-3xl">
              {scenario.title}
            </h1>
            <p className="mt-2 hidden max-w-4xl text-sm leading-6 text-slate-300 sm:block">
              {scenario.requirement || scenario.businessContext}
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 xl:w-80">
          <label className="block w-full">
            <span className="mb-2 hidden text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 sm:block">
              Choose scenario
            </span>
            <select
              value={scenario.slug}
              onChange={(event) => router.push(`/scenarios/${event.target.value}`)}
              aria-label="Choose scenario"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-slate-100 outline-none transition focus:border-teal-300/50 sm:py-3"
            >
              {allScenarios.map((item) => (
                <option key={item.slug} value={item.slug}>{item.title}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={goToPreviousScenario} disabled={!previousScenario} className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:text-slate-600">← Previous</button>
            <button type="button" onClick={goToNextScenario} disabled={!nextScenario} className="rounded-full border border-teal-300/30 px-4 py-2 text-sm font-semibold text-teal-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-600">Next →</button>
          </div>
          </div>
        </div>
      </header>

      {mobileReferenceOpen ? (
        <button
          type="button"
          aria-label="Close reference panel"
          onClick={() => setMobileReferenceOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(320px,0.88fr)_minmax(0,1.35fr)] lg:items-start">
        <aside className={`${mobileReferenceOpen ? "fixed inset-x-3 bottom-3 top-16 z-50 flex" : "hidden"} min-w-0 flex-col overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100vh-7rem)]`}>
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">Reference</p>
            <button
              type="button"
              onClick={() => setMobileReferenceOpen(false)}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 lg:hidden"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 border-b border-slate-800 p-2" role="tablist" aria-label="Scenario reference">
            {(["task", "data", "broken"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={referenceTab === tab}
                onClick={() => setReferenceTab(tab)}
                className={`rounded-xl px-3 py-2.5 text-xs font-semibold capitalize transition ${referenceTab === tab ? "bg-teal-300 text-slate-950" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"}`}
              >
                {tab === "broken" ? "Broken code" : tab}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
            {referenceTab === "task" ? (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Problem</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">{scenario.problemStatement}</p>
                </div>
                <div className="rounded-2xl border border-teal-300/20 bg-teal-300/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">Required outcome</p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-100">{scenario.requirement || scenario.businessContext}</p>
                </div>
                {scenario.incident ? (
                  <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-amber-100">{scenario.incident.incidentId}</p>
                      <span className="text-xs font-bold uppercase tracking-[0.16em] text-amber-200">{scenario.incident.severity}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-200">{scenario.incident.impact}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">Pipeline: {scenario.incident.pipeline} · Owner: {scenario.incident.owner}</p>
                  </div>
                ) : null}
                {scenario.evidence?.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Evidence</p>
                    <div className="mt-3 space-y-3">
                      {scenario.evidence.map((item, index) => (
                        <div key={`${item.title}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-200">{item.type}</span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{item.summary}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{item.details}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {scenario.diagnosisOptions?.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Your diagnosis</p>
                    <div className="mt-3 space-y-2">
                      {scenario.diagnosisOptions.map((option) => {
                        const isSelected = selectedDiagnosisId === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setSelectedDiagnosisId(option.id)}
                            className={`w-full rounded-2xl border p-3 text-left text-sm leading-6 transition ${isSelected ? option.isCorrect ? "border-teal-300/50 bg-teal-300/10 text-teal-100" : "border-amber-300/50 bg-amber-300/10 text-amber-100" : "border-slate-800 bg-slate-900/35 text-slate-300 hover:border-teal-300/30"}`}
                          >
                            <span className="font-semibold">{option.id}.</span> {option.text}
                            {isSelected ? <span className="mt-2 block text-xs leading-5 opacity-85">{option.explanation}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {referenceTab === "data" ? (
              <>
                <section>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Source / raw data</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">The inputs your solution must read and interpret.</p>
                  <div className="mt-4 space-y-4">
                    {scenario.sampleTables?.map((table) => <ScenarioTablePreview key={table.name} table={table} />)}
                    {scenario.schema ? <CodeBlock title="Source schema" code={scenario.schema} /> : null}
                    {scenario.sampleInput ? <CodeBlock title="Raw sample input" code={scenario.sampleInput} /> : null}
                    {!scenario.sampleTables?.length && !scenario.schema && !scenario.sampleInput ? <p className="rounded-2xl border border-slate-800 p-4 text-sm text-slate-400">No separate source sample is provided for this scenario.</p> : null}
                  </div>
                </section>
                <section className="border-t border-slate-800 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Target / result data</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">The grain, columns, or business result your solution must produce.</p>
                  <div className="mt-4 space-y-4">
                    {scenario.expectedOutput ? <CodeBlock title="Expected result" code={scenario.expectedOutput} /> : <p className="rounded-2xl border border-slate-800 p-4 text-sm leading-6 text-slate-300">{scenario.requirement || scenario.problemStatement}</p>}
                    {scenario.actualOutput ? <CodeBlock title="Current incorrect result" code={scenario.actualOutput} /> : null}
                  </div>
                </section>
              </>
            ) : null}

            {referenceTab === "broken" ? (
              <>
                {scenario.brokenCode ? <CodeBlock title="Broken logic / code" code={scenario.brokenCode} /> : null}
                {scenario.logs ? <CodeBlock title="Logs / error" code={scenario.logs} /> : null}
                {!scenario.brokenCode && !scenario.logs ? <p className="rounded-2xl border border-slate-800 p-4 text-sm leading-6 text-slate-400">This question does not include broken starter code. Build your answer from the task and data contract.</p> : null}
              </>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          <section className="panel overflow-hidden rounded-[2rem]">
            <div className="flex flex-col gap-4 border-b border-slate-800 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 lg:hidden">
                <button
                  type="button"
                  onClick={() => setMobileReferenceOpen(true)}
                  className="rounded-full border border-teal-300/35 px-4 py-2 text-sm font-semibold text-teal-100"
                >
                  Open task & data
                </button>
                <PracticeStatusBadge status={scenarioStatus} />
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-800 bg-slate-950/45 p-1" role="tablist" aria-label="Attempt workflow">
                {(["fix", "explain", "review"] as const).map((step, index) => (
                  <button
                    key={step}
                    type="button"
                    role="tab"
                    aria-selected={workspaceStep === step}
                    onClick={() => setWorkspaceStep(step)}
                    className={`rounded-xl px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${workspaceStep === step ? "bg-teal-300 text-slate-950" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"}`}
                  >
                    {index + 1}. {step === "fix" ? "Fix" : step === "explain" ? "Explain" : "Review"}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {workspaceStep === "fix" ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">Your attempt</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-50 sm:text-2xl">{promptLabel}</h2>
                  <p className="mt-2 hidden text-sm leading-6 text-slate-400 sm:block">{canRunSql ? "Write the corrected query, then run it against the visible source and target data." : canRunPyspark ? "Create daily_sales or fixed_daily_sales, then run the visible sample before submitting." : "Work from the task and data contract. A partial attempt is better practice than revealing the model answer first."}</p>
                  {scenario.scenarioType === "mcq" ? (
                    <div className="mt-5 grid gap-3">
                      {scenario.mcqOptions?.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => { setSelectedOptionId(option.id); setEvaluation(null); }}
                          className={`rounded-2xl border p-4 text-left text-sm leading-6 transition ${selectedOptionId === option.id ? "border-teal-300/40 bg-teal-300/10 text-teal-100" : "border-slate-800 bg-slate-950/45 text-slate-300 hover:border-teal-300/30"}`}
                        >
                          <span className="font-semibold">{option.id}.</span> {option.text}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      value={answer}
                      onChange={(event) => { setAnswer(event.target.value); setSqlExecution(null); setPysparkExecution(null); setEvaluation(null); setDraftMessage(null); }}
                      onKeyDown={(event) => handleTextareaTabKeyDown(event, (nextValue) => { setAnswer(nextValue); setSqlExecution(null); setPysparkExecution(null); setEvaluation(null); setDraftMessage(null); })}
                      rows={18}
                      spellCheck={false}
                      className="mt-5 w-full rounded-3xl border border-slate-800 bg-slate-950/80 p-4 font-mono text-sm leading-7 text-slate-100 outline-none transition focus:border-teal-300/50 sm:p-5"
                      placeholder="Write your fix, diagnosis, or production-safe approach here."
                    />
                  )}
                </div>
              ) : null}

              {workspaceStep === "explain" ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">Interview explanation</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-50 sm:text-2xl">Explain the decision, not only the syntax</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">Cover the symptom, root cause, safe fix, edge cases, trade-offs, monitoring, and prevention.</p>
                  <textarea
                    value={interviewAnswer}
                    onChange={(event) => { setInterviewAnswer(event.target.value); setEvaluation(null); }}
                    onKeyDown={(event) => handleTextareaTabKeyDown(event, (nextValue) => { setInterviewAnswer(nextValue); setEvaluation(null); })}
                    rows={12}
                    className="mt-5 w-full rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-sm leading-7 text-slate-100 outline-none transition focus:border-amber-300/50 sm:p-5"
                    placeholder="I would first confirm..., the root cause is..., the safe fix is..., and I would monitor..."
                  />
                </div>
              ) : null}

              {workspaceStep === "review" ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">Review</p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-50 sm:text-2xl">Feedback, rubric, and next step</h2>
                    {!evaluation && !modelSolutionVisible ? <p className="mt-2 text-sm leading-6 text-slate-400">Submit your attempt to receive feedback, or reveal the model solution after making an honest attempt.</p> : null}
                  </div>
                  {evaluationNotice ? <div role="status" className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">{evaluationNotice}</div> : null}
                  {evaluation ? <EvaluationPanel result={evaluation} commonMistakes={scenario.commonMistakes} followUps={scenario.followUps} /> : null}
                  <RubricBreakdown rubric={scenario.evaluationRubric} />
                  {scenario.productionChecklist?.length ? (
                    <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Production checklist</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {scenario.productionChecklist.map((item, index) => <div key={item} className="flex gap-3 rounded-2xl border border-slate-800 p-3 text-sm leading-6 text-slate-300"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-300 text-xs font-black text-slate-950">{index + 1}</span><span>{item}</span></div>)}
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/35 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Current follow-up</p>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{scenario.followUps[activeFollowUpIndex] ?? "No follow-up configured yet."}</p>
                  </div>
                  {modelSolutionVisible ? (
                    <div className="rounded-3xl border border-amber-300/20 bg-amber-300/5 p-5">
                      <h3 className="text-xl font-semibold text-slate-50">Model solution</h3>
                      <div className="mt-4"><CodeBlock code={scenario.modelSolution} /></div>
                      <p className="mt-5 text-sm leading-7 text-slate-300">{scenario.productionExplanation}</p>
                    </div>
                  ) : null}
                  {evaluation || modelSolutionVisible ? (
                    <div className="rounded-3xl border border-teal-300/20 bg-teal-300/5 p-5">
                      {evaluation ? <p className="text-xl font-semibold text-slate-50">Score: {evaluation.score}/100</p> : null}
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button type="button" onClick={() => void completeLab()} disabled={completionButtonDisabled} className={completionButtonClass}>{completionButtonLabel}</button>
                        <button type="button" onClick={goToPreviousScenario} disabled={!previousScenario} className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:text-slate-600">← Previous</button>
                        <button type="button" onClick={goToNextScenario} disabled={!canGoToNextScenario} className={nextScenarioButtonClass}>Next scenario →</button>
                      </div>
                      {completionMessage ? <p role="status" className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${completionStatus === "error" ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : "border-teal-300/20 bg-teal-300/10 text-teal-100"}`}>{completionMessage}</p> : null}
                      {!currentUser ? <button type="button" onClick={() => { trackEvent("signup_started", { source: "scenario_feedback" }); setIsAuthOpen(true); }} className="mt-4 text-sm font-semibold text-amber-200 underline decoration-amber-300/40 underline-offset-4">Sign up to keep progress across devices</button> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-6 border-t border-slate-800 pt-5">
                <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                  <div aria-live="polite" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {draftMessage || autoSaveStatus}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={saveDraft} className="rounded-full border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40">Save draft</button>
                    <button type="button" onClick={revealHint} disabled={hintsRevealed >= scenario.hints.length} className="rounded-full border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-amber-300/40 disabled:opacity-40">Show hint</button>
                    {workspaceStep === "fix" && canRunSql ? <button type="button" onClick={copySchema} className="rounded-full border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200">Copy schema</button> : null}
                    {workspaceStep === "fix" && (canRunSql || canRunPyspark) ? <button type="button" onClick={runSampleCheck} disabled={isChecking} className="rounded-full border border-teal-300/35 px-4 py-2.5 text-sm font-semibold text-teal-100 disabled:opacity-50">Run sample</button> : null}
                    {workspaceStep === "fix" ? <button type="button" onClick={() => setWorkspaceStep("explain")} className="rounded-full bg-teal-300 px-5 py-2.5 text-sm font-semibold text-slate-950">Continue to explain</button> : null}
                    {workspaceStep === "explain" ? <button type="button" onClick={checkAnswer} disabled={isChecking} className="rounded-full bg-teal-300 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60">{isChecking ? "Submitting..." : submitLabel}</button> : null}
                    {workspaceStep === "review" ? <button type="button" onClick={() => setWorkspaceStep("fix")} className="rounded-full border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200">Edit answer</button> : null}
                    {workspaceStep === "review" ? <button type="button" onClick={requestModelSolution} className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-semibold text-slate-950">Reveal model solution</button> : null}
                    {workspaceStep === "review" && scenario.followUps.length ? <button type="button" onClick={tryFollowUp} className="rounded-full border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200">Try follow-up</button> : null}
                  </div>
                </div>
                {autoSaveStatus.toLowerCase().includes("retry") ? <button type="button" onClick={saveDraft} className="mt-3 text-xs font-semibold text-amber-100 underline">Retry save</button> : null}
              </div>

              {showRevealConfirmation ? (
                <div className="mt-5 rounded-3xl border border-amber-300/25 bg-amber-300/10 p-5">
                  <p className="text-sm font-semibold text-amber-100">Try once before revealing the solution?</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">You have not submitted an attempt yet. Revealing now can reduce the value of the exercise.</p>
                  <div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => { setShowRevealConfirmation(false); setWorkspaceStep("fix"); }} className="rounded-full bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950">Return to attempt</button><button type="button" onClick={revealModelSolution} className="rounded-full border border-amber-300/35 px-4 py-2 text-sm font-semibold text-amber-100">Reveal anyway</button></div>
                </div>
              ) : null}
            </div>
          </section>

          {sqlExecution ? <ScenarioSqlResultPanel result={sqlExecution} /> : null}
          {pysparkExecution ? <ScenarioPysparkResultPanel result={pysparkExecution} /> : null}
          {visibleHints.length ? <section className="panel rounded-[2rem] p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Hints revealed</p><div className="mt-4 space-y-3">{visibleHints.map((hint, index) => <p key={hint} className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">Hint {index + 1}: {hint}</p>)}</div></section> : null}
        </div>
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
