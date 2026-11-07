"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BrowserSqlResultTable } from "../../lib/browser-sql";
import {
  PROJECT_DRAFT_KEY, PROJECT_MANIFEST, PROJECT_STAGES, expectedProjectTable, projectPacket, projectQueries,
  projectSnapshots, rawColumns, rawSchema, snapshotLabels, snapshotNames, snapshotNotes,
  type ProjectStage
} from "../../lib/project-pipeline";
import {
  beginProjectRun, canPublishProject, canRunProjectStage, changeProjectDraft, checkedStage, finishProjectRun,
  initialProjectState, injectProjectFailure, parseProjectState, publishProjectReport, serializeProjectState,
  type ProjectState
} from "../../lib/project-pipeline-state";
import { startProjectRun } from "../../lib/project-pipeline-runner";

const button = "rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-teal-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300 disabled:opacity-50";
const label: Record<ProjectStage, string> = { accepted_events: "Stage 1 — accepted events", current_orders: "Stage 2 — current orders", daily_revenue: "Stage 3 — daily revenue" };
const purpose: Record<ProjectStage, string> = {
  accepted_events: "Read raw_deliveries. Keep each immutable business event once, despite new delivery IDs and receipt times.",
  current_orders: "Read your materialized accepted_events output. Keep the greatest source_version for every order; each version is a full replacement state.",
  daily_revenue: "Read your materialized current_orders output. Sum paid current states by original order_date, keeping 0/0 dates where all orders are cancelled."
};

