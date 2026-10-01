"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  runReadOnlySql,
  validateSqlOutput,
  type BrowserSqlResultTable
} from "../../lib/browser-sql";
import {
  getLearnerProgress,
  getPythonLabSolution,
  saveLearnerAttempt,
  saveLearnerDraft,
  validatePysparkScenario,
  validatePythonLab
} from "../../lib/api";
import { trackEvent } from "../../lib/analytics";
import { AUTH_UPDATED_EVENT, getAuthToken, getCurrentUser } from "../../lib/auth";
import { codingProgressFromRemote } from "../../lib/learner-progress";
import { sendUsageEvent } from "../../lib/usage";
import { handleTextareaTabKeyDown } from "../../lib/textarea-tab";
import {
  formatTrackLabel,
  getCodingLabs,
  type CodingLab,
  type CodingLabTable,
  type CodingLabTrack,
  type PythonTestCase,
  type SqlTestCase
} from "../../lib/coding-labs";
import type { QueryResult } from "../../lib/types";
import {
  getCodingLabDrafts,
  getCodingLabProgressMap,
  getLastCodingLab,
  migrateGuestCodingLabStateToUser,
  recordCodingLabAttempt,
  saveCodingLabDraft,
  saveLastCodingLab,
  type CodingLabProgress
} from "../../lib/coding-lab-session";
import { AuthDialog } from "../auth-dialog";
import { getPracticeStatus, PracticeStatusBadge } from "../practice-status-badge";

interface PythonTestResult {
  name: string;
  passed: boolean;
  message?: string;
  actual: unknown;
  expected: unknown;
}

interface SqlCaseResult {
  name: string;
  description: string;
  passed: boolean;
  actual: BrowserSqlResultTable;
  expected: BrowserSqlResultTable;
}

interface ReviewKeywordResult {
  keyword: string;
  matched: boolean;
}

interface PysparkCaseResult {
  name: string;
  passed: boolean;
  message: string;
  actual?: BrowserSqlResultTable;
  expected?: BrowserSqlResultTable;
}

interface LabRunResult {
  passed: boolean | null;
  message: string;
  table?: BrowserSqlResultTable;
  sqlResults?: SqlCaseResult[];
  pythonResults?: PythonTestResult[];
  pysparkResults?: PysparkCaseResult[];
  score?: number;
  reviewResults?: ReviewKeywordResult[];
}

type ProgressFilter = "All" | "In progress" | "Done" | "New";

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<{
      runPythonAsync: (code: string) => Promise<unknown>;
    }>;
    __dataFoundryPyodide?: Promise<{
      runPythonAsync: (code: string) => Promise<unknown>;
    }>;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
        once: true
      });
      if (window.loadPyodide) resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function getPyodide() {
  if (!window.__dataFoundryPyodide) {
    window.__dataFoundryPyodide = loadScript(
      "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js"
    ).then(async () => {
      if (!window.loadPyodide) {
        throw new Error("Pyodide did not load correctly.");
      }
      return window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/"
      });
    });
  }
  return window.__dataFoundryPyodide;
}

async function runSqlLab(lab: CodingLab, answer: string): Promise<LabRunResult> {
  if (!lab.expectedSql) {
    return {
      passed: null,
      message: "This lab cannot be validated yet. Please choose another question or contact support."
    };
  }

  const validationCases: SqlTestCase[] = [
    {
      name: "Visible sample data",
      description: "Checks the query against the sample data shown in the lab.",
      tables: lab.tables,
      expectedSql: lab.expectedSql
    },
    ...(lab.sqlTestCases ?? [])
  ];

  const sqlResults: SqlCaseResult[] = [];
  for (const validationCase of validationCases) {
    const result = await validateSqlOutput(
      validationCase.tables,
      answer,
      validationCase.expectedSql ?? lab.expectedSql
    );
    sqlResults.push({
      name: validationCase.name,
      description: validationCase.description,
      passed: result.passed,
      actual: result.actual,
      expected: result.expected
    });
  }

  const passed = sqlResults.every((result) => result.passed);
  const passedCount = sqlResults.filter((result) => result.passed).length;

  return {
    passed,
    message: passed
      ? `Correct. Your query passed all ${sqlResults.length} validation cases, including edge cases.`
      : `Not yet. ${passedCount}/${sqlResults.length} validation cases passed. Compare columns, grain, filters, joins, NULL handling, and tie behavior.`,
    table: sqlResults[0]?.actual,
    sqlResults
  };
}

function buildPythonHarness(lab: CodingLab, testCases: PythonTestCase[] = lab.testCases ?? []) {
  return `
import json

_function_name = ${JSON.stringify(lab.functionName)}
_test_cases = json.loads(${JSON.stringify(JSON.stringify(testCases))})

if _function_name not in globals() or not callable(globals()[_function_name]):
    raise AssertionError(f"Define a function named {_function_name}.")

_fn = globals()[_function_name]
_results = []

for _case in _test_cases:
    _actual = _fn(*_case["args"])
    if hasattr(_actual, "__iter__") and not isinstance(_actual, (str, bytes, dict, list, tuple, set)):
        _actual = list(_actual)
    if isinstance(_actual, tuple):
        _actual = list(_actual)
    _expected = _case["expected"]
    _results.append({
        "name": _case["name"],
        "passed": _actual == _expected,
        "actual": _actual,
        "expected": _expected
    })

json.dumps(_results, default=str)
`;
}

async function runPythonLab(
  lab: CodingLab,
  answer: string,
  testCases: PythonTestCase[] = lab.testCases ?? [],
  mode: "sample" | "hidden" = "sample",
  authToken?: string | null
): Promise<LabRunResult> {
  if (lab.serverValidation === "python") {
    const validation = await validatePythonLab(lab.slug, {
      code: answer,
      mode
    }, authToken);

    return {
      passed: validation.passed,
      message:
        mode === "sample"
          ? validation.passed
            ? "Sample check passed. Submit your answer to run hidden edge-case validation."
            : validation.message
          : validation.passed
            ? "Correct. Your Python function passed the visible sample and hidden edge-case checks."
            : validation.message,
      pythonResults: validation.tests
    };
  }

  if (!lab.functionName || !testCases.length) {
    return {
      passed: null,
      message: "This lab cannot be validated yet. Please choose another question or contact support."
    };
  }

  const pyodide = await getPyodide();
  const raw = await pyodide.runPythonAsync(`${answer}\n\n${buildPythonHarness(lab, testCases)}`);
  const pythonResults = JSON.parse(String(raw)) as PythonTestResult[];
  const passed = pythonResults.every((result) => result.passed);

  return {
    passed,
    message: passed
      ? "Correct. Your Python function passed all validation checks."
      : "Some tests failed. Look at the failing input/output and tighten your edge-case handling.",
    pythonResults
  };
}

