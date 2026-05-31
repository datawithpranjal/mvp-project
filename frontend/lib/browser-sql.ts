import initSqlJs, { type QueryExecResult, type SqlJsStatic } from "sql.js";

export type BrowserSqlCell = string | number | boolean | null;

export interface BrowserSqlTable {
  name: string;
  columns: string[];
  rows: BrowserSqlCell[][];
}

export interface BrowserSqlResultTable {
  columns: string[];
  rows: BrowserSqlCell[][];
}

export interface BrowserSqlValidationResult {
  passed: boolean;
  message: string;
  actual: BrowserSqlResultTable;
  expected: BrowserSqlResultTable;
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

export function getSqlJs() {
  sqlJsPromise ??= initSqlJs({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`
  });
  return sqlJsPromise;
}

export function isReadOnlySql(sql: string): boolean {
  const trimmed = sql.trim().replace(/^--.*$/gm, "").trim().toLowerCase();
  if (!trimmed) return false;
  if (!(trimmed.startsWith("select") || trimmed.startsWith("with"))) return false;
  return !/\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|replace)\b/i.test(trimmed);
}

function sqlLiteral(value: BrowserSqlCell): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function inferColumnType(rows: BrowserSqlCell[][], columnIndex: number): string {
  const values = rows.map((row) => row[columnIndex]).filter((value) => value !== null);
  if (values.length > 0 && values.every((value) => typeof value === "number")) {
    return "REAL";
  }
  return "TEXT";
}

export function buildSetupSql(tables: BrowserSqlTable[]): string {
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

export function resultFromExec(execResult: QueryExecResult[]): BrowserSqlResultTable {
  const first = execResult[0];
  if (!first) return { columns: [], rows: [] };
  return {
    columns: first.columns,
    rows: first.values.map((row) =>
      row.map((value) => {
        if (value instanceof Uint8Array) return Array.from(value).join(",");
        return value as BrowserSqlCell;
      })
    )
  };
}

function normalizeValue(value: BrowserSqlCell) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(6));
  }
  return value;
}

function normalizeRows(table: BrowserSqlResultTable): string[] {
  return table.rows.map((row) => JSON.stringify(row.map(normalizeValue))).sort();
}

export function sameSqlOutput(
  actual: BrowserSqlResultTable,
  expected: BrowserSqlResultTable
): boolean {
  if (actual.columns.length !== expected.columns.length) return false;
  const actualColumns = actual.columns.map((column) => column.toLowerCase());
  const expectedColumns = expected.columns.map((column) => column.toLowerCase());
  if (JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns)) return false;
  return JSON.stringify(normalizeRows(actual)) === JSON.stringify(normalizeRows(expected));
}

export async function runReadOnlySql(
  tables: BrowserSqlTable[],
  sql: string
): Promise<BrowserSqlResultTable> {
  if (!isReadOnlySql(sql)) {
    throw new Error("Only read-only SELECT or WITH queries can be run in the browser scenario checker.");
  }

  const SQL = await getSqlJs();
  const db = new SQL.Database();
  try {
    db.run(buildSetupSql(tables));
    return resultFromExec(db.exec(sql));
  } finally {
    db.close();
  }
}

export async function validateSqlOutput(
  tables: BrowserSqlTable[],
  answerSql: string,
  expectedSql: string
): Promise<BrowserSqlValidationResult> {
  if (!isReadOnlySql(answerSql)) {
    throw new Error("Only read-only SELECT or WITH queries can be checked.");
  }

  const SQL = await getSqlJs();
  const db = new SQL.Database();
  try {
    db.run(buildSetupSql(tables));
    const actual = resultFromExec(db.exec(answerSql));
    const expected = resultFromExec(db.exec(expectedSql));
    const passed = sameSqlOutput(actual, expected);
    return {
      passed,
      actual,
      expected,
      message: passed
        ? "Your SQL returns the expected output on the seeded production-style data."
        : "The query ran, but the output does not match the expected result. Check grain, filters, joins, NULLs, and tie handling."
    };
  } finally {
    db.close();
  }
}
