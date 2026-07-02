import { createRequire } from "node:module";
import path from "node:path";

import { ALL_CODING_LABS, type CodingLab, type CodingLabTable } from "../frontend/lib/coding-labs";
import { ALL_SCENARIOS, type Scenario, type ScenarioSampleTable } from "../frontend/lib/scenarios";

type Severity = "BLOCKER" | "WARNING";

type SqlJsStatic = {
  Database: new () => {
    run: (sql: string) => void;
    exec: (sql: string) => Array<{
      columns: string[];
      values: unknown[][];
    }>;
    close: () => void;
  };
};

type InitSqlJs = (config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>;

interface Finding {
  severity: Severity;
  source: string;
  slug: string;
  title: string;
  check: string;
  message: string;
}

interface QueryResult {
  columns: string[];
  rows: unknown[][];
}

const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const SQL_WASM_DIR = path.join(FRONTEND_DIR, "node_modules", "sql.js", "dist");
const frontendRequire = createRequire(path.join(FRONTEND_DIR, "package.json"));
const findings: Finding[] = [];

function addFinding(
  severity: Severity,
  source: string,
  slug: string,
  title: string,
  check: string,
  message: string
) {
  findings.push({ severity, source, slug, title, check, message });
}

function sqlLiteral(value: string | number | boolean | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function inferColumnType(rows: Array<Array<string | number | boolean | null>>, columnIndex: number): string {
  const values = rows.map((row) => row[columnIndex]).filter((value) => value !== null);
  return values.length > 0 && values.every((value) => typeof value === "number") ? "REAL" : "TEXT";
}

function buildSetupSql(tables: CodingLabTable[]): string {
  return tables
    .map((table) => {
      const createColumns = table.columns
        .map((column, index) => `${quoteIdentifier(column)} ${inferColumnType(table.rows, index)}`)
        .join(", ");
      const inserts = table.rows.map((row) => {
        const values = table.columns.map((_, index) => sqlLiteral(row[index] ?? null)).join(", ");
        return `INSERT INTO ${quoteIdentifier(table.name)} VALUES (${values});`;
      });

      return [
        `DROP TABLE IF EXISTS ${quoteIdentifier(table.name)};`,
        `CREATE TABLE ${quoteIdentifier(table.name)} (${createColumns});`,
        ...inserts
      ].join("\n");
    })
    .join("\n\n");
}

function scenarioTablesToCodingTables(tables?: ScenarioSampleTable[]): CodingLabTable[] {
  return (tables ?? []).map((table) => ({
    name: table.name,
    columns: table.columns,
    rows: table.rows
  }));
}

async function createSqlEngine(): Promise<SqlJsStatic> {
  const sqlJsModule = frontendRequire("sql.js") as InitSqlJs | { default: InitSqlJs };
  const initSqlJs = typeof sqlJsModule === "function" ? sqlJsModule : sqlJsModule.default;
  return initSqlJs({
    locateFile: (file) => path.join(SQL_WASM_DIR, file)
  });
}

function executeSql(SQL: SqlJsStatic, tables: CodingLabTable[], sql: string): QueryResult {
  const db = new SQL.Database();
  try {
    db.run(buildSetupSql(tables));
    const result = db.exec(sql).at(-1);
    return {
      columns: result?.columns ?? [],
      rows: result?.values ?? []
    };
  } finally {
    db.close();
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[_|,-]+/g, " ").replace(/\s+/g, " ").trim();
}

function hasAllColumns(expectedText: string, columns: string[]): boolean {
  const normalizedExpected = normalizeText(expectedText);
  return columns.every((column) => normalizedExpected.includes(normalizeText(column)));
}

function hasVisibleRowValues(expectedText: string, result: QueryResult): boolean {
  if (result.rows.length === 0) return true;
  const normalizedExpected = normalizeText(expectedText);
  return result.rows.every((row) =>
    row.every((value) => value === null || normalizedExpected.includes(normalizeText(String(value))))
  );
}

function resultSignature(result: QueryResult): string {
  return JSON.stringify({
    columns: result.columns.map((column) => column.toLowerCase()),
    rows: result.rows
  });
}

function looksLikeSelect(sql: string): boolean {
  return /^\s*(with|select)\b/i.test(sql);
}

function checkCodingLab(SQL: SqlJsStatic, lab: CodingLab) {
  if (!lab.expectedSql || lab.tables.length === 0) return;

  let expectedResult: QueryResult;
  try {
    expectedResult = executeSql(SQL, lab.tables, lab.expectedSql);
  } catch (error) {
    addFinding(
      "BLOCKER",
      "coding-lab",
      lab.slug,
      lab.title,
      "expected-sql-execution",
      error instanceof Error ? error.message : String(error)
    );
    return;
  }

  if (lab.expectedOutcome && !hasAllColumns(lab.expectedOutcome, expectedResult.columns)) {
    addFinding(
      "WARNING",
      "coding-lab",
      lab.slug,
      lab.title,
      "expected-output-columns",
      `Expected outcome text does not mention actual result columns: ${expectedResult.columns.join(", ")}.`
    );
  }

  for (const testCase of lab.sqlTestCases ?? []) {
    const testSql = testCase.expectedSql || lab.expectedSql;
    try {
      executeSql(SQL, testCase.tables, testSql);
    } catch (error) {
      addFinding(
        "BLOCKER",
        "coding-lab",
        lab.slug,
        lab.title,
        "hidden-test-execution",
        `${testCase.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

function checkScenario(SQL: SqlJsStatic, scenario: Scenario) {
  const tables = scenarioTablesToCodingTables(scenario.sampleTables);
  if (!scenario.expectedSql || tables.length === 0) return;

  let expectedResult: QueryResult;
  try {
    expectedResult = executeSql(SQL, tables, scenario.expectedSql);
  } catch (error) {
    addFinding(
      "BLOCKER",
      "scenario",
      scenario.slug,
      scenario.title,
      "expected-sql-execution",
      error instanceof Error ? error.message : String(error)
    );
    return;
  }

  if (scenario.expectedOutput) {
    if (!hasAllColumns(scenario.expectedOutput, expectedResult.columns)) {
      addFinding(
        "WARNING",
        "scenario",
        scenario.slug,
        scenario.title,
        "expected-output-columns",
        `Expected output text does not mention actual result columns: ${expectedResult.columns.join(", ")}.`
      );
    }

    if (!hasVisibleRowValues(scenario.expectedOutput, expectedResult)) {
      addFinding(
        "WARNING",
        "scenario",
        scenario.slug,
        scenario.title,
        "expected-output-values",
        "Expected output text appears to miss one or more visible result values from expectedSql."
      );
    }
  }

  if (looksLikeSelect(scenario.modelSolution)) {
    try {
      const modelResult = executeSql(SQL, tables, scenario.modelSolution);
      if (resultSignature(modelResult) !== resultSignature(expectedResult)) {
        addFinding(
          "WARNING",
          "scenario",
          scenario.slug,
          scenario.title,
          "model-solution-result",
          "Model solution result differs from expectedSql result on visible sample data."
        );
      }
    } catch (error) {
      addFinding(
        "WARNING",
        "scenario",
        scenario.slug,
        scenario.title,
        "model-solution-execution",
        `Model solution looks like SQL but failed to execute: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function main() {
  const SQL = await createSqlEngine();
  ALL_CODING_LABS.forEach((lab) => checkCodingLab(SQL, lab));
  ALL_SCENARIOS.forEach((scenario) => checkScenario(SQL, scenario));

  const blockers = findings.filter((finding) => finding.severity === "BLOCKER");
  const warnings = findings.filter((finding) => finding.severity === "WARNING");

  console.log(
    `Runtime sanity checked ${ALL_CODING_LABS.length} coding labs and ${ALL_SCENARIOS.length} scenarios.`
  );
  console.log(`BLOCKER: ${blockers.length} | WARNING: ${warnings.length}`);

  for (const severity of ["BLOCKER", "WARNING"] as const) {
    const severityFindings = findings.filter((finding) => finding.severity === severity);
    if (severityFindings.length === 0) continue;
    console.log(`\n${severity}`);
    console.log("-".repeat(severity.length));
    severityFindings.slice(0, 50).forEach((finding) => {
      console.log(
        `- ${finding.source} :: ${finding.slug} :: ${finding.title}\n  [${finding.check}] ${finding.message}`
      );
    });
    if (severityFindings.length > 50) {
      console.log(`- ... ${severityFindings.length - 50} more`);
    }
  }

  if (blockers.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Runtime content sanity check failed to run.");
  console.error(error);
  process.exitCode = 1;
});
