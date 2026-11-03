import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

async function main() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const factoryPath = require.resolve("sql.js");
  const originalFactory = require(factoryPath);
  const unavailable = process.argv.includes("--bootstrap-failure");
  const SQL = unavailable ? null : await originalFactory({ locateFile: (file: string) => path.join(path.dirname(factoryPath), file) });
  // Only loader plumbing is substituted. Grading uses the production adapter.
  require.cache[factoryPath]!.exports = unavailable
    ? () => Promise.reject(new Error("Synthetic WASM loader unavailable"))
    : () => Promise.resolve(SQL);
  const { getCodingLabBySlug } = require("./lib/coding-labs");
  const { checkCore1SalaryBands: check } = require("./lib/core1-salary-check");
  const { validateSqlOutput, sameSqlOutput } = require("./lib/browser-sql");
  const lab = getCodingLabBySlug("sql-coding-03-top-3-salaries-per-department");
  assert(lab?.isFree && lab.id === "sql-coding-003");
  if (unavailable) {
    const result = await check(lab, lab.solutionCode, "full");
    assert.equal(result.passed, null); assert.equal(result.status, "unavailable");
    console.log("Core1 unavailable loader: no correctness judgment PASS"); return;
  }
  const cases = [{ name: "visible", tables: lab.tables }, ...lab.sqlTestCases];
  assert.equal(cases.length, 9); assert.equal(lab.tables[0].rows.length, 11);
  const multiset = (rows: unknown[][]) => rows.map(r => JSON.stringify(r)).sort();
  let positives = 0;
  for (const query of [lab.solutionCode, lab.practiceGuidance.alternativeSql]) {
    for (const test of cases) {
      for (const seed of [0, 1, 7, 19]) {
        const tables = test.tables.map((t: any) => ({ ...t, rows: [...t.rows].sort((a: any[], b: any[]) => ((a[0] * (seed + 3)) % 13) - ((b[0] * (seed + 3)) % 13)) }));
        const bands = new Map<string, Set<number>>();
        for (const r of tables[0].rows) {
          if (!bands.has(r[2])) bands.set(r[2], new Set());
          bands.get(r[2])!.add(r[4]);
        }
        const top = new Map([...bands].map(([d, salaries]) => [d, new Set([...salaries].sort((a,b) => b-a).slice(0,3))]));
        const expected = tables[0].rows.filter((r: any[]) => top.get(r[2])!.has(r[4])).map((r: any[]) => [r[2],r[1],r[4]]);
        const result = await validateSqlOutput(tables, query, lab.expectedSql);
        assert(result.passed, test.name);
        assert.deepEqual(multiset(result.actual.rows), multiset(expected), test.name); positives++;
      }
    }
  }
  const ref = lab.solutionCode;
  const noCutoff = "SELECT department, emp_name, salary FROM employees";
  const mutants: Record<string,string> = {
    no_cutoff: noCutoff,
    row_number: ref.replace("DENSE_RANK()", "ROW_NUMBER()"),
    global_rank: ref.replace("PARTITION BY department ", ""),
    global_limit: "SELECT department, emp_name, salary FROM employees ORDER BY salary DESC LIMIT 3",
    ascending: ref.replace("ORDER BY salary DESC", "ORDER BY salary ASC"),
    offset: ref.replace("salary_rank <= 3", "salary_rank BETWEEN 2 AND 4"),
    fewer_bands: ref.replace("salary_rank <= 3", "salary_rank < 3"),
    gapped_rank: ref.replace("DENSE_RANK()", "RANK()"),
    extra_tie_key: ref.replace("ORDER BY salary DESC", "ORDER BY salary DESC, emp_id"),
    lost_multiplicity: ref.replace("SELECT department, emp_name, salary\nFROM ranked", "SELECT DISTINCT department, emp_name, salary\nFROM ranked"),
    prompt_copy: "SELECT 'partition distinct salary bands boundary ties' AS answer"
  };
  for (const [name, query] of Object.entries(mutants)) assert.equal((await check(lab, query, "full")).passed, false, name);
  const legacy = cases.filter((x: any) => x.name.startsWith("Legacy")); assert.equal(legacy.length,2);
  for (const test of legacy) assert((await validateSqlOutput(test.tables, noCutoff, lab.expectedSql)).passed);
  const starter = await check(lab, lab.starterCode, "sample");
  assert.equal(starter.passed, false); assert.equal(starter.sqlResults[0].actual.rows.length,11); assert.equal(starter.sqlResults[0].expected.rows.length,9);
  const constant = starter.sqlResults[0].expected.rows.map((r: any[]) => `SELECT '${r[0]}' AS department, '${r[1]}' AS emp_name, ${r[2]} AS salary`).join(" UNION ALL ");
  assert.equal((await check(lab, constant, "sample")).passed, true);
  assert.equal((await check(lab, constant, "full")).passed, false);
  assert.equal((await check(lab, lab.practiceGuidance.alternativeSql, "full")).passed, true);
  for (const query of ["SELECT FROM employees", "DELETE FROM employees"]) {
    const result = await check(lab, query, "sample");
    assert.equal(result.passed, null); assert.equal(result.status, "query_error");
  }
  for (const broken of [{ ...lab, tables:[{name:"employees",columns:[],rows:[]}] }, { ...lab, expectedSql:"SELECT missing_reference_column FROM employees" }]) {
    const result = await check(broken, ref, "sample");
    assert.equal(result.passed, null); assert.equal(result.status, "unavailable");
  }
  assert.equal(sameSqlOutput({columns:["salary"],rows:[[1],[1]]},{columns:["salary"],rows:[[1]]}),false);
  console.log(JSON.stringify({positive_runtime_comparisons:positives,wrong_strategies_rejected:Object.keys(mutants).length,legacy_no_cutoff_false_pass:2,starter_actual:11,starter_expected:9,sample_only_constant_rejected_by_full:true,query_error_and_setup_reference_unavailable:true,scope:"production validator with local matching WASM; browser/CDN/save verified separately"}));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
