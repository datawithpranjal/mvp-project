import { ApiError, ApiDecodeError, ApiTransportError } from "./api";
import type { LearnerDraftRequest, LearnerDraftResponse } from "./types";

export type SyncOperation = "load" | "draft-save";
export type SyncTrigger = "initial" | "manual" | "autosave";
export type SyncClass = "session-required" | "service-unavailable" | "no-response" | "other-http" | "unknown";
export type DurationBucket = "<1s" | "1–5s" | "5–15s" | ">15s";

// This is the complete diagnostic allowlist. Never add context, payloads or errors.
export interface CodingSyncDetails {
  operation: SyncOperation;
  outcome: "pending" | "success" | "failure";
  status?: number;
  class: SyncClass;
  durationBucket: DurationBucket;
  trigger: SyncTrigger;
  manualRetry: boolean;
}

export function classifyCodingSyncError(error: unknown): Pick<CodingSyncDetails, "status" | "class"> {
  const status = error instanceof ApiError || error instanceof ApiDecodeError ? error.status : undefined;
  if (error instanceof ApiError) {
    if (status === 401) return { status, class: "session-required" };
    if (status && status >= 500 && status <= 599) return { status, class: "service-unavailable" };
    return { status, class: "other-http" };
  }
  if (error instanceof ApiTransportError) return { class: "no-response" };
  return { ...(status === undefined ? {} : { status }), class: "unknown" };
}

export function durationBucket(elapsed: number): DurationBucket {
  return elapsed < 1000 ? "<1s" : elapsed < 5000 ? "1–5s" : elapsed <= 15000 ? "5–15s" : ">15s";
}

export function codingSyncMessage(details: CodingSyncDetails): string {
  if (details.outcome === "pending") {
    if (details.durationBucket === "5–15s" || details.durationBucket === ">15s") {
      return "Account sync is taking longer. Keep this page open; your answer is still in the editor.";
    }
    return details.operation === "load" ? "Loading account progress..." : "Saving draft to your account...";
  }
  if (details.outcome === "success") return details.operation === "load" ? "Account progress loaded." : "This draft revision was saved to your account.";
  if (details.class === "session-required") return "Account access needs sign-in. Your answer is still in the editor.";
  if (details.class === "service-unavailable") return "The account service is unavailable. Your answer is still in the editor.";
  if (details.class === "no-response") return "The account request could not be completed. Your answer is still in the editor.";
  if (details.class === "other-http") return `${details.operation === "load" ? "Account progress could not be loaded" : "The draft could not be saved to your account"} (HTTP ${details.status}). Your answer is still in the editor.`;
  return "Account sync could not be confirmed. Your answer is still in the editor.";
}

export function confirmCodingDraft(
  response: LearnerDraftResponse, contentType: string, slug: string, payload: LearnerDraftRequest
): void {
  const item = response?.item;
  if (!item || item.content_type !== contentType || item.content_id !== slug ||
      item.draft_revision !== payload.client_revision || item.draft_answer !== payload.draft_answer) {
    throw new ApiDecodeError("Draft acknowledgement could not be confirmed.", 200);
  }
}

interface SyncClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(timer: unknown): void;
}

const browserClock: SyncClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>)
};

/** One ephemeral presentation operation. Requests and guards remain caller-owned. */
export class CodingSyncFeedback {
  private active?: { details: CodingSyncDetails; started: number; current: () => boolean };
  private timer?: unknown;
  private value?: CodingSyncDetails;
  constructor(private readonly publish: (details: CodingSyncDetails | undefined) => void, private readonly clock: SyncClock = browserClock) {}
  get pending(): boolean { return this.value?.outcome === "pending"; }
  get operation(): SyncOperation | undefined { return this.value?.operation; }

  reset(): void {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined; this.active = undefined; this.value = undefined;
    this.publish(undefined);
  }

  begin(operation: SyncOperation, trigger: SyncTrigger, current: () => boolean, manualRetry = false) {
    this.reset();
    const active = { details: { operation, outcome: "pending", class: "unknown", durationBucket: "<1s", trigger, manualRetry } as CodingSyncDetails, started: this.clock.now(), current };
    this.active = active;
    const emit = (details: CodingSyncDetails) => { this.value = details; this.publish({ ...details }); };
    const tick = () => {
      if (this.active !== active) return;
      if (!current()) { this.reset(); return; }
      const elapsed = this.clock.now() - active.started;
      emit({ ...active.details, durationBucket: durationBucket(elapsed) });
      const next = [1000, 5000, 15001].find((boundary) => boundary > elapsed);
      if (next !== undefined) this.timer = this.clock.setTimeout(tick, next - elapsed);
    };
    const settle = (error?: unknown, failed = false) => {
      if (this.active !== active) return;
      if (!current()) { this.reset(); return; }
      if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
      this.timer = undefined;
      emit({ ...active.details, outcome: failed ? "failure" : "success", durationBucket: durationBucket(this.clock.now() - active.started), ...(failed ? classifyCodingSyncError(error) : {}) });
    };
    tick();
    return { success: () => settle(), failure: (error: unknown) => settle(error, true) };
  }
}
