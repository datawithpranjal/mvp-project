import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import codingLabGenerated from "../frontend/data/coding-labs.generated.json";
import publicSqlPracticeGenerated from "../frontend/data/public-sql-practice.generated.json";
import { pysparkLabData } from "../frontend/data/pyspark-labs.generated";
import {
  ALL_OPERATIONS_LABS,
  type OperationsLab
} from "../frontend/data/platform-operations-labs";
import {
  ALL_SCENARIOS,
  type Scenario,
  type ScenarioSampleTable
} from "../frontend/lib/scenarios";
import {
  ALL_SYSTEM_DESIGN_CASES,
  type SystemDesignCase
} from "../frontend/lib/system-design";
import { isLaunchReadyCodingLab } from "../frontend/lib/launch-ready-content";
import type {
  CodingLab,
  CodingLabTable,
  SqlTestCase
} from "../frontend/lib/coding-labs";

type Severity = "BLOCKER" | "WARNING" | "SUGGESTION";
type ContentKind = "coding-lab" | "scenario" | "operations-lab" | "system-design" | "file";

type SqlJsStatic = {
  Database: new () => {
    run: (sql: string) => void;
    exec: (sql: string) => unknown;
    close: () => void;
  };
};

type InitSqlJs = (config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>;

interface Finding {
  severity: Severity;
  source: string;
  kind: ContentKind;
  id: string;
  title: string;
  check: string;
  message: string;
  launchReady: boolean;
}

interface ValidationItem {
  source: string;
  kind: ContentKind;
  id: string;
  slug: string;
  title: string;
  businessContext?: string;
  problemStatement?: string;
  studentTask?: string;
  expectedOutcome?: string;
  modelAnswer?: string;
  explanation?: string;
  hints?: string[];
  starterCode?: string;
  expectedSql?: string;
  solutionCode?: string;
  tables?: CodingLabTable[];
  sqlTestCases?: SqlTestCase[];
  launchReady?: boolean;
}

const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const SQL_WASM_DIR = path.join(FRONTEND_DIR, "node_modules", "sql.js", "dist");
const frontendRequire = createRequire(path.join(FRONTEND_DIR, "package.json"));
const VALIDATED_FILES = [
  "frontend/data/coding-labs.generated.json",
  "frontend/data/public-sql-practice.generated.json",
  "frontend/data/pyspark-labs.generated.ts",
  "frontend/lib/scenarios.ts",
  "frontend/data/platform-operations-labs.ts",
  "frontend/lib/system-design.ts"
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "case",
  "data",
  "engineer",
  "engineering",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "job",
  "lab",
  "of",
  "on",
  "or",
  "pipeline",
  "practice",
  "problem",
  "query",
  "question",
  "record",
  "records",
  "return",
  "scenario",
  "sql",
  "task",
  "the",
  "this",
  "to",
  "with",
  "write"
]);

const findings: Finding[] = [];

function addFinding(
  severity: Severity,
  item: Pick<ValidationItem, "source" | "kind" | "id" | "title"> & { launchReady?: boolean },
  check: string,
  message: string
) {
  findings.push({
    severity,
    source: item.source,
    kind: item.kind,
    id: item.id,
    title: item.title,
    check,
    message,
    launchReady: "launchReady" in item ? Boolean(item.launchReady) : false
  });
}

function launchSection(item: ValidationItem): string {
  if (item.kind === "coding-lab" && item.source.includes("public-sql-practice.generated")) {
    return "SQL coverage labs";
  }
  if (item.kind === "coding-lab" && item.source.includes("coding-labs.generated")) {
    return item.slug.startsWith("sql-") ? "SQL labs" : "Python labs";
  }
  if (item.kind === "coding-lab" && item.source.includes("pyspark-labs.generated")) {
    return "PySpark labs";
  }
  if (item.kind === "operations-lab" && item.slug.startsWith("airflow-")) {
    return "Airflow labs";
  }
  if (item.kind === "operations-lab" && item.slug.startsWith("aws-")) {
    return "AWS labs";
  }
  if (item.kind === "scenario") return "Broken Pipeline scenarios";
  if (item.kind === "system-design") return "System Design cases";
  return item.kind;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeTable(value: unknown): CodingLabTable | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = asString(record.name).trim();
  const columns = asStringArray(record.columns);
  const rows = Array.isArray(record.rows)
    ? record.rows.filter(Array.isArray) as CodingLabTable["rows"]
    : [];
  return name && columns.length > 0 ? { name, columns, rows } : null;
}

