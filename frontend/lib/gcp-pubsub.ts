export const GCP_EDITOR_BYTES = 60_000;
export const GCP_REQUEST_BYTES = 300_000;
export const GCP_RESULT_BYTES = 160_000;
export const GCP_HISTORY_STEPS = 512;
export const GCP_LOAD_MS = 5_000;
export const GCP_RUN_MS = 1_000;

const publicationFields = ["message_id", "producer", "event_id", "order_id", "amount_cents"] as const;
const idFields = ["message_id", "producer", "event_id", "order_id"] as const;
export const dedupKeys = ["none", "message_id", "event_id", "producer_event_id", "order_id"] as const;
export const ackTimings = ["before_write", "after_write"] as const;
export const faults = ["none", "sink_failure_before_write", "crash_after_commit_before_ack"] as const;
export const actions = ["process_next", "expire_current", "retry_current", "force_redelivery",
  "reset_confirmed", "cancel", "stale_reply"] as const;

export interface Publication {
  message_id: string;
  producer: string;
  event_id: string;
  order_id: string;
  amount_cents: number;
}
export interface Delivery { message_id: string; ack_id: string }
export interface LedgerRow extends Publication {
  committed_from_message_id: string;
  committed_from_ack_id: string;
}
export interface PubsubState {
  source_publications: Publication[];
  ledger: LedgerRow[];
  acked_message_ids: string[];
  ack_history: Delivery[];
  pending: string[];
  inflight: Delivery | null;
  retry_for: string | null;
  attempts: Record<string, number>;
}
export type Policy = { ackTiming: typeof ackTimings[number]; dedupKey: typeof dedupKeys[number] };
export type Fault = typeof faults[number];
export type FaultMode = Fault | "teaching";
export type PubsubAction = typeof actions[number];
type TraceStatus = "ResetConfirmed" | "Ignored" | "NoMessages" | "ExpiredForRetry"
  | "SinkFailed" | "CrashedAfterCommit" | "Succeeded";
export interface PubsubTrace {
  action: PubsubAction;
  message_id: string | null;
  ack_id: string | null;
  fault: Fault;
  policy: Policy;
  sink_effect: "none" | "insert" | "skip_duplicate";
  ack_effect: "none" | "acknowledged" | "acknowledged forced redelivery";
  status: TraceStatus;
  reason: string | null;
}
export interface PubsubRun { state: PubsubState; history: PubsubTrace[] }
export interface PubsubRequest {
  id: number;
  sourceText: string;
  policyText: string;
  run: PubsubRun;
  action: PubsubAction;
  fault: FaultMode;
  messageId: string | null;
}
export type PubsubReply =
  | { id: number; kind: "result"; run: PubsubRun; trace: PubsubTrace }
  | { id: number; kind: "error"; message: string };

const encoder = new TextEncoder();
export const byteLength = (text: string) => encoder.encode(text).length;
export const prettyPubsub = (value: unknown) => JSON.stringify(value, null, 2);
export const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
export class PubsubInputError extends Error {}
function reject(message: string): never { throw new PubsubInputError(message); }

export function exactObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== fields.length || !fields.every(field => hasOwn(value, field))) {
    reject(`${label} requires exactly ${fields.join(", ")}.`);
  }
  return value as Record<string, unknown>;
}
function member<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.some(option => option === value);
}
function safeInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}
function parse(text: string, label: string, limit: number, malformed = `${label}: malformed JSON.`): unknown {
  if (text.length > limit || byteLength(text) > limit) reject(`${label}: exceeds ${limit.toLocaleString("en-US")} bytes.`);
  try { return JSON.parse(text); }
  catch { reject(malformed); }
}
export function encodePubsub(value: unknown, limit: number, label: string): string {
  const text = JSON.stringify(value);
  if (text.length > limit || byteLength(text) > limit) {
    reject(`RESOURCE: ${label} exceeds ${limit.toLocaleString("en-US")} serialized bytes.`);
  }
  return text;
}

