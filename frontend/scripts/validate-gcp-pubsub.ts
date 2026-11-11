import assert from "node:assert/strict";
import { pubsubContent } from "../lib/gcp-pubsub-content";
import { byteLength, emptyPubsubRun, encodePubsub, executePubsubRequest, GCP_EDITOR_BYTES,
  GCP_HISTORY_STEPS, GCP_LOAD_MS, GCP_REQUEST_BYTES, GCP_RESULT_BYTES, GCP_RUN_MS, readPubsubReply,
  type Publication, type PubsubReply, type PubsubRequest, type PubsubRun } from "../lib/gcp-pubsub";
import { initialPubsubSession, readPubsubSave, writePubsubSave } from "../lib/gcp-pubsub-session";
import { startPubsubRun, type PubsubOutcome } from "../lib/gcp-pubsub-runner";

const checks: string[] = [];
function check(name: string, fn: () => void) {
  fn();
  checks.push(name);
}
function execute(request: unknown): PubsubReply {
  return JSON.parse(executePubsubRequest(JSON.stringify(request)));
}
const policies = pubsubContent.policies as Record<string, unknown>;
const { publications } = pubsubContent.fixtures;
const manual = pubsubContent.expected as unknown as Record<string, Record<string, unknown>[]>;
function wire(run: PubsubRun, change: Partial<PubsubRequest> = {}): PubsubRequest {
  return { id: 1, action: "process_next", fault: "none", messageId: null, run,
    sourceText: JSON.stringify(run.state.source_publications), policyText: JSON.stringify(policies.reference), ...change };
}
function accepted(result: PubsubReply): Extract<PubsubReply, { kind: "result" }> {
  assert.equal(result.kind, "result", JSON.stringify(result));
  return result as Extract<PubsubReply, { kind: "result" }>;
}

let actionStates = 0;
for (const scenario of pubsubContent.cases) {
  let run = emptyPubsubRun(scenario.source);
  for (const [i, step] of scenario.steps.entries()) {
    check(`manual full state / ${scenario.name} / ${i + 1}`, () => {
      const rule = "policy" in step ? step.policy : scenario.policy;
      const policy = typeof rule === "string" && Object.hasOwn(policies, rule) ? policies[rule] : rule;
      const source = "source" in step ? step.source : scenario.source;
      const { expected_status, expected_sink, expected_error_contains, ...state } = manual[scenario.name][i];
      const prior = structuredClone(run);
      const request = { ...wire(run), action: step.action, fault: step.fault,
        messageId: "message_id" in step ? step.message_id : null,
        sourceText: JSON.stringify(source),
        policyText: typeof policy === "string" ? policy : JSON.stringify(policy) };
      const result = execute(request);
      assert.deepEqual(run, prior, "worker input must remain unchanged");
      if (expected_error_contains) {
        assert.equal(result.kind, "error");
        if (result.kind !== "error") throw Error("Expected input rejection.");
        assert.ok(result.message.includes(String(expected_error_contains)), result.message);
      } else {
        const reply = accepted(result);
        if (expected_status) assert.equal(reply.trace.status, expected_status);
        if (expected_sink) assert.equal(reply.trace.sink_effect, expected_sink);
        run = reply.run;
      }
      assert.deepEqual(run.state, state);
      actionStates++;
    });
  }
}