function normalizeTables(value: unknown): CodingLabTable[] {
  return Array.isArray(value)
    ? value.map(normalizeTable).filter((table): table is CodingLabTable => Boolean(table))
    : [];
}

function normalizeSqlTestCases(value: unknown): SqlTestCase[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((testCase): testCase is Record<string, unknown> =>
      Boolean(testCase && typeof testCase === "object")
    )
    .map((testCase) => ({
      name: asString(testCase.name) || "Unnamed SQL case",
      description: asString(testCase.description),
      tables: normalizeTables(testCase.tables),
      expectedSql: asString(testCase.expectedSql) || undefined
    }));
}

function normalizeCodingLab(value: unknown, source: string): ValidationItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const slug = asString(record.slug);
  const title = asString(record.title);
  if (!slug || !title) return null;

  return {
    source,
    kind: "coding-lab",
    id: slug,
    slug,
    title,
    businessContext: asString(record.businessContext),
    problemStatement: asString(record.problemStatement),
    studentTask: asString(record.studentTask),
    expectedOutcome: asString(record.expectedOutcome),
    explanation: asString(record.explanation),
    hints: asStringArray(record.hints),
    starterCode: asString(record.starterCode),
    expectedSql: asString(record.expectedSql),
    solutionCode: asString(record.solutionCode),
    tables: normalizeTables(record.tables),
    sqlTestCases: normalizeSqlTestCases(record.sqlTestCases),
    launchReady: isLaunchReadyCodingLab(slug)
  };
}

function scenarioTablesToCodingTables(tables?: ScenarioSampleTable[]): CodingLabTable[] {
  return (tables ?? []).map((table) => ({
    name: table.name,
    columns: table.columns,
    rows: table.rows
  }));
}

function itemFromScenario(scenario: Scenario): ValidationItem {
  return {
    source: "frontend/lib/scenarios.ts",
    kind: "scenario",
    id: scenario.slug,
    slug: scenario.slug,
    title: scenario.title,
    businessContext: scenario.businessContext,
    problemStatement: scenario.problemStatement,
    studentTask: scenario.tasks.join("\n"),
    expectedOutcome: scenario.expectedOutput,
    modelAnswer: `${scenario.modelSolution}\n${scenario.productionExplanation}`,
    explanation: scenario.productionExplanation,
    hints: scenario.hints,
    starterCode: scenario.brokenCode,
    expectedSql: scenario.expectedSql,
    solutionCode: scenario.modelSolution,
    tables: scenarioTablesToCodingTables(scenario.sampleTables),
    launchReady: scenario.launchReady
  };
}

function itemFromOperationsLab(lab: OperationsLab): ValidationItem {
  return {
    source: "frontend/data/platform-operations-labs.ts",
    kind: "operations-lab",
    id: lab.slug,
    slug: lab.slug,
    title: lab.title,
    businessContext: lab.businessContext,
    problemStatement: lab.problemStatement,
    studentTask: lab.studentTask,
    expectedOutcome: lab.evidence,
    modelAnswer: Object.values(lab.modelAnswer).join("\n"),
    explanation: Object.values(lab.modelAnswer).join("\n"),
    hints: lab.hints,
    starterCode: lab.evidence,
    solutionCode: Object.values(lab.modelAnswer).join("\n"),
    launchReady: lab.launchReady
  };
}

