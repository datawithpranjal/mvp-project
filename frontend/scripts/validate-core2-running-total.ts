import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

async function main() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const factoryPath = require.resolve("sql.js");
  const factory = require(factoryPath);
  const unavailable = process.argv.includes("--bootstrap-failure");
  const SQL = unavailable ? null : await factory({ locateFile: (file: string) => path.join(path.dirname(factoryPath), file) });
  // Substitute only loader plumbing; exercise the actual production SQL adapter.
  require.cache[factoryPath]!.exports = unavailable
    ? () => Promise.reject(new Error("Synthetic WASM loader unavailable"))
    : () => Promise.resolve(SQL);
  const { getCodingLabBySlug, ALL_CODING_LABS } = require("./lib/coding-labs");
  const { GOLD_CORE_ITEMS } = require("./lib/gold-core");
  const { checkGuidedSqlLab: check } = require("./lib/guided-sql-check");
  const { validateSqlOutput } = require("./lib/browser-sql");
  const slug = "sql-coding-06-running-total-by-date";
  const lab = getCodingLabBySlug(slug);
  assert(lab?.isFree && lab.id === "sql-coding-006" && lab.track === "sql");
  assert.equal(ALL_CODING_LABS.length, 439);
  assert.equal(GOLD_CORE_ITEMS.find((x: any) => x.slug === slug)?.order, 2);
  if (unavailable) {
    const result = await check(lab, lab.solutionCode, "full");
    assert.equal(result.passed, null); assert.equal(result.status, "unavailable");
    console.log("Core2 unavailable loader: no correctness judgment PASS"); return;
  }
  const cases = [{ name: "visible", tables: lab.tables }, ...lab.sqlTestCases];
  assert.equal(cases.length, 9); assert.equal(lab.tables[0].rows.length, 6);
  // Hand-calculated oracles are independent of the reference SQL.
  const oracles = [
    [["2026-04-30",40,40],["2026-05-01",60,100],["2026-05-02",30,130],["2026-05-04",0,130]],
    [["2026-06-15",28,28]],
    [["2026-02-01",7,7],["2026-02-03",10,17]],
    [["2026-12-31",10,10],["2027-01-01",7,17],["2027-02-01",1,18]],
    [["2026-07-01",0,0],["2026-07-05",6,6],["2026-07-09",0,6]],
    [["2024-02-29",17,17]], [],
    [["2026-05-01",100,100],["2026-05-02",150,250],["2026-05-03",200,450],["2026-05-04",130,580],["2026-05-05",170,750],["2026-05-06",90,840],["2026-05-07",300,1140]],
    [["2026-04-29",50,50],["2026-04-30",75,125],["2026-05-01",200,325],["2026-05-02",125,450],["2026-05-03",175,625],["2026-05-04",25,650]]
  ];
  const daily = "WITH daily AS (SELECT sale_date, SUM(CAST(amount AS REAL)) AS daily_revenue FROM daily_sales GROUP BY sale_date) ";
  const strategies = {
    reference: lab.solutionCode,
    correlated: lab.practiceGuidance.alternativeSql,
    nested: "SELECT sale_date, SUM(CAST(amount AS REAL)) AS daily_revenue, SUM(SUM(CAST(amount AS REAL))) OVER (ORDER BY sale_date) AS running_revenue FROM daily_sales GROUP BY sale_date",
    peer_window: "SELECT DISTINCT sale_date, SUM(CAST(amount AS REAL)) OVER (PARTITION BY sale_date) AS daily_revenue, SUM(CAST(amount AS REAL)) OVER (ORDER BY sale_date RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_revenue FROM daily_sales"
  };
  const multiset = (rows: unknown[][]) => rows.map(r => JSON.stringify(r)).sort();
  let positives = 0;
  for (const [name, query] of Object.entries(strategies)) {
    assert.equal((await check(lab, query, "full")).passed, true, name);
    for (const [index, test] of cases.entries()) {
      for (const seed of [0, 1, 7, 19]) {
        const tables = test.tables.map((t: any) => {
          const rows = [...t.rows]; let state = seed + 1;
          for (let i = rows.length - 1; i > 0; i--) {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            const j = state % (i + 1); [rows[i], rows[j]] = [rows[j], rows[i]];
          }
          return { ...t, rows };
        });
        const sums = new Map<string, number>();
        for (const row of tables[0].rows) sums.set(row[0], (sums.get(row[0]) ?? 0) + row[4]);
        let total = 0;
        const calculated = [...sums].sort(([a],[b]) => a.localeCompare(b)).map(([date, amount]) => [date, amount, total += amount]);
        assert.deepEqual(calculated, oracles[index], test.name);
        const result = await validateSqlOutput(tables, query, lab.expectedSql);
        assert(result.passed, `${name}: ${test.name}`);
        assert.deepEqual(multiset(result.actual.rows), multiset(oracles[index]), `${name}: ${test.name}`);
        assert.deepEqual(result.actual.columns, index === 6 ? [] : ["sale_date","daily_revenue","running_revenue"]);
        positives++;
      }
    }
  }
  const mutants: Record<string,string> = {
    raw_rows: lab.starterCode,
    raw_rows_rows: "SELECT sale_date, amount AS daily_revenue, SUM(amount) OVER (ORDER BY sale_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_revenue FROM daily_sales",
    distinct_amount: daily.replace("SUM(CAST(amount AS REAL))", "SUM(DISTINCT CAST(amount AS REAL))") + "SELECT sale_date,daily_revenue,SUM(daily_revenue) OVER (ORDER BY sale_date) AS running_revenue FROM daily",
    month_reset: daily + "SELECT sale_date,daily_revenue,SUM(daily_revenue) OVER (PARTITION BY substr(sale_date,1,7) ORDER BY sale_date) AS running_revenue FROM daily",
    city_grain: daily.replace("GROUP BY sale_date", "GROUP BY sale_date,city") + "SELECT sale_date,daily_revenue,SUM(daily_revenue) OVER (ORDER BY sale_date) AS running_revenue FROM daily",
    daily_as_running: daily + "SELECT sale_date,daily_revenue,daily_revenue AS running_revenue FROM daily",
    full_period: daily + "SELECT sale_date,daily_revenue,SUM(daily_revenue) OVER () AS running_revenue FROM daily",
    zero_filter: daily + "SELECT sale_date,daily_revenue,SUM(daily_revenue) OVER (ORDER BY sale_date) AS running_revenue FROM daily WHERE daily_revenue > 0",
    input_dedup: daily.replace("FROM daily_sales", "FROM (SELECT DISTINCT * FROM daily_sales)") + "SELECT sale_date,daily_revenue,SUM(daily_revenue) OVER (ORDER BY sale_date) AS running_revenue FROM daily",
    reverse_cumulative: daily + "SELECT sale_date,daily_revenue,SUM(daily_revenue) OVER (ORDER BY sale_date DESC) AS running_revenue FROM daily"
  };
  const rejected: Record<string,string[]> = {};
  for (const [name, query] of Object.entries(mutants)) {
    const result = await check(lab, query, "full"); assert.equal(result.passed, false, name);
    rejected[name] = result.sqlResults.filter((x: any) => !x.passed).map((x: any) => x.name);
    assert(rejected[name].length > 0);
  }
  for (const test of cases.slice(-2)) assert((await validateSqlOutput(test.tables, lab.starterCode, lab.expectedSql)).passed);
  const starter = await check(lab, lab.starterCode, "sample");
  assert.equal(starter.passed, false); assert.equal(starter.sqlResults[0].actual.rows.length,6); assert.equal(starter.sqlResults[0].expected.rows.length,4);
  const constant = oracles[0].map(r => `SELECT '${r[0]}' AS sale_date, ${r[1]} AS daily_revenue, ${r[2]} AS running_revenue`).join(" UNION ALL ");
  assert.equal((await check(lab, constant, "sample")).passed, true);
  assert.equal((await check(lab, constant, "full")).passed, false);
  for (const query of ["", "SELECT FROM daily_sales", "SELECT missing FROM daily_sales", "DELETE FROM daily_sales"]) {
    const result = await check(lab, query, "sample");
    assert.equal(result.passed, null); assert.equal(result.status, "query_error");
  }
  for (const broken of [{ ...lab, tables:[{name:"daily_sales",columns:[],rows:[]}] }, { ...lab, expectedSql:"SELECT missing_reference_column FROM daily_sales" }]) {
    const result = await check(broken, lab.solutionCode, "sample");
    assert.equal(result.passed, null); assert.equal(result.status, "unavailable");
  }
  console.log(JSON.stringify({ positive_runtime_comparisons: positives, wrong_strategies_rejected: rejected, legacy_raw_row_false_passes:2, starter_actual:6, starter_expected:4, sample_only_constant_rejected_by_full:true, query_error_and_setup_reference_unavailable:true, scope:"production adapter with local matching WASM; browser/CDN/save verified separately" }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