const initial = emptyPubsubRun(publications);
const withCommit = accepted(execute(wire(initial))).run;
type Mutation = (value: Record<string, any>) => void;
const corruptions: [string, Mutation][] = [
  ["Boolean counter", s => { s.attempts.m1 = true; }],
  ["fractional counter", s => { s.attempts.m1 = 0.5; }],
  ["unsafe counter", s => { s.attempts.m1 = Number.MAX_SAFE_INTEGER + 1; }],
  ["missing counter", s => { delete s.attempts.m2; }],
  ["changed ledger payload", s => { s.ledger[0].amount_cents = 500; }],
  ["future commit provenance", s => { s.ledger[0].committed_from_ack_id = "a-m1-2"; }],
  ["duplicate commit provenance", s => { s.ledger.push({ ...s.ledger[0] }); }],
  ["future ACK receipt", s => { s.ack_history[0].ack_id = "a-m1-2"; }],
  ["wrong pending order", s => { s.pending.reverse(); }],
  ["orphan attempt", s => { s.attempts.m2 = 1; }],
  ["simultaneous expiry and delivery", s => { s.inflight = { message_id: "m2", ack_id: "a-m2-1" }; s.retry_for = "m2"; }],
  ["ACK set mismatch", s => { s.acked_message_ids = []; }]
];
for (const [name, change] of corruptions) {
  check(`state preflight before process, reset and cancel / ${name}`, () => {
    const malformed = structuredClone(withCommit);
    change(malformed.state);
    const saved = JSON.stringify(malformed);
    for (const action of ["process_next", "reset_confirmed", "cancel"] as const) {
      const result = execute(wire(malformed, { action }));
      assert.equal(result.kind, "error");
      if (result.kind === "error") assert.match(result.message, /^STATE:/);
      assert.equal(JSON.stringify(malformed), saved);
    }
  });
}
check("case-sensitive IDs, reserved object keys and Unicode sort order", () => {
  const rows = ["__proto__", "constructor", "💳", "Ｚ"].map((message_id, i) => ({
    message_id, producer: "shop", event_id: String(i), order_id: "order", amount_cents: 2_147_483_647
  }));
  let run = emptyPubsubRun(rows);
  for (const _row of rows) run = accepted(execute(wire(run))).run;
  assert.deepEqual(run.state.acked_message_ids, ["__proto__", "constructor", "Ｚ", "💳"]);
  assert.equal(run.state.ledger.reduce((sum, row) => sum + row.amount_cents, 0), 8_589_934_588);
});
check("UTF-8 editor, request and reply budgets count actual serialized bytes", () => {
  const sourceText = "é".repeat(GCP_EDITOR_BYTES / 2 + 1);
  const result = execute(wire(initial, { sourceText }));
  assert.equal(result.kind, "error");
  if (result.kind === "error") assert.match(result.message, /exceeds 60,000 bytes/);
  assert.throws(() => encodePubsub({ value: "é".repeat(GCP_REQUEST_BYTES / 2) }, GCP_REQUEST_BYTES, "request"), /RESOURCE:/);
  assert.throws(() => readPubsubReply(JSON.stringify({ id: 1, value: "é".repeat(GCP_RESULT_BYTES / 2) }), 1), /160,000 bytes/);
});
let finalBeforeByteLimit = 0;
check("forced redelivery grows real ACK and commit history to the byte limit without replacing accepted state", () => {
  const row: Publication = { message_id: "💳".repeat(40), producer: "🏬".repeat(40),
    event_id: "🧾".repeat(40), order_id: "🛒".repeat(40), amount_cents: 1 };
  const policyText = JSON.stringify(policies.no_dedup);
  let run = accepted(execute(wire(emptyPubsubRun([row]), { policyText }))).run;
  for (let i = 0; i < GCP_HISTORY_STEPS; i++) {
    const request = wire(run, { action: "force_redelivery", messageId: row.message_id, policyText });
    const before = JSON.stringify(run);
    const serialized = executePubsubRequest(JSON.stringify(request));
    const reply = JSON.parse(serialized) as PubsubReply;
    if (reply.kind === "error") {
      assert.match(reply.message, /RESOURCE: result and history exceeds 160,000 serialized bytes/);
      assert.equal(JSON.stringify(run), before);
      finalBeforeByteLimit = run.history.length;
      return;
    }
    assert.ok(byteLength(serialized) <= GCP_RESULT_BYTES);
    run = reply.run;
  }
  assert.fail("Expected an actual byte limit before the step limit.");
});
check("separate history count limit and explicit valid reset", () => {
  let run = emptyPubsubRun([publications[0]]);
  const policyText = JSON.stringify({ ackTiming: "after_write", dedupKey: "none" });
  while (run.history.length < GCP_HISTORY_STEPS) {
    const action = run.state.inflight ? "expire_current" : run.state.retry_for ? "retry_current" : "process_next";
    run = accepted(execute(wire(run, { action, policyText, fault: "sink_failure_before_write" }))).run;
  }
  const result = execute(wire(run, { action: "retry_current", policyText }));
  assert.equal(result.kind, "error");
  if (result.kind === "error") assert.match(result.message, /history is full/);
  assert.equal(accepted(execute(wire(run, { action: "reset_confirmed", policyText }))).run.history.length, 0);
});
check("saved empty drafts, trace, assistance and corrupt version rejection", () => {
  const session = initialPubsubSession();
  session.run = withCommit;
  session.draft.sourceText = "";
  session.draft.policyText = "";
  session.draft.hints = 2;
  session.draft.reviewed = true;
  const raw = writePubsubSave(session, "test-revision");
  assert.deepEqual(readPubsubSave(raw), session);
  assert.throws(() => readPubsubSave(raw.replace('"version":1', '"version":2')), /STATE:/);
  assert.throws(() => readPubsubSave(raw.replace('"m1":1', '"m1":true')), /STATE:/);
});

const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
let timer: { fn: () => void; ms: number } | undefined;
globalThis.setTimeout = ((fn: () => void, ms: number) => { timer = { fn, ms }; return 1; }) as unknown as typeof setTimeout;
globalThis.clearTimeout = (() => { timer = undefined; }) as typeof clearTimeout;
try {
  function driver() {
    const sent: string[] = [], outcomes: PubsubOutcome[] = [];
    let terminated = 0;
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null, onerror: null,
      postMessage: (value: string) => sent.push(value), terminate: () => { terminated++; }
    };
    const handle = startPubsubRun(wire(initial), outcome => outcomes.push(outcome), () => worker);
    return { sent, outcomes, terminated: () => terminated, handle,
      emit: (data: string) => worker.onmessage?.({ data } as MessageEvent) };
  }
  check("worker load budget uses 5 seconds and terminates", () => {
    const d = driver();
    assert.equal(timer?.ms, GCP_LOAD_MS);
    timer?.fn();
    assert.equal(d.outcomes[0].kind, "load-timeout");
    assert.equal(d.terminated(), 1);
  });
  check("worker readiness starts the independent 1-second execution budget", () => {
    const d = driver();
    d.emit("ready");
    d.emit("ready");
    assert.equal(timer?.ms, GCP_RUN_MS);
    assert.equal(d.sent.length, 1);
    timer?.fn();
    assert.equal(d.outcomes[0].kind, "execution-timeout");
    assert.equal(d.terminated(), 1);
  });
  check("wrong ID and late reply preserve confirmed state through cancellation", () => {
    const d = driver();
    d.emit("ready");
    d.emit(executePubsubRequest(JSON.stringify(wire(initial, { id: 7 }))));
    assert.equal(d.outcomes.length, 0);
    d.handle.cancel();
    d.emit(executePubsubRequest(d.sent[0]));
    assert.deepEqual(d.outcomes, [{ kind: "cancelled" }]);
    assert.equal(d.terminated(), 1);
  });
} finally {
  globalThis.setTimeout = realSet;
  globalThis.clearTimeout = realClear;
}
console.log(JSON.stringify({ status: "PASS", cases: pubsubContent.cases.length, actionStates,
  checks, finalBeforeByteLimit,
  limits: "Actual TypeScript serialized engine compared with authored manual states. Fake clocks verify controller timers. Actual browser evidence is separate." }, null, 2));