function itemFromSystemDesignCase(systemCase: SystemDesignCase): ValidationItem {
  return {
    source: "frontend/lib/system-design.ts",
    kind: "system-design",
    id: systemCase.slug,
    slug: systemCase.slug,
    title: systemCase.title,
    businessContext: systemCase.businessContext,
    problemStatement: systemCase.shortDescription,
    studentTask: systemCase.learnerTask,
    expectedOutcome: systemCase.architectureStages.join(" -> "),
    modelAnswer: Object.values(systemCase.modelAnswer).join("\n"),
    explanation: Object.values(systemCase.modelAnswer).join("\n"),
    hints: systemCase.hints,
    starterCode: systemCase.badArchitecture,
    solutionCode: Object.values(systemCase.modelAnswer).join("\n"),
    launchReady: systemCase.launchReady
  };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function uniqueTokens(value: string): string[] {
  return Array.from(new Set(tokenize(value)));
}

function overlapRatio(left: string[], right: string[]): number {
  if (left.length === 0) return 0;
  const rightSet = new Set(right);
  return left.filter((token) => rightSet.has(token)).length / left.length;
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSqlStringsAndComments(sql: string): string {
  return sql
    .replace(/--.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'([^']|'')*'/g, "''")
    .replace(/"([^"]|"")*"/g, '""');
}

function extractCteNames(sql: string): Set<string> {
  const cteNames = new Set<string>();
  const cleaned = stripSqlStringsAndComments(sql);
  const ctePattern = /(?:with\s+(?:recursive\s+)?|,\s*)([a-zA-Z_][\w]*)\s+as\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = ctePattern.exec(cleaned)) !== null) {
    cteNames.add(match[1].toLowerCase());
  }
  return cteNames;
}

function extractSqlTableReferences(sql: string): string[] {
  const cleaned = stripSqlStringsAndComments(sql);
  const references = new Set<string>();
  const tablePattern = /\b(?:from|join|update|into)\s+([a-zA-Z_][\w.]*|"[^"]+")/gi;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(cleaned)) !== null) {
    const raw = match[1].replace(/"/g, "");
    const tableName = raw.split(".").pop()?.toLowerCase();
    if (tableName) references.add(tableName);
  }
  return Array.from(references);
}

