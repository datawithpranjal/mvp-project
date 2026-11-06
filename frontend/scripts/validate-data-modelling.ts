import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import initSqlJs from "sql.js";
import {
  CONTENT_MANIFEST, ENGINE_LOAD_BUDGET_MS, QUERY_BUDGET_MS, evaluateModellingSql,
  modellingFixtures, modellingQueries, initialModellingDraft, parseModellingDraft,
  strictReportMatch, type ReportStage
} from "../lib/data-modelling";
import { startModellingRun, type ModellingWorker, type RunOutcome } from "../lib/data-modelling-runner";

async function main() {
  const require = createRequire(import.meta.url);
  const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
  const checks: string[] = [];
  function check(name: string, f: () => void) { f(); checks.push(name); }
  for (const fixture of modellingFixtures) for (const stage of ["historical", "as_of"] as ReportStage[]) {
    for (const family of ["reference", "independent_alternative"] as const) {
      check(`${fixture.name}/${stage}/${family}`, () => {
        const r = evaluateModellingSql(SQL, fixture.name, stage, modellingQueries[family][stage]);
        assert.equal(r.state, fixture.name === "overlap_conflict" ? "conflict" : fixture.name === "empty_orders" ? "empty" : "match");
        if (r.state === "match") {
          assert.equal(r.actual.rows.reduce((s, x) => s + Number(x[1]), 0), r.sourceAmount);
          assert.equal(r.actual.rows.reduce((s, x) => s + Number(x[2]), 0), r.sourceLines);
        }
      });
    }
  }
  for (const [key, sql] of Object.entries(modellingQueries.deliberately_wrong)) {
    const stage = key.startsWith("as_of") ? "as_of" : "historical";
    check(`negative/${key}`, () => assert.ok(modellingFixtures.filter(f => f.name !== "overlap_conflict" && f.name !== "empty_orders")
      .some(f => evaluateModellingSql(SQL, f.name, stage, sql).state === "mismatch")));
  }
  const baseline = evaluateModellingSql(SQL, "baseline", "historical", modellingQueries.reference.historical).actual;
  check("strict/no-rounded-fraction", () => assert.equal(strictReportMatch({ ...baseline, rows: baseline.rows.map((row, i) => i ? row : [row[0], Number(row[1]) + .0000001, row[2]]) }, baseline), false));
  check("strict/header-case-and-order", () => assert.equal(strictReportMatch({ ...baseline, columns: ["Territory", "total_amount", "line_count"] }, baseline), false));
  check("strict/multiplicity", () => assert.equal(strictReportMatch({ ...baseline, rows: [...baseline.rows, baseline.rows[0]] }, baseline), false));
  check("strict/unordered-valid", () => assert.equal(strictReportMatch({ ...baseline, rows: [...baseline.rows].reverse() }, baseline), true));
  check("strict/no-text-numbers", () => assert.equal(strictReportMatch({ ...baseline, rows: baseline.rows.map(row => [row[0], String(row[1]), row[2]]) }, baseline), false));
  check("strict/no-infinity", () => assert.equal(strictReportMatch({ ...baseline, rows: [["North", Infinity, 2]] }, baseline), false));
  check("query-error/corrected-retry", () => {
    assert.equal(evaluateModellingSql(SQL, "baseline", "historical", "SELECT broken FROM").state, "query_error");
    assert.equal(evaluateModellingSql(SQL, "baseline", "historical", modellingQueries.reference.historical).state, "match");
  });
  for (const sql of ["", "DELETE FROM orders", "SELECT 1; SELECT 2", "SELECT " + "1".repeat(20001)]) {
    check(`bounded-input/${sql.slice(0, 25)}`, () => assert.equal(evaluateModellingSql(SQL, "baseline", "historical", sql).state, "query_error"));
  }
  check("output-row-limit", () => assert.equal(evaluateModellingSql(SQL, "baseline", "historical", "WITH RECURSIVE x(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM x WHERE n<1000) SELECT n FROM x").state, "query_error"));
  check("empty/not-successful-nonempty", () => {
    const r = evaluateModellingSql(SQL, "empty_orders", "historical", modellingQueries.reference.historical);
    assert.equal(r.state, "empty"); assert.deepEqual(r.actual.columns, []); assert.match(r.message, /does not complete/);
  });
  check("empty/copied-rows-rejected", () => assert.equal(evaluateModellingSql(SQL, "empty_orders", "as_of", modellingQueries.deliberately_wrong.as_of_constant).state, "mismatch"));
  check("draft/untouched-and-empty-distinct", () => {
    const initial = initialModellingDraft(); assert.ok(initial.historical.length);
    const restored = parseModellingDraft(JSON.stringify({ ...initial, historical: "", as_of: "" }));
    assert.equal(restored.historical, ""); assert.equal(restored.as_of, "");
  });
  check("draft/version-and-case-rejected", () => {
    assert.throws(() => parseModellingDraft(JSON.stringify({ ...initialModellingDraft(), version: 2 })));
    assert.throws(() => parseModellingDraft(JSON.stringify({ ...initialModellingDraft(), fixture: "private" })));
    assert.throws(() => parseModellingDraft("null"));
  });
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let timer: { cb: () => void; ms: number } | undefined;
  globalThis.setTimeout = ((cb: () => void, ms: number) => { timer = { cb, ms }; return 1; }) as typeof setTimeout;
  globalThis.clearTimeout = (() => { timer = undefined; }) as typeof clearTimeout;
  try {
    function fake() {
      let terminated = 0;
      const sent: unknown[] = [];
      const outcomes: RunOutcome[] = [];
      const worker: ModellingWorker = { onmessage: null, onerror: null, postMessage: v => sent.push(v), terminate: () => { terminated++; } };
      const run = startModellingRun({ id: 17, fixture: "baseline", stage: "historical", sql: "SELECT 1" }, v => outcomes.push(v), () => worker);
      const emit = (data: unknown) => worker.onmessage?.({ data } as MessageEvent);
      return { run, emit, sent, outcomes, terminated: () => terminated };
    }
    check("worker/load-budget-and-termination", () => { const f = fake(); assert.equal(timer?.ms, ENGINE_LOAD_BUDGET_MS); timer!.cb(); assert.deepEqual(f.outcomes, [{ kind: "unavailable" }]); assert.equal(f.terminated(), 1); });
    check("worker/query-budget-and-timeout", () => { const f = fake(); f.emit({ type: "ready" }); assert.equal(timer?.ms, QUERY_BUDGET_MS); assert.equal(f.sent.length, 1); timer!.cb(); assert.equal(f.outcomes[0].kind, "timeout"); assert.equal(f.terminated(), 1); });
    check("worker/cancel-and-late-pass", () => { const f = fake(); f.emit({ type: "ready" }); f.run.cancel(); f.emit({ type: "result", id: 17, result: {} }); assert.deepEqual(f.outcomes, [{ kind: "cancelled" }]); assert.equal(f.terminated(), 1); });
    check("worker/stale-id-ignored", () => { const f = fake(); f.emit({ type: "ready" }); f.emit({ type: "result", id: 16, result: {} }); assert.equal(f.outcomes.length, 0); f.run.cancel(); });
    check("worker/result-terminates-instance", () => { const f = fake(); f.emit({ type: "ready" }); f.emit({ type: "result", id: 17, result: {} }); assert.equal(f.outcomes[0].kind, "result"); assert.equal(f.terminated(), 1); f.run.cancel(); assert.equal(f.outcomes.length, 1); });
    check("worker/engine-failure", () => { const f = fake(); f.emit({ type: "unavailable" }); assert.equal(f.outcomes[0].kind, "unavailable"); assert.equal(f.terminated(), 1); });
  } finally { globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout; }
  check("pinned-wasm-identical", () => assert.equal(createHash("sha256").update(readFileSync("public/vendor/sqljs/sql-wasm.wasm")).digest("hex"), createHash("sha256").update(readFileSync(require.resolve("sql.js/dist/sql-wasm.wasm"))).digest("hex")));
  console.log(JSON.stringify({ status: "PASS", content_manifest: CONTENT_MANIFEST, engine: SQL.Database ? "actual SQL.js" : "", checks: checks.length, cases: checks, limits: "Worker lifecycle tests use a fake clock; actual browser cancel/timeout/WASM/UI require separate evidence." }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
