import assert from "node:assert/strict";
import { AttemptSaveRecovery, type AttemptSaveScope } from "../frontend/lib/attempt-save-recovery";
import type { LearnerAttemptRequest, LearnerAttemptResponse } from "../frontend/lib/types";

const scope: AttemptSaveScope = { accountId: "qa-a", token: "qa-token-a", slug: "sales" };
const payload = (passed: boolean | null = true): LearnerAttemptRequest => ({
  idempotency_key: "original-key", answer: "original evaluated code", passed, message: "original outcome",
  result: { nested: { score: 100 } }, ai_feedback: { text: "original feedback" }
});
const ack: LearnerAttemptResponse = { duplicate: false, item: {
  content_type: "scenario", content_id: "sales", draft_answer: "edited draft", draft_interview_answer: "",
  hints_revealed: 0, completed: true, completed_at: null, latest_result: null, ai_feedback: null,
  draft_revision: 1, updated_at: "2026-10-30T00:00:00Z", attempts: []
} };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function setup(persist: (scope: AttemptSaveScope, body: LearnerAttemptRequest) => Promise<LearnerAttemptResponse>) {
  let current: AttemptSaveScope | null = { ...scope };
  const saver = new AttemptSaveRecovery(
    s => current?.accountId === s.accountId && current?.token === s.token && current?.slug === s.slug,
    persist, () => {}
  );
  saver.setScope(current);
  return { saver, change(next: AttemptSaveScope | null, notify = true) { current = next; if (notify) saver.setScope(next); } };
}
async function main() {
  for (const passed of [true, false, null]) {
    const sent: LearnerAttemptRequest[] = [];
    const h = setup(async (_scope, body) => { sent.push(body); if (sent.length < 3) throw new Error("Unavailable"); return ack; });
    const body = payload(passed), original = JSON.stringify(body);
    assert(h.saver.stage(scope, body));
    await h.saver.save(true);
    assert.equal(h.saver.status, "unsaved");
    body.answer = "edited code";
    (body.result!.nested as { score: number }).score = 0;
    assert.equal(h.saver.stage(scope, payload(false)), false, "Pending attempt replaced");
    h.saver.restore(true, true);
    assert.equal(h.saver.status, "unsaved", "Draft/background restore dismissed failure");
    await h.saver.save(true);
    assert.equal(h.saver.status, "unsaved", "Failed retry cleared warning");
    assert.equal((await h.saver.save(true))?.response, ack);
    assert.equal(h.saver.status, "saved");
    assert(!h.saver.hasPending());
    assert(sent.every(s => JSON.stringify(s) === original), "Retry mutated answer/result/feedback/key");
    await h.saver.save(true);
    assert.equal(sent.length, 3, "Acknowledged attempt resent");
  }
  {
    const d = deferred<LearnerAttemptResponse>(); let calls = 0;
    const h = setup(async () => { calls++; return d.promise; });
    h.saver.stage(scope, payload());
    const first = h.saver.save(true);
    assert.equal(h.saver.status, "saving");
    assert.equal(await h.saver.save(true), null);
    assert.equal(calls, 1, "Double retry duplicated POST");
    d.resolve(ack); await first;
    assert.equal(h.saver.status, "saved");
  }
  for (const next of [null, { ...scope, accountId: "qa-b", token: "qa-token-b" }, { ...scope, slug: "other" }, { ...scope, token: "new-session" }]) {
    const d = deferred<LearnerAttemptResponse>(); let calls = 0;
    const h = setup(async () => { calls++; return d.promise; });
    h.saver.stage(scope, payload()); const pending = h.saver.save(true);
    h.change(next); d.resolve(ack);
    assert.equal(await pending, null, "Stale acknowledgement escaped scope");
    assert.equal(h.saver.status, "idle"); assert(!h.saver.hasPending());
    await h.saver.save(true); assert.equal(calls, 1, "New scope sent old snapshot");
  }
  {
    let calls = 0; const h = setup(async () => { calls++; return ack; });
    h.saver.stage(scope, payload()); await h.saver.save(false);
    assert.equal(calls, 0); assert.equal(h.saver.status, "unsaved");
    await h.saver.save(true); assert.equal(h.saver.status, "saved");
    h.saver.beginEvaluation(); h.saver.stage(scope, payload());
    h.change({ ...scope, accountId: "qa-b" }, false);
    await h.saver.save(true); assert.equal(calls, 1); assert(!h.saver.hasPending());
  }
  {
    const h = setup(async () => ack);
    h.saver.restore(false, true); assert.equal(h.saver.status, "unconfirmed");
    h.saver.restore(true, true); assert.equal(h.saver.status, "restored");
  }
  {
    const oldReply = deferred<LearnerAttemptResponse>(), newReply = deferred<LearnerAttemptResponse>();
    const h = setup(async s => s.accountId === scope.accountId ? oldReply.promise : newReply.promise);
    h.saver.stage(scope, payload()); const oldRequest = h.saver.save(true);
    const next = { ...scope, accountId: "qa-b", token: "qa-token-b" };
    h.change(next); h.saver.stage(next, { ...payload(false), idempotency_key: "new-key" });
    const newRequest = h.saver.save(true);
    oldReply.reject(new Error("Old account failed late"));
    assert.equal(await oldRequest, null); assert.equal(h.saver.status, "saving");
    assert(h.saver.hasPending(), "Old failure cleared a new account's pending attempt");
    newReply.resolve(ack); await newRequest; assert.equal(h.saver.status, "saved");
  }
  console.log("Attempt recovery passed: exact snapshot/key, failed/successful retries, concurrency, edited drafts, readiness, acknowledgement, reload and scope guards.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