function findUnavailableSqlTables(sql: string, tables: CodingLabTable[]): string[] {
  const available = new Set(tables.map((table) => table.name.toLowerCase()));
  const cteNames = extractCteNames(sql);
  return extractSqlTableReferences(sql).filter(
    (reference) => !available.has(reference) && !cteNames.has(reference)
  );
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

function inferColumnType(rows: CodingLabTable["rows"], columnIndex: number): string {
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

async function createSqlEngine(): Promise<SqlJsStatic> {
  const sqlJsModule = frontendRequire("sql.js") as InitSqlJs | { default: InitSqlJs };
  const initSqlJs = typeof sqlJsModule === "function" ? sqlJsModule : sqlJsModule.default;
  return initSqlJs({
    locateFile: (file) => path.join(SQL_WASM_DIR, file)
  });
}

function executeSql(SQL: SqlJsStatic, tables: CodingLabTable[], sql: string) {
  const db = new SQL.Database();
  try {
    db.run(buildSetupSql(tables));
    db.exec(sql);
  } finally {
    db.close();
  }
}

function validateRequiredFields(item: ValidationItem) {
  const requiredTextFields: Array<[keyof ValidationItem, string]> = [
    ["businessContext", "businessContext"],
    ["problemStatement", "problemStatement"],
    ["studentTask", "studentTask"],
    ["explanation", "explanation"]
  ];

  for (const [field, label] of requiredTextFields) {
    if (!asString(item[field]).trim()) {
      addFinding("BLOCKER", item, "required-fields", `${label} is empty.`);
    }
  }

  if (!item.hints?.some((hint) => hint.trim())) {
    addFinding("BLOCKER", item, "required-fields", "hints is empty.");
  }

  if (!asString(item.expectedOutcome).trim() && !asString(item.modelAnswer).trim()) {
    addFinding(
      "BLOCKER",
      item,
      "required-fields",
      "expectedOutcome or model answer is empty."
    );
  }
}

function validateSemanticMatch(item: ValidationItem) {
  const titleTokens = uniqueTokens(item.title);
  if (titleTokens.length === 0) return;

  const statementTokens = uniqueTokens(
    [
      item.businessContext,
      item.problemStatement,
      item.studentTask,
      item.expectedOutcome,
      item.modelAnswer,
      item.explanation
    ].join(" ")
  );
  const codeTokens = uniqueTokens([item.expectedSql, item.solutionCode, item.starterCode].join(" "));
  const statementOverlap = overlapRatio(titleTokens, statementTokens);
  const codeOverlap = overlapRatio(titleTokens, codeTokens);

  if (statementOverlap < 0.25 && codeOverlap < 0.15) {
    addFinding(
      "WARNING",
      item,
      "semantic-title-match",
      `Title has low token overlap with problem/model content (problem ${(statementOverlap * 100).toFixed(0)}%, code ${(codeOverlap * 100).toFixed(0)}%).`
    );
  } else if (item.kind === "coding-lab" && item.solutionCode && codeOverlap < 0.1) {
    addFinding(
      "SUGGESTION",
      item,
      "semantic-title-match",
      `Title appears weakly connected to expectedSql/solutionCode (code overlap ${(codeOverlap * 100).toFixed(0)}%).`
    );
  }
}

function validateHints(item: ValidationItem) {
  const contextTokens = uniqueTokens(
    [item.title, item.problemStatement, item.studentTask, item.expectedOutcome].join(" ")
  );
  const contextSet = new Set(contextTokens);
  const hints = item.hints ?? [];

  hints.forEach((hint, index) => {
    const hintTokens = uniqueTokens(hint);
    const hintOverlap = overlapRatio(hintTokens, contextTokens);
    if (hintTokens.length >= 4 && hintOverlap < 0.12) {
      addFinding(
        "SUGGESTION",
        item,
        "hint-alignment",
        `Hint ${index + 1} has low overlap with the lab context and may be generic or misaligned.`
      );
    }

    const contradictionPattern = /\b(?:do not|don't|avoid|never|without|no)\s+([a-zA-Z_][\w-]*)/gi;
    let match: RegExpExecArray | null;
    while ((match = contradictionPattern.exec(hint)) !== null) {
      const contradictedToken = match[1].toLowerCase().replace(/[_-]+/g, " ");
      const contradictedTokens = tokenize(contradictedToken);
      if (contradictedTokens.some((token) => contextSet.has(token))) {
        addFinding(
          "WARNING",
          item,
          "hint-contradiction",
          `Hint ${index + 1} appears to discourage a concept present in the title/problem: "${match[0]}". Review manually.`
        );
      }
    }
  });
}

function validateSqlReferences(item: ValidationItem) {
  const tables = item.tables ?? [];
  const hasExecutableSql = Boolean(item.expectedSql?.trim());
  if (hasExecutableSql && item.starterCode?.trim()) {
    const unavailableStarterTables = findUnavailableSqlTables(item.starterCode, tables);
    if (unavailableStarterTables.length > 0) {
      addFinding(
        "BLOCKER",
        item,
        "starter-table-references",
        `starterCode references missing table(s): ${unavailableStarterTables.join(", ")}.`
      );
    }
  }

  if (hasExecutableSql && item.expectedSql?.trim()) {
    const unavailableExpectedTables = findUnavailableSqlTables(item.expectedSql, tables);
    if (unavailableExpectedTables.length > 0) {
      addFinding(
        "BLOCKER",
        item,
        "expected-sql-table-references",
        `expectedSql references missing table(s): ${unavailableExpectedTables.join(", ")}.`
      );
    }
  }
}

function validateDuplicateSolutions(items: ValidationItem[]) {
  const groups = new Map<string, ValidationItem[]>();

  for (const item of items) {
    const solution = normalizeComparable(item.expectedSql || item.solutionCode || "");
    if (!solution) continue;
    groups.set(solution, [...(groups.get(solution) ?? []), item]);
  }

  for (const duplicates of groups.values()) {
    const uniqueTitles = new Set(duplicates.map((item) => item.title));
    if (duplicates.length > 1 && uniqueTitles.size > 1) {
      const [first] = duplicates;
      addFinding(
        "WARNING",
        first,
        "duplicate-solution",
        `Same expectedSql/solutionCode appears across different titles: ${duplicates
          .slice(0, 6)
          .map((item) => `${item.slug} (${item.title})`)
          .join("; ")}${duplicates.length > 6 ? "; ..." : ""}`
      );
    }
  }
}

function validateGeneratedFiles(itemsBySource: Map<string, ValidationItem[]>) {
  for (const relativePath of VALIDATED_FILES) {
    const absolutePath = path.join(ROOT_DIR, relativePath);
    const fileItem = {
      source: relativePath,
      kind: "file" as const,
      id: relativePath,
      title: relativePath
    };

    if (!fs.existsSync(absolutePath)) {
      addFinding("BLOCKER", fileItem, "generated-file", "File does not exist.");
      continue;
    }

    const contents = fs.readFileSync(absolutePath, "utf8");
    if (!contents.trim()) {
      addFinding("BLOCKER", fileItem, "generated-file", "File is empty.");
    }

    const sourceItems = itemsBySource.get(relativePath);
    if (sourceItems && sourceItems.length === 0) {
      addFinding("BLOCKER", fileItem, "generated-file", "File produced zero validation records.");
    }
  }
}

async function validateSqlExecution(SQL: SqlJsStatic, item: ValidationItem) {
  if (!item.expectedSql?.trim()) return;
  const tables = item.tables ?? [];
  if (tables.length === 0) {
    addFinding("BLOCKER", item, "sql-execution", "SQL lab has expectedSql but no visible tables.");
    return;
  }

  try {
    executeSql(SQL, tables, item.expectedSql);
  } catch (error) {
    addFinding(
      "BLOCKER",
      item,
      "sql-execution",
      `expectedSql failed against visible tables: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  for (const testCase of item.sqlTestCases ?? []) {
    const sql = testCase.expectedSql || item.expectedSql;
    if (!sql?.trim()) {
      addFinding(
        "BLOCKER",
        item,
        "sql-test-case-execution",
        `SQL test case "${testCase.name}" has no expectedSql.`
      );
      continue;
    }
    if (!testCase.tables.length) {
      addFinding(
        "BLOCKER",
        item,
        "sql-test-case-execution",
        `SQL test case "${testCase.name}" has no tables.`
      );
      continue;
    }

    const unavailableTables = findUnavailableSqlTables(sql, testCase.tables);
    if (unavailableTables.length > 0) {
      addFinding(
        "BLOCKER",
        item,
        "sql-test-case-table-references",
        `SQL test case "${testCase.name}" references missing table(s): ${unavailableTables.join(", ")}.`
      );
    }

    try {
      executeSql(SQL, testCase.tables, sql);
    } catch (error) {
      addFinding(
        "BLOCKER",
        item,
        "sql-test-case-execution",
        `SQL test case "${testCase.name}" failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

function printReport(items: ValidationItem[]) {
  const severityOrder: Severity[] = ["BLOCKER", "WARNING", "SUGGESTION"];
  const launchReadyItems = items.filter((item) => item.launchReady);
  const launchReadyBlockers = findings.filter(
    (finding) => finding.launchReady && finding.severity === "BLOCKER"
  );
  const hiddenBlockers = findings.filter(
    (finding) => !finding.launchReady && finding.severity === "BLOCKER"
  );
  const launchCounts = new Map<string, number>();
  for (const item of launchReadyItems) {
    const section = launchSection(item);
    launchCounts.set(section, (launchCounts.get(section) ?? 0) + 1);
  }

  console.log("\nData Foundry content quality report");
  console.log("===================================");
  console.log("\nLaunch-ready gate");
  console.log("-----------------");
  console.log(`Launch-ready records: ${launchReadyItems.length}`);
  Array.from(launchCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([section, count]) => console.log(`- ${section}: ${count}`));
  console.log(`Launch-ready BLOCKER findings: ${launchReadyBlockers.length}`);
  console.log(`Hidden BLOCKER findings: ${hiddenBlockers.length}`);

  if (launchReadyBlockers.length > 0) {
    console.log("\nLaunch-ready blockers to fix before beta:");
    launchReadyBlockers.slice(0, 20).forEach((finding) => {
      console.log(
        `- ${finding.source} :: ${finding.id} :: ${finding.title}\n  ${finding.message}`
      );
    });
    if (launchReadyBlockers.length > 20) {
      console.log(`- ... ${launchReadyBlockers.length - 20} more`);
    }
  }

  for (const severity of severityOrder) {
    const severityFindings = findings.filter((finding) => finding.severity === severity);
    console.log(`\n${severity} (${severityFindings.length})`);
    console.log("-".repeat(severity.length + 5));

    if (severityFindings.length === 0) {
      console.log("No findings.");
      continue;
    }

    const groupedByCheck = new Map<string, Finding[]>();
    for (const finding of severityFindings) {
      groupedByCheck.set(finding.check, [
        ...(groupedByCheck.get(finding.check) ?? []),
        finding
      ]);
    }

    for (const [check, checkFindings] of groupedByCheck) {
      console.log(`\n[${check}] ${checkFindings.length}`);
      checkFindings.slice(0, 15).forEach((finding) => {
        console.log(
          `- ${finding.source} :: ${finding.id} :: ${finding.title}\n  ${finding.message}`
        );
      });
      if (checkFindings.length > 15) {
        console.log(`- ... ${checkFindings.length - 15} more`);
      }
    }
  }

  const summary = severityOrder
    .map((severity) => `${severity}: ${findings.filter((finding) => finding.severity === severity).length}`)
    .join(" | ");
  console.log(`\nSummary: ${summary}\n`);

  if (process.env.CONTENT_QA_STRICT === "1" && launchReadyBlockers.length > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const generatedSqlLabs = (codingLabGenerated as unknown[])
    .map((lab) => normalizeCodingLab(lab, "frontend/data/coding-labs.generated.json"))
    .filter((lab): lab is ValidationItem => Boolean(lab));
  const publicSqlPracticeLabs = (publicSqlPracticeGenerated as unknown[])
    .map((lab) => normalizeCodingLab(lab, "frontend/data/public-sql-practice.generated.json"))
    .filter((lab): lab is ValidationItem => Boolean(lab));
  const generatedPySparkLabs = (pysparkLabData as unknown[])
    .map((lab) => normalizeCodingLab(lab, "frontend/data/pyspark-labs.generated.ts"))
    .filter((lab): lab is ValidationItem => Boolean(lab));
  const scenarioItems = ALL_SCENARIOS.map(itemFromScenario);
  const operationsItems = ALL_OPERATIONS_LABS.map(itemFromOperationsLab);
  const systemDesignItems = ALL_SYSTEM_DESIGN_CASES.map(itemFromSystemDesignCase);

  const items = [
    ...generatedSqlLabs,
    ...publicSqlPracticeLabs,
    ...generatedPySparkLabs,
    ...scenarioItems,
    ...operationsItems,
    ...systemDesignItems
  ];
  const itemsBySource = new Map<string, ValidationItem[]>([
    ["frontend/data/coding-labs.generated.json", generatedSqlLabs],
    ["frontend/data/public-sql-practice.generated.json", publicSqlPracticeLabs],
    ["frontend/data/pyspark-labs.generated.ts", generatedPySparkLabs],
    ["frontend/lib/scenarios.ts", scenarioItems],
    ["frontend/data/platform-operations-labs.ts", operationsItems],
    ["frontend/lib/system-design.ts", systemDesignItems]
  ]);

  validateGeneratedFiles(itemsBySource);
  items.forEach(validateRequiredFields);
  items.forEach(validateSemanticMatch);
  items.forEach(validateHints);

  const codingItems = [...generatedSqlLabs, ...publicSqlPracticeLabs, ...generatedPySparkLabs];
  codingItems.forEach(validateSqlReferences);
  validateDuplicateSolutions(codingItems);

  const SQL = await createSqlEngine();
  for (const lab of [...generatedSqlLabs, ...publicSqlPracticeLabs].filter((item) => item.expectedSql?.trim())) {
    await validateSqlExecution(SQL, lab);
  }

  console.log(
    `Validated ${items.length} records: ${generatedSqlLabs.length} generated SQL/Python labs, ${publicSqlPracticeLabs.length} SQL coverage labs, ${generatedPySparkLabs.length} generated PySpark labs, ${scenarioItems.length} scenarios, ${operationsItems.length} operations labs, ${systemDesignItems.length} system-design cases.`
  );
  printReport(items);
}

main().catch((error) => {
  console.error("Content quality validation failed to run.");
  console.error(error);
  process.exitCode = 1;
});
