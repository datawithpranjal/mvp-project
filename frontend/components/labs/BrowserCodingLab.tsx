"use client";

import { useEffect, useMemo, useState } from "react";

import {
  runReadOnlySql,
  validateSqlOutput,
  type BrowserSqlResultTable
} from "../../lib/browser-sql";
import {
  formatTrackLabel,
  getCodingLabs,
  type CodingLab,
  type CodingLabTable,
  type CodingLabTrack,
  type SqlTestCase
} from "../../lib/coding-labs";

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

interface LabRunResult {
  passed: boolean | null;
  message: string;
  table?: BrowserSqlResultTable;
  sqlResults?: SqlCaseResult[];
  pythonResults?: PythonTestResult[];
}

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

function rememberCompletion(lab: CodingLab, passed: boolean) {
  if (!passed) return;
  const key = "data-foundry-coding-lab-progress";
  const current = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
  current[lab.slug] = {
    completed: true,
    completedAt: new Date().toISOString(),
    track: lab.track
  };
  window.localStorage.setItem(key, JSON.stringify(current));
}

async function runSqlLab(lab: CodingLab, answer: string): Promise<LabRunResult> {
  if (!lab.expectedSql) {
    return {
      passed: null,
      message: "This SQL lab is missing an expected query. Reveal the model answer for now."
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
  rememberCompletion(lab, passed);
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
      message: "This Python lab is missing tests. Reveal the model answer for now."
    };
  }

  const pyodide = await getPyodide();
  const raw = await pyodide.runPythonAsync(`${answer}\n\n${buildPythonHarness(lab)}`);
  const pythonResults = JSON.parse(String(raw)) as PythonTestResult[];
  const passed = pythonResults.every((result) => result.passed);
  rememberCompletion(lab, passed);

  return {
    passed,
    message: passed
      ? "Correct. Your Python function passed all browser-side tests."
      : "Some tests failed. Look at the failing input/output and tighten your edge-case handling.",
    pythonResults
  };
}

export function BrowserCodingLab({ track }: { track: CodingLabTrack }) {
  const labs = useMemo(() => getCodingLabs(track), [track]);
  const [selectedSlug, setSelectedSlug] = useState(labs[0]?.slug ?? "");
  const selectedLab = labs.find((lab) => lab.slug === selectedSlug) ?? labs[0];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hintCount, setHintCount] = useState(0);
  const [showSolution, setShowSolution] = useState(false);
  const [result, setResult] = useState<LabRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [topic, setTopic] = useState("All");
  const [difficulty, setDifficulty] = useState("All");
  const [expectedPreview, setExpectedPreview] = useState<BrowserSqlResultTable | null>(null);
  const [expectedPreviewError, setExpectedPreviewError] = useState("");

  const topics = useMemo(() => {
    const all = new Set<string>();
    labs.forEach((lab) => lab.topicTags.forEach((tag) => all.add(tag)));
    return ["All", ...Array.from(all).sort()];
  }, [labs]);

  const filteredLabs = labs.filter((lab) => {
    const topicMatches = topic === "All" || lab.topicTags.includes(topic);
    const difficultyMatches = difficulty === "All" || lab.difficulty === difficulty;
    return topicMatches && difficultyMatches;
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

  async function runLab() {
    if (!selectedLab) return;
    try {
      setIsRunning(true);
      setResult(null);
      const nextResult =
        selectedLab.track === "sql"
          ? await runSqlLab(selectedLab, answer)
          : await runPythonLab(selectedLab, answer);
      setResult(nextResult);
    } catch (error) {
      setResult({
        passed: false,
        message: error instanceof Error ? error.message : "Execution failed in the browser."
      });
    } finally {
      setIsRunning(false);
    }
  }

  function switchLab(slug: string) {
    setSelectedSlug(slug);
    setHintCount(0);
    setShowSolution(false);
    setResult(null);
  }

  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-4 py-8 sm:px-8">
      <section className="panel rounded-[2rem] p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          {formatTrackLabel(track)} Lab
        </p>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-50">
              Browser-based data engineering practice.
            </h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">
              Run code directly in your browser. No backend judge, no hidden server state:
              inspect the data, write the fix, run checks, then explain the production lesson.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Labs" value={labs.length} />
            <Stat label="Free" value={labs.filter((lab) => lab.isFree).length} />
            <Stat label="Runtime" value={track === "sql" ? "SQLite" : "Pyodide"} />
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)_340px]">
        <aside className="panel h-fit rounded-[2rem] p-5">
          <div className="flex flex-wrap gap-2">
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
          <div className="mt-5 max-h-[720px] space-y-3 overflow-y-auto pr-1">
            {filteredLabs.map((lab) => (
              <button
                key={lab.slug}
                type="button"
                onClick={() => switchLab(lab.slug)}
                className={`w-full rounded-3xl border p-4 text-left transition ${
                  lab.slug === selectedLab.slug
                    ? "border-teal-300/60 bg-teal-300/10"
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
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-6">
          <div className="panel rounded-[2rem] p-6">
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
          </div>

          {selectedLab.tables.length > 0 ? (
            <div className="panel rounded-[2rem] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Sample production data
              </p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
                    : `Define the function ${selectedLab.functionName ?? ""} and pass the browser tests.`}
                </p>
              </div>
              <button
                type="button"
                onClick={runLab}
                disabled={isRunning}
                className="rounded-full bg-amber-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-70"
              >
                {isRunning ? "Running..." : track === "sql" ? "Run query" : "Run tests"}
              </button>
            </div>
            <textarea
              value={answer}
              onChange={(event) =>
                setAnswers((current) => ({
                  ...current,
                  [selectedLab.slug]: event.target.value
                }))
              }
              spellCheck={false}
              className="mt-5 min-h-[360px] w-full resize-y rounded-3xl border border-slate-700 bg-slate-950/80 p-5 font-mono text-sm leading-7 text-teal-50 outline-none transition focus:border-teal-300/70"
            />
          </div>

          {result ? <ResultPanel result={result} /> : null}
        </section>

        <aside className="space-y-6">
          <div className="panel rounded-[2rem] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Browser runtime
            </p>
            <h3 className="mt-3 text-xl font-semibold text-slate-50">
              No backend execution
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {track === "sql"
                ? "The table seed and validation run inside your browser using SQLite/WebAssembly."
                : "Python loads through Pyodide in your browser, then runs your function against sample tests."}
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
              </div>
            ) : null}
          </div>
        </aside>
      </section>
    </main>
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

function TablePreview({ table }: { table: CodingLabTable }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/40">
      <div className="border-b border-slate-800 px-4 py-3">
        <p className="font-mono text-sm font-semibold text-teal-100">{table.name}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-950/70 text-slate-400">
            <tr>
              {table.columns.map((column) => (
                <th key={column} className="px-4 py-3 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {table.rows.slice(0, 7).map((row, rowIndex) => (
              <tr key={`${table.name}-${rowIndex}`}>
                {table.columns.map((column, columnIndex) => (
                  <td key={column} className="whitespace-nowrap px-4 py-3 font-mono">
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
        {result.passed === true ? "Passed" : result.passed === false ? "Needs work" : "Result"}
      </p>
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
              {!test.passed ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <MiniResultTable title="Your output" table={test.actual} />
                  <MiniResultTable title="Expected output" table={test.expected} />
                </div>
              ) : null}
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