// Compare decoded JSON values independently of object key order.
export function samePubsubValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((item, i) => samePubsubValue(item, right[i]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => hasOwn(b, key) && samePubsubValue(a[key], b[key]));
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 80 && value.trim().length > 0 && [...value].length <= 40;
}
export function validatePublications(value: unknown, label = "SOURCE"): Publication[] {
  if (!Array.isArray(value) || value.length > 100) reject(`${label}: source publications must be an array of at most 100 rows.`);
  const messages = new Set<string>();
  const events = new Map<string, Publication>();
  return value.map((item, i) => {
    const path = `${label}: publication[${i}]`;
    const row = exactObject(item, publicationFields, path);
    for (const field of idFields) if (!validId(row[field])) {
      reject(`${path}.${field} must be a nonblank string of 1..40 characters.`);
    }
    if (!safeInteger(row.amount_cents, 2_147_483_647)) reject(`${path}.amount_cents must be integer 0..2147483647.`);
    const publication = row as unknown as Publication;
    const { message_id, producer, event_id, order_id, amount_cents } = publication;
    if (messages.has(message_id)) reject(`${label}: duplicate message_id ${message_id}.`);
    const key = JSON.stringify([producer, event_id]);
    const prior = events.get(key);
    if (prior && (prior.order_id !== order_id || prior.amount_cents !== amount_cents)) {
      reject(`${label}: SOURCE CONFLICT ${producer}/${event_id}: ${prior.message_id} versus ${message_id} have different business payload.`);
    }
    messages.add(message_id);
    events.set(key, prior ?? publication);
    return publication;
  });
}
export function parsePublications(text: string): Publication[] {
  return validatePublications(parse(text, "SOURCE", GCP_EDITOR_BYTES));
}
export function validatePolicy(value: unknown): Policy {
  const { ackTiming, dedupKey } = exactObject(value, ["ackTiming", "dedupKey"], "POLICY: policy (extra/unknown fields are unsupported)");
  if (!member(ackTiming, ackTimings)) reject("POLICY: policy.ackTiming must be before_write or after_write.");
  if (!member(dedupKey, dedupKeys)) reject(`POLICY: policy.dedupKey must be ${dedupKeys.join(", ")}.`);
  return { ackTiming, dedupKey };
}
const parsePolicy = (text: string) => validatePolicy(parse(text, "POLICY", GCP_EDITOR_BYTES, "POLICY: policy is malformed JSON."));

