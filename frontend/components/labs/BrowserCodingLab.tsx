"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  runReadOnlySql,
  validateSqlOutput,
  type BrowserSqlResultTable
} from "../../lib/browser-sql";
import { trackEvent } from "../../lib/analytics";
import { getCurrentUser } from "../../lib/auth";
import { getGuestSubmissionStatus, recordGuestSubmission } from "../../lib/guest-submissions";
import { sendUsageEvent } from "../../lib/usage";
import {
  formatTrackLabel,
  getCodingLabs,
  type CodingLab,
  type CodingLabTable,
  type CodingLabTrack,
  type PythonTestCase,
  type SqlTestCase
} from "../../lib/coding-labs";
import {
  getCodingLabDrafts,
  getCodingLabProgressMap,
  getLastCodingLab,
  recordCodingLabAttempt,
  saveCodingLabDraft,
  saveLastCodingLab,
  type CodingLabProgress
} from "../../lib/coding-lab-session";
import { AuthDialog } from "../auth-dialog";

interface PythonTestResult {
  name: string;
  passed: boolean;
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

interface LabRunResult {
  passed: boolean | null;
  message: string;
  table?: BrowserSqlResultTable;
  sqlResults?: SqlCaseResult[];
  pythonResults?: PythonTestResult[];
  score?: number;
  reviewResults?: ReviewKeywordResult[];
}

type ProgressFilter = "All" | "Attempted" | "Completed" | "Not started";

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

function buildPythonHarness(lab: CodingLab) {
  return `
import json

_function_name = ${JSON.stringify(lab.functionName)}
_test_cases = json.loads(${JSON.stringify(JSON.stringify(lab.testCases ?? []))})

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

async function runPythonLab(lab: CodingLab, answer: string): Promise<LabRunResult> {
  if (!lab.functionName || !lab.testCases?.length) {
    return {
      passed: null,
      message: "This lab cannot be validated yet. Please choose another question or contact support."
    };
  }

  const pyodide = await getPyodide();
  const raw = await pyodide.runPythonAsync(`${answer}\n\n${buildPythonHarness(lab)}`);
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
  const questionListRef = useRef<HTMLDivElement | null>(null);
  const activeQuestionRef = useRef<HTMLDivElement | null>(null);
  const [selectedSlug, setSelectedSlug] = useState(labs[0]?.slug ?? "");
  const selectedLab = labs.find((lab) => lab.slug === selectedSlug) ?? labs[0];
  const [isLibraryMode, setIsLibraryMode] = useState(true);
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
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const topics = useMemo(() => {
    const all = new Set<string>();
    labs.forEach((lab) => lab.topicTags.forEach((tag) => all.add(tag)));
    return ["All", ...Array.from(all).sort()];
  }, [labs]);

  const progressStats = useMemo(() => {
    const attempted = labs.filter((lab) => (progressMap[lab.slug]?.attemptCount ?? 0) > 0).length;
    const completed = labs.filter((lab) => progressMap[lab.slug]?.completed).length;
    const drafted = labs.filter(
      (lab) => !progressMap[lab.slug]?.attemptCount && Boolean(answers[lab.slug])
    ).length;

    return {
      attempted,
      completed,
      notStarted: Math.max(0, labs.length - attempted - drafted),
      drafted
    };
  }, [answers, labs, progressMap]);

  const progressFilterOptions: Array<{ label: ProgressFilter; count: number }> = [
    { label: "All", count: labs.length },
    { label: "Attempted", count: progressStats.attempted },
    { label: "Completed", count: progressStats.completed },
    { label: "Not started", count: progressStats.notStarted }
  ];

  const filteredLabs = labs.filter((lab) => {
    const topicMatches = topic === "All" || lab.topicTags.includes(topic);
    const difficultyMatches = difficulty === "All" || lab.difficulty === difficulty;
    const labProgress = progressMap[lab.slug];
    const attemptCount = labProgress?.attemptCount ?? 0;
    const hasDraft = Boolean(answers[lab.slug]);
    const progressMatches =
      progressFilter === "All" ||
      (progressFilter === "Attempted" && attemptCount > 0) ||
      (progressFilter === "Completed" && Boolean(labProgress?.completed)) ||
      (progressFilter === "Not started" && attemptCount === 0 && !hasDraft);
    return topicMatches && difficultyMatches && progressMatches;
  });
  const filteredLabSignature = filteredLabs.map((lab) => lab.slug).join("|");

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
    const savedDrafts = getCodingLabDrafts();
    setAnswers(
      Object.fromEntries(
        Object.entries(savedDrafts).map(([slug, draft]) => [slug, draft.code])
      )
    );
    setProgressMap(getCodingLabProgressMap());
    setDraftsLoaded(true);
  }, [labs, track]);

  useEffect(() => {
    if (!draftsLoaded || !selectedLab) return;
    saveLastCodingLab(track, selectedLab.slug);
  }, [draftsLoaded, selectedLab, track]);

  useEffect(() => {
    if (!draftsLoaded || !selectedLab) return;
    const currentAnswer = answers[selectedLab.slug];
    if (typeof currentAnswer !== "string") return;

    setSaveStatus("Saving...");
    const timer = window.setTimeout(() => {
      const draft = saveCodingLabDraft(selectedLab.slug, currentAnswer);
      setSaveStatus(
        `Saved at ${new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit"
        }).format(new Date(draft.savedAt))}`
      );
    }, 500);

    return () => window.clearTimeout(timer);
  }, [answers, draftsLoaded, selectedLab]);

  useEffect(() => {
    if (isLibraryMode || workspaceFocusNonce === 0) return;

    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [isLibraryMode, workspaceFocusNonce]);

  useEffect(() => {
    if (isLibraryMode) return;

    window.requestAnimationFrame(() => {
      const questionList = questionListRef.current;
      const activeQuestion = activeQuestionRef.current;
      if (!questionList || !activeQuestion) return;

      const centeredTop =
        activeQuestion.offsetTop - questionList.clientHeight / 2 + activeQuestion.clientHeight / 2;
      questionList.scrollTo({
        top: Math.max(0, centeredTop),
        behavior: "smooth"
      });
    });
  }, [filteredLabSignature, isLibraryMode, selectedSlug]);

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

  async function runLab() {
    if (!selectedLab) return;
    const currentUser = getCurrentUser();
    const guestQuestionKey = `coding:${selectedLab.slug}`;
    const guestStatus = getGuestSubmissionStatus(guestQuestionKey);
    if (!currentUser && !guestStatus.canSubmit) {
      setWorkspaceMessage(
        "You have used your 3 free guest questions. Log in or create an account to continue."
      );
      setIsAuthOpen(true);
      trackEvent("signup_started", { source: "coding_lab_submit", lab: selectedLab.slug });
      return;
    }

    try {
      setIsRunning(true);
      setResult(null);
      const nextResult =
        selectedLab.track === "sql"
          ? await runSqlLab(selectedLab, answer)
          : selectedLab.track === "python"
            ? await runPythonLab(selectedLab, answer)
            : evaluateCodeReviewLab(selectedLab, answer);
      setResult(nextResult);
      setProgressMap(
        recordCodingLabAttempt(selectedLab.slug, selectedLab.track, nextResult.passed === true)
      );
      if (!currentUser) {
        const nextGuestStatus = recordGuestSubmission(guestQuestionKey);
        setWorkspaceMessage(
          nextGuestStatus.remaining > 0
            ? `${nextGuestStatus.remaining} free guest question${nextGuestStatus.remaining === 1 ? "" : "s"} left in this session.`
            : "You have used your 3 free guest questions. Log in to continue practicing."
        );
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
        sendUsageEvent("coding_lab_completed", {
          metadata: {
            lab_slug: selectedLab.slug,
            track: selectedLab.track
          }
        });
        trackEvent("lab_completed", { lab: selectedLab.slug, track: selectedLab.track });
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

  async function runSqlPreview() {
    if (selectedLab.track !== "sql") return;
    try {
      setIsRunning(true);
      setResult(null);
      if (!selectedLab.expectedSql) {
        const table = await runReadOnlySql(selectedLab.tables, answer);
        setResult({
          passed: null,
          message:
            "Query ran successfully, but this lab does not yet have an expected result for comparison.",
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
          ? "Correct answer on the visible sample data. Submit your answer to run the hidden edge-case checks."
          : "Wrong answer. The query ran successfully, but its output does not match the expected result on the visible sample data.",
        sqlResults: [
          {
            name: "Visible sample data",
            description:
              "Run-query check against the sample tables and expected output shown in this lab.",
            passed: validation.passed,
            actual: validation.actual,
            expected: validation.expected
          }
        ]
      });
      setProgressMap(recordCodingLabAttempt(selectedLab.slug, selectedLab.track, false));
    } catch (error) {
      setResult({
        passed: false,
        message: error instanceof Error ? error.message : "The query could not run.",
        table: { columns: [], rows: [] }
      });
      setProgressMap(recordCodingLabAttempt(selectedLab.slug, selectedLab.track, false));
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
    setWorkspaceFocusNonce((count) => count + 1);
    setHintCount(0);
    setShowSolution(false);
    setResult(null);
    setWorkspaceMessage("");
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-8 sm:px-8">
      <section className="panel rounded-[2rem] p-7">
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
            <Stat label="Attempted" value={progressStats.attempted} />
            <Stat label="Completed" value={progressStats.completed} />
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

      <section
        ref={workspaceRef}
        className="mt-6 scroll-mt-28 grid gap-6 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)_320px]"
      >
        <aside className="panel h-fit rounded-[2rem] p-5 md:sticky md:top-24 md:max-h-[calc(100vh-7rem)] md:overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
                Questions
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Jump directly to another lab.
              </p>
            </div>
            <button
              type="button"
              onClick={returnToLibrary}
              className="rounded-full border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-amber-300/40 hover:text-amber-100"
            >
              All cards
            </button>
          </div>
          <div
            ref={questionListRef}
            className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1 md:max-h-[calc(100vh-18rem)]"
          >
            {filteredLabs.length > 0 ? (
              filteredLabs.map((lab) => {
                const isActive = lab.slug === selectedLab.slug;
                return (
                  <div key={lab.slug} ref={isActive ? activeQuestionRef : null}>
                    <LabListButton
                      lab={lab}
                      active={isActive}
                      progress={progressMap[lab.slug]}
                      hasDraft={Boolean(answers[lab.slug])}
                      onSelect={() => switchLab(lab.slug)}
                    />
                  </div>
                );
              })
            ) : (
              <div className="rounded-3xl border border-slate-800 bg-slate-950/30 p-4">
                <p className="text-sm font-semibold text-slate-200">No questions found.</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Try another progress tab, topic, or difficulty filter.
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-slate-800 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Refine list
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["All", "beginner", "intermediate", "advanced"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setDifficulty(item)}
                className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                  difficulty === item
                    ? "bg-teal-300 text-slate-950"
                    : "border border-slate-700 bg-slate-950/40 text-slate-300"
                }`}
              >
                {item}
              </button>
            ))}
            </div>
            <select
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100"
            >
              {topics.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/30 p-3">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Progress
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {progressFilterOptions.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setProgressFilter(item.label)}
                  className={`rounded-2xl border px-3 py-3 text-left text-xs transition ${
                    progressFilter === item.label
                      ? "border-amber-300/60 bg-amber-300/15 text-amber-50"
                      : "border-slate-800 bg-slate-950/30 text-slate-300 hover:border-amber-300/30"
                  }`}
                >
                  <span className="block font-semibold">{item.label}</span>
                  <span className="mt-1 block text-lg font-bold">{item.count}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 px-2 text-xs leading-5 text-slate-500">
              Attempts are saved automatically after you run or submit a question.
            </p>
          </div>
        </aside>

        <section className="min-w-0 space-y-6">
          <div className="panel rounded-[2rem] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]">
                  {selectedLab.difficulty}
                </span>
                {selectedLab.topicTags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={goToNextLab}
                disabled={!nextLab}
                className="rounded-full border border-teal-300/30 px-5 py-2 text-sm font-semibold text-teal-100 transition hover:bg-teal-300/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                Next question
              </button>
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50">
              {selectedLab.title}
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              {selectedLab.businessContext}
            </p>
            <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                Data engineer task
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-50">{selectedLab.studentTask}</p>
            </div>
            {selectedLab.expectedOutcome ? (
              <div className="mt-4 rounded-3xl border border-teal-300/20 bg-teal-300/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-100">
                  Expected outcome
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-teal-50">
                  {selectedLab.expectedOutcome}
                </p>
                {expectedPreview ? (
                  <div className="mt-4">
                    <MiniResultTable title="Expected output on sample data" table={expectedPreview} />
                  </div>
                ) : null}
                {expectedPreviewError ? (
                  <p className="mt-3 text-xs leading-5 text-amber-100">
                    Expected output preview is unavailable: {expectedPreviewError}
                  </p>
                ) : null}
              </div>
            ) : null}
            {selectedLab.track === "python" && selectedLab.testCases?.length ? (
              <PythonExamplesPanel lab={selectedLab} testCases={selectedLab.testCases} />
            ) : null}
          </div>

          {selectedLab.tables.length > 0 ? (
            <div className="panel rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Sample production data
              </p>
              <div className="mt-4 grid min-w-0 gap-4">
                {selectedLab.tables.map((table) => (
                  <TablePreview key={table.name} table={table} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="panel rounded-[2rem] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
                  Fix workspace
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  {track === "sql"
                    ? "Write a read-only query that returns the expected result."
                    : track === "python"
                      ? `Define the function ${selectedLab.functionName ?? ""} and pass the browser tests.`
                      : "Fix the PySpark code or write the production-safe approach. Your answer is checked for concepts, APIs, and trade-offs."}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={goToNextLab}
                  disabled={!nextLab}
                  className="rounded-full border border-teal-300/30 px-5 py-3 text-sm font-bold text-teal-100 transition hover:bg-teal-300/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                >
                  Next question
                </button>
                {track === "sql" ? (
                  <>
                    <button
                      type="button"
                      onClick={copySchema}
                      className="rounded-full border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-teal-300/40"
                    >
                      Copy schema
                    </button>
                    <button
                      type="button"
                      onClick={runSqlPreview}
                      disabled={isRunning}
                      className="rounded-full border border-amber-300/35 px-5 py-3 text-sm font-bold text-amber-100 transition hover:bg-amber-300/10 disabled:cursor-wait disabled:opacity-70"
                    >
                      {isRunning ? "Running..." : "Run query"}
                    </button>
                    <button
                      type="button"
                      onClick={runLab}
                      disabled={isRunning}
                      className="rounded-full bg-amber-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-70"
                    >
                      {isRunning ? "Submitting..." : "Submit answer"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={runLab}
                    disabled={isRunning}
                    className="rounded-full bg-amber-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-70"
                  >
                    {isRunning
                      ? "Running..."
                      : track === "python"
                        ? "Run tests"
                        : "Check fix"}
                  </button>
                )}
              </div>
            </div>
            {workspaceMessage ? (
              <p className="mt-3 text-sm font-semibold text-teal-100">{workspaceMessage}</p>
            ) : null}
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {saveStatus}
            </p>
            <textarea
              value={answer}
              onChange={(event) =>
                setAnswers((current) => {
                  setResult(null);
                  setSaveStatus("Saving...");
                  return {
                    ...current,
                    [selectedLab.slug]: event.target.value
                  };
                })
              }
              spellCheck={false}
              className="mt-5 min-h-[360px] w-full resize-y rounded-3xl border border-slate-700 bg-slate-950/80 p-5 font-mono text-sm leading-7 text-teal-50 outline-none transition focus:border-teal-300/70"
            />
          </div>

          {result ? <ResultPanel result={result} /> : null}
        </section>

        <aside className="space-y-6 md:col-start-2 2xl:col-start-auto">
          <div className="panel rounded-[2rem] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Practice workflow
            </p>
            <h3 className="mt-3 text-xl font-semibold text-slate-50">
              Attempt, validate, improve
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {track === "sql"
                ? "Inspect the seeded tables, write your query, run it, and submit it for complete validation."
                : track === "python"
                  ? "Use the sample inputs and outputs, implement the function, and run the validation checks."
                  : "Review the PySpark issue, propose a production-safe fix, and check it against the expected APIs and reasoning."}
            </p>
          </div>

          <div className="panel rounded-[2rem] p-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Hints
              </p>
              <button
                type="button"
                onClick={() => setHintCount((count) => Math.min(count + 1, selectedLab.hints.length))}
                className="rounded-full border border-teal-300/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-100"
              >
                Get hint
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {selectedLab.hints.slice(0, hintCount).map((hint, index) => (
                <div key={hint} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">
                    Hint {index + 1}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{hint}</p>
                </div>
              ))}
              {hintCount === 0 ? (
                <p className="text-sm leading-6 text-slate-400">
                  Try first. Then reveal hints one at a time like an interviewer nudging you.
                </p>
              ) : null}
            </div>
          </div>

          <div className="panel rounded-[2rem] p-6">
            <button
              type="button"
              onClick={() => setShowSolution((value) => !value)}
              className="w-full rounded-full bg-teal-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-teal-200"
            >
              {showSolution ? "Hide solution" : "Reveal model answer"}
            </button>
            {showSolution ? (
              <div className="mt-5 space-y-4">
                <pre className="max-h-[420px] overflow-auto rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-xs leading-6 text-teal-50">
                  <code>{selectedLab.solutionCode}</code>
                </pre>
                <p className="text-sm leading-6 text-slate-300">{selectedLab.explanation}</p>
                {selectedLab.commonMistakes?.length ? (
                  <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
                      Common mistake
                    </p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-50">
                      {selectedLab.commonMistakes.map((mistake) => (
                        <li key={mistake}>{mistake}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>
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
  const status =
    isCompleted
      ? "Completed"
      : (progress?.attemptCount ?? 0) > 0
        ? "Attempted"
        : hasDraft
          ? "Draft saved"
          : "Not started";
  const statusTone =
    status === "Completed"
      ? "bg-teal-300 text-slate-950"
      : status === "Attempted"
        ? "bg-amber-300 text-slate-950"
        : status === "Draft saved"
          ? "border border-sky-300/40 text-sky-100"
          : "border border-slate-700 text-slate-400";
  const cardClass = isCompleted
    ? "group flex min-h-[280px] flex-col rounded-[2rem] border border-teal-300/55 bg-teal-300/10 p-5 text-left shadow-[0_0_0_1px_rgba(94,234,212,0.12),0_22px_80px_rgba(20,184,166,0.12)] transition hover:-translate-y-1 hover:border-teal-200/70 hover:bg-teal-300/15"
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
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${statusTone}`}>
          {status}
        </span>
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

function LabListButton({
  lab,
  active,
  progress,
  hasDraft,
  onSelect
}: {
  lab: CodingLab;
  active: boolean;
  progress?: CodingLabProgress;
  hasDraft: boolean;
  onSelect: () => void;
}) {
  const isCompleted = Boolean(progress?.completed);
  const status =
    isCompleted
      ? "Completed"
      : (progress?.attemptCount ?? 0) > 0
        ? "Attempted"
        : hasDraft
          ? "Draft saved"
          : "Not started";
  const statusClass =
    status === "Completed"
      ? "bg-teal-300 text-slate-950"
      : status === "Attempted"
        ? "bg-amber-300 text-slate-950"
        : status === "Draft saved"
          ? "border border-sky-300/40 text-sky-100"
          : "border border-slate-700 text-slate-400";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-3xl border p-4 text-left transition ${
        active
          ? "border-teal-300/70 bg-teal-300/15 shadow-[0_0_0_1px_rgba(94,234,212,0.12)]"
          : isCompleted
            ? "border-teal-300/45 bg-teal-300/10 hover:border-teal-200/60 hover:bg-teal-300/15"
            : "border-slate-800 bg-slate-950/30 hover:border-teal-300/30"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          {lab.section}
        </span>
        <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-400">
          {lab.estimatedMinutes}m
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold leading-5 text-slate-100">{lab.title}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{lab.problemStatement}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${statusClass}`}>
          {status}
        </span>
        {(progress?.attemptCount ?? 0) > 0 ? (
          <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {progress?.attemptCount} attempt{progress?.attemptCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function PythonExamplesPanel({
  lab,
  testCases
}: {
  lab: CodingLab;
  testCases: PythonTestCase[];
}) {
  return (
    <div className="mt-4 rounded-3xl border border-sky-300/20 bg-sky-300/10 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
          Sample input and output
        </p>
        <p className="text-xs leading-5 text-slate-400">
          Return the value from your function. Do not print it.
        </p>
      </div>
      <div className="mt-4 grid gap-3">
        {testCases.slice(0, 3).map((testCase) => (
          <div
            key={testCase.name}
            className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60"
          >
            <div className="border-b border-slate-800 px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                {testCase.name}
              </p>
            </div>
            <div className="grid gap-0 md:grid-cols-2">
              <ExampleBlock
                label="Input"
                value={`${lab.functionName ?? "your_function"}(${testCase.args
                  .map(formatPythonLiteral)
                  .join(", ")})`}
              />
              <ExampleBlock label="Expected output" value={formatPythonLiteral(testCase.expected)} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">
        The browser tests may also include similar edge cases, so keep your solution general.
      </p>
    </div>
  );
}

function ExampleBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-slate-800 p-4 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-200">
        <code>{value}</code>
      </pre>
    </div>
  );
}

function formatPythonLiteral(value: unknown): string {
  if (value === null || typeof value === "undefined") return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "None";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(formatPythonLiteral).join(", ")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${JSON.stringify(key)}: ${formatPythonLiteral(item)}`)
      .join(", ")}}`;
  }
  return JSON.stringify(value);
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-50">{value}</p>
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
        ? "border-rose-300/25 bg-rose-300/10 text-rose-50"
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
                    test.passed ? "bg-teal-300 text-slate-950" : "bg-rose-300 text-slate-950"
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
                    test.passed ? "bg-teal-300 text-slate-950" : "bg-rose-300 text-slate-950"
                  }`}
                >
                  {test.passed ? "pass" : "fail"}
                </span>
              </div>
              {!test.passed ? (
                <pre className="mt-3 overflow-x-auto text-xs leading-6 text-slate-300">
                  {JSON.stringify({ expected: test.expected, actual: test.actual }, null, 2)}
                </pre>
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
