import type { SqlJsStatic } from "sql.js";
import packetData from "../data/data-modelling/packet.json";
import fixtureData from "../data/data-modelling/fixtures.json";
import queryData from "../data/data-modelling/queries.json";
import { buildSetupSql, isReadOnlySql, resultFromExec, type BrowserSqlCell, type BrowserSqlResultTable } from "./browser-sql";

export const modellingPacket = packetData;
export const modellingQueries = queryData;
export const CONTENT_MANIFEST = "26330d797eb4bc4b62a962fece696d1762f56d044fe964ce5db27401a443a74e";
export const QUERY_BUDGET_MS = 3000;
export const ENGINE_LOAD_BUDGET_MS = 15000;
export const DRAFT_KEY = "tdf.data-modelling.dm-historical-territory-001.v1";
export type ReportStage = "historical" | "as_of";
export interface ModellingFixture {
  name: string;
  purpose: string;
  orders: BrowserSqlCell[][];
  territory_history: BrowserSqlCell[][];
  expected: { historical_rows?: BrowserSqlCell[][]; as_of_rows?: BrowserSqlCell[][] };
}
export const modellingFixtures = fixtureData.cases as ModellingFixture[];
export const fixtureLabels: Record<string, string> = {
  baseline: "Original snapshot", backdated_correction: "Backdated correction",
  changed_amount: "Changed amount", new_current_only_member: "Current-only member",
  overlap_conflict: "Overlapping history", empty_orders: "Empty orders"
};
export interface ModellingResult {
  state: "match" | "mismatch" | "empty" | "conflict" | "query_error";
  message: string;
  actual: BrowserSqlResultTable;
  expected: BrowserSqlResultTable;
  sourceLines: number;
  sourceAmount: number;
}
export function strictReportMatch(actual: BrowserSqlResultTable, expected: BrowserSqlResultTable): boolean {
  if (JSON.stringify(actual.columns) !== JSON.stringify(expected.columns)) return false;
  if (!actual.rows.every(row => row.length === 3 && typeof row[0] === "string" &&
    typeof row[1] === "number" && Number.isSafeInteger(row[1]) &&
    typeof row[2] === "number" && Number.isSafeInteger(row[2]))) return false;
  const tuples = (rows: BrowserSqlCell[][]) => rows.map(row => JSON.stringify(row)).sort();
  return JSON.stringify(tuples(actual.rows)) === JSON.stringify(tuples(expected.rows));
}

export function evaluateModellingSql(SQL: SqlJsStatic, fixtureName: string, stage: ReportStage, sql: string): ModellingResult {
  const fixture = modellingFixtures.find(item => item.name === fixtureName);
  if (!fixture || !(stage === "historical" || stage === "as_of")) throw new Error("Unknown practice example or report.");
  const expected: BrowserSqlResultTable = {
    columns: ["territory", "total_amount", "line_count"],
    rows: fixture.expected[stage === "historical" ? "historical_rows" : "as_of_rows"] ?? []
  };
  const base = { expected, sourceLines: fixture.orders.length,
    sourceAmount: fixture.orders.reduce((sum, row) => sum + Number(row[4]), 0) };
  const db = new SQL.Database();
  try {
    db.run(buildSetupSql([
      { name: "orders", columns: fixtureData.table_schema.orders.map(c => c.name), rows: fixture.orders },
      { name: "territory_history", columns: fixtureData.table_schema.territory_history.map(c => c.name), rows: fixture.territory_history }
    ]));
    const conflicts = resultFromExec(db.exec(queryData.overlap_diagnostic));
    if (conflicts.rows.length) return { ...base, state: "conflict", actual: conflicts,
      message: "Data-quality conflict: overlapping history blocks both reports. Resolve the supplied C1 interval conflict; no report total is accepted." };
    try {
      if (sql.length > 20000 || !isReadOnlySql(sql)) throw new Error("Enter one read-only SELECT or WITH query (maximum 20,000 characters).");
      let columns: string[] = [];
      const rows: BrowserSqlCell[][] = [];
      let count = 0;
      const statements = db.iterateStatements(sql);
      for (const stmt of statements) {
          if (++count > 1) throw new Error("Run one query at a time.");
          while (stmt.step()) {
            if (rows.length >= 500) throw new Error("Result exceeds the 500-row practice limit. Aggregate by territory.");
            columns = stmt.getColumnNames();
            if (columns.length > 32) throw new Error("Result exceeds the 32-column practice limit.");
            rows.push(stmt.get().map(value => value instanceof Uint8Array ? Array.from(value).join(",") : value));
          }
      }
      const actual = { columns, rows };
      if (!fixture.orders.length && !rows.length) return { ...base, actual, state: "empty",
        message: "No rows expected for this empty input. This check verifies zero rows only; column names are checked on the nonempty examples. This does not complete the exercise." };
      const matched = strictReportMatch(actual, expected);
      return { ...base, actual, state: matched ? "match" : "mismatch", message: matched
        ? "Matching disclosed practice example. Exact headers, integer totals and row multiplicity match; this is not proof of independent mastery."
        : "Result mismatch. Compare headers, fact-line grain, interval boundaries, Unknown rows and totals with this selected example." };
    } catch (error) {
      return { ...base, state: "query_error", actual: { columns: [], rows: [] },
        message: error instanceof Error ? error.message : "SQL could not run. Your drafts are preserved." };
    }
  } finally { db.close(); }
}

export interface ModellingDraft {
  version: 1; revision: string; fixture: string; historical: string; as_of: string;
  hints: number; reviewed: boolean;
}
export function initialModellingDraft(): ModellingDraft {
  return { version: 1, revision: "", fixture: "baseline", historical: packetData.stages[0].starter_sql,
    as_of: packetData.stages[1].starter_sql, hints: 0, reviewed: false };
}
export function parseModellingDraft(raw: string): ModellingDraft {
  const d = JSON.parse(raw);
  if (d.version !== 1 || typeof d.revision !== "string" || typeof d.historical !== "string" ||
    typeof d.as_of !== "string" || d.historical.length > 20000 || d.as_of.length > 20000 ||
    !modellingFixtures.some(f => f.name === d.fixture) || !Number.isInteger(d.hints) ||
    d.hints < 0 || d.hints > 3 || typeof d.reviewed !== "boolean") {
    throw new Error("Saved draft version or content is not supported. Current editors have been kept; retry or explicitly replace the saved copy.");
  }
  return d;
}