export function emptyPubsubRun(source: Publication[]): PubsubRun {
  return {
    state: {
      source_publications: source,
      ledger: [],
      acked_message_ids: [],
      ack_history: [],
      pending: source.map(row => row.message_id),
      inflight: null,
      retry_for: null,
      attempts: Object.fromEntries(source.map(row => [row.message_id, 0]))
    },
    history: []
  };
}
const deliveryId = (mid: string, attempt: number) => `a-${mid}-${attempt}`;
function compareIds(a: string, b: string): number {
  const left = [...a], right = [...b];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const diff = left[i].codePointAt(0)! - right[i].codePointAt(0)!;
    if (diff) return diff;
  }
  return left.length - right.length;
}
function attemptOf(mid: string, ack: unknown, counts: Record<string, number>): number | null {
  const prefix = `a-${mid}-`;
  if (typeof ack !== "string" || !ack.startsWith(prefix)) return null;
  const suffix = ack.slice(prefix.length);
  if (!/^[1-9][0-9]{0,15}$/.test(suffix)) return null;
  const n = Number(suffix);
  return safeInteger(n, counts[mid]) ? n : null;
}
export function validatePubsubState(value: unknown): PubsubState {
  const s = exactObject(value, ["source_publications", "ledger", "acked_message_ids", "ack_history",
    "pending", "inflight", "retry_for", "attempts"], "STATE: state");
  const source = validatePublications(s.source_publications, "STATE: state.source_publications");
  const ids = source.map(row => row.message_id);
  const byId = new Map(source.map(row => [row.message_id, row]));
  const rawCounts = exactObject(s.attempts, ids, "STATE: state.attempts");
  for (const mid of ids) if (!safeInteger(rawCounts[mid])) {
    reject(`STATE: state.attempts.${mid} must be a nonnegative safe integer.`);
  }
  const counts = rawCounts as Record<string, number>;
  const totalAttempts = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (!Array.isArray(s.ledger) || s.ledger.length > totalAttempts) reject("STATE: invalid ledger size.");
  const commits = new Set<string>();
  for (const [i, item] of s.ledger.entries()) {
    const path = `STATE: state.ledger[${i}]`;
    const row = exactObject(item, [...publicationFields, "committed_from_message_id", "committed_from_ack_id"], path);
    const mid = row.committed_from_message_id;
    const publication = typeof mid === "string" ? byId.get(mid) : undefined;
    if (!publication || publicationFields.some(field => row[field] !== publication[field])) {
      reject(`${path} business payload does not match its source publication.`);
    }
    const ack = row.committed_from_ack_id;
    if (attemptOf(publication.message_id, ack, counts) === null || commits.has(ack as string)) {
      reject(`${path} has unproven or repeated commit provenance.`);
    }
    commits.add(ack as string);
  }
  if (!Array.isArray(s.ack_history) || s.ack_history.length > totalAttempts) reject("STATE: invalid ACK history size.");
  const receipts = new Set<string>(), acked = new Set<string>();
  for (const [i, item] of s.ack_history.entries()) {
    const path = `STATE: state.ack_history[${i}]`;
    const { message_id: mid, ack_id: ack } = exactObject(item, ["message_id", "ack_id"], path);
    if (typeof mid !== "string" || !byId.has(mid) || attemptOf(mid, ack, counts) === null || receipts.has(ack as string)) {
      reject(`${path} has unknown, unproven or repeated ACK receipt.`);
    }
    receipts.add(ack as string);
    acked.add(mid);
  }
  if (!samePubsubValue(s.acked_message_ids, [...acked].sort(compareIds))) {
    reject("STATE: state.acked_message_ids must match ACK history in sorted unique order.");
  }
  const pending = ids.filter(mid => !acked.has(mid));
  if (!samePubsubValue(s.pending, pending)) reject("STATE: state.pending must match unacknowledged source IDs in source order.");
  if (s.inflight !== null && s.retry_for !== null) reject("STATE: inflight and retry_for cannot both be set.");
  let current: string | null = null;
  if (s.inflight !== null) {
    const { message_id: mid, ack_id: ack } = exactObject(s.inflight, ["message_id", "ack_id"], "STATE: state.inflight");
    if (typeof mid !== "string" || !byId.has(mid) || attemptOf(mid, ack, counts) !== counts[mid] || receipts.has(ack as string)) {
      reject("STATE: state.inflight must identify the latest unacknowledged known delivery.");
    }
    current = mid;
  }
  if (s.retry_for !== null) {
    const mid = s.retry_for;
    if (typeof mid !== "string" || !byId.has(mid) || counts[mid] < 1 || receipts.has(deliveryId(mid, counts[mid]))) {
      reject("STATE: state.retry_for must identify a latest unacknowledged known delivery.");
    }
    current = mid;
  }
  if (current !== null && pending.includes(current) && pending[0] !== current) {
    reject("STATE: current delivery must be the oldest pending publication.");
  }
  for (const mid of ids) {
    if (counts[mid] > 0 && current !== mid && (!acked.has(mid) || !receipts.has(deliveryId(mid, counts[mid])))) {
      reject(`STATE: state.attempts.${mid} has an orphaned latest delivery.`);
    }
  }
  return s as unknown as PubsubState;
}

