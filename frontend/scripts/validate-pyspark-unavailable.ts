import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { ApiError, ApiTransportError, ApiDecodeError, validatePysparkScenario } from "../lib/api";

// Optional source path lets the same regression exercise the unmodified baseline.
const file = process.argv[2] ?? new URL("../components/labs/BrowserCodingLab.tsx", import.meta.url);
const source = ts.createSourceFile(String(file), fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const required = ["queryResultToBrowserTable", "runPysparkLab", "getAttemptKey", "requireLoginForValidation", "submitLab", "runSampleCheck", "ResultPanel", "MiniResultTable"];
const declarations = new Map<string, ts.FunctionDeclaration>();
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name && [...required, "pysparkUnavailableResult"].includes(node.name.text)) {
    assert(!declarations.has(node.name.text), `Ambiguous actual function ${node.name.text}`);
    declarations.set(node.name.text, node);
  }
  ts.forEachChild(node, visit);
}
visit(source);
for (const name of required) assert(declarations.has(name), `Missing actual function ${name}`);
const compiled = ts.transpile([...declarations.values()].map(node => node.getText(source)).join("\n"), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React
});

type Action = "sample" | "submit";
type Variant = "503" | "transport" | "decode" | "correct" | "wrong" | "401" | "403";
const code = "# Synthetic unchanged editor code\nresult_df = source";
const slug = "synthetic-pyspark-unavailable";
const token = "synthetic-member-token-no-access";
const privateError = "synthetic-private-response-detail";
const authMessage = "Synthetic access/session response";
let cases = 0;

function harness(variant: Variant, options: { member?: boolean; free?: boolean; locked?: boolean; workspaceMessage?: string; sql?: boolean } = {}) {
  const member = options.member ?? true;
  const state: any = {
    result: null, mode: null, running: false, workspaceMessage: options.workspaceMessage ?? "",
    progress: {}, remoteProgress: {}, authOpen: false,
    editorWrites: 0, focusCalls: 0, requests: [], attempts: [], saves: [], drafts: [], intents: [], usage: [], events: []
  };
  const savedDrafts = new Map([[slug, code]]);
  const focused = { id: "synthetic-action-trigger", focus: () => { state.focusCalls++; } };
  const selectedLab = {
    id: "synthetic-pyspark", slug, title: "Synthetic check", track: options.sql ? "sql" : "pyspark",
    validationMode: options.sql ? "sql" : "pyspark", isFree: options.free ?? true, tables: []
  };
  const pending = { slug, answer: code, key: "synthetic-existing-attempt-key" };
  const setter = (key: string) => (value: any) => { state[key] = typeof value === "function" ? value(state[key]) : value; };
  const context: any = {
    React, Error, TypeError, ApiError, ApiTransportError, ApiDecodeError,
    BrowserSqlError: class BrowserSqlError extends Error {},
    selectedLab, answer: code, track: selectedLab.track, isPythonIntro: false,
    isPremiumLocked: options.locked ?? false, persistenceReady: true, nextLab: null,
    draftSessionRef: { current: { conflicts: {} } }, pendingAttemptRef: { current: pending },
    authIntentKey: "synthetic-auth-intent", crypto: { randomUUID: () => "synthetic-attempt-id" },
    getCurrentUser: () => member ? { id: "synthetic-member" } : null,
    getAuthToken: () => member ? token : null,
    validatePysparkScenario,
    setResult: setter("result"), setResultMode: setter("mode"), setIsRunning: setter("running"),
    setWorkspaceMessage: setter("workspaceMessage"), setProgressMap: setter("progress"),
    setRemoteProgress: setter("remoteProgress"), setIsAuthOpen: setter("authOpen"),
    setPythonPhase: () => assert.fail("PySpark action changed Python phase"),
    setPythonError: () => assert.fail("PySpark action fabricated Python error feedback"),
    pythonIntroError: () => undefined, isSqlSalaryEntry: () => false,
    setAnswers: () => { state.editorWrites++; },
    saveLocalDraft: (id: string, value: string) => { state.drafts.push({ id, value }); savedDrafts.set(id, value); },
    rememberAuthIntent: (key: string, action: string) => state.intents.push({ key, action }),
    recordCodingLabAttempt: (...args: unknown[]) => { state.attempts.push(args); return { [slug]: { attempted: true } }; },
    saveLearnerAttempt: async (...args: any[]) => {
      state.saves.push(args);
      return { item: { latest_result: args[3].result, completed: args[3].passed } };
    },
    codingProgressFromRemote: (item: unknown) => item,
    sendUsageEvent: (name: string, data: unknown) => state.usage.push({ name, data }),
    trackEvent: (name: string, data: unknown) => state.events.push({ name, data }),
    runSqlLab: async () => { throw new ApiError("Synthetic SQL service failure", 503); },
    runReadOnlySql: async () => { throw new ApiError("Synthetic SQL service failure", 503); },
    document: { activeElement: focused }, window: {},
    // An old baseline has no helper; its unchanged handlers still run and fail the outage assertion.
    pysparkUnavailableResult: () => undefined
  };
  vm.createContext(context);
  vm.runInContext(compiled, context);
  globalThis.fetch = async (input, init) => {
    state.requests.push({ url: String(input), method: init?.method, authorization: new Headers(init?.headers).get("Authorization"), body: JSON.parse(String(init?.body)) });
    if (variant === "transport") throw new TypeError(privateError);
    if (variant === "decode") return new Response("synthetic invalid JSON", { status: 200 });
    if (variant === "503") return new Response(JSON.stringify({ detail: privateError }), { status: 503 });
    if (variant === "401" || variant === "403") return new Response(JSON.stringify({ detail: authMessage }), { status: Number(variant) });
    const passed = variant === "correct";
    return new Response(JSON.stringify({
      passed, message: "Synthetic executed answer comparison", tests: [{
        name: "Synthetic executed check", passed, message: "Synthetic finite check",
        actual_output: { columns: ["value"], rows: [[7]] },
        expected_output: { columns: ["value"], rows: [[passed ? 7 : 8]] }
      }]
    }), { status: 200 });
  };
  return {
    state, context, pending,
    run: (action: Action) => action === "sample" ? context.runSampleCheck() : context.submitLab(),
    html: () => renderToStaticMarkup(context.ResultPanel({ result: state.result, mode: state.mode })),
    assertEditor: () => {
      assert.equal(context.answer, code); assert.equal(savedDrafts.get(slug), code);
      assert.equal(state.editorWrites, 0); assert.equal(context.document.activeElement, focused); assert.equal(state.focusCalls, 0);
    },
    assertRequest: (action: Action, authenticated = member) => {
      assert.equal(state.requests.length, 1, "Exactly the existing request, with no automatic retry");
      const request = state.requests[0];
      assert(request.url.endsWith(`/api/v1/pyspark/validate/${slug}`)); assert.equal(request.method, "POST");
      assert.equal(request.authorization, authenticated ? `Bearer ${token}` : null);
      assert.deepEqual(request.body, { code, mode: action === "sample" ? "sample" : "hidden" });
    }
  };
}

