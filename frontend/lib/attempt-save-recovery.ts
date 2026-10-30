import type { LearnerAttemptRequest, LearnerAttemptResponse } from "./types";

export interface AttemptSaveScope {
  accountId: string;
  token: string;
  slug: string;
}

export type AttemptSaveStatus = "idle" | "saving" | "unsaved" | "saved" | "restored" | "unconfirmed";

// One workspace's in-memory retry, not a durable queue or a new source of progress.
export class AttemptSaveRecovery {
  private scope: AttemptSaveScope | null = null;
  private pending: { scope: AttemptSaveScope; json: string } | null = null;
  private inFlight: object | null = null;
  status: AttemptSaveStatus = "idle";

  constructor(
    private readonly isCurrent: (scope: AttemptSaveScope) => boolean,
    private readonly persist: (scope: AttemptSaveScope, payload: LearnerAttemptRequest) => Promise<LearnerAttemptResponse>,
    private readonly changed: (status: AttemptSaveStatus) => void
  ) {}

  private publish(status: AttemptSaveStatus) {
    this.status = status;
    this.changed(status);
  }

  setScope(scope: AttemptSaveScope | null) {
    if (scope?.accountId === this.scope?.accountId && scope?.token === this.scope?.token && scope?.slug === this.scope?.slug) return false;
    this.scope = scope ? { ...scope } : null;
    this.pending = null;
    this.inFlight = null;
    this.publish("idle");
    return true;
  }

  hasPending() { return this.pending !== null; }

  restore(serverAttempt: boolean, localAttempt: boolean) {
    if (this.pending || !["idle", "unconfirmed"].includes(this.status)) return;
    this.publish(serverAttempt ? "restored" : localAttempt ? "unconfirmed" : "idle");
  }

  beginEvaluation() {
    if (!this.pending) this.publish("idle");
  }

  stage(scope: AttemptSaveScope, payload: LearnerAttemptRequest): boolean {
    this.setScope(scope);
    if (this.pending || !this.isCurrent(scope)) return false;
    // Serialize now so later editor/feedback mutations cannot alter a retry.
    this.pending = { scope: { ...scope }, json: JSON.stringify(payload) };
    this.publish("unsaved");
    return true;
  }

  async save(ready: boolean): Promise<{ scope: AttemptSaveScope; response: LearnerAttemptResponse } | null> {
    const pending = this.pending;
    if (!pending || this.inFlight || !ready) return null;
    if (!this.isCurrent(pending.scope)) {
      this.setScope(null);
      return null;
    }
    this.inFlight = pending;
    this.publish("saving");
    try {
      const response = await this.persist(pending.scope, JSON.parse(pending.json));
      if (this.pending !== pending || !this.isCurrent(pending.scope)) return null;
      this.pending = null;
      this.publish("saved");
      return { scope: pending.scope, response };
    } catch {
      if (this.pending === pending && this.isCurrent(pending.scope)) this.publish("unsaved");
      return null;
    } finally {
      if (this.inFlight === pending) this.inFlight = null;
    }
  }
}
