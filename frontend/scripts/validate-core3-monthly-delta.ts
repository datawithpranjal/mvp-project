import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

async function main() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const factoryPath = require.resolve("sql.js");
  const factory = require(factoryPath);
  const unavailable = process.argv.includes("--bootstrap-failure");
  const SQL = unavailable ? null : await factory({ locateFile: (file: string) => path.join(path.dirname(factoryPath), file) });
  // Keep the actual adapter/checker; only substitute local WASM loader plumbing.
  require.cache[factoryPath]!.exports = unavailable
    ? () => Promise.reject(new Error("Synthetic WASM loader unavailable"))
    : () => Promise.resolve(SQL);
  const { getCodingLabBySlug, ALL_CODING_LABS } = require("./lib/coding-labs");
  const { GOLD_CORE_ITEMS } = require("./lib/gold-core");
  const { checkGuidedSqlLab: check } = require("./lib/guided-sql-check");
  const { validateSqlOutput } = require("./lib/browser-sql");
  const slug = "sql-coding-08-month-over-month-growth";
  const lab = getCodingLabBySlug(slug);
  assert(lab?.isFree && lab.id === "sql-coding-008" && lab.track === "sql");
  assert.equal(ALL_CODING_LABS.length, 439);
  assert.equal(GOLD_CORE_ITEMS.find((item: any) => item.slug === slug)?.order, 3);
  if (unavailable) {
    const result = await check(lab, lab.solutionCode, "full");
    assert.equal(result.passed, null);
    assert.equal(result.status, "unavailable");
    console.log("Core3 unavailable loader: no correctness judgment PASS");
    return;
  }

  const original = JSON.parse(fs.readFileSync("data/coding-labs.generated.json", "utf8")).find((item: any) => item.id === lab.id);
  const schema = ["sale_date", "city", "region", "customer_id", "amount"];
  assert.deepEqual(lab.tables[0].columns, schema);
  assert.equal(lab.tables[0].rows.length, 6);
  assert.equal(lab.sqlTestCases.length, 1);
  assert.deepEqual(lab.sqlTestCases[0].tables, original.sqlTestCases[0].tables);
  assert.equal(lab.sqlTestCases[0].expectedSql, original.sqlTestCases[0].expectedSql);
  // Explicit arithmetic oracle, independent of either SQL strategy.
  const oracles = [
    [["2026-01", 100, null], ["2026-02", 150, 50], ["2026-03", 120, -30]],
    [["2026-04", 125, null], ["2026-05", 525, 400]]
  ];
  const cases = [{ name: "visible", tables: lab.tables }, ...lab.sqlTestCases];
  const sort = (rows: unknown[][]) => rows.map(row => JSON.stringify(row)).sort();
  const strategies = { reference: lab.solutionCode, correlated: lab.practiceGuidance.alternativeSql };
  let positiveComparisons = 0;
  for (const [name, query] of Object.entries(strategies)) {
    assert.equal((await check(lab, query, "sample")).passed, true, name);
    assert.equal((await check(lab, query, "full")).passed, true, name);
    for (const [index, test] of cases.entries()) {
      for (const seed of [0, 1, 7, 19]) {
        const rows = [...test.tables[0].rows];
        let state = seed + 1;
        for (let i = rows.length - 1; i > 0; i--) {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          const j = state % (i + 1);
          [rows[i], rows[j]] = [rows[j], rows[i]];
        }
        const totals = new Map<string, number>();
        for (const row of rows) totals.set(row[0].slice(0, 7), (totals.get(row[0].slice(0, 7)) ?? 0) + row[4]);
        let previous: number | null = null;
        const oracle = [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([month, revenue]) => {
          const value = [month, revenue, previous === null ? null : revenue - previous];
          previous = revenue;
          return value;
        });
        assert.deepEqual(oracle, oracles[index], test.name);
        const result = await validateSqlOutput([{ ...test.tables[0], rows }], query, lab.expectedSql);
        assert(result.passed, `${name}:${test.name}`);
        assert.deepEqual(result.actual.columns, ["month", "revenue", "revenue_delta"]);
        assert.deepEqual(sort(result.actual.rows), sort(oracle));
        positiveComparisons++;
      }
    }
  }

  // Reproduce the old blind spot and its repaired third-month discriminator.
  let oldFalsePasses = 0;
  for (const test of [{ tables: original.tables, expectedSql: original.expectedSql }, ...original.sqlTestCases]) {
    assert((await validateSqlOutput(test.tables, lab.starterCode, test.expectedSql)).passed);
    oldFalsePasses++;
  }
  assert.equal(oldFalsePasses, 2);
  const wrong = await check(lab, lab.starterCode, "sample");
  assert.equal(wrong.passed, false);
  assert.deepEqual(wrong.sqlResults[0].actual.rows, [["2026-01", 100, null], ["2026-02", 150, 50], ["2026-03", 120, 20]]);
  assert.deepEqual(wrong.sqlResults[0].expected.rows, oracles[0]);
  const fullWrong = await check(lab, lab.starterCode, "full");
  assert.equal(fullWrong.passed, false);
  assert.equal(fullWrong.sqlResults.length, 2);
  assert.equal(fullWrong.sqlResults[1].passed, true);
  const visibleConstant = oracles[0].map(row => `SELECT '${row[0]}' AS month, ${row[1]} AS revenue, ${row[2] === null ? "NULL" : row[2]} AS revenue_delta`).join(" UNION ALL ");
  assert.equal((await check(lab, visibleConstant, "sample")).passed, true);
  assert.equal((await check(lab, visibleConstant, "full")).passed, false);
  for (const query of ["", "SELECT FROM daily_sales", "SELECT missing FROM daily_sales", "DELETE FROM daily_sales"]) {
    const result = await check(lab, query, "sample");
    assert.equal(result.passed, null);
    assert.equal(result.status, "query_error");
  }
  for (const broken of [{ ...lab, tables: [{ name: "daily_sales", columns: [], rows: [] }] }, { ...lab, expectedSql: "SELECT missing_reference_column FROM daily_sales" }]) {
    const result = await check(broken, lab.solutionCode, "sample");
    assert.equal(result.passed, null);
    assert.equal(result.status, "unavailable");
  }
  console.log(JSON.stringify({ identity_free_core3: true, complete_visible_rows: 6, configured_cases: 2, additional_cases_unchanged: 1, positive_runtime_comparisons: positiveComparisons, old_baseline_false_passes: oldFalsePasses, repaired_march_wrong: 20, repaired_march_expected: -30, result_equivalent_accepted: true, visible_constant_not_full_pass: true, query_error_and_unavailable_distinct: true, scope: "Actual adapter/checker with local matching WASM; browser, account and deployment evidence separate" }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