const traceFields = ["action", "message_id", "ack_id", "fault", "policy", "sink_effect", "ack_effect", "status", "reason"];
export function validatePubsubTrace(value: unknown): PubsubTrace {
  const step = exactObject(value, traceFields, "STATE: trace");
  if (!member(step.action, actions) || !member(step.fault, faults)
    || !member(step.status, ["ResetConfirmed", "Ignored", "NoMessages", "ExpiredForRetry", "SinkFailed", "CrashedAfterCommit", "Succeeded"])
    || !member(step.sink_effect, ["none", "insert", "skip_duplicate"])
    || !member(step.ack_effect, ["none", "acknowledged", "acknowledged forced redelivery"])
    || (step.message_id !== null && !validId(step.message_id))
    || (step.ack_id !== null && (typeof step.ack_id !== "string" || step.ack_id.length > 100))
    || (step.reason !== null && (typeof step.reason !== "string" || step.reason.length > 240))) {
    reject("STATE: invalid trace fields.");
  }
  validatePolicy(step.policy);
  return step as unknown as PubsubTrace;
}

// Reconstruct a display snapshot from append-only commit and ACK receipts.
// Execution never uses a reconstructed snapshot or the expected examples.
export function pubsubSnapshot(run: PubsubRun, stepCount: number): PubsubState {
  const snapshot = emptyPubsubRun(run.state.source_publications).state;
  const pending = new Set(snapshot.pending), acked = new Set<string>();
  for (const step of run.history.slice(0, stepCount)) {
    const mid = step.message_id;
    if (mid === null || !hasOwn(snapshot.attempts, mid)) reject("STATE: history references an unknown message.");
    if (step.action === "expire_current") {
      if (snapshot.inflight?.message_id !== mid || step.ack_id !== null || step.status !== "ExpiredForRetry"
        || step.ack_effect !== "none" || step.sink_effect !== "none") reject("STATE: invalid expiry history.");
      snapshot.inflight = null;
      snapshot.retry_for = mid;
      continue;
    }
    const forced = step.action === "force_redelivery";
    const retry = step.action === "retry_current";
    const next = step.action === "process_next";
    if (snapshot.inflight || (!next && !retry && !forced)
      || (retry ? snapshot.retry_for !== mid : snapshot.retry_for !== null)
      || (next && pending.values().next().value !== mid) || (forced && !acked.has(mid))) {
      reject("STATE: history has an impossible delivery sequence.");
    }
    const ack = deliveryId(mid, ++snapshot.attempts[mid]);
    const sinkFailed = step.fault === "sink_failure_before_write";
    const status = sinkFailed ? "SinkFailed" : step.fault === "crash_after_commit_before_ack" ? "CrashedAfterCommit" : "Succeeded";
    const acknowledged = step.policy.ackTiming === "before_write" || step.fault === "none";
    const receiptEffect = acknowledged ? forced ? "acknowledged forced redelivery" : "acknowledged" : "none";
    if (step.ack_id !== ack || step.status !== status || step.ack_effect !== receiptEffect
      || (step.sink_effect === "none") !== sinkFailed) {
      reject("STATE: history has an invalid delivery receipt.");
    }
    snapshot.retry_for = null;
    if (step.sink_effect === "insert") {
      const row = run.state.ledger[snapshot.ledger.length];
      if (!row || row.committed_from_message_id !== mid || row.committed_from_ack_id !== ack) {
        reject("STATE: history commit does not match ledger provenance.");
      }
      snapshot.ledger.push(row);
    }
    if (step.ack_effect === "none") {
      snapshot.inflight = { message_id: mid, ack_id: ack };
    } else {
      const receipt = run.state.ack_history[snapshot.ack_history.length];
      if (!receipt || receipt.message_id !== mid || receipt.ack_id !== ack) reject("STATE: history does not match ACK receipts.");
      snapshot.ack_history.push(receipt);
      pending.delete(mid);
      acked.add(mid);
    }
  }
  snapshot.pending = [...pending];
  snapshot.acked_message_ids = [...acked].sort(compareIds);
  return snapshot;
}
export function validatePubsubRun(value: unknown): PubsubRun {
  const { state, history } = exactObject(value, ["state", "history"], "STATE: run");
  const confirmed = validatePubsubState(state);
  if (!Array.isArray(history) || history.length > GCP_HISTORY_STEPS) reject("STATE: history exceeds the step limit or is not an array.");
  const run = { state: confirmed, history: history.map(validatePubsubTrace) };
  encodePubsub(run, GCP_RESULT_BYTES, "confirmed state and history");
  if (!samePubsubValue(pubsubSnapshot(run, history.length), confirmed)) {
    reject("STATE: history does not match the confirmed run.");
  }
  return run;
}

