import { adfContent, adfConfigs } from "./azure-adf-content";
import { ADF_TEXT_LIMIT, ADF_OUTPUT_LIMIT, adfConfirmed, adfRows, adfFaults, validateAdfCapture, type AdfCapture, type AdfConfirmed, type AdfFault, type AdfRequest, type AdfResult, type AdfRow } from "./azure-adf";
import type { AdfOutcome } from "./azure-adf-runner";

export const ADF_DRAFT_KEY = "tdf.azure-adf-watermark-recovery-001.v1";
export interface AdfDraft { configText: string; captureText: string; copyText: string; fault: AdfFault; example: string; hints: number; reviewed: boolean }
export interface AdfSession {
  draft: AdfDraft; confirmed: AdfConfirmed; captured: AdfCapture | null; acceptedId: string;
  trace: AdfResult | null; traceCurrent: boolean; message: string; error: boolean;
  running: { id: number; label: string; signature: string; action: "capture" | "run" } | null;
}
export const prettyAdf = (value: unknown) => JSON.stringify(value, null, 2);
export function initialAdfSession(): AdfSession {
  return { draft: { configText: prettyAdf(adfContent.starter), captureText: prettyAdf(adfContent.fixtures.source_at_upper_lookup), copyText: prettyAdf(adfContent.fixtures.source_at_copy), fault: "none", example: "starter_combined", hints: 0, reviewed: false },
    confirmed: { target_rows: adfRows(adfContent.fixtures.target_states.initial, "initial"), checkpoint: 100 }, captured: null, acceptedId: "original baseline (not a run)", trace: null, traceCurrent: false, running: null,
    message: "Inspect the complete inputs and starter. Capture a window, then run your configuration. No Azure request or SQL execution.", error: false };
}
export function adfSignature(s: AdfSession): string {
  return JSON.stringify([s.draft.configText, s.draft.captureText, s.draft.copyText, s.draft.fault, s.confirmed, s.captured]);
}
export function changeAdfDraft(s: AdfSession, patch: Partial<AdfDraft>): AdfSession {
  const captureChanged = patch.captureText !== undefined && patch.captureText !== s.draft.captureText;
  const actualChanged = ["configText", "captureText", "copyText", "fault"].some(k => k in patch && patch[k as keyof AdfDraft] !== s.draft[k as keyof AdfDraft]);
  return { ...s, draft: { ...s.draft, ...patch }, ...(actualChanged ? { running: null, traceCurrent: false, captured: captureChanged ? null : s.captured, error: false,
    message: "Draft changed. Prior trace is historical; the actual accepted target/checkpoint is retained. Capture again if the capture-source changed." } : {}) };
}
export function beginAdfAction(s: AdfSession, id: number, action: "capture" | "run", label = `sim-${id}`): AdfSession {
  return { ...s, running: { id, label, action, signature: adfSignature(s) }, traceCurrent: false, error: false,
    message: `${action === "capture" ? "Capturing bounds from current source/checkpoint" : "Running actual config from current accepted state"}. Cancel retains the last accepted state, which may already be partial.` };
}
export function adfRequest(s: AdfSession): AdfRequest {
  if (!s.running) throw new Error("No current worker request");
  return { id: s.running.id, action: s.running.action, configText: s.draft.configText, captureText: s.draft.captureText, copyText: s.draft.copyText,
    confirmed: structuredClone(s.confirmed), captured: structuredClone(s.captured), fault: s.draft.fault };
}
export function finishAdfAction(s: AdfSession, id: number, outcome: AdfOutcome): AdfSession {
  if (!s.running || s.running.id !== id || s.running.signature !== adfSignature(s)) return s;
  const base = { ...s, running: null };
  if (outcome.kind !== "reply") return { ...base, error: true, message: (outcome.kind === "cancelled" ? "Cancelled; worker terminated." : outcome.kind === "timeout" ? "1-second execution budget expired; worker terminated." : "Worker could not load within5seconds or was unavailable; retry.") + " Last accepted target/checkpoint/capture and all drafts/prior trace are unchanged." };
  const reply = outcome.reply;
  if (reply.kind === "error") return { ...base, error: true, message: `Input/configuration rejected; Copy/Advance NotStarted. ${reply.message}. Last accepted state and prior trace are preserved.` };
  if (reply.kind === "capture") return { ...base, captured: reply.captured, error: false, message: `Captured actual checkpoint ${reply.captured.lower} → ${reply.captured.upper === null ? "NULL (no-work source)" : reply.captured.upper}. Target/checkpoint unchanged. Run explicitly; retry retains these bounds.` };
  // Every completed modeled run is accepted, including deliberate FailedCopy partial writes and unsafe Completed checkpoints.
  return { ...base, confirmed: { target_rows: structuredClone(reply.result.target_rows), checkpoint: reply.result.checkpoint }, acceptedId: s.running.label,
    trace: structuredClone(reply.result), traceCurrent: true, error: false,
    message: `Simulation accepted: Copy ${reply.result.copy_status}; Advance ${reply.result.advance_status}. ${reply.result.diagnostic ?? "Inspect exact selected/committed rows and checkpoint."} Completed failed copies may retain partial writes; this is not a successful warehouse transaction.` };
}
export function adfSourceVariant(name: string, capture: boolean): AdfRow[] {
  const f = adfContent.fixtures;
  if (name === "empty") return [];
  if (name === "wrong_key") return adfRows(capture ? f.wrong_key_fixture.source_at_upper_lookup : f.wrong_key_fixture.source_at_copy, "fixture");
  if (name === "duplicate_source_order_id" || name === "invalid_integer") return structuredClone(capture ? f.source_at_upper_lookup : f.invalid_fixtures[name]) as AdfRow[];
  return structuredClone(capture ? name === "next" ? f.source_at_next_upper_lookup : f.source_at_upper_lookup : f.source_at_copy) as AdfRow[];
}
export function loadAdfExample(name: string): AdfSession {
  const runs = (adfContent.cases as Record<string, { config: string; start_target: string; checkpoint: number; captured_lower: number; captured_upper: number | null; source: string; fault: string | null }[]>)[name];
  if (!runs) throw new Error("Unknown disclosed case");
  const first = runs[0], capture = adfSourceVariant(first.source, true);
  return { ...initialAdfSession(), draft: { configText: prettyAdf(adfConfigs[first.config]), captureText: prettyAdf(capture), copyText: prettyAdf(adfSourceVariant(first.source, false)), fault: (first.fault ?? "none") as AdfFault, example: name, hints: 0, reviewed: true },
    confirmed: { target_rows: adfRows((adfContent.fixtures.target_states as Record<string, number[][]>)[first.start_target], "case initial target"), checkpoint: first.checkpoint },
    captured: { lower: first.captured_lower, upper: first.captured_upper, capture_rows: capture }, acceptedId: "loaded disclosed starting state (not a run)",
    message: "Explicitly loaded this case's first starting inputs/config (assisted). Later steps must use actual returned state; no next-step expected target is injected." };
}
export function serializeAdfSession(s: AdfSession, revision: string) {
  return JSON.stringify({ version: 1, revision, draft: s.draft, confirmed: s.confirmed, captured: s.captured, acceptedId: s.acceptedId, trace: s.trace });
}
export function parseAdfSession(raw: string): { session: AdfSession; revision: string } {
  if (raw.length > 450000) throw new Error("Saved device copy exceeds450,000characters");
  const value = JSON.parse(raw), d = value?.draft;
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["version", "revision", "draft", "confirmed", "captured", "acceptedId", "trace"].sort()) || !d || typeof d !== "object" || Array.isArray(d) || JSON.stringify(Object.keys(d).sort()) !== JSON.stringify(["configText", "captureText", "copyText", "fault", "example", "hints", "reviewed"].sort())) throw new Error("Saved copy fields/version are unsupported");
  if (!value || value.version !== 1 || typeof value.revision !== "string" || value.revision.length > 100 || !d ||
    !["configText", "captureText", "copyText"].every(k => typeof d[k] === "string" && d[k].length <= ADF_TEXT_LIMIT) ||
    !adfFaults.includes(d.fault) || !Object.prototype.hasOwnProperty.call(adfContent.cases, d.example) || !Number.isInteger(d.hints) || d.hints < 0 || d.hints > 3 || typeof d.reviewed !== "boolean" || typeof value.acceptedId !== "string" || value.acceptedId.length > 100) throw new Error("Saved draft version/shape is unsupported; current state preserved");
  const confirmed = adfConfirmed(value.confirmed);
  // Saved bounds may predate an advanced checkpoint. Validate their shape, never reset the actual checkpoint to make a retry fit.
  const captured = value.captured === null ? null : validateAdfCapture(value.captured);
  const trace = value.trace as AdfResult | null;
  if (trace) {
    if (JSON.stringify(trace).length > ADF_OUTPUT_LIMIT || !Array.isArray(trace.stages) || trace.stages.length > 5 || !["Succeeded", "Failed", "Skipped"].includes(trace.copy_status) || !["Succeeded", "Failed", "Skipped"].includes(trace.advance_status) || typeof trace.sql_illustration !== "string" || trace.sql_illustration.length > 2000 || trace.diagnostic !== null && typeof trace.diagnostic !== "string" || !trace.lookup_outputs || typeof trace.lookup_outputs !== "object" || trace.lookup_statuses?.LookupOld !== "Succeeded" || trace.lookup_statuses?.LookupNew !== "Succeeded") throw new Error("Saved trace shape is unsupported");
    adfConfirmed({ target_rows: trace.target_rows, checkpoint: trace.checkpoint }); adfRows(trace.selected_rows, "saved.selected_rows"); adfRows(trace.committed_rows, "saved.committed_rows");
    if (JSON.stringify(trace.selected_order_ids) !== JSON.stringify(trace.selected_rows.map(r => r[0])) || JSON.stringify(trace.committed_order_ids) !== JSON.stringify(trace.committed_rows.map(r => r[0]))) throw new Error("Saved trace row/ID shape is unsupported");
    for (const stage of trace.stages) { if (!["start", "after_lookup", "after_copy", "after_advance", "lookup_no_work"].includes(stage.phase)) throw new Error("Saved trace phase unsupported"); adfConfirmed({ target_rows: stage.target_rows, checkpoint: stage.checkpoint }); }
  }
  return { revision: value.revision, session: { ...initialAdfSession(), draft: d, confirmed, captured, acceptedId: value.acceptedId, trace,
    message: "Restored device-only accepted state (possibly partial), drafts and historical trace. Saved history is not independently verified or cloud-synced; rerun before interpreting current feedback." } };
}