async function main() {
  const originalFetch = globalThis.fetch;
  try {
    for (const action of ["sample", "submit"] as const) {
      for (const variant of ["503", "transport", "decode"] as const) {
        const previousBanner = variant === "transport" ? "Correct. Prior answer passed." : "Not correct yet. Prior answer needs work.";
        const test = harness(variant, { workspaceMessage: previousBanner });
        await test.run(action); cases++;
        assert.equal(test.state.result?.status, "unavailable", `${action}/${variant}: unavailable is not an incorrect answer`);
        assert.equal(test.state.result.passed, null);
        assert.match(test.state.result.message, /temporarily unavailable/i);
        assert.match(test.state.result.message, /No result is available for this check/i);
        assert.match(test.state.result.message, /try again shortly/i);
        assert(!test.state.result.message.includes(privateError));
        for (const key of ["pysparkResults", "pythonResults", "sqlResults", "score"]) assert.equal(test.state.result[key], undefined);
        assert.equal(test.state.workspaceMessage, "", "A prior graded banner must not contradict unavailable feedback");
        assert.equal(test.state.attempts.length, 0); assert.equal(test.state.saves.length, 0); assert.equal(test.state.drafts.length, 0);
        assert.equal(test.context.pendingAttemptRef.current, test.pending);
        assert(!test.state.usage.some((event: any) => /submitted|completed/.test(event.name)));
        assert(!test.state.events.some((event: any) => /submitted|completed/.test(event.name)));
        assert.equal(test.state.running, false); test.assertRequest(action); test.assertEditor();
        const html = test.html(); assert.match(html, /Checking unavailable/); assert.match(html, /try again shortly/);
        assert(!/needs work|Wrong answer|Synthetic executed check|>fail<|>pass</i.test(html));
      }
      for (const variant of ["wrong", "correct"] as const) {
        const test = harness(variant); await test.run(action); cases++;
        assert.equal(test.state.result.passed, variant === "correct"); assert.equal(test.state.result.status, undefined);
        assert.equal(test.state.result.pysparkResults.length, 1); test.assertRequest(action); test.assertEditor();
        assert.match(test.html(), new RegExp(action === "sample" ? `Visible sample ${variant === "correct" ? "passed" : "needs work"}` : `Full validation ${variant === "correct" ? "passed" : "needs work"}`));
        assert(!/Checking unavailable|temporarily unavailable/.test(test.html()));
        assert.equal(test.state.attempts.length, action === "submit" ? 1 : 0);
        assert.equal(test.state.saves.length, action === "submit" ? 1 : 0);
        if (action === "submit") {
          assert.equal(test.state.attempts[0][2], variant === "correct");
          assert.equal(test.state.saves[0][0], token); assert.equal(test.state.saves[0][3].answer, code);
          assert.equal(test.state.saves[0][3].passed, variant === "correct");
          assert.equal(test.state.saves[0][3].idempotency_key, "synthetic-existing-attempt-key");
        }
      }
      for (const variant of ["401", "403"] as const) {
        const test = harness(variant, { workspaceMessage: "Existing access context" }); await test.run(action); cases++;
        assert.equal(test.state.result.status, undefined); assert.equal(test.state.result.message, authMessage);
        assert(!/temporarily unavailable/.test(test.html())); assert.equal(test.state.workspaceMessage, "Existing access context");
        assert.equal(test.state.attempts.length, 0); assert.equal(test.state.saves.length, 0); test.assertRequest(action); test.assertEditor();
      }
      const sql = harness("503", { sql: true, workspaceMessage: "Existing SQL context" }); await sql.run(action); cases++;
      assert.equal(sql.state.result.message, "Synthetic SQL service failure"); assert.equal(sql.state.result.status, undefined);
      assert.equal(sql.state.workspaceMessage, "Existing SQL context"); assert.equal(sql.state.requests.length, 0); sql.assertEditor();
    }
    const guestSubmit = harness("correct", { member: false }); await guestSubmit.run("submit"); cases++;
    assert.equal(guestSubmit.state.requests.length, 0); assert.equal(guestSubmit.state.authOpen, true);
    assert.equal(guestSubmit.state.drafts.length, 1); assert.equal(guestSubmit.state.intents[0].action, "submit");
    assert.equal(guestSubmit.state.result, null); guestSubmit.assertEditor();
    const guestSample = harness("correct", { member: false }); await guestSample.run("sample"); cases++;
    assert.equal(guestSample.state.result.passed, true); guestSample.assertRequest("sample", false); guestSample.assertEditor();
    const premiumGuest = harness("correct", { member: false, free: false }); await premiumGuest.run("sample"); cases++;
    assert.equal(premiumGuest.state.requests.length, 0); assert.equal(premiumGuest.state.authOpen, true);
    assert.equal(premiumGuest.state.intents[0].action, "run"); assert.equal(premiumGuest.state.drafts.length, 1); premiumGuest.assertEditor();
    const premiumMember = harness("correct", { free: false }); await premiumMember.run("sample"); cases++;
    assert.equal(premiumMember.state.result.passed, true); premiumMember.assertRequest("sample"); premiumMember.assertEditor();
    const locked = harness("correct", { free: false, locked: true }); await locked.run("sample"); cases++;
    assert.equal(locked.state.requests.length, 0); assert.equal(locked.state.result, null); locked.assertEditor();
    console.log(JSON.stringify({
      action_cases: cases, actual_handlers_and_renderer: true, http503_transport_decode_ungraded: true,
      stale_graded_banner_cleared: true, no_fabricated_tests_or_outage_attempt_save: true,
      actual_wrong_correct_sample_full_preserved: true, request_payload_auth_and_no_auto_retry_preserved: true,
      guest_member_premium_boundaries_preserved: true, http401_403_and_sql_scope_preserved: true,
      editor_draft_and_focus_references_unchanged: true,
      scope: "Synthetic real API wrapper + actual extracted action handlers and server-rendered result panel; browser focus and account durability are not proved."
    }));
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