function dedupKey(row: Publication, key: Policy["dedupKey"]): string | null {
  if (key === "none") return null;
  if (key === "producer_event_id") return JSON.stringify([row.producer, row.event_id]);
  return row[key];
}
function chosenFault(mode: FaultMode, mid: string, attempt: number): Fault {
  if (mode !== "teaching") return mode;
  if (attempt === 1 && mid === "m1") return "sink_failure_before_write";
  if (attempt === 1 && mid === "m2") return "crash_after_commit_before_ack";
  return "none";
}

function transition(run: PubsubRun, source: Publication[], policy: Policy, request: PubsubRequest): Pick<Extract<PubsubReply, { kind: "result" }>, "run" | "trace"> {
  const { action, fault: mode, messageId } = request;
  const before = run.state;
  const trace: PubsubTrace = {
    action, message_id: null, ack_id: null, fault: "none", policy,
    sink_effect: "none", ack_effect: "none", status: "Ignored", reason: null
  };
  if (action === "reset_confirmed") {
    return { run: emptyPubsubRun(source), trace: { ...trace, status: "ResetConfirmed", reason: "Explicit baseline reset." } };
  }
  if (!samePubsubValue(source, before.source_publications)) {
    reject("SOURCE_CHANGE_RESET_REQUIRED: reset the baseline to apply source edits. Confirmed effects are retained.");
  }
  if (action === "cancel" || action === "stale_reply") return { run, trace };
  if (action === "process_next" && !before.inflight && before.retry_for === null && !before.pending.length) {
    return { run, trace: { ...trace, status: "NoMessages", reason: "No pending publications." } };
  }
  if (run.history.length >= GCP_HISTORY_STEPS) reject("RESOURCE: history is full. Save this run or confirm a baseline reset.");
  const state = structuredClone(before);
  if (action === "expire_current") {
    if (!state.inflight) reject("ACTION: no unacknowledged in-flight delivery to expire.");
    state.retry_for = state.inflight.message_id;
    state.inflight = null;
    trace.message_id = state.retry_for;
    trace.status = "ExpiredForRetry";
    trace.reason = "Explicit local expiry.";
  } else {
    if (state.inflight || (state.retry_for !== null && action !== "retry_current")) {
      reject("ACTION: current unacknowledged message must expire and retry before next publication.");
    }
    let mid: string;
    if (action === "process_next") mid = state.pending[0];
    else if (action === "retry_current") {
      if (state.retry_for === null) reject("ACTION: retry requires explicit expiry of current unacknowledged message.");
      mid = state.retry_for;
    } else {
      if (messageId === null || !state.acked_message_ids.includes(messageId)) {
        reject("ACTION: forced post-ACK redelivery needs an acknowledged message and no current delivery.");
      }
      mid = messageId;
    }
    if (state.attempts[mid] === Number.MAX_SAFE_INTEGER) reject("STATE: attempt counter exhausted.");
    state.retry_for = null;
    const publication = source.find(row => row.message_id === mid)!;
    const ack = deliveryId(mid, ++state.attempts[mid]);
    const fault = chosenFault(mode, mid, state.attempts[mid]);
    state.inflight = { message_id: mid, ack_id: ack };
    trace.message_id = mid;
    trace.ack_id = ack;
    trace.fault = fault;
    function acknowledge() {
      if (!state.acked_message_ids.includes(mid)) state.acked_message_ids = [...state.acked_message_ids, mid].sort(compareIds);
      state.ack_history.push({ message_id: mid, ack_id: ack });
      state.pending = state.pending.filter(id => id !== mid);
      state.inflight = null;
      trace.ack_effect = action === "force_redelivery" ? "acknowledged forced redelivery" : "acknowledged";
    }
    if (policy.ackTiming === "before_write") acknowledge();
    if (fault === "sink_failure_before_write") {
      trace.status = "SinkFailed";
      trace.reason = "Injected sink failure before write.";
    } else {
      const key = dedupKey(publication, policy.dedupKey);
      const existing = key === null ? undefined : state.ledger.find(row => dedupKey(row, policy.dedupKey) === key);
      if (existing) {
        trace.sink_effect = "skip_duplicate";
        trace.reason = policy.dedupKey === "order_id" && existing.event_id !== publication.event_id
          ? "Order ID already committed. This loses a distinct event." : "Deduplication key already committed.";
      } else {
        state.ledger.push({ ...publication, committed_from_message_id: mid, committed_from_ack_id: ack });
        trace.sink_effect = "insert";
      }
      if (fault === "crash_after_commit_before_ack") {
        trace.status = "CrashedAfterCommit";
        if (policy.ackTiming === "before_write") trace.reason = "Early ACK already succeeded before the simulated crash.";
      } else {
        if (policy.ackTiming === "after_write") acknowledge();
        trace.status = "Succeeded";
      }
    }
  }
  return { run: { state, history: [...run.history, trace] }, trace };
}

