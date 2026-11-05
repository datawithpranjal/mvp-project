import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

async function main() {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const factoryPath = require.resolve("sql.js");
  const factory = require(factoryPath);
  const unavailable = process.argv.includes("--bootstrap-failure");
  const SQL = unavailable ? null : await factory({ locateFile: (file: string) => path.join(path.dirname(factoryPath), file) });
  require.cache[factoryPath]!.exports = unavailable
    ? () => Promise.reject(new Error("Synthetic loader unavailable"))
    : () => Promise.resolve(SQL);
  const { ALL_CODING_LABS, getCodingLabs } = require("./lib/coding-labs");
  const adapter = require("./lib/browser-sql");
  const { checkGuidedSqlLab } = require("./lib/guided-sql-check");
  const clarity = require("./lib/sql-workspace-clarity");
  const lab = getCodingLabs("sql")[0];
  assert.equal(lab.id, "sql-coding-001");
  assert.equal(lab.slug, "sql-coding-01-second-highest-salary");
  assert(lab.isFree && !lab.practiceGuidance);
  assert.deepEqual(ALL_CODING_LABS.filter(clarity.isSqlSalaryEntry).map((x: any) => x.id), [lab.id]);
  const original = JSON.parse(fs.readFileSync("data/coding-labs.generated.json", "utf8")).find((x: any) => x.id === lab.id);
  for (const key of ["tables", "expectedSql", "solutionCode", "sqlTestCases", "starterCode", "id", "slug", "title", "isFree"]) assert.deepEqual(lab[key], original[key], key);
  assert.equal(lab.tables[0].rows.length, 7);
  assert.equal(lab.sqlTestCases.length, 1);

  // Execute the actual complete-check runner with its real adapter, not a copied evaluator.
  const file = "components/labs/BrowserCodingLab.tsx";
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const runner = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "runSqlLab");
  assert(runner);
  const context: any = { validateSqlOutput: adapter.validateSqlOutput, checkGuidedSqlLab, ...clarity };
  vm.createContext(context);
  vm.runInContext(ts.transpile(runner.getText(source), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }), context);
  if (unavailable) {
    await assert.rejects(() => context.runSqlLab(lab, lab.solutionCode), (error: any) => error.kind === "unavailable");
    console.log("SQL loader failure stays unavailable; no auto-retry/reset or correctness result PASS");
    return;
  }

  const alternative = "SELECT (SELECT DISTINCT salary FROM employees WHERE salary IS NOT NULL ORDER BY salary DESC LIMIT 1 OFFSET 1) AS second_highest_salary";
  const configured = [{ name: "visible", tables: lab.tables }, ...lab.sqlTestCases];
  for (const query of [lab.solutionCode, alternative]) {
    const result = await context.runSqlLab(lab, query);
    assert.equal(result.passed, true);
    assert.equal(result.sqlResults.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(result.sqlResults.map((x: any) => x.actual.rows))), [[[115000]], [[180000]]]);
    assert(!/hidden|all edge cases/i.test(result.message));
  }
  const hardcoded = "SELECT 115000 AS second_highest_salary";
  assert.equal((await adapter.validateSqlOutput(lab.tables, hardcoded, lab.expectedSql)).passed, true);
  assert.equal((await context.runSqlLab(lab, hardcoded)).passed, false);
  assert.equal((await context.runSqlLab(lab, "SELECT 180000 AS second_highest_salary")).passed, false);
  // The additional dataset has a duplicated maximum, so employee-row ranking must fail.
  const employeeRow = "WITH ranked AS (SELECT salary, ROW_NUMBER() OVER (ORDER BY salary DESC) AS rn FROM employees) SELECT salary AS second_highest_salary FROM ranked WHERE rn = 2";
  const employeeOffset = "SELECT salary AS second_highest_salary FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 1";
  for (const query of [employeeRow, employeeOffset]) {
    const result = await context.runSqlLab(lab, query);
    assert.equal(result.passed, false);
    assert.deepEqual(JSON.parse(JSON.stringify(result.sqlResults.map((x: any) => x.passed))), [true, false]);
  }
  for (const query of [
    lab.expectedSql.replace(/second_highest_salary/g, "wrong_column"),
    "SELECT 115000 AS second_highest_salary, 1 AS extra_column",
    "SELECT 115000 AS second_highest_salary UNION ALL SELECT 115000",
    "SELECT salary AS second_highest_salary FROM employees WHERE 1 = 0"
  ]) assert.equal((await context.runSqlLab(lab, query)).passed, false, "Required column and row shape");

  // These five synthetic boundaries are internal tests, not shipped exercise cases.
  const boundaries = [
    { name: "empty", amounts: [], expected: null },
    { name: "one band", amounts: [30], expected: null },
    { name: "tied only", amounts: [30, 30], expected: null },
    { name: "all NULL", amounts: [null, null], expected: null },
    { name: "mixed", amounts: [null, 30, 30, 20, 10], expected: 20 }
  ];
  let comparisons = 0;
  for (const test of [...configured.map((x: any, i: number) => ({ ...x, expected: i ? 180000 : 115000 })), ...boundaries]) {
    const tables = test.tables ?? [{ ...lab.tables[0], rows: test.amounts.map((salary: number | null, i: number) => [i + 1, `Synthetic ${i}`, "Test", null, salary]) }];
    for (const query of [lab.solutionCode, alternative]) {
      const result = await adapter.validateSqlOutput(tables, query, lab.expectedSql);
      assert(result.passed, test.name);
      assert.deepEqual(result.actual, { columns: ["second_highest_salary"], rows: [[test.expected]] });
      comparisons++;
    }
  }
  for (const query of ["SELECT TOP 1 salary FROM employees", "SELECT FROM employees", ""]) {
    await assert.rejects(() => context.runSqlLab(lab, query), (error: any) => error.kind === "query_error" && error.message.length > 0);
  }
  assert.deepEqual((await adapter.runReadOnlySql(lab.tables, "SELECT salary FROM employees ORDER BY salary DESC LIMIT 1")).rows, [[120000]]);
  assert.deepEqual((await adapter.runReadOnlySql(lab.tables, "SELECT strftime('%Y-%m', '2026-03-02') AS month")).rows, [["2026-03"]]);
  console.log(JSON.stringify({ exact_default_free_SQL1: true, seven_internal_boundary_cases: true, positive_adapter_comparisons: comparisons, configured_cases: 2, reference_scalar_equivalent_pass: true, both_hardcoded_constants_fail_complete: true, employee_row_and_offset_fail_additional: true, required_column_row_shape_checked: true, TOP_query_error_LIMIT_strftime_proven: true, scope: "Actual adapter and private complete-check runner with local matching WASM; internal boundaries do not expand shipped cases; UI/auth/Preview separate" }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