function queryResultToBrowserTable(table?: QueryResult | null): BrowserSqlResultTable | undefined {
  if (!table) return undefined;
  return {
    columns: table.columns,
    rows: table.rows
  };
}

async function runPysparkLab(
  lab: CodingLab,
  answer: string,
  mode: "sample" | "hidden",
  authToken?: string | null
): Promise<LabRunResult> {
  const validation = await validatePysparkScenario(lab.slug, {
    code: answer,
    mode
  }, authToken);

  const pysparkResults: PysparkCaseResult[] = validation.tests.map((test) => ({
    name: test.name,
    passed: test.passed,
    message: test.message,
    actual: queryResultToBrowserTable(test.actual_output),
    expected: queryResultToBrowserTable(test.expected_output)
  }));

  return {
    passed: validation.passed,
    message:
      mode === "sample"
        ? validation.passed
          ? "Sample check passed. Submit your answer to run the hidden production-style validation cases."
          : validation.message
        : validation.passed
          ? "Correct. Your PySpark fix passed the hidden validation cases."
          : validation.message,
    pysparkResults
  };
}

function evaluateCodeReviewLab(lab: CodingLab, answer: string): LabRunResult {
  const normalizedAnswer = answer.toLowerCase();
  const keywords =
    lab.validationKeywords && lab.validationKeywords.length > 0
      ? lab.validationKeywords
      : lab.topicTags;

  const reviewResults = keywords.map((keyword) => ({
    keyword,
    matched: normalizedAnswer.includes(keyword.toLowerCase())
  }));
  const matchedCount = reviewResults.filter((result) => result.matched).length;
  const answerLooksSubstantial = answer.replace(/\s/g, "").length >= 140;
  const keywordScore = keywords.length > 0 ? Math.round((matchedCount / keywords.length) * 80) : 50;
  const score = Math.min(100, keywordScore + (answerLooksSubstantial ? 20 : 0));
  const passed = score >= 70;

  return {
    passed,
    score,
    reviewResults,
    message: passed
      ? `Good production fix. Your answer hit ${matchedCount}/${keywords.length} expected PySpark concepts and scored ${score}/100.`
      : `Not complete yet. Your answer hit ${matchedCount}/${keywords.length} expected PySpark concepts and scored ${score}/100. Add the missing Spark API, edge-case handling, and production trade-off.`
  };
}

