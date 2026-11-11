import { pubsubContent } from "./gcp-pubsub-content";
import { GCP_PUBSUB_LAB } from "./product";
import { byteLength, emptyPubsubRun, encodePubsub, exactObject, faults, GCP_EDITOR_BYTES,
  GCP_REQUEST_BYTES, prettyPubsub, PubsubInputError, validatePubsubRun, type FaultMode, type PubsubRun } from "./gcp-pubsub";

export const GCP_SAVE_KEY = `tdf.${GCP_PUBSUB_LAB.id}.v1`;
export interface PubsubDraft {
  sourceText: string;
  policyText: string;
  fault: FaultMode;
  messageId: string | null;
  hints: number;
  reviewed: boolean;
}
export interface PubsubSession { draft: PubsubDraft; run: PubsubRun }

export function initialPubsubSession(): PubsubSession {
  return {
    draft: {
      sourceText: prettyPubsub(pubsubContent.fixtures.publications),
      policyText: prettyPubsub(pubsubContent.policies.starter),
      fault: "teaching",
      messageId: null,
      hints: 0,
      reviewed: false
    },
    run: emptyPubsubRun(pubsubContent.fixtures.publications)
  };
}

export function readPubsubSave(raw: string): PubsubSession {
  if (raw.length > GCP_REQUEST_BYTES || byteLength(raw) > GCP_REQUEST_BYTES) {
    throw new PubsubInputError("STATE: saved copy exceeds the serialized device limit.");
  }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new PubsubInputError("STATE: saved copy is malformed JSON."); }
  const { version, revision, draft, run } = exactObject(value, ["version", "revision", "draft", "run"], "STATE: saved copy");
  if (version !== 1 || typeof revision !== "string" || !revision || revision.length > 100) {
    throw new PubsubInputError("STATE: unsupported saved version or revision.");
  }
  const fields = ["sourceText", "policyText", "fault", "messageId", "hints", "reviewed"];
  const d = exactObject(draft, fields, "STATE: saved draft");
  if (typeof d.sourceText !== "string" || typeof d.policyText !== "string"
    || byteLength(d.sourceText) > GCP_EDITOR_BYTES || byteLength(d.policyText) > GCP_EDITOR_BYTES
    || ![...faults, "teaching"].some(fault => d.fault === fault)
    || (d.messageId !== null && (typeof d.messageId !== "string" || d.messageId.length > 80 || !d.messageId.trim()))
    || typeof d.hints !== "number" || !Number.isInteger(d.hints) || d.hints < 0 || d.hints > 3
    || typeof d.reviewed !== "boolean") {
    throw new PubsubInputError("STATE: invalid saved draft fields.");
  }
  return { draft: d as unknown as PubsubDraft, run: validatePubsubRun(run) };
}

export function writePubsubSave(session: PubsubSession, revision: string): string {
  return encodePubsub({ version: 1, revision, ...session }, GCP_REQUEST_BYTES, "saved device copy");
}