export function OrderReplayProject() {
  const [state, setState] = useState<ProjectState>(initialProjectState);
  const current = useRef(state);
  const [ready, setReady] = useState(false), [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false), savedRevision = useRef("");
  const storageEpoch = useRef(0);
  const [storageMessage, setStorageMessage] = useState("Loading this device's saved copy…");
  const [storageError, setStorageError] = useState(false);
  const [conflict, setConflict] = useState<{ raw: string | null } | null>(null);
  const [revealed, setRevealed] = useState<Partial<Record<ProjectStage, boolean>>>({});
  const activeRun = useRef<{ cancel: () => void } | null>(null), runId = useRef(0);
  function apply(next: ProjectState, edited = true) {
    current.current = next; setState(next);
    if (edited) { dirtyRef.current = true; setDirty(true); }
  }
  function stop() { ++runId.current; activeRun.current?.cancel(); activeRun.current = null; }
  function changeFixture(fixture: string) {
    if (fixture === current.current.draft.fixture) return;
    stop(); apply(changeProjectDraft(current.current, { ...current.current.draft, fixture }));
  }
  function changeQuery(stage: ProjectStage, sql: string) {
    if (sql === current.current.draft.queries[stage]) return;
    stop(); apply(changeProjectDraft(current.current, { ...current.current.draft, queries: { ...current.current.draft.queries, [stage]: sql } }));
  }
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROJECT_DRAFT_KEY);
      if (raw) {
        const restored = parseProjectState(raw); savedRevision.current = restored.draft.revision;
        apply(restored, false); setStorageMessage("Restored three separate drafts and saved report snapshot from this device. Rerun checks before publishing.");
      } else setStorageMessage("Explicit Save stores drafts and the last published snapshot on this device only.");
    } catch { setStorageError(true); setStorageMessage("Device storage is unavailable or the saved version is unsupported. Current editors are preserved. Copy queries before leaving; retry or explicitly replace the saved copy."); }
    setReady(true);
    function onStorage(event: StorageEvent) {
      if (event.key !== PROJECT_DRAFT_KEY) return;
      ++storageEpoch.current;
      if (dirtyRef.current || current.current.running || !event.newValue) { setConflict({ raw: event.newValue }); return; }
      try {
        const restored = parseProjectState(event.newValue); savedRevision.current = restored.draft.revision;
        apply(restored, false); setStorageMessage("Loaded newer saved device copy. Its run history is not independently reverified; rerun checks.");
      } catch { setConflict({ raw: event.newValue }); setStorageError(true); setStorageMessage("Another tab saved an unsupported copy. Current editors and last report are preserved."); }
    }
    function onUnload(event: BeforeUnloadEvent) { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } }
    window.addEventListener("storage", onStorage); window.addEventListener("beforeunload", onUnload);
    return () => { stop(); window.removeEventListener("storage", onStorage); window.removeEventListener("beforeunload", onUnload); };
    // Hydrate once. Storage and worker callbacks read current refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function save(force = false) {
    try {
      const raw = localStorage.getItem(PROJECT_DRAFT_KEY);
      if (!force && (raw ? parseProjectState(raw).draft.revision !== savedRevision.current : !!savedRevision.current)) { setConflict({ raw }); return; }
      const revision = crypto.randomUUID(), encoded = serializeProjectState(current.current, revision);
      localStorage.setItem(PROJECT_DRAFT_KEY, encoded);
      apply({ ...current.current, draft: { ...current.current.draft, revision } }, false);
      savedRevision.current = revision; dirtyRef.current = false; setDirty(false); setConflict(null); setStorageError(false);
      setStorageMessage("Saved three drafts, assistance state and last published snapshot on this device only. No account/cloud save or completion record.");
    } catch { setStorageError(true); setStorageMessage("Could not save: device storage is unavailable, full or unsupported. All editors and last report are preserved. Copy queries; retry or explicitly replace the saved copy."); }
  }
  async function loadOther() {
    try {
      const raw = localStorage.getItem(PROJECT_DRAFT_KEY);
      if (raw !== conflict?.raw) { setConflict({ raw }); setStorageMessage("The saved copy changed again. Review the current conflict before choosing."); return; }
      if (!raw) { setStorageMessage("The other saved copy was removed. Current editors are preserved."); return; }
      const restored = parseProjectState(raw);
      const epoch = storageEpoch.current, editors = current.current;
      if (!window.confirm("Replace these three editors and local report with the other saved device copy? Unsaved work will be discarded.")) return;
      // A native confirmation pauses this renderer. Let queued storage changes arrive before applying its choice.
      await new Promise(resolve => window.setTimeout(resolve, 0));
      const latest = localStorage.getItem(PROJECT_DRAFT_KEY);
      if (latest !== raw || epoch !== storageEpoch.current || editors !== current.current) { setConflict({ raw: latest }); setStorageMessage("The saved copy changed while confirmation was open. Current editors are preserved; review the new conflict."); return; }
      stop(); apply(restored, false); savedRevision.current = restored.draft.revision; dirtyRef.current = false; setDirty(false); setConflict(null); setStorageError(false);
      setStorageMessage("Loaded the other saved device copy. Rerun checks; saved run history is not independently reverified.");
    } catch { setStorageMessage("That saved copy is unsupported or unavailable. Current editors and last report are preserved."); }
  }
  function run(stage: ProjectStage) {
    if (!canRunProjectStage(current.current, stage)) return;
    const id = ++runId.current;
    const request = { id, fixture: current.current.draft.fixture, stage, sql: current.current.draft.queries[stage],
      upstream: Object.fromEntries(PROJECT_STAGES.filter(s => checkedStage(current.current, s)).map(s => [s, current.current.results[s]!.result.actual])) };
    apply(beginProjectRun(current.current, id, stage), false);
    activeRun.current = startProjectRun(request, outcome => {
      if (id !== runId.current) return;
      activeRun.current = null; apply(finishProjectRun(current.current, id, outcome), false);
    });
  }
  function cancel() {
    const id = current.current.running?.id;
    if (id === undefined) return;
    stop(); apply(finishProjectRun(current.current, id, { kind: "cancelled" }), false);
  }
  function restart() {
    if (!window.confirm("Restart? Three edited drafts, hints, previews and this local published report will be discarded; original baseline restored. The saved device copy stays unchanged until Save.")) return;
    stop(); apply(initialProjectState()); setRevealed({});
  }
  const { draft, lastPublished } = state;
  const raw = projectSnapshots[draft.fixture];
  const assisted = draft.hints > 0 || draft.reviewed.length > 0;
  const reveal = (stage: ProjectStage) => {
    if (!draft.reviewed.includes(stage)) apply({ ...current.current, draft: { ...current.current.draft, reviewed: [...current.current.draft.reviewed, stage] } });
    setRevealed(previous => ({ ...previous, [stage]: !previous[stage] }));
  };
  return <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-8" data-project-manifest={PROJECT_MANIFEST}>
    <Link href="/labs" className="text-sm text-teal-200 underline focus-visible:outline">← All practice</Link>
    <header className="panel mt-5 rounded-3xl p-5 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-200">Free · Guided project · SQLite · Intermediate</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">Replay the order feed without changing revenue</h1>
      <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">Build three linked SQL stages, test replay and late cancellations, and practise protecting the last good report in a browser simulation.</p>
      <p className="mt-3 text-sm leading-7 text-slate-400">Original fictional data, eight valid and four rejected public examples. Runs on this device; no sign-in, paid service, real warehouse, scheduler or cloud progress. Supplied-case matches are guided feedback, not independent mastery.</p>
      <nav aria-label="Project sections" className="mt-5 flex flex-wrap gap-3">
        {[['Task', 'task'], ['Data', 'data'], ['Stage 1', 'accepted_events'], ['Stage 2', 'current_orders'], ['Stage 3', 'daily_revenue'], ['Publish', 'publish'], ['Help', 'help'], ['Drafts', 'drafts']].map(([name, id]) => <a key={id} className={button} href={`#project-${id}`}>{name}</a>)}
      </nav>
    </header>
    <section id="project-task" tabIndex={-1} aria-labelledby="project-task-title" className="panel mt-6 scroll-mt-44 rounded-3xl p-5 sm:p-6">
      <h2 id="project-task-title" className="text-xl font-semibold text-slate-50">Task and business rules</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">Prerequisites: SELECT, CTE, GROUP BY, event versus order grain, and ROW_NUMBER or an anti-join. Amounts are integer cents in one fictional currency.</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-300">
        <li><code>delivery_id</code> is a physical receipt; <code>event_id</code> is an immutable business event; <code>order_id</code> is an order. Replays can change receipt ID/time, never business payload.</li>
        <li>Each positive <code>source_version</code> is the full replacement order state, not a delta. Greatest version wins even if old data arrives last; gaps are allowed. Do not choose by receipt or event timestamp.</li>
        <li>One event per order/version. Different payload for the same event, a second event for an order/version, or a changed original <code>order_date</code> rejects the source before SQL.</li>
        <li>Latest paid state contributes its amount and one eligible order. Cancelled contributes zero cents and zero eligible orders on the original order date. Retain a 0/0 row for an all-cancelled date.</li>
        <li>Return the exact stage headers in order. Nonempty output requires text/safe integer types and exact row multiplicity; row order is irrelevant. No rounding or text-to-number coercion. Empty checks establish zero rows only.</li>
        <li>No tax, FX, partial refund, line item or delete semantics. Reconcile eligible latest-order cents and counts, never raw receipt amounts across replays or versions.</li>
      </ol>
    </section>
    <section id="project-data" tabIndex={-1} aria-labelledby="project-data-title" className="panel mt-6 min-w-0 scroll-mt-44 rounded-3xl p-5 sm:p-6">
      <h2 id="project-data-title" className="text-xl font-semibold text-slate-50">Complete input and expected outputs</h2>
      <label htmlFor="project-snapshot" className="mt-4 block text-sm font-semibold text-slate-200">Disclosed source snapshot</label>
      <select id="project-snapshot" disabled={!ready} value={draft.fixture} onChange={e => changeFixture(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 p-3 text-sm text-slate-100 sm:max-w-lg">
        {snapshotNames.map(name => <option key={name} value={name}>{snapshotLabels[name]}</option>)}
      </select>
      <p className="mt-3 text-sm leading-7 text-slate-300">{snapshotNotes[draft.fixture]} Selecting a snapshot retains all three queries and the last published report; rerun previews on the new input.</p>
      <p className="mt-2 break-words text-sm leading-7 text-slate-400">{rawSchema}. IDs are nonblank; dates must be real YYYY-MM-DD, timestamps real UTC YYYY-MM-DDTHH:MM:SSZ, status paid/cancelled, version positive and cents nonnegative safe integers.</p>
      <div className="mt-4"><ProjectTable title={`Raw input — ${raw.length} physical deliveries`} table={{ columns: rawColumns, rows: raw.map(r => rawColumns.map(k => r[k])) }} /></div>
      <div className="mt-5 space-y-5">
        {PROJECT_STAGES.map(stage => <ProjectTable key={stage} title={`Expected ${stage} — ${validExpectedMessage(draft.fixture)}`} table={expectedProjectTable(draft.fixture, stage)} />)}
      </div>
      {!Object.prototype.hasOwnProperty.call(projectSnapshots, draft.fixture) && <p>Unknown snapshot.</p>}
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" className={button} onClick={() => changeFixture("corrected_retry")}>Select corrected source</button><button type="button" className={button} onClick={() => changeFixture("baseline")}>Restore original input</button></div>
    </section>
    <section aria-label="Three dependent SQL stages" className="mt-6 min-w-0 space-y-6">
      {PROJECT_STAGES.map((stage, index) => {
        const result = state.results[stage]?.result;
        const canRun = ready && canRunProjectStage(state, stage);
        return <section key={stage} id={`project-${stage}`} tabIndex={-1} aria-labelledby={`project-${stage}-title`} className="panel min-w-0 scroll-mt-44 rounded-3xl p-5 sm:p-6">
          <h2 id={`project-${stage}-title`} className="text-xl font-semibold text-slate-50">{label[stage]}</h2>
          <p className="mt-2 text-sm leading-7 text-slate-300">{purpose[stage]}</p>
          {index > 0 && !checkedStage(state, PROJECT_STAGES[index - 1]) && <p className="mt-2 text-sm leading-7 text-amber-200">Blocked: match the previous stage on this input first. A wrong or missing upstream output cannot advance.</p>}
          <label htmlFor={`project-sql-${stage}`} className="mt-4 block text-sm font-semibold text-slate-200">{stage} SQL</label>
          <textarea id={`project-sql-${stage}`} disabled={!ready} spellCheck={false} maxLength={20000} value={draft.queries[stage]} onChange={e => changeQuery(stage, e.target.value)} className="mt-2 min-h-[230px] w-full resize-y rounded-xl border border-slate-600 bg-slate-950 p-3 font-mono text-sm leading-6 text-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300" />
          <div className="mt-3 flex flex-wrap gap-3"><button type="button" className={`${button} bg-teal-300 !text-slate-950`} disabled={!canRun} onClick={() => run(stage)}>Run Stage {index + 1}</button><button type="button" className={button} disabled={!ready} aria-expanded={!!revealed[stage]} onClick={() => reveal(stage)}>{revealed[stage] ? "Hide" : "Reveal"} Stage {index + 1} worked SQL</button></div>
          {revealed[stage] && <div className="mt-4 text-sm leading-7 text-slate-300"><p className="font-semibold text-amber-200">Reviewed / assisted practice — revealing never marks a stage passed.</p><p>{purpose[stage]}</p><pre tabIndex={0} aria-label={`${stage} reference SQL`} className="mt-3 max-w-full overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-teal-100">{projectQueries.reference[stage]}</pre><p className="mt-3">Another defensible method, with the same required grain:</p><pre tabIndex={0} aria-label={`${stage} alternative SQL`} className="mt-2 max-w-full overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-teal-100">{projectQueries.alternative[stage]}</pre></div>}
          {result && <div className="mt-5 min-w-0 space-y-4" data-project-result={result.state} data-stage={stage}>
            <p className="text-sm leading-7 text-slate-200" role={["query_error", "input_rejected"].includes(result.state) ? "alert" : undefined}>{result.message} {assisted && ["match", "empty"].includes(result.state) ? "Assisted practice." : ""}</p>
            {result.diagnostics.length > 0 && <ul className="list-disc space-y-2 break-words pl-5 text-sm text-amber-200">{result.diagnostics.map(message => <li key={message}>{message}</li>)}</ul>}
            {["match", "empty", "mismatch"].includes(result.state) && <><p className="text-sm text-slate-400">Unpublished preview. Actual stage input: {result.materializedInputRows} {index === 0 ? "physical deliveries" : `learner ${PROJECT_STAGES[index - 1]} rows`}; output: {result.actual.rows.length} rows.</p><ProjectTable title={`Actual ${stage} — unpublished preview`} table={result.actual} /><ProjectTable title={`Expected ${stage} for this supplied case`} table={result.expected} /></>}
          </div>}
        </section>;
      })}
    </section>
    <section aria-label="Project execution status" className="panel mt-4 rounded-2xl p-5">
      <button type="button" className={button} disabled={!state.running} onClick={cancel}>Cancel run</button>
      <p className="mt-3 text-xs leading-6 text-slate-400">15-second engine-load / 3-second query budget · 20,000 SQL characters · 500 output rows / 32 columns / 64,000 output bytes · SQLite allocations limited to16MiB. Cancel terminates the worker. These small local limits are not a cloud capacity guarantee.</p>
      <p role="status" aria-live="polite" className="mt-3 break-words text-sm leading-7 text-slate-200">{state.message}</p>
    </section>
    <section id="project-publish" tabIndex={-1} aria-labelledby="project-publish-title" className="panel mt-6 min-w-0 scroll-mt-44 rounded-3xl p-5 sm:p-6">
      <h2 id="project-publish-title" className="text-xl font-semibold text-slate-50">Publish a simulated report</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">Previews never publish automatically. Match all three stages on the same current input and query revisions, then deliberately publish. Changing input or a query invalidates affected previews and publication eligibility; it keeps the last good report.</p>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" id="project-publish-button" className={`${button} bg-teal-300 !text-slate-950`} disabled={!ready || !canPublishProject(state)} onClick={() => apply(publishProjectReport(current.current, `sim-${crypto.randomUUID()}`, new Date().toISOString()))}>Publish simulated report</button><button type="button" className={button} disabled={!!state.running || !checkedStage(state, "current_orders")} onClick={() => apply(injectProjectFailure(current.current), false)}>Simulate failure after Stage 2</button></div>
      <p className="mt-3 text-sm leading-7 text-slate-400">The named failure happens before publication: retry Stage 3, then publish explicitly. Wrong SQL, rejected input, engine error, timeout, Cancel or stale replies also cannot replace the last good report/run ID.</p>
      <div className="mt-5 rounded-2xl border border-slate-700 p-4" data-published-run-id={lastPublished?.id ?? ""}>
        <h3 className="font-semibold text-slate-100">Last successfully published report</h3>
        {lastPublished ? <><p className="mt-2 break-words text-sm leading-7 text-slate-300">Device snapshot {lastPublished.id} · {snapshotLabels[lastPublished.fixture]} · {lastPublished.publishedAt}. {lastPublished.assisted ? "Assisted / reviewed practice." : "Matches a supplied case; no independent mastery claim."}</p><p className="mt-2 text-sm leading-7 text-slate-400">{lastPublished.emptyRowsOnly ? "Explicitly empty simulated report: zero rows only, not schema validation or completion of nonempty practice." : `Published ${lastPublished.report.rows.reduce((s, r) => s + Number(r[1]), 0)} cents / ${lastPublished.report.rows.reduce((s, r) => s + Number(r[2]), 0)} eligible latest orders. Receipt, business-event and current-order counts are different units.`}</p><div className="mt-3"><ProjectTable title="Published simulated daily revenue" table={lastPublished.report} /></div></> : <p className="mt-2 text-sm text-slate-300">No report published yet. Running a preview does not create one.</p>}
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-400">This report is in memory until you explicitly save on this device. Saved history is not independently verified, account-synced or a production transaction.</p>
    </section>
    <section id="project-help" tabIndex={-1} aria-labelledby="project-help-title" className="panel mt-6 scroll-mt-44 rounded-3xl p-5 sm:p-6">
      <h2 id="project-help-title" className="text-xl font-semibold text-slate-50">Help and production consequences</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">{assisted ? "Assisted practice: a hint or worked query has been opened. Hiding help does not remove that state." : "Hints and per-stage worked queries are optional; complete input and expected rows are available before Run."}</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-300">{projectPacket.progressive_help.slice(0, draft.hints).map(hint => <li key={hint}>{hint}</li>)}</ol>
      <button type="button" className={`${button} mt-4`} disabled={draft.hints >= 3} onClick={() => apply({ ...current.current, draft: { ...current.current.draft, hints: current.current.draft.hints + 1 } })}>Show hint {Math.min(draft.hints + 1, 3)} of 3</button>
      <p className="mt-4 text-sm leading-7 text-slate-300">{projectPacket.production_consequence}</p>
      <ul className="mt-3 list-disc pl-5 text-sm leading-7 text-teal-200">{projectPacket.sources.map(source => <li key={source.url}><a className="underline" href={source.url}>{source.title}</a> — author reviewed7 November2026.</li>)}</ul>
    </section>
    <section id="project-drafts" tabIndex={-1} aria-labelledby="project-drafts-title" className="panel mt-6 scroll-mt-44 rounded-3xl p-5 sm:p-6">
      <h2 id="project-drafts-title" className="text-xl font-semibold text-slate-50">Device-only drafts and recovery</h2>
      <p className="mt-3 text-sm leading-7 text-slate-300">Three separate queries, source selection, assistance state and last published snapshot. No cloud/account persistence. {dirty ? "Unsaved changes." : ""}</p>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" className={button} disabled={!ready} onClick={() => save()}>Save on this device</button><button type="button" className={button} disabled={!ready} onClick={restart}>Restart project</button>{storageError && <button type="button" className={button} onClick={() => { if (window.confirm("Replace the saved device copy with these current editors and report? The old saved copy will be overwritten only if saving succeeds.")) save(true); }}>Replace saved copy</button>}</div>
      <p role={storageError ? "alert" : "status"} className="mt-3 break-words text-sm leading-7 text-slate-300">{storageMessage}</p>
      {conflict && <div role="alert" className="mt-4 rounded-xl border border-amber-300 p-4 text-sm leading-7 text-slate-200"><p>Another tab changed or removed the saved copy. Current edits and report are preserved. Choose before overwriting.</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" className={button} onClick={() => save(true)}>Keep these editors and save</button><button type="button" className={button} disabled={!conflict.raw} onClick={loadOther}>Load other saved copy</button></div></div>}
    </section>
  </main>;
}

function validExpectedMessage(fixture: string) {
  return ["conflict_event_payload", "conflict_order_version", "conflict_order_date", "malformed_fields"].includes(fixture)
    ? "input rejected; no accepted output" : "disclosed expected rows, not a worked query";
}
function ProjectTable({ title, table }: { title: string; table: BrowserSqlResultTable }) {
  return <div className="min-w-0 max-w-full"><p className="mb-2 break-words text-sm font-semibold leading-7 text-slate-200">{title}</p><div role="region" aria-label={title} tabIndex={0} className="max-w-full overflow-x-auto rounded-xl border border-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">
    <table className="w-full whitespace-nowrap text-left text-xs leading-6"><thead className="bg-slate-900 text-slate-200"><tr>{table.columns.map((column, index) => <th key={index} scope="col" className="px-3 py-2">{column}</th>)}</tr></thead><tbody className="text-slate-300">{table.rows.map((row, index) => <tr key={index} className="border-t border-slate-800">{row.map((cell, i) => <td key={i} className="px-3 py-2">{cell === null ? "NULL" : String(cell)}</td>)}</tr>)}</tbody></table>{!table.rows.length && <p className="p-3 text-sm text-slate-300">Zero rows.</p>}
  </div></div>;
}
