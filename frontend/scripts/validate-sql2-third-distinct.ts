import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

async function main() {
  const root = path.resolve("..");
  const require = createRequire(path.resolve("package.json"));
  const factoryPath = require.resolve("sql.js");
  const factory = require(factoryPath);
  const SQL = await factory({ locateFile: (file: string) => path.join(path.dirname(factoryPath), file) });
  require.cache[factoryPath]!.exports = () => Promise.resolve(SQL);
  const adapter = require("./lib/browser-sql");
  const catalog = require("./lib/coding-labs");
  const clarity = require("./lib/sql-workspace-clarity");
  const guided = require("./lib/guided-sql-check");
  const lab = catalog.ALL_CODING_LABS.find((item: any) => item.id === "sql-coding-002");
  const originalCatalog = JSON.parse(fs.readFileSync(path.join(root, "frontend/data/coding-labs.generated.json"), "utf8"));
  const original = originalCatalog.find((item: any) => item.id === lab.id);
  const oldReference = "WITH ranked AS (SELECT DISTINCT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS salary_rank FROM employees) SELECT salary AS third_highest_salary FROM ranked WHERE salary_rank = 3";
  assert.equal(lab.slug, "sql-coding-02-nth-highest-salary");
  assert(lab.isFree && !lab.practiceGuidance && lab.difficulty === original.difficulty);
  assert.equal(lab.title, "SQL 2: Third Highest Distinct Salary");
  assert.equal(lab.expectedSql, lab.solutionCode);
  assert.equal(lab.sqlTestCases.length, 1);
  assert.equal(lab.sqlTestCases[0].expectedSql, lab.expectedSql);
  assert.deepEqual(lab.tables, original.tables);
  const sourceFile = "components/labs/BrowserCodingLab.tsx";
  const source = ts.createSourceFile(sourceFile, fs.readFileSync(sourceFile, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const runner = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "runSqlLab");
  assert(runner);
  const context: any = { validateSqlOutput: adapter.validateSqlOutput, checkGuidedSqlLab: guided.checkGuidedSqlLab, ...clarity };
  vm.createContext(context);
  vm.runInContext(ts.transpile(runner.getText(source), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }), context);
  const alternative = "WITH ranked AS (SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS salary_rank FROM employees WHERE salary IS NOT NULL) SELECT MAX(CASE WHEN salary_rank = 3 THEN salary END) AS third_highest_salary FROM ranked";
  const row = (id: number, salary: number | null) => [id, `Fictional ${id}`, "Data", null, salary];
  const cases = [
    { name: "visible", rows: lab.tables[0].rows, expected: 105000 },
    { name: "additional", rows: lab.sqlTestCases[0].tables[0].rows, expected: 150000 },
    { name: "empty", rows: [], expected: null },
    { name: "one_nonnull_band", rows: [row(21, 100), row(22, 100)], expected: null },
    { name: "two_nonnull_bands", rows: [row(31, 200), row(32, 100)], expected: null },
    { name: "two_bands_plus_null", rows: [row(41, 200), row(42, 100), row(43, null)], expected: null },
    { name: "all_null", rows: [row(51, null), row(52, null)], expected: null },
    { name: "repeated_third_band", rows: [row(61, 300), row(62, 200), row(63, 100), row(64, 100)], expected: 100 }
  ];
  const boundaryResults = [];
  for (const test of cases) {
    const tables = [{ ...lab.tables[0], rows: test.rows }];
    const oracle = { columns: ["third_highest_salary"], rows: [[test.expected]] };
    const bands = [...new Set(test.rows.map((item: any[]) => item[4]).filter((value: any) => value !== null))].sort((a: any, b: any) => b - a);
    assert.equal(bands.length >= 3 ? bands[2] : null, test.expected, "Handwritten oracle");
    const variants = [];
    for (const [name, query] of [["reference", lab.expectedSql], ["aggregate_dense_rank", alternative]]) {
      const result = await adapter.validateSqlOutput(tables, query, lab.expectedSql);
      assert(result.passed);
      assert.deepEqual(result.actual, oracle);
      // Keep the actual full runner's second dataset while varying only its internal first input.
      const complete = JSON.parse(JSON.stringify(await context.runSqlLab({ ...lab, tables }, query)));
      assert(complete.passed && complete.sqlResults.length === 2);
      assert.deepEqual(complete.sqlResults[0].actual, oracle);
      assert.deepEqual(complete.sqlResults[1].actual, { columns: ["third_highest_salary"], rows: [[150000]] });
      variants.push({ name, query, adapter: result, complete });
    }
    const old = await adapter.validateSqlOutput(tables, oldReference, lab.expectedSql);
    if (["empty", "one_nonnull_band", "two_nonnull_bands", "all_null"].includes(test.name)) {
      assert.equal(old.passed, false);
      assert.deepEqual(old.actual, { columns: [], rows: [] });
      const oldComplete = await context.runSqlLab({ ...lab, tables }, oldReference);
      assert.equal(oldComplete.passed, false);
    }
    boundaryResults.push({ name: test.name, input: tables, handwrittenOracle: oracle, variants, oldReference: old });
  }
  const queries = {
    employee_offset2: "SELECT salary AS third_highest_salary FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 2",
    constant105000: "SELECT 105000 AS third_highest_salary",
    constant150000: "SELECT 150000 AS third_highest_salary",
    wrong_alias: lab.expectedSql.replace(/third_highest_salary/g, "wrong_column"),
    extra_column: "SELECT 105000 AS third_highest_salary, 1 AS extra_column",
    extra_row: "SELECT 105000 AS third_highest_salary UNION ALL SELECT 105000",
    zero_rows: "SELECT salary AS third_highest_salary FROM employees WHERE 1 = 0"
  };
  const negativeResults = [];
  for (const [name, query] of Object.entries(queries)) {
    const result = JSON.parse(JSON.stringify(await context.runSqlLab(lab, query)));
    assert.equal(result.passed, false);
    assert(result.message.includes("third_highest_salary") && !result.message.includes("second_highest_salary"));
    const expected = name === "constant150000" ? [false, true] : ["employee_offset2", "constant105000"].includes(name) ? [true, false] : [false, false];
    assert.deepEqual(result.sqlResults.map((test: any) => test.passed), expected);
    negativeResults.push({ name, query, ...result });
  }
  assert.deepEqual(catalog.ALL_CODING_LABS.filter(clarity.isSqlSalaryEntry).map((item: any) => item.id), ["sql-coding-001", lab.id]);
  assert(lab.expectedOutcome.includes("one additional configured salary-ranking dataset") && lab.expectedOutcome.includes("device saving does not guarantee cloud"));
  assert(!/hidden|all edge-case datasets/i.test(lab.problemStatement));
  assert(clarity.sqlSalarySampleMessage().includes("finite checks"));
  const db = new SQL.Database();
  const sqlite = db.exec("SELECT sqlite_version()")[0].values[0][0];
  db.close();
  console.log(JSON.stringify({ sqlite, actualAdapter: true, actualComponentCompleteRunner: true, deployedDatasets: 2, boundaryInputs: 8, adapterPositiveComparisons: 16, completeRunnerPositiveRuns: 16, completeRunnerPositiveCaseComparisons: 32, boundaryResults, negativeResults, scope: "Internal synthetic first-input substitutions retain the unchanged additional dataset and execute the actual full runner. No eight-case deployment, browser, account or effect claim." }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