export function BrowserCodingLab({ track }: { track: CodingLabTrack }) {
  const labs = useMemo(() => getCodingLabs(track), [track]);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const [selectedSlug, setSelectedSlug] = useState(labs[0]?.slug ?? "");
  const selectedLab = labs.find((lab) => lab.slug === selectedSlug) ?? labs[0];
  const [isLibraryMode, setIsLibraryMode] = useState(true);
  const [referenceTab, setReferenceTab] = useState<"task" | "data" | "help">("task");
  const [mobileReferenceOpen, setMobileReferenceOpen] = useState(false);
  const [workspaceFocusNonce, setWorkspaceFocusNonce] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hintCount, setHintCount] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [result, setResult] = useState<LabRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [topic, setTopic] = useState("All");
  const [difficulty, setDifficulty] = useState("All");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("All");
  const [progressMap, setProgressMap] = useState<Record<string, CodingLabProgress>>({});
  const [expectedPreview, setExpectedPreview] = useState<BrowserSqlResultTable | null>(null);
  const [expectedPreviewError, setExpectedPreviewError] = useState("");
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Preparing save...");
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [serverSolutions, setServerSolutions] = useState<
    Record<string, { solutionCode: string; explanation: string }>
  >({});
  const [isLoadingSolution, setIsLoadingSolution] = useState(false);
  const [solutionError, setSolutionError] = useState("");
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [authEpoch, setAuthEpoch] = useState(0);
  const [remoteProgress, setRemoteProgress] = useState<Record<string, { latestResult?: unknown }>>({});
  const draftRevisionRef = useRef<Record<string, number>>({});
  const pendingAttemptRef = useRef<{ slug: string; answer: string; key: string } | null>(null);

  useEffect(() => {
    const syncAuth = () => setAuthEpoch((value) => value + 1);
    window.addEventListener(AUTH_UPDATED_EVENT, syncAuth);
    window.addEventListener("storage", syncAuth);
    return () => {
      window.removeEventListener(AUTH_UPDATED_EVENT, syncAuth);
      window.removeEventListener("storage", syncAuth);
    };
  }, []);

  const topics = useMemo(() => {
    const all = new Set<string>();
    labs.forEach((lab) => lab.topicTags.forEach((tag) => all.add(tag)));
    return ["All", ...Array.from(all).sort()];
  }, [labs]);

  const progressStats = useMemo(() => {
    const completed = labs.filter((lab) => progressMap[lab.slug]?.completed).length;
    const attempted = labs.filter((lab) =>
      !progressMap[lab.slug]?.completed &&
      ((progressMap[lab.slug]?.attemptCount ?? 0) > 0 || Boolean(answers[lab.slug]))
    ).length;
    return {
      attempted,
      completed,
      notStarted: Math.max(0, labs.length - attempted - completed)
    };
  }, [answers, labs, progressMap]);

  const progressFilterOptions: Array<{ label: ProgressFilter; count: number }> = [
    { label: "All", count: labs.length },
    { label: "In progress", count: progressStats.attempted },
    { label: "Done", count: progressStats.completed },
    { label: "New", count: progressStats.notStarted }
  ];

  const filteredLabs = labs.filter((lab) => {
    const topicMatches = topic === "All" || lab.topicTags.includes(topic);
    const difficultyMatches = difficulty === "All" || lab.difficulty === difficulty;
    const labProgress = progressMap[lab.slug];
    const attemptCount = labProgress?.attemptCount ?? 0;
    const hasDraft = Boolean(answers[lab.slug]);
    const progressMatches =
      progressFilter === "All" ||
      (progressFilter === "In progress" && !labProgress?.completed && (attemptCount > 0 || hasDraft)) ||
      (progressFilter === "Done" && Boolean(labProgress?.completed)) ||
      (progressFilter === "New" && !labProgress?.completed && attemptCount === 0 && !hasDraft);
    return topicMatches && difficultyMatches && progressMatches;
  });

  useEffect(() => {
    let cancelled = false;
    setExpectedPreview(null);
    setExpectedPreviewError("");

    if (!selectedLab) return;
    if (selectedLab.track !== "sql" || !selectedLab.expectedSql) return;

    runReadOnlySql(selectedLab.tables, selectedLab.expectedSql)
      .then((table) => {
        if (!cancelled) setExpectedPreview(table);
      })
      .catch((error) => {
        if (!cancelled) {
          setExpectedPreviewError(
            error instanceof Error ? error.message : "Expected output preview failed."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedLab]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateProgress() {
      const authToken = getAuthToken();
      const authUser = getCurrentUser();
      setPersistenceReady(!authToken);
      const requestedSlug = new URLSearchParams(window.location.search).get("lab");
      if (requestedSlug && labs.some((lab) => lab.slug === requestedSlug)) {
        setSelectedSlug(requestedSlug);
        setIsLibraryMode(false);
      } else {
        const lastSlug = getLastCodingLab(track);
        if (lastSlug && labs.some((lab) => lab.slug === lastSlug)) {
          setSelectedSlug(lastSlug);
        }
      }

      const migrated =
        authToken && authUser ? migrateGuestCodingLabStateToUser(authUser.id) : null;
      const savedDrafts = migrated?.drafts ?? getCodingLabDrafts();
      const localProgress = migrated?.progress ?? getCodingLabProgressMap();
      setAnswers(
        Object.fromEntries(
          Object.entries(savedDrafts).map(([slug, draft]) => [slug, draft.code])
        )
      );
      setProgressMap(localProgress);
      setDraftsLoaded(true);
      setRemoteProgress(
        Object.fromEntries(
          Object.entries(localProgress).map(([slug, item]) => [
            slug,
            { latestResult: item.lastResult }
          ])
        )
      );

      if (!authToken) {
        setSaveStatus("Saved on this device");
        return;
      }

      try {
        const response = await getLearnerProgress(authToken);
        if (cancelled) return;
        const records = response.items.filter(
          (item) => item.content_type === `coding_lab:${track}`
        );
        const remoteBySlug = new Map(records.map((record) => [record.content_id, record]));
        const nextAnswers: Record<string, string> = {};
        const nextProgress: Record<string, CodingLabProgress> = {};
        const nextRemote: Record<string, { latestResult?: unknown }> = {};
        const pendingSync: Array<Promise<unknown>> = [];

        labs.forEach((lab) => {
          const localDraft = savedDrafts[lab.slug];
          const localItem = localProgress[lab.slug];
          const remote = remoteBySlug.get(lab.slug);
          const localRevision = localDraft ? Date.parse(localDraft.savedAt) || 0 : 0;
          const remoteRevision = remote?.draft_revision ?? 0;
          const localDraftWins = Boolean(localDraft && localRevision > remoteRevision);
          const remoteItem = remote ? codingProgressFromRemote(remote) : undefined;

          if (localDraftWins || (!remote && localDraft)) {
            nextAnswers[lab.slug] = localDraft?.code ?? "";
          } else if (remote) {
            nextAnswers[lab.slug] = remote.draft_answer;
          }

          const newestLocalAttempt = Date.parse(localItem?.lastAttemptedAt ?? "") || 0;
          const newestRemoteAttempt = Date.parse(remoteItem?.lastAttemptedAt ?? "") || 0;
          const newestProgress =
            newestLocalAttempt > newestRemoteAttempt ? localItem : remoteItem ?? localItem;
          if (newestProgress || localItem || remoteItem) {
            nextProgress[lab.slug] = {
              ...(newestProgress ?? localItem ?? remoteItem!),
              completed: Boolean(localItem?.completed || remoteItem?.completed),
              completedAt: remoteItem?.completedAt ?? localItem?.completedAt,
              attemptCount: Math.max(
                localItem?.attemptCount ?? 0,
                remoteItem?.attemptCount ?? 0
              ),
              lastResult: newestProgress?.lastResult ?? remoteItem?.lastResult ?? localItem?.lastResult
            };
            nextRemote[lab.slug] = { latestResult: nextProgress[lab.slug].lastResult };
          }

          if (
            localDraft &&
            (localRevision > remoteRevision || Boolean(localItem?.completed && !remote?.completed))
          ) {
            pendingSync.push(
              saveLearnerDraft(authToken, `coding_lab:${track}`, lab.slug, {
                draft_answer: localDraft.code,
                draft_interview_answer: "",
                hints_revealed: 0,
                client_revision: Math.max(localRevision, Date.now()),
                completed: localItem?.completed || undefined
              })
            );
          }
        });

        setAnswers(nextAnswers);
        setProgressMap(nextProgress);
        setRemoteProgress(nextRemote);
        const syncResults = await Promise.allSettled(pendingSync);
        if (cancelled) return;
        setSaveStatus(
          syncResults.some((result) => result.status === "rejected")
            ? "Account sync failed — local recovery copy kept"
            : "Saved to your account"
        );
      } catch {
        if (!cancelled) setSaveStatus("Account sync failed — local recovery copy kept");
      } finally {
        if (!cancelled) setPersistenceReady(true);
      }
    }

    void hydrateProgress();

    return () => {
      cancelled = true;
    };
  }, [authEpoch, labs, track]);

  useEffect(() => {
    if (!draftsLoaded || !selectedLab) return;
    const remote = remoteProgress[selectedLab.slug];
    if (remote?.latestResult && !result) {
      setResult(remote.latestResult as LabRunResult);
    }
  }, [draftsLoaded, remoteProgress, result, selectedLab]);

  useEffect(() => {
    if (!draftsLoaded || !selectedLab) return;
    saveLastCodingLab(track, selectedLab.slug);
  }, [draftsLoaded, selectedLab, track]);

  useEffect(() => {
    if (!draftsLoaded || !persistenceReady || !selectedLab) return;
    const currentAnswer = answers[selectedLab.slug];
    if (typeof currentAnswer !== "string") return;

    const authToken = getAuthToken();
    setSaveStatus(authToken ? "Saving to your account..." : "Saving on this device...");
    const slug = selectedLab.slug;
    const revision = Date.now();
    draftRevisionRef.current[slug] = Math.max(draftRevisionRef.current[slug] ?? 0, revision);
    const timer = window.setTimeout(() => {
      const draft = saveCodingLabDraft(selectedLab.slug, currentAnswer);
      const authToken = getAuthToken();
      if (!authToken) {
        setSaveStatus(
          `Saved on this device at ${new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: "2-digit"
          }).format(new Date(draft.savedAt))}`
        );
        return;
      }
      saveLearnerDraft(authToken, `coding_lab:${track}`, slug, {
        draft_answer: currentAnswer,
        draft_interview_answer: "",
        hints_revealed: 0,
        client_revision: revision
      })
        .then(() => {
          if (draftRevisionRef.current[slug] === revision) {
            setSaveStatus(
              `Saved to your account at ${new Intl.DateTimeFormat(undefined, {
                hour: "numeric",
                minute: "2-digit"
              }).format(new Date())}`
            );
          }
        })
        .catch(() => {
          if (draftRevisionRef.current[slug] === revision) {
            setSaveStatus("Account sync failed — retry save");
          }
        });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [answers, draftsLoaded, persistenceReady, selectedLab, track]);

  useEffect(() => {
    if (isLibraryMode || workspaceFocusNonce === 0) return;

    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [isLibraryMode, workspaceFocusNonce]);

  if (!selectedLab) {
    return (
      <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
        <div className="panel rounded-[2rem] p-8 text-slate-300">
          No {formatTrackLabel(track)} labs are available yet.
        </div>
      </main>
    );
  }

  const answer = answers[selectedLab.slug] ?? selectedLab.starterCode;
  const activeLabQueue = filteredLabs.length > 0 ? filteredLabs : labs;
  const currentQueueIndex = activeLabQueue.findIndex((lab) => lab.slug === selectedLab.slug);
  const nextLab =
    currentQueueIndex >= 0
      ? activeLabQueue[currentQueueIndex + 1] ?? null
      : activeLabQueue[0] ?? null;
  const selectedProgress = progressMap[selectedLab.slug];
  const selectedCompleted = Boolean(selectedProgress?.completed);
  const selectedStatus = getPracticeStatus(
    selectedCompleted,
    (selectedProgress?.attemptCount ?? 0) > 0 || Boolean(answers[selectedLab.slug])
  );
  const canGoNext = Boolean(nextLab && selectedCompleted);
  const nextQuestionButtonClass = canGoNext
    ? "rounded-full bg-teal-300 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_0_28px_rgba(94,234,212,0.2)] transition hover:bg-teal-200"
    : "rounded-full border border-slate-700 px-5 py-3 text-sm font-bold text-slate-500 disabled:cursor-not-allowed";

  async function saveDraftNow(code: string = answer, slug: string = selectedLab.slug) {
    const draft = saveCodingLabDraft(slug, code);
    const authToken = getAuthToken();
    if (!authToken) {
      setSaveStatus(
        `Saved on this device at ${new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit"
        }).format(new Date(draft.savedAt))}`
      );
      return;
    }

    setSaveStatus("Saving to your account...");
    const revision = Date.now();
    draftRevisionRef.current[slug] = revision;
    try {
      await saveLearnerDraft(authToken, `coding_lab:${track}`, slug, {
        draft_answer: code,
        draft_interview_answer: "",
        hints_revealed: 0,
        client_revision: revision
      });
      setSaveStatus("Saved to your account");
    } catch {
      setSaveStatus("Account sync failed — retry save");
    }
  }

  function getAttemptKey(slug: string, code: string): string {
    const pending = pendingAttemptRef.current;
    if (pending?.slug === slug && pending.answer === code) return pending.key;
    const key = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingAttemptRef.current = { slug, answer: code, key };
    return key;
  }

  function requireLoginForValidation(action: "run" | "submit") {
    const currentUser = getCurrentUser();
    const authToken = getAuthToken();
    if (currentUser && authToken) {
      return authToken;
    }

    setWorkspaceMessage(
      action === "run"
        ? "Log in or create an account to run this code."
        : "Log in or create an account to submit this answer."
    );
    setIsAuthOpen(true);
    trackEvent("signup_started", {
      source: action === "run" ? "coding_lab_run" : "coding_lab_submit",
      lab: selectedLab.slug
    });
    return false;
  }

  async function submitLab() {
    if (!selectedLab) return;
    const authToken = requireLoginForValidation("submit");
    if (!authToken) {
      return;
    }

    try {
      setIsRunning(true);
      setResult(null);
      const nextResult =
        selectedLab.track === "sql"
          ? await runSqlLab(selectedLab, answer)
          : selectedLab.track === "python"
            ? await runPythonLab(selectedLab, answer, selectedLab.testCases ?? [], "hidden", authToken)
            : selectedLab.validationMode === "pyspark"
              ? await runPysparkLab(selectedLab, answer, "hidden", authToken)
          : evaluateCodeReviewLab(selectedLab, answer);
      setResult(nextResult);
      const nextProgressMap = recordCodingLabAttempt(
        selectedLab.slug,
        selectedLab.track,
        nextResult.passed === true,
        nextResult
      );
      setProgressMap(nextProgressMap);
      if (authToken && persistenceReady) {
        try {
          const persisted = await saveLearnerAttempt(
            authToken,
            `coding_lab:${selectedLab.track}`,
            selectedLab.slug,
            {
              idempotency_key: getAttemptKey(selectedLab.slug, answer),
              answer,
              passed: nextResult.passed,
              message: nextResult.message,
              result: nextResult as unknown as Record<string, unknown>,
              ai_feedback: null
            }
          );
          setProgressMap((current) => ({
            ...current,
            [selectedLab.slug]: codingProgressFromRemote(persisted.item)
          }));
          setRemoteProgress((current) => ({
            ...current,
            [selectedLab.slug]: { latestResult: persisted.item.latest_result ?? undefined }
          }));
          pendingAttemptRef.current = null;
        } catch {
          setWorkspaceMessage("Result shown, but it could not be saved to your account. Please retry submit.");
        }
      }
      sendUsageEvent("coding_lab_submitted", {
        metadata: {
          lab_slug: selectedLab.slug,
          track: selectedLab.track,
          passed: nextResult.passed === true,
          score: nextResult.score ?? null
        }
      });
      trackEvent("first_lab_submitted", {
        lab: selectedLab.slug,
        track: selectedLab.track,
        passed: nextResult.passed
      });
      if (nextResult.passed) {
        setWorkspaceMessage(
          nextLab
            ? "Correct. Passed full validation and edge-case checks. Use Next question when you are ready."
            : "Correct. Passed full validation and edge-case checks."
        );
        sendUsageEvent("coding_lab_completed", {
          metadata: {
            lab_slug: selectedLab.slug,
            track: selectedLab.track
          }
        });
        trackEvent("lab_completed", { lab: selectedLab.slug, track: selectedLab.track });
      } else if (nextResult.passed === false) {
        setWorkspaceMessage("Not correct yet. Review the result details, fix the answer, and submit again.");
      }
    } catch (error) {
      setResult({
        passed: false,
        message: error instanceof Error ? error.message : "Code execution failed."
      });
    } finally {
      setIsRunning(false);
    }
  }

  async function runSampleCheck() {
    const authToken = requireLoginForValidation("run");
    if (!authToken) {
      return;
    }

    try {
      setIsRunning(true);
      setResult(null);

      if (selectedLab.track === "sql") {
        if (!selectedLab.expectedSql) {
          const table = await runReadOnlySql(selectedLab.tables, answer);
          setResult({
            passed: null,
            message:
              "Query ran successfully on the visible sample data, but this lab does not yet have an expected result for comparison.",
            table
          });
          return;
        }

        const validation = await validateSqlOutput(
          selectedLab.tables,
          answer,
          selectedLab.expectedSql
        );
        setResult({
          passed: validation.passed,
          message: validation.passed
            ? "Sample check passed. Submit your answer to run hidden edge-case validation."
            : "Wrong answer on the visible sample data. Compare your output with the expected result before submitting.",
          sqlResults: [
            {
              name: "Visible sample data",
              description:
                "Run check against only the sample tables and expected output shown in this lab.",
              passed: validation.passed,
              actual: validation.actual,
              expected: validation.expected
            }
          ]
        });
        return;
      }

      if (selectedLab.track === "python") {
        if (selectedLab.serverValidation === "python") {
          const sampleResult = await runPythonLab(selectedLab, answer, [], "sample", authToken);
          setResult(sampleResult);
          return;
        }

        const sampleCase = selectedLab.testCases?.[0];
        if (!sampleCase) {
          setResult({
            passed: null,
            message:
              "Sample check is unavailable for this lab. Submit the answer for full validation."
          });
          return;
        }
        const sampleResult = await runPythonLab(selectedLab, answer, [sampleCase]);
        setResult({
          ...sampleResult,
          message: sampleResult.passed
            ? "Sample check passed. Submit your answer to run the full hidden edge-case validation."
            : "Wrong answer on the visible sample case. Fix the failing input/output before submitting."
        });
        return;
      }

      if (selectedLab.validationMode === "pyspark") {
        const sampleResult = await runPysparkLab(selectedLab, answer, "sample", authToken);
        setResult(sampleResult);
        return;
      }

      const trimmedAnswer = answer.trim();
      setResult({
        passed: trimmedAnswer.length >= 80 ? null : false,
        message:
          trimmedAnswer.length >= 80
            ? "Your draft is ready for review. Submit it for the complete production-fix evaluation."
            : "Add a concrete PySpark fix before submitting. Mention the API change and production trade-off."
      });
    } catch (error) {
      setResult({
        passed: false,
        message: error instanceof Error ? error.message : "The query could not run.",
        table: { columns: [], rows: [] }
      });
    } finally {
      setIsRunning(false);
    }
  }

  async function copySchema() {
    const schema = selectedLab.tables
      .map((table) => `${table.name}(${table.columns.join(", ")})`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(schema);
      setWorkspaceMessage("Schema copied.");
    } catch {
      setWorkspaceMessage("Copy was blocked. Select the schema text manually.");
    }
  }

  function switchLab(slug: string) {
    setSelectedSlug(slug);
    setIsLibraryMode(false);
    setReferenceTab("task");
    setMobileReferenceOpen(false);
    setWorkspaceFocusNonce((count) => count + 1);
    setHintCount(0);
    setShowSolution(false);
    setResult(null);
    setWorkspaceMessage("");
    setSolutionError("");
  }

  function goToNextLab() {
    if (!nextLab) return;
    switchLab(nextLab.slug);
  }

  function returnToLibrary() {
    setIsLibraryMode(true);
    setHintCount(0);
    setShowSolution(false);
    setResult(null);
    setWorkspaceMessage("");
    setSolutionError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleSolution() {
    if (showSolution) {
      setShowSolution(false);
      return;
    }

    setSolutionError("");
    if (selectedLab.serverValidation === "python" && !serverSolutions[selectedLab.slug]) {
      try {
        setIsLoadingSolution(true);
        const solution = await getPythonLabSolution(selectedLab.slug, getAuthToken());
        setServerSolutions((current) => ({
          ...current,
          [selectedLab.slug]: {
            solutionCode: solution.solution_code,
            explanation: solution.explanation
          }
        }));
      } catch (error) {
        setSolutionError(
          error instanceof Error ? error.message : "The model answer could not load."
        );
      } finally {
        setIsLoadingSolution(false);
      }
    }

    setShowSolution(true);
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-8 sm:px-8">
      <section className={`${isLibraryMode ? "" : "hidden"} panel rounded-[2rem] p-7`}>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          {formatTrackLabel(track)} Lab
        </p>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-50">
              Hands-on data engineering practice.
            </h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">
              {track === "pyspark"
                ? "Practice Spark production fixes: inspect the data, repair the code, run a concept check, then compare with the model answer."
                : "Inspect the data, write the solution, run validation checks, and explain the production lesson."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <Stat label="Labs" value={labs.length} />
            <Stat label="In progress" value={progressStats.attempted} />
            <Stat label="Done" value={progressStats.completed} />
            <Stat label="Free" value={labs.filter((lab) => lab.isFree).length} />
          </div>
        </div>
      </section>

      {isLibraryMode ? (
        <LabLibraryView
          labs={filteredLabs}
          allLabCount={labs.length}
          track={track}
          topics={topics}
          topic={topic}
          difficulty={difficulty}
          progressFilter={progressFilter}
          progressFilterOptions={progressFilterOptions}
          progressMap={progressMap}
          answers={answers}
          onTopicChange={setTopic}
          onDifficultyChange={setDifficulty}
          onProgressFilterChange={setProgressFilter}
          onSelectLab={switchLab}
        />
      ) : (
        <>

      <header className="mt-0 rounded-[2rem] border border-slate-800 bg-slate-950/45 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <PracticeStatusBadge status={selectedStatus} />
              <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">{selectedLab.difficulty}</span>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">{formatTrackLabel(track)}</span>
              {selectedLab.topicTags.slice(0, 2).map((tag) => <span key={tag} className="hidden rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-400 sm:inline-flex">{tag}</span>)}
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">{selectedLab.title}</h1>
            <p className="mt-2 hidden max-w-4xl text-sm leading-6 text-slate-300 sm:block">{selectedLab.studentTask}</p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 xl:w-80">
            <label>
              <span className="mb-2 hidden text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 sm:block">Choose question</span>
              <select value={selectedLab.slug} onChange={(event) => switchLab(event.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-100 outline-none focus:border-teal-300/50">
                {labs.map((lab) => <option key={lab.slug} value={lab.slug}>{lab.title}</option>)}
              </select>
            </label>
            <button type="button" onClick={returnToLibrary} className="hidden self-start text-xs font-semibold text-slate-400 underline decoration-slate-700 underline-offset-4 hover:text-teal-100 sm:block">Back to all questions</button>
          </div>
        </div>
      </header>

      {mobileReferenceOpen ? <button type="button" aria-label="Close task and data" onClick={() => setMobileReferenceOpen(false)} className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm md:hidden" /> : null}

      <section
        ref={workspaceRef}
        className="mt-5 scroll-mt-28 grid min-w-0 gap-5 md:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.4fr)] md:items-start"
      >
        <aside className={`${mobileReferenceOpen ? "fixed inset-x-3 bottom-3 top-16 z-50 flex" : "hidden"} min-w-0 flex-col overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl md:sticky md:top-24 md:flex md:max-h-[calc(100vh-7rem)]`}>
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">Reference</p>
            <button type="button" onClick={() => setMobileReferenceOpen(false)} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 md:hidden">Close</button>
          </div>
          <div className="grid grid-cols-3 gap-1 border-b border-slate-800 p-2" role="tablist" aria-label="Lab reference">
            {(["task", "data", "help"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={referenceTab === tab} onClick={() => setReferenceTab(tab)} className={`rounded-xl px-3 py-2.5 text-xs font-semibold capitalize transition ${referenceTab === tab ? "bg-teal-300 text-slate-950" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"}`}>{tab}</button>)}
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
            {referenceTab === "task" ? <>
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Business context</p><p className="mt-2 text-sm leading-6 text-slate-300">{selectedLab.businessContext}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Problem</p><p className="mt-2 text-sm leading-6 text-slate-200">{selectedLab.problemStatement}</p></div>
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">Your task</p><p className="mt-2 text-sm font-semibold leading-6 text-amber-50">{selectedLab.studentTask}</p></div>
              {selectedLab.expectedOutcome ? <div className="rounded-2xl border border-teal-300/20 bg-teal-300/10 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-100">Outcome contract</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-teal-50">{selectedLab.expectedOutcome}</p></div> : null}
            </> : null}

            {referenceTab === "data" ? <>
              <section>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Source / raw data</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">Inputs available to your query or function.</p>
                <div className="mt-4 space-y-4">
                  {selectedLab.tables.map((table) => <TablePreview key={table.name} table={table} />)}
                  {selectedLab.track === "python" && selectedLab.testCases?.length ? selectedLab.testCases.map((testCase) => <div key={testCase.name} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"><p className="text-xs font-semibold text-slate-400">{testCase.name}</p><pre className="mt-2 overflow-x-auto text-xs leading-5 text-slate-200"><code>{JSON.stringify(testCase.args, null, 2)}</code></pre></div>) : null}
                  {!selectedLab.tables.length && !(selectedLab.track === "python" && selectedLab.testCases?.length) ? <p className="rounded-2xl border border-slate-800 p-4 text-sm text-slate-400">Use the starter code and task contract as the input for this review question.</p> : null}
                </div>
              </section>
              <section className="border-t border-slate-800 pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Target / result data</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">The exact result or behavior your solution should produce.</p>
                <div className="mt-4 space-y-4">
                  {selectedLab.expectedOutputTable ? <MiniResultTable title="Expected output on sample data" table={selectedLab.expectedOutputTable} /> : null}
                  {expectedPreview ? <MiniResultTable title="Expected output on sample data" table={expectedPreview} /> : null}
                  {selectedLab.track === "python" && selectedLab.testCases?.length ? selectedLab.testCases.map((testCase) => <div key={testCase.name} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"><p className="text-xs font-semibold text-slate-400">{testCase.name}</p><pre className="mt-2 overflow-x-auto text-xs leading-5 text-teal-100"><code>{JSON.stringify(testCase.expected, null, 2)}</code></pre></div>) : null}
                  {selectedLab.expectedOutcome ? <p className="rounded-2xl border border-slate-800 p-4 whitespace-pre-line text-sm leading-6 text-slate-300">{selectedLab.expectedOutcome}</p> : null}
                  {expectedPreviewError ? <p className="text-xs leading-5 text-amber-100">Expected output preview is unavailable: {expectedPreviewError}</p> : null}
                </div>
              </section>
            </> : null}

            {referenceTab === "help" ? <>
              {selectedLab.tables.length ? <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Table schema</p><div className="mt-3"><TableSchemaReference tables={selectedLab.tables} /></div></div> : null}
              <div><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Hints</p><button type="button" onClick={() => setHintCount((count) => Math.min(count + 1, selectedLab.hints.length))} className="rounded-full border border-teal-300/30 px-3 py-2 text-xs font-semibold text-teal-100">Get hint</button></div><div className="mt-3 space-y-3">{selectedLab.hints.slice(0, hintCount).map((hint, index) => <div key={hint} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"><p className="text-xs font-semibold text-teal-200">Hint {index + 1}</p><p className="mt-2 text-sm leading-6 text-slate-300">{hint}</p></div>)}{hintCount === 0 ? <p className="text-sm leading-6 text-slate-400">Try once, then reveal one hint at a time.</p> : null}</div></div>
              <div className="border-t border-slate-800 pt-5"><button type="button" onClick={toggleSolution} disabled={isLoadingSolution} className="w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-bold text-slate-950">{showSolution ? "Hide model answer" : isLoadingSolution ? "Loading solution..." : "Reveal model answer"}</button>{solutionError ? <p className="mt-3 text-sm leading-6 text-amber-100">{solutionError}</p> : null}{showSolution ? <div className="mt-4 space-y-4"><pre className="max-h-[420px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-xs leading-6 text-teal-50"><code>{selectedLab.serverValidation === "python" ? serverSolutions[selectedLab.slug]?.solutionCode ?? "Model answer is loading." : selectedLab.solutionCode}</code></pre><p className="text-sm leading-6 text-slate-300">{selectedLab.serverValidation === "python" ? serverSolutions[selectedLab.slug]?.explanation ?? selectedLab.explanation : selectedLab.explanation}</p>{selectedLab.commonMistakes?.length ? <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">Common mistakes</p><ul className="mt-3 space-y-2 text-sm leading-6 text-amber-50">{selectedLab.commonMistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul></div> : null}</div> : null}</div>
            </> : null}
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <div className="panel rounded-[2rem] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
                  Fix workspace
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {track === "sql"
                    ? "Write a read-only query that returns the expected result."
                    : track === "python"
                      ? `Define the function ${selectedLab.functionName ?? ""} and pass the sample plus edge-case checks.`
                      : "Fix the PySpark code or write the production-safe approach. Your answer is checked for concepts, APIs, and trade-offs."}
                </p>
              </div>
              <button type="button" onClick={() => setMobileReferenceOpen(true)} className="rounded-full border border-teal-300/35 px-4 py-2 text-sm font-semibold text-teal-100 md:hidden">Open task & data</button>
            </div>
            {workspaceMessage ? (
              <p className="mt-3 text-sm font-semibold text-teal-100">{workspaceMessage}</p>
            ) : null}
            <div aria-live="polite" className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span>{saveStatus}</span>
              {saveStatus.toLowerCase().includes("retry") ? (
                <button
                  type="button"
                  onClick={() => void saveDraftNow()}
                  className="rounded-full border border-amber-300/40 px-3 py-1 text-[10px] text-amber-100 transition hover:bg-amber-300/10"
                >
                  Retry save
                </button>
              ) : null}
            </div>
            <textarea
              value={answer}
              onChange={(event) =>
                setAnswers((current) => {
                  setResult(null);
                  setSaveStatus(
                    getAuthToken()
                      ? "Saving to your account..."
                      : "Saving on this device..."
                  );
                  return {
                    ...current,
                    [selectedLab.slug]: event.target.value
                  };
                })
              }
              onKeyDown={(event) =>
                handleTextareaTabKeyDown(event, (nextValue) =>
                  setAnswers((current) => {
                    setResult(null);
                    setSaveStatus(
                      getAuthToken()
                        ? "Saving to your account..."
                        : "Saving on this device..."
                    );
                    return {
                      ...current,
                      [selectedLab.slug]: nextValue
                    };
                  })
                )
              }
              spellCheck={false}
              className="mt-5 min-h-[360px] w-full resize-y rounded-3xl border border-slate-700 bg-slate-950/80 p-5 font-mono text-sm leading-7 text-teal-50 outline-none transition focus:border-teal-300/70"
            />
            <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/35 p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Validation flow
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Run checks the visible sample only. Submit runs full validation and completes
                    the question only when every case passes.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void saveDraftNow()}
                    className="rounded-full border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-teal-300/40"
                  >
                    Save draft
                  </button>
                  <button
                    type="button"
                    onClick={() => { setReferenceTab("help"); setMobileReferenceOpen(true); }}
                    className="rounded-full border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-amber-300/40 md:hidden"
                  >
                    Hints & answer
                  </button>
                  {track === "sql" ? (
                    <button
                      type="button"
                      onClick={copySchema}
                      className="rounded-full border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-teal-300/40"
                    >
                      Copy schema
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={runSampleCheck}
                    disabled={isRunning}
                    className="rounded-full border border-amber-300/35 px-6 py-3 text-sm font-bold text-amber-100 transition hover:bg-amber-300/10 disabled:cursor-wait disabled:opacity-70"
                  >
                    {isRunning ? "Running sample..." : "Run sample"}
                  </button>
                  <button
                    type="button"
                    onClick={submitLab}
                    disabled={isRunning}
                    className="rounded-full bg-amber-300 px-7 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-70"
                  >
                    {isRunning ? "Submitting..." : "Submit for completion"}
                  </button>
                  <button
                    type="button"
	                    onClick={goToNextLab}
	                    disabled={!canGoNext}
	                    className={nextQuestionButtonClass}
	                  >
	                    {selectedCompleted ? "Next question" : "Complete to continue"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {result ? <ResultPanel result={result} /> : null}
        </section>

      </section>
        </>
      )}
      <AuthDialog isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </main>
  );
}

function LabLibraryView({
  labs,
  allLabCount,
  track,
  topics,
  topic,
  difficulty,
  progressFilter,
  progressFilterOptions,
  progressMap,
  answers,
  onTopicChange,
  onDifficultyChange,
  onProgressFilterChange,
  onSelectLab
}: {
  labs: CodingLab[];
  allLabCount: number;
  track: CodingLabTrack;
  topics: string[];
  topic: string;
  difficulty: string;
  progressFilter: ProgressFilter;
  progressFilterOptions: Array<{ label: ProgressFilter; count: number }>;
  progressMap: Record<string, CodingLabProgress>;
  answers: Record<string, string>;
  onTopicChange: (topic: string) => void;
  onDifficultyChange: (difficulty: string) => void;
  onProgressFilterChange: (filter: ProgressFilter) => void;
  onSelectLab: (slug: string) => void;
}) {
  return (
    <section className="mt-6 space-y-6">
      <div className="panel rounded-[2rem] p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
              Choose a question first
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50">
              Start with the card that matches today&apos;s practice goal.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Open any {formatTrackLabel(track)} question from the library. Once you choose one,
              the question navigator stays on the left so moving to the next lab is quick.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {progressFilterOptions.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onProgressFilterChange(item.label)}
                className={`rounded-3xl border px-4 py-4 text-left transition ${
                  progressFilter === item.label
                    ? "border-amber-300/70 bg-amber-300/15 text-amber-50"
                    : "border-slate-800 bg-slate-950/35 text-slate-300 hover:border-amber-300/30"
                }`}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                  {item.label}
                </span>
                <span className="mt-2 block text-2xl font-bold">{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex flex-wrap gap-2">
            {["All", "beginner", "intermediate", "advanced"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onDifficultyChange(item)}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                  difficulty === item
                    ? "bg-teal-300 text-slate-950"
                    : "border border-slate-700 bg-slate-950/40 text-slate-300 hover:border-teal-300/40"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <select
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100"
          >
            {topics.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {labs.length > 0 ? (
          labs.map((lab) => (
            <LabLibraryCard
              key={lab.slug}
              lab={lab}
              progress={progressMap[lab.slug]}
              hasDraft={Boolean(answers[lab.slug])}
              onSelect={() => onSelectLab(lab.slug)}
            />
          ))
        ) : (
          <div className="panel rounded-[2rem] p-8 sm:col-span-2 xl:col-span-3">
            <p className="text-lg font-semibold text-slate-100">No matching questions found.</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Try changing the difficulty, topic, or progress filter. There are {allLabCount} total
              questions in this lab.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function LabLibraryCard({
  lab,
  progress,
  hasDraft,
  onSelect
}: {
  lab: CodingLab;
  progress?: CodingLabProgress;
  hasDraft: boolean;
  onSelect: () => void;
}) {
  const isCompleted = Boolean(progress?.completed);
  const isAttempted = (progress?.attemptCount ?? 0) > 0;
  const status = getPracticeStatus(isCompleted, isAttempted || hasDraft);
  const cardClass = isCompleted
    ? "group flex min-h-[280px] flex-col rounded-[2rem] border border-teal-300/55 bg-teal-300/10 p-5 text-left shadow-[0_0_0_1px_rgba(94,234,212,0.12),0_22px_80px_rgba(20,184,166,0.12)] transition hover:-translate-y-1 hover:border-teal-200/70 hover:bg-teal-300/15"
    : isAttempted
      ? "group flex min-h-[280px] flex-col rounded-[2rem] border border-amber-300/55 bg-amber-300/10 p-5 text-left shadow-[0_0_0_1px_rgba(251,191,36,0.1),0_22px_80px_rgba(245,158,11,0.1)] transition hover:-translate-y-1 hover:border-amber-200/70 hover:bg-amber-300/15"
      : "group flex min-h-[280px] flex-col rounded-[2rem] border border-slate-800 bg-slate-950/45 p-5 text-left transition hover:-translate-y-1 hover:border-amber-300/50 hover:bg-slate-950/70";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cardClass}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {lab.section}
        </span>
        <PracticeStatusBadge status={status} />
      </div>
      <h3 className="mt-5 text-xl font-semibold leading-7 text-slate-50">{lab.title}</h3>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-400">
        {lab.problemStatement}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {lab.difficulty}
        </span>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {lab.estimatedMinutes} min
        </span>
        {lab.topicTags.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-auto pt-6">
        <span
          className={`inline-flex rounded-full px-5 py-3 text-sm font-bold text-slate-950 transition ${
            isCompleted
              ? "bg-teal-300 group-hover:bg-teal-200"
              : "bg-amber-300 group-hover:bg-amber-200"
          }`}
        >
          {isCompleted ? "Review completed lab" : "Start this lab"}
        </span>
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-50">{value}</p>
    </div>
  );
}

function TableSchemaReference({ tables }: { tables: CodingLabTable[] }) {
  return (
    <div className="space-y-3">
      {tables.map((table) => (
        <div
          key={table.name}
          className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3"
        >
          <p className="font-mono text-xs font-semibold text-slate-100">{table.name}</p>
          <p className="mt-2 break-words font-mono text-xs leading-5 text-slate-400">
            {table.columns.join(" · ")}
          </p>
        </div>
      ))}
    </div>
  );
}

function TablePreview({ table }: { table: CodingLabTable }) {
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
            {table.rows.slice(0, 7).map((row, rowIndex) => (
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

function ResultPanel({ result }: { result: LabRunResult }) {
  const tone =
    result.passed === true
      ? "border-teal-300/25 bg-teal-300/10 text-teal-50"
      : result.passed === false
        ? "border-amber-300/30 bg-amber-300/10 text-amber-50"
        : "border-amber-300/25 bg-amber-300/10 text-amber-50";

  return (
    <div className={`rounded-[2rem] border p-6 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em]">
        {result.passed === true
          ? "Correct answer"
          : result.passed === false
            ? "Wrong answer"
            : "Result"}
      </p>
      {typeof result.score === "number" ? (
        <p className="mt-3 text-3xl font-semibold tracking-tight">{result.score}/100</p>
      ) : null}
      <p className="mt-3 text-sm leading-6">{result.message}</p>
      {result.table ? (
        <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/70">
          <table className="min-w-full text-left text-xs text-slate-200">
            <thead>
              <tr>
                {result.table.columns.map((column) => (
                  <th key={column} className="px-4 py-3 font-semibold text-slate-400">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {result.table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} className="px-4 py-3 font-mono">
                      {String(cell ?? "NULL")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {result.sqlResults ? (
        <div className="mt-5 space-y-3">
          {result.sqlResults.map((test) => (
            <div
              key={test.name}
              className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{test.name}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{test.description}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    test.passed ? "bg-teal-300 text-slate-950" : "bg-amber-300 text-slate-950"
                  }`}
                >
                  {test.passed ? "pass" : "fail"}
                </span>
              </div>
              <div className={`mt-4 grid gap-3 ${test.passed ? "" : "lg:grid-cols-2"}`}>
                <MiniResultTable title="Your output" table={test.actual} />
                {!test.passed ? (
                  <MiniResultTable title="Expected output" table={test.expected} />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {result.pythonResults ? (
        <div className="mt-5 space-y-3">
          {result.pythonResults.map((test) => (
            <div key={test.name} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-slate-100">{test.name}</p>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    test.passed ? "bg-teal-300 text-slate-950" : "bg-amber-300 text-slate-950"
                  }`}
                >
                  {test.passed ? "pass" : "fail"}
                </span>
              </div>
              {test.message ? (
                <p className="mt-2 text-xs leading-5 text-slate-400">{test.message}</p>
              ) : null}
              {!test.passed ? (
                <pre className="mt-3 overflow-x-auto text-xs leading-6 text-slate-300">
                  {JSON.stringify({ expected: test.expected, actual: test.actual }, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {result.pysparkResults ? (
        <div className="mt-5 space-y-3">
          {result.pysparkResults.map((test) => (
            <div key={test.name} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{test.name}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{test.message}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    test.passed ? "bg-teal-300 text-slate-950" : "bg-amber-300 text-slate-950"
                  }`}
                >
                  {test.passed ? "pass" : "fail"}
                </span>
              </div>
              {test.actual || test.expected ? (
                <div className={`mt-4 grid gap-3 ${test.passed ? "" : "lg:grid-cols-2"}`}>
                  {test.actual ? <MiniResultTable title="Your output" table={test.actual} /> : null}
                  {!test.passed && test.expected ? (
                    <MiniResultTable title="Expected output" table={test.expected} />
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {result.reviewResults ? (
        <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-sm font-semibold text-slate-100">Production fix checklist</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {result.reviewResults.map((item) => (
              <span
                key={item.keyword}
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  item.matched ? "bg-teal-300 text-slate-950" : "bg-slate-800 text-slate-300"
                }`}
              >
                {item.matched ? "hit" : "missing"}: {item.keyword}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MiniResultTable({
  title,
  table
}: {
  title: string;
  table: BrowserSqlResultTable;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
      <p className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {title}
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[11px] text-slate-200">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column} className="px-3 py-2 font-semibold text-slate-400">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {table.rows.length > 0 ? (
              table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-2 font-mono">
                      {String(cell ?? "NULL")}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={Math.max(table.columns.length, 1)}>
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