export function executePubsubRequest(wire: unknown): string {
  let id = 0;
  try {
    if (typeof wire !== "string") reject("REQUEST: expected serialized JSON.");
    const payload = parse(wire, "REQUEST", GCP_REQUEST_BYTES);
    const r = exactObject(payload, ["id", "sourceText", "policyText", "run", "action", "fault", "messageId"], "REQUEST");
    if (!safeInteger(r.id) || r.id === 0) reject("REQUEST: invalid request ID.");
    id = r.id;
    if (typeof r.sourceText !== "string" || typeof r.policyText !== "string") reject("REQUEST: source and policy must be JSON text.");
    const source = parsePublications(r.sourceText);
    const policy = parsePolicy(r.policyText);
    if (!member(r.action, actions)) reject("ACTION: unsupported local action.");
    if (!member(r.fault, [...faults, "teaching"])) reject("FAULT: unsupported local fault.");
    if (r.messageId !== null && !validId(r.messageId)) reject("ACTION: invalid forced delivery message ID.");
    const run = validatePubsubRun(r.run);
    const result = transition(run, source, policy, r as unknown as PubsubRequest);
    return encodePubsub({ id, kind: "result", ...result }, GCP_RESULT_BYTES, "result and history");
  } catch (error) {
    if (!(error instanceof PubsubInputError)) throw error;
    return JSON.stringify({ id, kind: "error", message: error.message.slice(0, 500) } satisfies PubsubReply);
  }
}

export function readPubsubReply(wire: string, requestId: number): PubsubReply | null {
  const raw = parse(wire, "REPLY", GCP_RESULT_BYTES);
  if (!raw || typeof raw !== "object" || !("id" in raw) || raw.id !== requestId) return null;
  if ("kind" in raw && raw.kind === "error") {
    const { message } = exactObject(raw, ["id", "kind", "message"], "REPLY");
    if (typeof message !== "string" || message.length > 500) reject("REPLY: invalid error message.");
    return { id: requestId, kind: "error", message };
  }
  const { kind, run, trace } = exactObject(raw, ["id", "kind", "run", "trace"], "REPLY");
  if (kind !== "result") reject("REPLY: unsupported result.");
  return { id: requestId, kind, run: validatePubsubRun(run), trace: validatePubsubTrace(trace) };
}
