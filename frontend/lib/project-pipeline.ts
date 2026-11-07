import type { SqlJsStatic } from "sql.js";
import fixtureData from "../data/project-order-replay/fixtures.json";
import expectedData from "../data/project-order-replay/expected.json";
import queryData from "../data/project-order-replay/queries.json";
import packetData from "../data/project-order-replay/packet.json";
import { isReadOnlySql, type BrowserSqlResultTable } from "./browser-sql";

export const PROJECT_MANIFEST = "7141d5e8a565e2a11e1f852b2a45cbff07302dd3f277977f141459749b41a738";
export const PROJECT_STAGES = ["accepted_events", "current_orders", "daily_revenue"] as const;
export type ProjectStage = typeof PROJECT_STAGES[number];
export const projectQueries = queryData;
export const projectPacket = packetData;
export const PROJECT_QUERY_MS = 3000;
export const PROJECT_LOAD_MS = 15000;
export const PROJECT_SQL_LIMIT = 20000;
export const PROJECT_ROW_LIMIT = 500;
export const PROJECT_OUTPUT_BYTES = 64000;
export const PROJECT_DRAFT_KEY = "tdf.project-order-replay-001.v1";
export const projectHeaders = expectedData.headers;
export const rawColumns = fixtureData.columns.map(c => c[0]);
export const rawSchema = fixtureData.columns.map(c => `${c[0]} ${c[1]}`).join(", ");
export type RawDelivery = Record<string, string | number>;
export const projectSnapshots = fixtureData.snapshots as Record<string, RawDelivery[]>;
export const snapshotNotes = fixtureData.snapshot_notes as Record<string, string>;
export const snapshotNames = Object.keys(projectSnapshots);
export const validExpected = expectedData.valid as Record<string, Record<ProjectStage, (string | number)[][]>>;
export const snapshotLabels: Record<string, string> = {
  baseline: "Original two orders", replay: "Identical events replayed", late_cancellation: "Late cancellation and new order",
  obsolete_last: "Old version arrives last", equal_amount_multi_version: "Equal amounts and newer full state",
  all_cancelled_date: "A date with only cancelled orders", empty: "Empty source",
  conflict_event_payload: "Conflicting event payload", conflict_order_version: "Conflicting order version",
  conflict_order_date: "Changed immutable order date", malformed_fields: "Malformed source fields", corrected_retry: "Corrected source — retry"
};
const stageTypes: Record<ProjectStage, string[]> = packetData.types;
const businessFields = projectHeaders.accepted_events;

export function sourceErrors(rows: unknown): string[] {
  if (!Array.isArray(rows) || rows.length > PROJECT_ROW_LIMIT) return ["source: expected at most 500 raw rows"];
  const errors: string[] = [];
  const deliveries = new Set<unknown>(), events = new Map<unknown, string>(), versions = new Map<string, unknown>(), dates = new Map<unknown, unknown>();
  const dateValid = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
  const timeValid = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString().replace(".000Z", "Z") === v;
  rows.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`row ${index + 1}: invalid row schema`); return; }
    const r = value as Record<string, unknown>;
    const label = typeof r.delivery_id === "string" && r.delivery_id ? r.delivery_id : `row ${index + 1}`;
    if (JSON.stringify(Object.keys(r).sort()) !== JSON.stringify([...rawColumns].sort())) errors.push(`${label}: expected all nine source fields, with no extra fields`);
    for (const field of ["delivery_id", "event_id", "order_id"]) {
      if (typeof r[field] !== "string" || !(r[field] as string).trim() || (r[field] as string).length > 256) errors.push(`${label}: ${field} must be nonblank text, at most 256 characters`);
    }
    if (deliveries.has(r.delivery_id)) errors.push(`${label}: duplicate delivery_id`);
    deliveries.add(r.delivery_id);
    if (!Number.isSafeInteger(r.source_version) || Number(r.source_version) < 1) errors.push(`${label}: source_version must be a positive safe integer`);
    if (!dateValid(r.order_date)) errors.push(`${label}: invalid order_date; use a real YYYY-MM-DD date`);
    for (const field of ["event_time", "received_at"]) if (!timeValid(r[field])) errors.push(`${label}: invalid ${field}; use a real UTC YYYY-MM-DDTHH:MM:SSZ timestamp`);
    if (r.status !== "paid" && r.status !== "cancelled") errors.push(`${label}: status must be paid or cancelled`);
    if (!Number.isSafeInteger(r.amount_cents) || Number(r.amount_cents) < 0) errors.push(`${label}: amount_cents must be nonnegative safe integer cents`);
    const payload = JSON.stringify(businessFields.map(k => r[k]));
    if (events.has(r.event_id) && events.get(r.event_id) !== payload) errors.push(`event_id ${r.event_id}: differing immutable business payload`);
    else events.set(r.event_id, payload);
    const versionKey = JSON.stringify([r.order_id, r.source_version]);
    if (versions.has(versionKey) && versions.get(versionKey) !== r.event_id) errors.push(`order_id ${r.order_id}/source_version ${r.source_version}: distinct event IDs conflict`);
    else versions.set(versionKey, r.event_id);
    if (dates.has(r.order_id) && dates.get(r.order_id) !== r.order_date) errors.push(`order_id ${r.order_id}: changed immutable order_date`);
    else dates.set(r.order_id, r.order_date);
  });
  return [...new Set(errors)].sort();
}

