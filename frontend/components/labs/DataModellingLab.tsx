"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CONTENT_MANIFEST, DRAFT_KEY, QUERY_BUDGET_MS, fixtureLabels, initialModellingDraft,
  modellingFixtures, modellingPacket, modellingQueries, parseModellingDraft,
  type ModellingDraft, type ModellingResult, type ReportStage
} from "../../lib/data-modelling";
import { startModellingRun } from "../../lib/data-modelling-runner";
import type { BrowserSqlCell, BrowserSqlResultTable } from "../../lib/browser-sql";

const button = "rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-teal-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300 disabled:opacity-50";
const stages: ReportStage[] = ["historical", "as_of"];
const stageLabel = (stage: ReportStage) => stage === "historical" ? "At sale time" : "As of 15 February";
const ordersColumns = ["order_id", "line_id", "customer_id", "sale_ts", "amount"];
const historyColumns = ["customer_id", "territory", "valid_from", "valid_to"];

export function DataModellingLab() {
  const [draft, setDraft] = useState<ModellingDraft>(initialModellingDraft);
  const draftRef = useRef(draft);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const savedRevision = useRef("");
  const [storageMessage, setStorageMessage] = useState("Loading this device's draft…");
  const [storageError, setStorageError] = useState(false);
  const [conflict, setConflict] = useState<{ raw: string | null } | null>(null);
  const [results, setResults] = useState<Partial<Record<ReportStage, ModellingResult>>>({});
  const [running, setRunning] = useState<ReportStage | null>(null);
  const [runMessage, setRunMessage] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const runId = useRef(0);
  const activeRun = useRef<{ cancel: () => void } | null>(null);
  const fixture = modellingFixtures.find(item => item.name === draft.fixture)!;

  function invalidate() {
    ++runId.current;
    activeRun.current?.cancel();
    activeRun.current = null;
    setRunning(null);
    setResults({});
    setRunMessage("");
  }
  function replaceDraft(next: ModellingDraft, edited: boolean) {
    invalidate();
    draftRef.current = next;
    setDraft(next);
    dirtyRef.current = edited;
    setDirty(edited);
  }
  function change(patch: Partial<ModellingDraft>) {
    replaceDraft({ ...draftRef.current, ...patch }, true);
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const restored = parseModellingDraft(raw);
        savedRevision.current = restored.revision;
        replaceDraft(restored, false);
        setStorageMessage("Restored both drafts from this device. Checks must be run again.");
      } else setStorageMessage("Drafts stay in these editors until you save on this device.");
    } catch (error) {
      setStorageError(true);
      setStorageMessage(error instanceof Error ? error.message : "Device storage unavailable. Keep a copy of both queries and retry saving.");
    }
    setReady(true);
    function onStorage(event: StorageEvent) {
      if (event.key !== DRAFT_KEY) return;
      if (dirtyRef.current || !event.newValue) {
        setConflict({ raw: event.newValue });
        return;
      }
      try {
        const restored = parseModellingDraft(event.newValue);
        savedRevision.current = restored.revision;
        replaceDraft(restored, false);
        setStorageMessage("Loaded the newer saved device copy. Checks must be run again.");
      } catch {
        setConflict({ raw: event.newValue });
        setStorageError(true);
        setStorageMessage("Another tab saved an unsupported draft. These editors are unchanged.");
      }
    }
    function onUnload(event: BeforeUnloadEvent) {
      if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; }
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      ++runId.current;
      activeRun.current?.cancel();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", onUnload);
    };
    // Hydrate once; storage events reconcile against refs rather than an old render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(force = false) {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!force) {
        if (raw) {
          const current = parseModellingDraft(raw);
          if (current.revision !== savedRevision.current) { setConflict({ raw }); return; }
        } else if (savedRevision.current) { setConflict({ raw: null }); return; }
      }
      const next = { ...draftRef.current, revision: crypto.randomUUID() };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      draftRef.current = next;
      setDraft(next);
      savedRevision.current = next.revision;
      dirtyRef.current = false;
      setDirty(false);
      setStorageError(false);
      setConflict(null);
      setStorageMessage("Saved both drafts and the selected snapshot on this device only. No cloud save or completion record.");
    } catch {
      setStorageError(true);
      setStorageMessage("Could not save: device storage is unavailable, full or uses an unsupported version. Both editors are preserved. Copy them before leaving; retry or explicitly replace the saved copy.");
    }
  }
  function loadOtherCopy() {
    if (!conflict?.raw) { setStorageMessage("The other saved copy was removed. Your current editors are still available."); return; }
    try {
      const next = parseModellingDraft(conflict.raw);
      if (!window.confirm("Replace both current editors with the other tab's saved copy? Unsaved edits will be discarded.")) return;
      replaceDraft(next, false);
      savedRevision.current = next.revision;
      setConflict(null);
      setStorageError(false);
      setStorageMessage("Loaded the other device copy. Checks must be run again.");
    } catch { setStorageMessage("That saved copy is unsupported. Current editors were kept."); }
  }
  function run(stage: ReportStage) {
    const id = ++runId.current;
    activeRun.current?.cancel();
    const current = draftRef.current;
    const sql = current[stage];
    const snapshot = current.fixture;
    setResults(previous => ({ ...previous, [stage]: undefined }));
    setRunning(stage);
    setRunMessage(`Running ${stageLabel(stage)} on ${fixtureLabels[snapshot]}. Cancel is available.`);
    activeRun.current = startModellingRun({ id, fixture: snapshot, stage, sql }, outcome => {
      if (id !== runId.current || draftRef.current.fixture !== snapshot || draftRef.current[stage] !== sql) return;
      activeRun.current = null;
      setRunning(null);
      if (outcome.kind === "result") {
        setResults(previous => ({ ...previous, [stage]: outcome.result }));
        setRunMessage(`${stageLabel(stage)}: ${outcome.result.message}`);
      } else setRunMessage(outcome.kind === "timeout"
        ? "Stopped after the 3-second query budget. Execution was terminated. Both drafts are preserved; simplify the query and retry."
        : outcome.kind === "cancelled" ? "Run cancelled. Execution was terminated; both drafts are preserved."
        : "SQL engine unavailable. Both drafts are preserved. Check the connection and retry Run to reload the engine.");
    });
  }
  function cancel() {
    ++runId.current;
    activeRun.current?.cancel();
    activeRun.current = null;
    setRunning(null);
    setRunMessage("Run cancelled. Execution was terminated; both drafts are preserved.");
  }
  function restart() {
    if (!window.confirm("Restart the exercise? Both edited drafts, hints and review state will be discarded and the original snapshot restored. The saved device copy is unchanged until you save again.")) return;
    replaceDraft(initialModellingDraft(), true);
    setReviewOpen(false);
    setRunMessage("Restarted with original inputs and inspection queries. Save explicitly to replace the device copy.");
  }
  const bothMatch = stages.every(stage => results[stage]?.state === "match");
  const assisted = draft.reviewed || draft.hints > 0;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-8" data-content-manifest={CONTENT_MANIFEST}>
      <Link href="/labs" className="text-sm text-teal-200 underline focus-visible:outline">← All practice</Link>
      <header className="panel mt-5 rounded-3xl p-5 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-200">Data Modelling · Free · 25 min · Intermediate</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">{modellingPacket.title}</h1>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">Write two territory reports from the same order lines: one at sale time and one at the supplied effective-as-of timestamp. Reconcile a backdated correction without losing or duplicating facts.</p>
        <p className="mt-3 text-sm text-slate-400">Original fictional teaching example. Uses SQLite in your browser; no warehouse update, sign-in, paid service or cloud completion.</p>
        <nav aria-label="Lab sections" className="mt-5 flex flex-wrap gap-3">
          {["Task", "Data", "Help"].map(label => <a key={label} href={`#modelling-${label.toLowerCase()}`} className={button}>{label}</a>)}
        </nav>
      </header>

      <section id="modelling-task" tabIndex={-1} aria-labelledby="task-title" className="panel mt-6 scroll-mt-44 rounded-3xl p-5 sm:p-6">
        <h2 id="task-title" className="text-xl font-semibold text-slate-50">Task and report rules</h2>
        <p className="mt-3 text-sm leading-7 text-slate-300">Prerequisites: SELECT, JOIN, GROUP BY, fact grain and UTC timestamp comparison. Finance wants territory at each sale; planning wants territory effective at <strong>2026-02-15 00:00:00 UTC</strong> for every line.</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">
          <li>One fact is <code>(order_id, line_id)</code>, not one order. O2 has two legitimate lines.</li>
          <li>Return exactly <code>territory, total_amount, line_count</code>, in that column order, one row per territory. Row order does not matter; duplicate rows and fractional totals do.</li>
          <li>Include every fact once. Missing history becomes <code>Unknown</code>. Amounts are fictional integer units; no refunds, tax, FX or status filter.</li>
          <li>Intervals include <code>valid_from</code>, exclude <code>valid_to</code>; NULL end is open. Fixed-format UTC timestamps compare lexically. Overlap anywhere for a customer blocks both reports, even if no fact lies inside it.</li>
          <li>The as-of instant is effective time, not loaded time or proof of what was previously published. Matching these six disclosed examples does not establish unseen transfer or mastery.</li>
        </ul>
      </section>

      <section id="modelling-data" tabIndex={-1} aria-labelledby="data-title" className="panel mt-6 min-w-0 scroll-mt-44 rounded-3xl p-5 sm:p-6">
        <h2 id="data-title" className="text-xl font-semibold text-slate-50">Complete input data</h2>
        <label htmlFor="modelling-snapshot" className="mt-4 block text-sm font-semibold text-slate-200">Disclosed input snapshot</label>
        <select id="modelling-snapshot" value={draft.fixture} disabled={!ready} onChange={event => change({ fixture: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 p-3 text-sm text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 sm:max-w-md">
          {modellingFixtures.map(item => <option key={item.name} value={item.name}>{fixtureLabels[item.name]}</option>)}
        </select>
        <p className="mt-3 text-sm leading-6 text-slate-300">{fixture.purpose}</p>
        <p className="mt-2 text-sm text-slate-300">Selected source: <strong>{fixture.orders.length} lines / {fixture.orders.reduce((sum, row) => sum + Number(row[4]), 0)} units</strong>. {draft.fixture === "overlap_conflict" ? "Overlapping input is blocked; these source totals are not accepted report totals." : "Each report must conserve this selected source."}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={button} onClick={() => change({ fixture: "backdated_correction" })}>Apply supplied correction</button>
          <button type="button" className={button} onClick={() => change({ fixture: "baseline" })}>Restore original input</button>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-400">Correction moves C1's North end and South start to 9 January at noon. Only O1's 100 units move historically; both reports still total six lines / 520 units. Selecting inputs preserves both query drafts and invalidates previous checks.</p>
        <div className="mt-5 space-y-5">
          <ResultTable title="orders — order_id TEXT, line_id INTEGER, customer_id TEXT, sale_ts TEXT UTC, amount INTEGER" table={{ columns: ordersColumns, rows: fixture.orders }} />
          <ResultTable title="territory_history — customer_id TEXT, territory TEXT, valid_from TEXT UTC, valid_to TEXT UTC or NULL" table={{ columns: historyColumns, rows: fixture.territory_history }} />
        </div>
      </section>

      <section aria-label="Two report editors" className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
        {stages.map(stage => <section key={stage} aria-labelledby={`${stage}-title`} className="panel min-w-0 rounded-3xl p-5">
          <h2 id={`${stage}-title`} className="text-xl font-semibold text-slate-50">{stageLabel(stage)}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">{stage === "historical" ? "Resolve territory using each order line's sale_ts." : "Resolve territory at 2026-02-15 00:00:00 UTC for every order line."}</p>
          <label htmlFor={`modelling-${stage}`} className="mt-4 block text-sm font-semibold text-slate-200">{stageLabel(stage)} SQL</label>
          <textarea id={`modelling-${stage}`} spellCheck={false} value={draft[stage]} disabled={!ready} maxLength={20000} onChange={event => change({ [stage]: event.target.value })} className="mt-2 min-h-[250px] w-full resize-y rounded-xl border border-slate-600 bg-slate-950 p-3 font-mono text-sm leading-6 text-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300" />
          <button type="button" className={`${button} mt-3 bg-teal-300 !text-slate-950`} disabled={!ready || running !== null} onClick={() => run(stage)}>Run {stageLabel(stage)}</button>
          {results[stage] && <ReportResult result={results[stage]!} assisted={assisted} />}
        </section>)}
      </section>
      <section aria-label="Execution status" className="panel mt-4 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={button} disabled={!running} onClick={cancel}>Cancel run</button>
          <span className="text-xs leading-6 text-slate-400">{QUERY_BUDGET_MS / 1000}-second query limit after engine load · 500 output rows · Cancel terminates execution</span>
        </div>
        <p role="status" aria-live="polite" className="mt-2 break-words text-sm leading-6 text-slate-200">{runMessage || "Run checks the selected disclosed snapshot. Both editors are independent."}</p>
        {bothMatch && <p className="mt-3 font-semibold text-teal-200">Both reports match this nonempty disclosed example{assisted ? " with assistance" : ""}. Practice feedback only; no mastery or cloud completion claim.</p>}
      </section>

      <section aria-labelledby="draft-title" className="panel mt-6 rounded-3xl p-5">
        <h2 id="draft-title" className="text-lg font-semibold text-slate-50">Device-only drafts</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">Save both editors, snapshot and assistance state in this browser. No account or cloud save. {dirty ? "Unsaved changes." : ""}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className={button} disabled={!ready} onClick={() => save()}>Save on this device</button>
          <button type="button" className={button} disabled={!ready} onClick={restart}>Restart and reset drafts</button>
          {storageError && <button type="button" className={button} onClick={() => { if (window.confirm("Replace the saved device copy with these two current editors? The old saved copy will be overwritten only if saving succeeds.")) save(true); }}>Replace saved copy</button>}
        </div>
        <p role={storageError ? "alert" : "status"} className="mt-3 break-words text-sm leading-6 text-slate-300">{storageMessage}</p>
        {conflict && <div role="alert" className="mt-4 rounded-xl border border-amber-400 p-4 text-sm text-slate-200">
          <p>Another tab changed or removed this device's saved copy. Your current edits have been kept. Choose before overwriting.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={button} onClick={() => save(true)}>Keep these editors and save</button>
            <button type="button" className={button} disabled={!conflict.raw} onClick={loadOtherCopy}>Load other saved copy</button>
          </div>
        </div>}
      </section>

      <section id="modelling-help" tabIndex={-1} aria-labelledby="help-title" className="panel mt-6 scroll-mt-44 rounded-3xl p-5 sm:p-6">
        <h2 id="help-title" className="text-xl font-semibold text-slate-50">Help, in stages</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{assisted ? "Assisted practice: hints or the reviewed example have been opened." : "Hints and the worked example are optional. Input data never requires reveal."}</p>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-7 text-slate-200">
          {modellingPacket.hints.slice(0, draft.hints).map(hint => <li key={hint.stage}>{hint.text}</li>)}
        </ol>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={button} disabled={draft.hints >= 3} onClick={() => change({ hints: draft.hints + 1 })}>Show hint {Math.min(draft.hints + 1, 3)} of 3</button>
          <button type="button" className={button} aria-expanded={reviewOpen} onClick={() => { if (!draft.reviewed) change({ reviewed: true }); setReviewOpen(!reviewOpen); }}>{reviewOpen ? "Hide worked example" : "Reveal worked example"}</button>
        </div>
        {reviewOpen && <div className="mt-5 space-y-5 text-sm leading-7 text-slate-300">
          <h3 className="text-lg font-semibold text-amber-200">Reviewed example — never a passed attempt</h3>
          {stages.map(stage => <div key={stage}><h4 className="font-semibold text-slate-100">{stageLabel(stage)}</h4><pre tabIndex={0} aria-label={`${stageLabel(stage)} worked SQL`} className="mt-2 max-w-full overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-teal-100">{modellingQueries.reference[stage]}</pre></div>)}
          <p>A left temporal join retains unmatched C3 as Unknown. O2's two boundary lines belong to South exactly once. The original historical report allocates 160 to North; the as-of report allocates those lines to South. Under the backdated correction only O1's 100 moves; the historical North total becomes 60 and South 350. Rerun to inspect selected expected and actual rows.</p>
          <p>A correlated lookup before grouping is another valid approach only after overlap preflight proves at most one matching interval. Inclusive ends double-count boundary lines; current-only history misattributes old sales; inner joins drop Unknown; copied baseline constants fail changed inputs.</p>
          <p>Materialized dimension-version keys simplify reads but late corrections need bounded audited fact repair. Temporal joins reflect corrected effective history but require overlap and cardinality monitoring. Neither reconstructs a previously published report without source/report version records. Reconcile line counts and amounts, record the correction source and affected interval, and investigate new gaps or overlaps. This exercise performs no warehouse backfill.</p>
          <ul className="list-disc pl-5">{modellingPacket.primary_sources.map(source => <li key={source.url}><a href={source.url} className="text-teal-200 underline">{source.title}</a> — {source.scope}; author reviewed 6 November 2026.</li>)}</ul>
        </div>}
      </section>
    </main>
  );
}

function ReportResult({ result, assisted }: { result: ModellingResult; assisted: boolean }) {
  const comparable = result.actual.columns[1] === "total_amount" && result.actual.columns[2] === "line_count" &&
    result.actual.rows.every(row => typeof row[1] === "number" && typeof row[2] === "number");
  return <div className="mt-5 min-w-0 space-y-4" data-result-state={result.state}>
    <p className="break-words text-sm leading-6 text-slate-200" role={result.state === "query_error" ? "alert" : undefined}>{result.message}{result.state === "match" && assisted ? " Assisted practice." : ""}</p>
    {result.state === "conflict" ? <ResultTable title="Conflicting customer and intervals — both reports blocked" table={result.actual} /> : result.state !== "query_error" && <>
      <p className="text-sm leading-6 text-slate-300">Source {result.sourceLines} lines / {result.sourceAmount} units. {comparable ? `Actual report ${result.actual.rows.reduce((sum, row) => sum + Number(row[2]), 0)} lines / ${result.actual.rows.reduce((sum, row) => sum + Number(row[1]), 0)} units.` : "Actual totals cannot be reconciled until the required numeric columns are returned."}</p>
      <ResultTable title="Actual report" table={result.actual} />
      <ResultTable title="Expected report for this disclosed snapshot" table={result.expected} />
    </>}
  </div>;
}
function ResultTable({ title, table }: { title: string; table: BrowserSqlResultTable }) {
  const display = (value: BrowserSqlCell) => value === null ? "NULL" : String(value);
  return <div className="min-w-0 max-w-full">
    <p className="mb-2 break-words text-sm font-semibold leading-6 text-slate-200">{title}</p>
    <div role="region" aria-label={title} tabIndex={0} className="max-w-full overflow-x-auto rounded-xl border border-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">
      {table.rows.length ? <table className="w-full whitespace-nowrap text-left text-xs leading-6"><thead className="bg-slate-900 text-slate-200"><tr>{table.columns.map((column, i) => <th key={i} scope="col" className="px-3 py-2">{column}</th>)}</tr></thead><tbody className="text-slate-300">{table.rows.map((row, index) => <tr key={index} className="border-t border-slate-800">{row.map((cell, i) => <td key={i} className="px-3 py-2">{display(cell)}</td>)}</tr>)}</tbody></table> : <p className="p-3 text-sm text-slate-300">Zero rows.</p>}
    </div>
  </div>;
}
