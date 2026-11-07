import assert from "node:assert/strict";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import {
  PROJECT_STAGES, PROJECT_MANIFEST, PROJECT_LOAD_MS, PROJECT_QUERY_MS, evaluateProjectStage,
  expectedProjectTable, projectHeaders, projectSnapshots, projectQueries, snapshotNames,
  sourceErrors, strictProjectMatch, validExpected, type ProjectStage
} from "../lib/project-pipeline";
import {
  beginProjectRun, canPublishProject, canRunProjectStage, changeProjectDraft, finishProjectRun,
  initialProjectState, injectProjectFailure, parseProjectState, publishProjectReport,
  serializeProjectState, type ProjectState
} from "../lib/project-pipeline-state";
import { startProjectRun, type ProjectOutcome, type ProjectWorker } from "../lib/project-pipeline-runner";
import type { BrowserSqlResultTable } from "../lib/browser-sql";

async function main() {
  const require = createRequire(import.meta.url);
  const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
  const checks: string[] = [];
  function check(name: string, f: () => void) { f(); checks.push(name); }
  const matchState = (fixture: string) => fixture === "empty" ? "empty" : "match";
  function runChain(fixture: string, queries: Record<ProjectStage, string>) {
    const upstream: Partial<Record<ProjectStage, BrowserSqlResultTable>> = {};
    for (const stage of PROJECT_STAGES) {
      const result = evaluateProjectStage(SQL, { id: 1, fixture, stage, sql: queries[stage], upstream });
      assert.equal(result.state, matchState(fixture), `${fixture}/${stage}: ${result.message}`);
      assert.deepEqual([...result.actual.rows].map(row => JSON.stringify(row)).sort(), [...expectedProjectTable(fixture, stage).rows].map(row => JSON.stringify(row)).sort());
      upstream[stage] = result.actual;
    }
    return upstream;
  }
  // Independently derive the public manual rows without SQL or the feature evaluator.
  for (const fixture of Object.keys(validExpected)) {
    check(`manual-oracle/${fixture}`, () => {
      const events = new Map<string | number, (string | number)[]>();
      for (const raw of projectSnapshots[fixture]) events.set(raw.event_id, projectHeaders.accepted_events.map(k => raw[k]));
      const orders = new Map<string | number, (string | number)[]>();
      for (const event of events.values()) {
        const old = orders.get(event[1]);
        if (!old || Number(event[2]) > Number(old[1])) orders.set(event[1], [event[1], event[2], event[3], event[5], event[6]]);
      }
      const days = new Map<string | number, number[]>();
      for (const order of orders.values()) {
        const total = days.get(order[2]) ?? [0, 0];
        if (order[3] === "paid") { total[0] += Number(order[4]); total[1]++; }
        days.set(order[2], total);
      }
      const derived = { accepted_events: [...events.values()], current_orders: [...orders.values()], daily_revenue: [...days].map(([day, totals]) => [day, ...totals]) };
      for (const stage of PROJECT_STAGES) assert.deepEqual(derived[stage].map(row => JSON.stringify(row)).sort(), validExpected[fixture][stage].map(row => JSON.stringify(row)).sort());
    });
    for (let mask = 0; mask < 8; mask++) {
      check(`actual-SQLjs/${fixture}/combination-${mask}`, () => {
        const queries = Object.fromEntries(PROJECT_STAGES.map((stage, i) => [stage, projectQueries[mask & 1 << i ? "alternative" : "reference"][stage]])) as Record<ProjectStage, string>;
        runChain(fixture, queries);
      });
    }
  }
  for (const fixture of ["replay", "obsolete_last", "all_cancelled_date"]) check(`delivery-order/${fixture}`, () => {
    const original = projectSnapshots[fixture];
    try { projectSnapshots[fixture] = [...original].reverse(); runChain(fixture, projectQueries.reference); runChain(fixture, projectQueries.alternative); }
    finally { projectSnapshots[fixture] = original; }
  });
  for (const [name, wrong] of Object.entries(projectQueries.wrong)) check(`wrong-strategy/${name}`, () => {
    const upstream: Partial<Record<ProjectStage, BrowserSqlResultTable>> = {};
    for (const stage of PROJECT_STAGES) {
      const result = evaluateProjectStage(SQL, { id: 2, fixture: wrong.case, stage, sql: stage === wrong.stage ? wrong.sql : projectQueries.reference[stage], upstream });
      if (stage === wrong.stage) { assert.equal(result.state, "mismatch", result.message); assert.notDeepEqual(result.actual.rows, result.expected.rows); break; }
      assert.equal(result.state, "match"); upstream[stage] = result.actual;
    }
  });
  for (const fixture of snapshotNames.filter(n => !validExpected[n])) check(`source-preflight/${fixture}`, () => {
    const result = evaluateProjectStage(SQL, { id: 3, fixture, stage: "accepted_events", sql: "SELECT broken FROM", upstream: {} });
    assert.equal(result.state, "input_rejected"); assert.match(result.message, /query not evaluated/); assert.ok(result.diagnostics.length); assert.equal(result.actual.rows.length, 0);
  });
  check("source-preflight/strict-fields-and-no-coercion", () => {
    for (const patch of [{ source_version: true }, { amount_cents: "10000" }, { amount_cents: 0.1 }, { amount_cents: Number.MAX_SAFE_INTEGER + 1 }, { order_date: "2026-02-30" }, { received_at: "2026-01-01T25:00:00Z" }, { event_id: " " }, { amount_cents: null }, { surprise: 1 }]) {
      assert.ok(sourceErrors([{ ...projectSnapshots.baseline[0], ...patch }]).length, JSON.stringify(patch));
    }
    assert.match(sourceErrors([projectSnapshots.baseline[0], projectSnapshots.baseline[0]]).join(), /duplicate delivery_id/);
  });
  const baseline = runChain("baseline", projectQueries.reference);
  check("actual-upstream-materialization/order-is-preserved", () => {
    const accepted = { ...baseline.accepted_events!, rows: [...baseline.accepted_events!.rows].reverse() };
    const r = evaluateProjectStage(SQL, { id: 4, fixture: "baseline", stage: "current_orders", sql: "SELECT order_id,source_version,order_date,status,amount_cents FROM accepted_events ORDER BY rowid", upstream: { accepted_events: accepted } });
    assert.equal(r.state, "match"); assert.deepEqual(r.actual.rows.map(row => row[0]), ["O2", "O1"]); assert.equal(r.materializedInputRows, 2);
  });
  check("wrong-upstream/blocked-before-affinity-or-hidden-reference", () => {
    for (const rows of [[], [["E01", "O1", "1", "2026-01-01", "2026-01-01T09:00:00Z", "paid", "10000"]], [...baseline.accepted_events!.rows, baseline.accepted_events!.rows[0]]]) {
      const r = evaluateProjectStage(SQL, { id: 4, fixture: "baseline", stage: "current_orders", sql: projectQueries.reference.current_orders, upstream: { accepted_events: { columns: projectHeaders.accepted_events, rows: rows as BrowserSqlResultTable["rows"] } } });
      assert.equal(r.state, "blocked"); assert.equal(r.actual.rows.length, 0);
    }
  });
  check("strict/types-headers-multiplicity-and-safe-integers", () => {
    const expected = expectedProjectTable("baseline", "daily_revenue");
    for (const actual of [
      { ...expected, columns: ["Order_date", "revenue_cents", "eligible_order_count"] },
      { ...expected, rows: [...expected.rows, expected.rows[0]] },
      { ...expected, rows: [["2026-01-01", "30000", 2]] }, { ...expected, rows: [["2026-01-01", 30000.01, 2]] },
      { ...expected, rows: [["2026-01-01", null, 2]] }, { ...expected, rows: [["2026-01-01", Infinity, 2]] }
    ]) assert.equal(strictProjectMatch(actual, expected, "daily_revenue"), false);
    assert.equal(strictProjectMatch({ ...expected, rows: [...expected.rows].reverse() }, expected, "daily_revenue"), true);
  });
  for (const [name, sql] of Object.entries({ blank: "", syntax: "SELECT broken FROM", write: "DELETE FROM raw_deliveries", multi: "SELECT 1; SELECT 2", long: "SELECT " + "1".repeat(20001),
    rows: "WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x WHERE n<600) SELECT n FROM x",
    cell: "SELECT hex(zeroblob(3000))", blob: "SELECT zeroblob(8)", output: "WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x WHERE n<100) SELECT printf('%01000d',n) FROM x",
    heap: "SELECT hex(zeroblob(30000000))" })) check(`bounded-query/${name}`, () => {
    const r = evaluateProjectStage(SQL, { id: 5, fixture: "baseline", stage: "accepted_events", sql, upstream: {} }); assert.equal(r.state, "query_error", `${name}: ${r.message}`);
  });
  function correctState(fixture = "baseline") {
    let state = initialProjectState(); state = changeProjectDraft(state, { ...state.draft, fixture, queries: { ...projectQueries.reference } });
    for (const [i, stage] of PROJECT_STAGES.entries()) {
      const r = evaluateProjectStage(SQL, { id: i + 1, fixture, stage, sql: state.draft.queries[stage], upstream: Object.fromEntries(PROJECT_STAGES.slice(0, i).map(s => [s, state.results[s]!.result.actual])) });
      state = finishProjectRun(beginProjectRun(state, i + 1, stage), i + 1, { kind: "result", result: r });
    }
    assert.ok(canPublishProject(state)); return state;
  }
  const reportIdentity = (state: ProjectState) => JSON.stringify(state.lastPublished);
  check("publication/explicit-cloned-snapshot-only", () => {
    const complete = correctState(); assert.equal(complete.lastPublished, null);
    const published = publishProjectReport(complete, "run-baseline", "2026-11-07T17:30:00Z");
    assert.equal(published.lastPublished?.id, "run-baseline"); complete.results.daily_revenue!.result.actual.rows[0][1] = 0;
    assert.equal(published.lastPublished!.report.rows[0][1], 30000);
  });
  check("revision/upstream-edit-invalidates-downstream-keeps-other-drafts-and-lastgood", () => {
    const published = publishProjectReport(correctState(), "good", "2026-11-07T17:30:00Z");
    const changed = changeProjectDraft(published, { ...published.draft, queries: { ...published.draft.queries, current_orders: "SELECT broken FROM" } });
    assert.ok(changed.results.accepted_events); assert.equal(changed.results.current_orders, undefined); assert.equal(changed.results.daily_revenue, undefined);
    assert.equal(changed.draft.queries.daily_revenue, published.draft.queries.daily_revenue); assert.equal(reportIdentity(changed), reportIdentity(published)); assert.equal(canPublishProject(changed), false);
  });
  for (const kind of ["cancelled", "timeout", "unavailable"] as const) check(`lastgood/${kind}`, () => {
    const good = publishProjectReport(correctState(), "keep-good", "2026-11-07T17:30:00Z");
    const outcome = finishProjectRun(beginProjectRun(good, 55, "accepted_events"), 55, { kind });
    assert.equal(reportIdentity(outcome), reportIdentity(good)); assert.equal(canPublishProject(outcome), false); assert.equal(outcome.running, null);
  });
  for (const fixture of ["baseline", "conflict_event_payload"]) check(`lastgood/wrong-or-source-error/${fixture}`, () => {
    const good = publishProjectReport(correctState(), "keep-good", "2026-11-07T17:30:00Z");
    const changed = changeProjectDraft(good, { ...good.draft, fixture, queries: { ...good.draft.queries, accepted_events: projectQueries.starter.accepted_events } });
    const result = evaluateProjectStage(SQL, { id: 56, fixture, stage: "accepted_events", sql: changed.draft.queries.accepted_events, upstream: {} });
    const failed = finishProjectRun(beginProjectRun(changed, 56, "accepted_events"), 56, { kind: "result", result });
    assert.ok(["mismatch", "input_rejected"].includes(result.state)); assert.equal(reportIdentity(failed), reportIdentity(good)); assert.equal(canPublishProject(failed), false);
  });
  check("lastgood/stale-id-and-edit-while-running", () => {
    const good = publishProjectReport(correctState(), "keep-good", "2026-11-07T17:30:00Z");
    const running = beginProjectRun(good, 57, "accepted_events");
    const payload = { kind: "result", result: good.results.accepted_events!.result } as const;
    assert.equal(finishProjectRun(running, 56, payload), running);
    const edited = changeProjectDraft(running, { ...running.draft, fixture: "replay" });
    assert.equal(finishProjectRun(edited, 57, payload), edited); assert.equal(reportIdentity(edited), reportIdentity(good)); assert.equal(canPublishProject(edited), false);
  });
  check("lastgood/injected-stage2-failure-and-retry-before-new-explicit-publish", () => {
    const good = publishProjectReport(correctState(), "keep-good", "2026-11-07T17:30:00Z");
    const failed = injectProjectFailure(good); assert.equal(canPublishProject(failed), false); assert.equal(failed.results.daily_revenue, undefined); assert.equal(reportIdentity(failed), reportIdentity(good));
    const refused = publishProjectReport(failed, "bad", "2026-11-07T17:31:00Z"); assert.equal(reportIdentity(refused), reportIdentity(good));
    const retried = finishProjectRun(beginProjectRun(failed, 58, "daily_revenue"), 58, { kind: "result", result: good.results.daily_revenue!.result });
    assert.ok(canPublishProject(retried)); assert.equal(retried.lastPublished!.id, "keep-good");
    assert.equal(publishProjectReport(retried, "new-good", "2026-11-07T17:32:00Z").lastPublished!.id, "new-good");
  });
  check("empty/explicitly-empty-publication-with-no-nonempty-completion", () => {
    const empty = publishProjectReport(correctState("empty"), "empty-run", "2026-11-07T17:30:00Z"); assert.ok(empty.lastPublished?.emptyRowsOnly); assert.equal(empty.lastPublished?.report.rows.length, 0);
    assert.ok(parseProjectState(serializeProjectState(empty, "rev-empty")).lastPublished?.emptyRowsOnly);
  });
  check("device-copy/separate-empty-drafts-assisted-and-lastgood-reload-with-no-checks", () => {
    const good = publishProjectReport(correctState(), "saved-good", "2026-11-07T17:30:00Z");
    const state = changeProjectDraft(good, { ...good.draft, queries: { accepted_events: "", current_orders: "SELECT 2", daily_revenue: "" }, hints: 2, reviewed: ["current_orders"] });
    const restored = parseProjectState(serializeProjectState(state, "revision-1")); assert.equal(restored.draft.queries.accepted_events, ""); assert.equal(restored.draft.queries.current_orders, "SELECT 2"); assert.equal(restored.draft.queries.daily_revenue, "");
    assert.equal(restored.draft.hints, 2); assert.deepEqual(restored.draft.reviewed, ["current_orders"]); assert.equal(restored.lastPublished?.id, "saved-good"); assert.deepEqual(restored.results, {}); assert.equal(canPublishProject(restored), false);
    assert.throws(() => parseProjectState(JSON.stringify({ draft: good.draft, lastPublished: { ...good.lastPublished, emptyRowsOnly: true } })));
    for (const bad of ["null", "{}", JSON.stringify({ draft: { ...state.draft, version: 2 } }), "x".repeat(200001)]) assert.throws(() => parseProjectState(bad));
  });
  const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
  let timer: { callback: () => void; ms: number } | undefined;
  globalThis.setTimeout = ((callback: () => void, ms: number) => { timer = { callback, ms }; return 1; }) as typeof setTimeout;
  globalThis.clearTimeout = (() => { timer = undefined; }) as typeof clearTimeout;
  try {
    function fake() {
      let terminated = 0;
      const outcomes: ProjectOutcome[] = [], sent: unknown[] = [];
      const worker: ProjectWorker = { onmessage: null, onerror: null, postMessage: r => { sent.push(r); }, terminate: () => { terminated++; } };
      const run = startProjectRun({ id: 91, fixture: "baseline", stage: "accepted_events", sql: "SELECT 1", upstream: {} }, r => outcomes.push(r), () => worker);
      return { run, worker, outcomes, sent, terminated: () => terminated, emit: (data: unknown) => worker.onmessage?.({ data } as MessageEvent) };
    }
    check("worker/load-budget-is-terminated", () => { const f = fake(); assert.equal(timer?.ms, PROJECT_LOAD_MS); timer!.callback(); assert.equal(f.outcomes[0].kind, "unavailable"); assert.equal(f.terminated(), 1); });
    check("worker/query-budget-not-extended-by-duplicate-ready", () => { const f = fake(); f.emit({ type: "ready" }); const t = timer; f.emit({ type: "ready" }); assert.equal(timer, t); assert.equal(timer?.ms, PROJECT_QUERY_MS); assert.equal(f.sent.length, 1); timer!.callback(); assert.equal(f.outcomes[0].kind, "timeout"); assert.equal(f.terminated(), 1); });
    check("worker/cancel-fences-late-success", () => { const f = fake(); f.emit({ type: "ready" }); f.run.cancel(); f.emit({ type: "result", id: 91, result: {} }); assert.deepEqual(f.outcomes, [{ kind: "cancelled" }]); assert.equal(f.terminated(), 1); });
    check("worker/stale-id-ignored-current-result-terminates", () => { const f = fake(); f.emit({ type: "ready" }); f.emit({ type: "result", id: 90, result: {} }); assert.equal(f.outcomes.length, 0); f.emit({ type: "result", id: 91, result: {} }); assert.equal(f.outcomes[0].kind, "result"); assert.equal(f.terminated(), 1); f.run.cancel(); assert.equal(f.outcomes.length, 1); });
    check("worker/engine-failure-terminates", () => { const f = fake(); f.emit({ type: "unavailable" }); assert.equal(f.outcomes[0].kind, "unavailable"); assert.equal(f.terminated(), 1); });
  } finally { globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout; }
  console.log(JSON.stringify({ status: "PASS", manifest: PROJECT_MANIFEST, actual_engine: "SQL.js SQLite3.49.1", checks: checks.length, cases: checks,
    actual_SQL_comparisons: 192, reversed_delivery_comparisons: 18, wrong_strategies: 8, invalid_sources: 4,
    limits: "Feature-local actual SQL evaluator/state and fake-clock worker lifecycle. Actual browser worker, recovery and UI evidence is separate. No author Python QA rerun, hosted release or learner effect." }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