export function strictProjectMatch(actual: BrowserSqlResultTable, expected: BrowserSqlResultTable, stage: ProjectStage): boolean {
  if (JSON.stringify(actual.columns) !== JSON.stringify(projectHeaders[stage])) return false;
  if (!actual.rows.every(row => row.length === stageTypes[stage].length && row.every((v, i) =>
    stageTypes[stage][i] === "TEXT" ? typeof v === "string" : typeof v === "number" && Number.isSafeInteger(v)))) return false;
  const tuples = (rows: BrowserSqlResultTable["rows"]) => rows.map(row => JSON.stringify(row)).sort();
  return JSON.stringify(tuples(actual.rows)) === JSON.stringify(tuples(expected.rows));
}
export function expectedProjectTable(fixture: string, stage: ProjectStage): BrowserSqlResultTable {
  return { columns: projectHeaders[stage], rows: validExpected[fixture]?.[stage] ?? [] };
}
export interface ProjectStageResult {
  state: "match" | "empty" | "mismatch" | "input_rejected" | "query_error" | "blocked";
  message: string;
  actual: BrowserSqlResultTable;
  expected: BrowserSqlResultTable;
  diagnostics: string[];
  materializedInputRows: number;
}
export interface ProjectRequest {
  id: number; fixture: string; stage: ProjectStage; sql: string;
  upstream: Partial<Record<ProjectStage, BrowserSqlResultTable>>;
}

// Each worker owns a fresh, small database. No shared SQL grader or database is changed.
export function evaluateProjectStage(SQL: SqlJsStatic, request: ProjectRequest): ProjectStageResult {
  const { fixture, stage, sql, upstream } = request;
  if (!snapshotNames.includes(fixture) || !PROJECT_STAGES.includes(stage)) throw new Error("Unknown project input or stage.");
  const raw = projectSnapshots[fixture];
  const expected = expectedProjectTable(fixture, stage);
  const base = { actual: { columns: [], rows: [] } as BrowserSqlResultTable, expected, diagnostics: [] as string[], materializedInputRows: raw.length };
  const errors = sourceErrors(raw);
  if (errors.length) return { ...base, state: "input_rejected", message: "Input rejected; query not evaluated. Select the corrected source to retry. Last published report is preserved.", diagnostics: errors };
  const prior = PROJECT_STAGES.slice(0, PROJECT_STAGES.indexOf(stage));
  for (const previous of prior) {
    const table = upstream[previous];
    if (!table || !(raw.length === 0 && table.rows.length === 0) && !strictProjectMatch(table, expectedProjectTable(fixture, previous), previous)) return {
      ...base, state: "blocked", message: `Run and match ${previous} on this input first. A missing or wrong learner output cannot advance.`, diagnostics: []
    };
  }
  const db = new SQL.Database();
  try {
    db.run("PRAGMA hard_heap_limit=16777216; PRAGMA max_page_count=128; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-1024;");
    const insertTable = (name: string, columns: string[], types: string[], rows: BrowserSqlResultTable["rows"]) => {
      db.run(`CREATE TABLE ${name} (${columns.map((c, i) => `${c} ${types[i]}`).join(",")})`);
      const insert = db.prepare(`INSERT INTO ${name} VALUES (${columns.map(() => "?").join(",")})`);
      try { for (const row of rows) insert.run(row as (string | number | null)[]); } finally { insert.free(); }
    };
    insertTable("raw_deliveries", rawColumns, fixtureData.columns.map(c => c[1]), raw.map(r => rawColumns.map(k => r[k])));
    for (const previous of prior) insertTable(previous, projectHeaders[previous], stageTypes[previous], upstream[previous]!.rows);
    const previous = prior.at(-1);
    base.materializedInputRows = previous ? upstream[previous]!.rows.length : raw.length;
    db.run("PRAGMA query_only=ON");
    try {
      if (sql.length > PROJECT_SQL_LIMIT || !isReadOnlySql(sql)) throw new Error("Enter one read-only SELECT or WITH query, at most 20,000 characters.");
      const actual: BrowserSqlResultTable = { columns: [], rows: [] };
      let count = 0, bytes = 0;
      for (const statement of db.iterateStatements(sql)) {
        if (++count !== 1) throw new Error("Run exactly one read-only query at a time.");
        actual.columns = statement.getColumnNames();
        if (actual.columns.length > 32) throw new Error("Result exceeds the 32-column limit.");
        while (statement.step()) {
          if (actual.rows.length >= PROJECT_ROW_LIMIT) throw new Error("Result exceeds the 500-row limit. Aggregate to the required grain.");
          const row = statement.get();
          if (row.some(v => v instanceof Uint8Array || typeof v === "string" && v.length > 4096)) throw new Error("BLOB output or a cell above 4,096 characters exceeds this practice limit.");
          bytes += new TextEncoder().encode(JSON.stringify(row)).length;
          if (bytes > PROJECT_OUTPUT_BYTES) throw new Error("Result exceeds the 64,000-byte output limit.");
          actual.rows.push(row as (string | number | null)[]);
        }
      }
      if (count !== 1) throw new Error("Enter one read-only query.");
      if (!raw.length && !actual.rows.length) return { ...base, actual, state: "empty", message: "Zero rows match this empty source. Empty checks establish rows only, not schema or completion of nonempty practice." };
      const matched = strictProjectMatch(actual, expected, stage);
      return { ...base, actual, state: matched ? "match" : "mismatch", message: matched
        ? "Matches this supplied case: exact headers, safe integer values and row multiplicity. Unpublished preview; guided finite-example feedback only."
        : "Preview does not match this supplied case. Compare headers, types, row counts and values below; correct this stage before continuing." };
    } catch (error) {
      return { ...base, state: "query_error", message: error instanceof Error ? error.message : "SQL could not run. Drafts and last published report are preserved." };
    }
  } finally { db.close(); }
}
