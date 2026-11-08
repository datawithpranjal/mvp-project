export const AZURE_MANIFEST = "0e397d92f40b4d3efa7c53285694ca2df752bcaa0255e4d8c285f6df1c7e8177";
export const ADF_TEXT_LIMIT = 60000;
export const ADF_ROWS_LIMIT = 250;
export const ADF_OUTPUT_LIMIT = 160000;
export const ADF_LOAD_MS = 5000;
export const ADF_RUN_MS = 1000;
export const ADF_INT_MAX = 2147483647;
export type AdfRow = [number, number, number];
export interface AdfConfirmed { target_rows: AdfRow[]; checkpoint: number }
export interface AdfCapture { lower: number; upper: number | null; capture_rows: AdfRow[] }
export type AdfFault = "none" | "partial_after_first" | "fail_before_write" | "checkpoint_fail_before_mutation";
export const adfFaults: AdfFault[] = ["none", "partial_after_first", "fail_before_write", "checkpoint_fail_before_mutation"];
export interface AdfTraceStage { phase: string; target_rows: AdfRow[]; checkpoint: number; [key: string]: unknown }
export interface AdfResult {
  selected_order_ids: number[]; selected_rows: AdfRow[]; committed_order_ids: number[]; committed_rows: AdfRow[];
  copy_status: "Succeeded" | "Failed" | "Skipped"; advance_status: "Succeeded" | "Failed" | "Skipped";
  target_rows: AdfRow[]; checkpoint: number; diagnostic: string | null; stages: AdfTraceStage[];
  lookup_outputs: { LookupOld: unknown; LookupNew: unknown }; sql_illustration: string;
  lookup_statuses: { LookupOld: "Succeeded"; LookupNew: "Succeeded" };
}
export interface AdfRequest {
  id: number; action: "capture" | "run"; configText: string; captureText: string; copyText: string;
  confirmed: AdfConfirmed; captured: AdfCapture | null; fault: AdfFault;
}
export type AdfReply = { kind: "capture"; captured: AdfCapture } | { kind: "result"; result: AdfResult } | { kind: "error"; message: string };
type ObjectValue = Record<string, unknown>;
function fail(path: string, reason: string): never { throw new Error(`${path}: ${reason}`); }
function object(value: unknown, path: string, allowed: string[], required = allowed): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected an object in this simulator subset");
  const result = value as ObjectValue;
  for (const key of Object.keys(result)) if (!allowed.includes(key)) fail(`${path}.${key}`, "unsupported simulator field; this is not a full ADF/ARM validator");
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(result, key)) fail(`${path}.${key}`, "required field is missing");
  return result;
}
function oneOf(value: unknown, options: readonly unknown[], path: string) {
  if (!options.includes(value)) fail(path, `supported values: ${options.join(" | ")}`);
  return value;
}
function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, `must be JSON Boolean true/false; got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
  return value;
}
export function adfInt(value: unknown, path: string, positive = false): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < (positive ? 1 : 0) || value > ADF_INT_MAX) fail(path, `expected ${positive ? "positive" : "nonnegative"} INT32 number, without coercion`);
  return value;
}
export function adfRows(value: unknown, path: string): AdfRow[] {
  if (!Array.isArray(value) || value.length > ADF_ROWS_LIMIT) fail(path, "expected at most 250 three-integer rows");
  const seen = new Set<number>();
  return value.map((row, index) => {
    if (!Array.isArray(row) || row.length !== 3) fail(`${path}[${index}]`, "expected [order_id, change_version, amount_cents]");
    const id = adfInt(row[0], `${path}[${index}].order_id`);
    if (seen.has(id)) fail(`${path}[${index}].order_id`, `duplicate source/target order_id=${id}`);
    seen.add(id);
    return [id, adfInt(row[1], `${path}[${index}].change_version`, true), adfInt(row[2], `${path}[${index}].amount_cents`)];
  });
}
export function adfConfirmed(value: unknown): AdfConfirmed {
  const state = object(value, "state", ["target_rows", "checkpoint"]);
  return { target_rows: adfRows(state.target_rows, "state.target_rows"), checkpoint: adfInt(state.checkpoint, "state.checkpoint") };
}
export function parseAdfJson(text: string, path: string): unknown {
  if (typeof text !== "string" || text.length > ADF_TEXT_LIMIT) fail(path, "JSON text exceeds 60,000 characters");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { fail(path, "invalid JSON; correct the text and retry. State and prior trace are preserved"); }
  const stack: { value: unknown; depth: number }[] = [{ value: parsed, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (depth > 20 || ++count > 15000) fail(path, "JSON nesting/node limit exceeded");
    if (value && typeof value === "object") for (const entry of Object.values(value)) stack.push({ value: entry, depth: depth + 1 });
  }
  return parsed;
}
function dependency(value: unknown, path: string, names: string[], conditions: string[]) {
  if (!Array.isArray(value) || value.length !== names.length) fail(path, `expected exactly ${names.length} dependencies`);
  const seen = new Set<string>();
  for (const [i, raw] of value.entries()) {
    const d = object(raw, `${path}[${i}]`, ["activity", "dependencyConditions"]);
    const name = oneOf(d.activity, names, `${path}[${i}].activity`) as string;
    if (seen.has(name)) fail(path, `duplicate dependency ${name}`);
    seen.add(name);
    if (!Array.isArray(d.dependencyConditions) || d.dependencyConditions.length !== 1) fail(`${path}[${i}].dependencyConditions`, "expected one condition");
    oneOf(d.dependencyConditions[0], conditions, `${path}[${i}].dependencyConditions`);
  }
}
function accessor(value: unknown, name: string, field: string, first: boolean, path: string) {
  const expected = `@activity('${name}').output.${first ? "firstRow" : "value[0]"}.${field}`;
  if (value !== expected) fail(path, `unsupported/mismatched Lookup accessor; ${name}.firstRowOnly=${first} exposes ${first ? "firstRow" : "value[0]"}. Use ${expected}`);
}
export function validateAdfConfig(value: unknown) {
  const c = object(value, "config", ["name", "variant", "simulatorPredicate", "activities"], ["name", "simulatorPredicate", "activities"]);
  if (typeof c.name !== "string" || c.name.length > 100) fail("config.name", "expected a name of at most 100 characters");
  if (c.variant !== undefined && (typeof c.variant !== "string" || c.variant.length > 100)) fail("config.variant", "optional teaching label must be text; it never controls execution");
  if (!Array.isArray(c.activities) || c.activities.length !== 4) fail("config.activities", "expected exactly LookupOld, LookupNew, CopyOrders and AdvanceWatermark");
  const names = ["LookupOld", "LookupNew", "CopyOrders", "AdvanceWatermark"];
  const activities = new Map<string, ObjectValue>();
  for (const [i, raw] of c.activities.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail(`config.activities[${i}]`, "expected an activity object");
    const name = (raw as ObjectValue).name;
    oneOf(name, names, `config.activities[${i}].name`);
    if (activities.has(name as string)) fail("config.activities", `duplicate activity ${name}`);
    activities.set(name as string, object(raw, String(name), name === "LookupOld" || name === "LookupNew" ? ["name", "type", "typeProperties"] : ["name", "type", "dependsOn", "typeProperties"]));
  }
  const lookup = (name: string) => {
    const a = activities.get(name)!; oneOf(a.type, ["Lookup"], `${name}.type`);
    const p = object(a.typeProperties, `${name}.typeProperties`, ["firstRowOnly"]);
    return bool(p.firstRowOnly, `${name}.typeProperties.firstRowOnly`);
  };
  const oldFirst = lookup("LookupOld"), newFirst = lookup("LookupNew");
  const cp = activities.get("CopyOrders")!, adv = activities.get("AdvanceWatermark")!;
  oneOf(cp.type, ["Copy"], "CopyOrders.type");
  dependency(cp.dependsOn, "CopyOrders.dependsOn", ["LookupOld", "LookupNew"], ["Succeeded"]);
  const cpProps = object(cp.typeProperties, "CopyOrders.typeProperties", ["source", "sink"]);
  const source = object(cpProps.source, "CopyOrders.typeProperties.source", ["type"]); oneOf(source.type, ["AzureSqlSource"], "CopyOrders.typeProperties.source.type");
  const sink = object(cpProps.sink, "CopyOrders.typeProperties.sink", ["type", "writeBehavior", "upsertSettings"], ["type", "writeBehavior"]);
  oneOf(sink.type, ["AzureSqlSink"], "CopyOrders.typeProperties.sink.type");
  const write = oneOf(sink.writeBehavior, ["insert", "upsert"], "CopyOrders.typeProperties.sink.writeBehavior") as "insert" | "upsert";
  if (sink.upsertSettings !== undefined) {
    const u = object(sink.upsertSettings, "CopyOrders.typeProperties.sink.upsertSettings", ["keys"], []);
    if (u.keys !== undefined && (!Array.isArray(u.keys) || u.keys.length !== 1 || u.keys[0] !== "order_id")) fail("CopyOrders.typeProperties.sink.upsertSettings.keys", "unsupported/ambiguous simulator key; only order_id or omitted keys with the visible order_id PK are modeled (not an Azure-wide restriction)");
  }
  oneOf(adv.type, ["SqlServerStoredProcedure"], "AdvanceWatermark.type");
  dependency(adv.dependsOn, "AdvanceWatermark.dependsOn", ["CopyOrders"], ["Succeeded", "Completed"]);
  const gate = ((adv.dependsOn as ObjectValue[])[0].dependencyConditions as string[])[0];
  const ap = object(adv.typeProperties, "AdvanceWatermark.typeProperties", ["storedProcedureName", "storedProcedureParameters"]);
  oneOf(ap.storedProcedureName, ["dbo.AdvanceOrdersWatermark"], "AdvanceWatermark.typeProperties.storedProcedureName");
  const parameters = object(ap.storedProcedureParameters, "AdvanceWatermark.storedProcedureParameters", ["NewWatermarkValue"]);
  const parameter = object(parameters.NewWatermarkValue, "AdvanceWatermark.NewWatermarkValue", ["value", "type"]);
  oneOf(parameter.type, ["Int"], "AdvanceWatermark.NewWatermarkValue.type");
  const pred = object(c.simulatorPredicate, "simulatorPredicate", ["lowerOperator", "upperOperator", "includeUpper", "lowerExpression", "upperExpression"]);
  const lowerOp = oneOf(pred.lowerOperator, [">", ">="], "simulatorPredicate.lowerOperator");
  const upperOp = oneOf(pred.upperOperator, ["<", "<="], "simulatorPredicate.upperOperator");
  const includeUpper = bool(pred.includeUpper, "simulatorPredicate.includeUpper");
  accessor(pred.lowerExpression, "LookupOld", "WatermarkValue", oldFirst, "simulatorPredicate.lowerExpression");
  accessor(pred.upperExpression, "LookupNew", "NewWatermarkValue", newFirst, "simulatorPredicate.upperExpression");
  accessor(parameter.value, "LookupNew", "NewWatermarkValue", newFirst, "AdvanceWatermark.NewWatermarkValue.value");
  return { oldFirst, newFirst, gate, write, lowerOp, upperOp, includeUpper };
}
const clone = (rows: AdfRow[]) => rows.map(row => [...row] as AdfRow);
const ordered = (rows: AdfRow[]) => clone(rows).sort((a, b) => a[0] - b[0]);
export function validateAdfCapture(value: unknown, state?: AdfConfirmed): AdfCapture {
  const b = object(value, "captured", ["lower", "upper", "capture_rows"]);
  const lower = adfInt(b.lower, "captured.lower"), upper = b.upper === null ? null : adfInt(b.upper, "captured.upper");
  if (state && lower !== state.checkpoint) fail("captured.lower", `captured ${lower} differs from actual checkpoint ${state.checkpoint}; capture a new window or explicitly reset the baseline. Retry never resets a checkpoint`);
  if (upper !== null && upper < lower) fail("captured.upper", `upper ${upper} is below lower ${lower}`);
  const rows = adfRows(b.capture_rows, "captured.capture_rows");
  const maximum = rows.length ? Math.max(...rows.map(row => row[1])) : null;
  if (maximum !== upper) fail("captured.upper", "does not match the actual source snapshot maximum (null only for empty source)");
  return { lower, upper, capture_rows: rows };
}
export function runAdf(config: unknown, sourceRows: unknown, stateValue: unknown, boundsValue: unknown, faultValue: unknown): AdfResult {
  const state = adfConfirmed(stateValue), source = adfRows(sourceRows, "source_at_copy");
  const parsed = validateAdfConfig(config), bounds = validateAdfCapture(boundsValue, state);
  const fault = oneOf(faultValue, adfFaults, "fault") as AdfFault;
  const { lower, upper } = bounds;
  if (upper !== null) {
    const inWindow = (row: AdfRow) => row[1] > lower && row[1] <= upper;
    const expected = ordered(bounds.capture_rows.filter(inWindow));
    if (JSON.stringify(expected) !== JSON.stringify(ordered(source.filter(inWindow)))) fail("source_at_copy", "captured-window rows changed; this local model requires a stable window, no late/backdated changes or deletes");
  }
  let target = clone(state.target_rows), checkpoint = state.checkpoint;
  const stages: AdfTraceStage[] = [{ phase: "start", target_rows: ordered(target), checkpoint }];
  const output = (value: number | null, first: boolean, field: string) => first ? { firstRow: { [field]: value } } : { count: "1", value: [{ [field]: value }] };
  const lookups = { LookupOld: output(lower, parsed.oldFirst, "WatermarkValue"), LookupNew: output(upper, parsed.newFirst, "NewWatermarkValue") };
  const sql = `SELECT order_id, change_version, amount_cents FROM dbo.Orders WHERE change_version ${parsed.lowerOp} ${lower}${parsed.includeUpper ? ` AND change_version ${parsed.upperOp} ${upper === null ? "NULL" : upper}` : ""}; -- T-SQL illustration only; not executed`;
  const result: AdfResult = { selected_order_ids: [], selected_rows: [], committed_order_ids: [], committed_rows: [], copy_status: "Skipped", advance_status: "Skipped", target_rows: ordered(target), checkpoint, diagnostic: null, stages, lookup_outputs: lookups, lookup_statuses: { LookupOld: "Succeeded", LookupNew: "Succeeded" }, sql_illustration: sql };
  if (upper === null) {
    stages.push({ phase: "lookup_no_work", target_rows: ordered(target), checkpoint });
    return { ...result, diagnostic: "new Lookup watermark is null; no-work branch" };
  }
  stages.push({ phase: "after_lookup", target_rows: ordered(target), checkpoint, lower, upper });
  const selected = source.filter(row => (parsed.lowerOp === ">" ? row[1] > lower : row[1] >= lower) && (!parsed.includeUpper || (parsed.upperOp === "<=" ? row[1] <= upper : row[1] < upper))).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  let copyStatus: AdfResult["copy_status"] = "Succeeded", diagnostic: string | null = null;
  const committed: AdfRow[] = [];
  for (const row of selected) {
    if (fault === "fail_before_write") { copyStatus = "Failed"; diagnostic = "injected Copy failure before first write"; break; }
    const index = target.findIndex(r => r[0] === row[0]);
    if (parsed.write === "insert" && index >= 0) { copyStatus = "Failed"; diagnostic = `duplicate target primary key order_id=${row[0]}`; break; }
    if (index >= 0) target[index] = [...row]; else target.push([...row]);
    if (target.length > ADF_ROWS_LIMIT) fail("state.target_rows", "target exceeds the 250-row local limit; no candidate state accepted");
    committed.push([...row]);
    if (fault === "partial_after_first") { copyStatus = "Failed"; diagnostic = "injected Copy failure after first committed row"; break; }
  }
  stages.push({ phase: "after_copy", target_rows: ordered(target), checkpoint, copy_status: copyStatus, committed_order_ids: committed.map(r => r[0]), committed_rows: clone(committed) });
  let advance: AdfResult["advance_status"] = "Skipped";
  if (copyStatus === "Succeeded" || parsed.gate === "Completed") {
    if (fault === "checkpoint_fail_before_mutation") { advance = "Failed"; diagnostic = "checkpoint failed before mutation"; }
    else { advance = "Succeeded"; checkpoint = upper; }
  }
  stages.push({ phase: "after_advance", target_rows: ordered(target), checkpoint, advance_status: advance });
  return { ...result, selected_order_ids: selected.map(r => r[0]), selected_rows: clone(selected), committed_order_ids: committed.map(r => r[0]), committed_rows: clone(committed), copy_status: copyStatus, advance_status: advance, target_rows: ordered(target), checkpoint, diagnostic };
}
export function executeAdfRequest(request: AdfRequest): AdfReply {
  try {
    const confirmed = adfConfirmed(request.confirmed);
    const captureRows = adfRows(parseAdfJson(request.captureText, "source_at_capture"), "source_at_capture");
    const copyRows = adfRows(parseAdfJson(request.copyText, "source_at_copy"), "source_at_copy");
    if (request.action === "capture") {
      const upper = captureRows.length ? Math.max(...captureRows.map(r => r[1])) : null;
      const captured = validateAdfCapture({ lower: confirmed.checkpoint, upper, capture_rows: captureRows }, confirmed);
      return { kind: "capture", captured };
    }
    if (request.action !== "run") fail("action", "unsupported worker action");
    if (!request.captured) fail("captured", "capture a window first; no state mutation");
    const captured = validateAdfCapture(request.captured, confirmed);
    if (JSON.stringify(ordered(captureRows)) !== JSON.stringify(ordered(captured.capture_rows))) fail("source_at_capture", "draft differs from captured source; capture a new window explicitly");
    const reply: AdfReply = { kind: "result", result: runAdf(parseAdfJson(request.configText, "config"), copyRows, confirmed, captured, request.fault) };
    if (JSON.stringify(reply).length > ADF_OUTPUT_LIMIT) fail("output", "trace/output exceeds the160,000-character local limit; previous accepted state retained");
    return reply;
  } catch (error) { return { kind: "error", message: error instanceof Error ? error.message : "Configuration/source rejected before accepting state" }; }
}
