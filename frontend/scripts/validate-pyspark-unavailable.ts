import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { ApiError, ApiTransportError, ApiDecodeError, validatePysparkScenario } from "../lib/api";
import { isSqlSalaryEntry } from "../lib/sql-workspace-clarity";
import { isPythonIntroLab } from "../lib/python-intro-feedback";

// Optional source path lets the same regression exercise the unmodified baseline.
const file = process.argv[2] ?? new URL("../components/labs/BrowserCodingLab.tsx", import.meta.url);
const source = ts.createSourceFile(String(file), fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const required = ["queryResultToBrowserTable", "runPysparkLab", "getAttemptKey", "requireLoginForValidation", "submitLab", "runSampleCheck", "ResultPanel", "MiniResultTable"];
const declarations = new Map<string, ts.FunctionDeclaration>();
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name && [...required, "pysparkUnavailableResult", "clearPysparkGradingMessage"].includes(node.name.text)) {
    assert(!declarations.has(node.name.text), `Ambiguous actual function ${node.name.text}`);
    declarations.set(node.name.text, node);
  }
  ts.forEachChild(node, visit);
}
visit(source);
for (const name of required) assert(declarations.has(name), `Missing actual function ${name}`);

// Inventory the actual graded constructors once. The persistence warning itself is not a grade.
type Condition = { expression: string; truthy: boolean };
type GradedConstructor = { name: string; suffix: string; conditions: Condition[]; attemptSaveNotice: boolean; pysparkReachable: boolean };
function matchingNodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const collect = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, collect); };
  collect(root); return found;
}
function isPassedResult(node: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
    && node.expression.text === "nextResult" && node.name.text === "passed";
}
function workspaceArgument(statement: ts.Statement): ts.Expression {
  const calls = matchingNodes(statement, (node): node is ts.CallExpression => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === "setWorkspaceMessage");
  assert.equal(calls.length, 1, "Each graded branch must have one workspace constructor");
  assert.equal(calls[0].arguments.length, 1); return calls[0].arguments[0];
}
function constructorLeaf(expression: ts.Expression, name: string, conditions: Condition[], pysparkReachable: boolean): GradedConstructor {
  if (ts.isStringLiteralLike(expression)) return { name, suffix: expression.text, conditions, attemptSaveNotice: false, pysparkReachable };
  assert(ts.isTemplateExpression(expression), `${name}: unexpected graded constructor shape`);
  assert.equal(expression.head.text, ""); assert.equal(expression.templateSpans.length, 1);
  const span = expression.templateSpans[0];
  assert(ts.isIdentifier(span.expression) && span.expression.text === "attemptSaveNotice");
  return { name, suffix: span.literal.text, conditions, attemptSaveNotice: true, pysparkReachable };
}
const gradedBranches = matchingNodes(declarations.get("submitLab")!, (node): node is ts.IfStatement => ts.isIfStatement(node) && isPassedResult(node.expression));
assert.equal(gradedBranches.length, 1, "Inventory the unique actual result-dependent Submit branch");
const positiveConstructors: GradedConstructor[] = [];
function inventoryPositive(expression: ts.Expression, conditions: Condition[] = []): void {
  if (ts.isParenthesizedExpression(expression)) return inventoryPositive(expression.expression, conditions);
  if (ts.isConditionalExpression(expression)) {
    const condition = expression.condition.getText(source).replace(/\s+/g, "");
    inventoryPositive(expression.whenTrue, [...conditions, { expression: condition, truthy: true }]);
    inventoryPositive(expression.whenFalse, [...conditions, { expression: condition, truthy: false }]);
    return;
  }
  const yes = (condition: string) => conditions.some(item => item.expression === condition && item.truthy);
  const name = yes("selectedLab.practiceGuidance") ? "guidance_correct"
    : yes("isSqlSalaryEntry(selectedLab)") ? "sql_salary_correct"
      : yes("isPythonIntro") ? "python_intro_correct"
        : yes("nextLab") ? "generic_correct_with_next" : "generic_correct_without_next";
  positiveConstructors.push(constructorLeaf(expression, name, conditions, name !== "sql_salary_correct" && name !== "python_intro_correct"));
}
inventoryPositive(workspaceArgument(gradedBranches[0].thenStatement));
assert.deepEqual(positiveConstructors.map(item => item.name), ["guidance_correct", "sql_salary_correct", "python_intro_correct", "generic_correct_with_next", "generic_correct_without_next"]);
const negativeBranch = gradedBranches[0].elseStatement;
assert(negativeBranch && ts.isIfStatement(negativeBranch) && ts.isBinaryExpression(negativeBranch.expression));
assert(isPassedResult(negativeBranch.expression.left) && negativeBranch.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
  && negativeBranch.expression.right.kind === ts.SyntaxKind.FalseKeyword);
const inventory = [constructorLeaf(workspaceArgument(negativeBranch.thenStatement), "wrong", [{ expression: "nextResult.passed===false", truthy: true }], true), ...positiveConstructors];
assert.equal(inventory.length, 6); assert.equal(inventory.filter(item => item.pysparkReachable).length, 4);
const byName = new Map(inventory.map(item => [item.name, item]));

function assertRequiredTrack(helperFile: string, name: string, expected: string) {
  const helperSource = ts.createSourceFile(helperFile, fs.readFileSync(new URL(helperFile, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const helpers = matchingNodes(helperSource, (node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(helpers.length, 1);
  const returns = helpers[0].body!.statements.filter(ts.isReturnStatement); assert.equal(returns.length, 1);
  const requiresTrack = (expression: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(expression)) return requiresTrack(expression.expression);
    if (!ts.isBinaryExpression(expression)) return false;
    if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return requiresTrack(expression.left) || requiresTrack(expression.right);
    return expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      && ts.isPropertyAccessExpression(expression.left) && expression.left.name.text === "track"
      && ts.isIdentifier(expression.left.expression) && expression.left.expression.text === "lab"
      && ts.isStringLiteral(expression.right) && expression.right.text === expected;
  };
  assert(returns[0].expression && requiresTrack(returns[0].expression), `${name} must require its actual non-PySpark track`);
}
assertRequiredTrack("../lib/sql-workspace-clarity.ts", "isSqlSalaryEntry", "sql");
assertRequiredTrack("../lib/python-intro-feedback.ts", "isPythonIntroLab", "python");
const introBindings = matchingNodes(source, (node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "isPythonIntro");
assert.equal(introBindings.length, 1);
assert(introBindings[0].initializer && ts.isCallExpression(introBindings[0].initializer)
  && ts.isIdentifier(introBindings[0].initializer.expression) && introBindings[0].initializer.expression.text === "isPythonIntroLab");

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

function harness(variant: Variant, options: { member?: boolean; free?: boolean; locked?: boolean; workspaceMessage?: string; sql?: boolean; practiceGuidance?: boolean; saveFailure?: boolean; nextLab?: boolean } = {}) {
  const member = options.member ?? true;
  const state: any = {
    result: null, mode: null, running: false, workspaceMessage: options.workspaceMessage ?? "",
    progress: {}, remoteProgress: {}, authOpen: false, workspaceMessages: [],
    editorWrites: 0, focusCalls: 0, requests: [], attempts: [], saves: [], drafts: [], intents: [], usage: [], events: []
  };
  const savedDrafts = new Map([[slug, code]]);
  const focused = { id: "synthetic-action-trigger", focus: () => { state.focusCalls++; } };
  const selectedLab = {
    id: "synthetic-pyspark", slug, title: "Synthetic check", track: options.sql ? "sql" : "pyspark",
    validationMode: options.sql ? "sql" : "pyspark", isFree: options.free ?? true, tables: [],
    ...(options.practiceGuidance ? { practiceGuidance: {} } : {})
  };
  const pending = { slug, answer: code, key: "synthetic-existing-attempt-key" };
  const setter = (key: string) => (value: any) => { state[key] = typeof value === "function" ? value(state[key]) : value; };
  const context: any = {
    React, Error, TypeError, ApiError, ApiTransportError, ApiDecodeError,
    BrowserSqlError: class BrowserSqlError extends Error {},
    selectedLab, answer: code, track: selectedLab.track, isPythonIntro: isPythonIntroLab(selectedLab as any),
    isPremiumLocked: options.locked ?? false, persistenceReady: true, nextLab: options.nextLab ? { slug: "synthetic-next-lab" } : null,
    draftSessionRef: { current: { conflicts: {} } }, pendingAttemptRef: { current: pending },
    authIntentKey: "synthetic-auth-intent", crypto: { randomUUID: () => "synthetic-attempt-id" },
    getCurrentUser: () => member ? { id: "synthetic-member" } : null,
    getAuthToken: () => member ? token : null,
    validatePysparkScenario,
    setResult: setter("result"), setResultMode: setter("mode"), setIsRunning: setter("running"),
    setWorkspaceMessage: (value: any) => { setter("workspaceMessage")(value); state.workspaceMessages.push(state.workspaceMessage); }, setProgressMap: setter("progress"),
    setRemoteProgress: setter("remoteProgress"), setIsAuthOpen: setter("authOpen"),
    setPythonPhase: () => assert.fail("PySpark action changed Python phase"),
    setPythonError: () => assert.fail("PySpark action fabricated Python error feedback"),
    pythonIntroError: () => undefined, isSqlSalaryEntry,
    setAnswers: () => { state.editorWrites++; },
    saveLocalDraft: (id: string, value: string) => { state.drafts.push({ id, value }); savedDrafts.set(id, value); },
    rememberAuthIntent: (key: string, action: string) => state.intents.push({ key, action }),
    recordCodingLabAttempt: (...args: unknown[]) => { state.attempts.push(args); return { [slug]: { attempted: true } }; },
    saveLearnerAttempt: async (...args: any[]) => {
      state.saves.push(args);
      if (options.saveFailure) throw new Error("Synthetic account-save failure");
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
        const previousBanner = byName.get(variant === "transport" ? "generic_correct_without_next" : "wrong")!.suffix;
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
      const accountWarning = "Result shown, but it could not be saved to your account. Please retry submit.";
      const accountNotice = harness("503", { workspaceMessage: accountWarning });
      await accountNotice.run(action); cases++;
      assert.equal(accountNotice.state.result.status, "unavailable");
      assert.equal(accountNotice.state.result.passed, null);
      assert.equal(accountNotice.state.workspaceMessage, accountWarning, "An outage must preserve the existing account-save warning");
      assert.equal(accountNotice.state.attempts.length, 0); assert.equal(accountNotice.state.saves.length, 0);
      assert.equal(accountNotice.state.drafts.length, 0); assert.equal(accountNotice.context.pendingAttemptRef.current, accountNotice.pending);
      assert.equal(accountNotice.state.running, false); accountNotice.assertRequest(action); accountNotice.assertEditor();
      assert.match(accountNotice.html(), /Checking unavailable/);
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
    // Capture each reachable predecessor through the actual Submit handler, including its save-warning assembly.
    const predecessors = [];
    for (const specification of [
      { name: "wrong", variant: "wrong", practiceGuidance: true, saveFailure: true, nextLab: false },
      { name: "guidance_correct", variant: "correct", practiceGuidance: true, saveFailure: true, nextLab: false },
      { name: "generic_correct_without_next", variant: "correct", practiceGuidance: false, saveFailure: false, nextLab: false },
      { name: "generic_correct_with_next", variant: "correct", practiceGuidance: false, saveFailure: false, nextLab: true }
    ] as const) {
      const prior = harness(specification.variant, specification); await prior.run("submit"); cases++;
      const constructor = byName.get(specification.name)!;
      const message = prior.state.workspaceMessage as string;
      assert(message.endsWith(constructor.suffix), `${specification.name}: actual Submit must emit the inventoried constructor`);
      const retainedMessage = message.slice(0, -constructor.suffix.length).trimEnd();
      if (specification.saveFailure) {
        assert(retainedMessage.length > 0); assert(prior.state.workspaceMessages.includes(retainedMessage), "Retained notice must be an actual preceding save warning");
      } else assert.equal(retainedMessage, "", "Generic correct predecessors are actual bare messages");
      assert.equal(prior.state.result.passed, specification.variant === "correct");
      assert.equal(prior.state.attempts.length, 1); assert.equal(prior.state.saves.length, 1);
      prior.assertRequest("submit"); prior.assertEditor();
      predecessors.push({ ...specification, constructor, message, retainedMessage });
    }
    for (const predecessor of predecessors) {
      for (const action of ["sample", "submit"] as const) {
        for (const variant of ["503", "transport", "decode"] as const) {
          for (const prefix of predecessor.saveFailure ? ["", "Other workspace context. "] : [""]) {
          const test = harness(variant, { workspaceMessage: prefix + predecessor.message, practiceGuidance: predecessor.practiceGuidance, saveFailure: predecessor.saveFailure, nextLab: predecessor.nextLab });
          const progressBefore = { [slug]: { previous: "synthetic progress" } };
          const remoteBefore = { [slug]: { previous: "synthetic remote progress" } };
          test.state.progress = progressBefore; test.state.remoteProgress = remoteBefore;
          await test.run(action); cases++;
          assert.equal(test.state.result.status, "unavailable"); assert.equal(test.state.result.passed, null);
          assert.equal(test.state.workspaceMessage, prefix + predecessor.retainedMessage, `${predecessor.name}/${action}/${variant}: remove only the actual grade, retain warning/context`);
          assert(!test.state.workspaceMessage.includes(predecessor.constructor.suffix));
          for (const key of ["pysparkResults", "pythonResults", "sqlResults", "score"]) assert.equal(test.state.result[key], undefined);
          assert.equal(test.state.attempts.length, 0); assert.equal(test.state.saves.length, 0); assert.equal(test.state.drafts.length, 0);
          assert.equal(test.state.progress, progressBefore); assert.equal(test.state.remoteProgress, remoteBefore);
          assert.equal(test.context.pendingAttemptRef.current, test.pending);
          assert(!test.state.usage.some((event: any) => /submitted|completed/.test(event.name)));
          assert(!test.state.events.some((event: any) => /submitted|completed/.test(event.name)));
          assert.equal(test.state.running, false); test.assertRequest(action); test.assertEditor();
          const html = test.html(); assert.match(html, /Checking unavailable/); assert.match(html, /try again shortly/);
          assert(!/needs work|Wrong answer|Synthetic executed check|>fail<|>pass</i.test(html));
          }
        }
      }
    }
    // Deliberately after transitions: the old parent must reproduce the missing guidance case first.
    const cleanup = declarations.get("clearPysparkGradingMessage"); assert(cleanup);
    const suffixArrays = matchingNodes(cleanup, (node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name) && node.name.text === "gradedSuffixes");
    assert.equal(suffixArrays.length, 1); assert(suffixArrays[0].initializer && ts.isArrayLiteralExpression(suffixArrays[0].initializer));
    const helperSuffixes = suffixArrays[0].initializer.elements.map(element => { assert(ts.isStringLiteralLike(element)); return element.text; });
    const reachableSuffixes = inventory.filter(item => item.pysparkReachable).map(item => item.suffix);
    assert.equal(new Set(helperSuffixes).size, 4); assert.equal(helperSuffixes.length, 4);
    assert.deepEqual([...helperSuffixes].sort(), [...reachableSuffixes].sort(), "Cleanup must match exactly the four inventory-derived PySpark constructors");
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
    for (const [action, message] of [
      ["sample", "Correct. This unrelated workspace context is not an emitted grading message."],
      ["submit", "Not correct yet. This unrelated workspace context is not an emitted grading message."]
    ] as const) {
      const test = harness("503", { workspaceMessage: message }); await test.run(action); cases++;
      assert.equal(test.state.workspaceMessage, message, "Unmatched context must remain byte-for-byte unchanged");
      assert.equal(test.state.result.status, "unavailable"); assert.equal(test.state.result.passed, null);
      assert.equal(test.state.attempts.length, 0); assert.equal(test.state.saves.length, 0); assert.equal(test.state.drafts.length, 0);
      assert.equal(test.context.pendingAttemptRef.current, test.pending); test.assertRequest(action); test.assertEditor();
    }
    assert.equal(cases, 65, "23 retained controls +4 actual predecessors +36 transitions +2 unmatched-context controls");
    console.log(JSON.stringify({
      action_cases: cases, actual_handlers_and_renderer: true, http503_transport_decode_ungraded: true,
      graded_constructor_inventory: { total: inventory.length, pyspark_reachable: inventory.filter(item => item.pysparkReachable).map(item => item.name), excluded_by_actual_track_guards: inventory.filter(item => !item.pysparkReachable).map(item => item.name) },
      exact_four_suffixes_match_actual_inventory: true, all_actual_predecessors_and_unmatched_context_preserved: true,
      stale_graded_banner_cleared: true, existing_account_save_warning_preserved: true,
      actual_prior_submit_combined_warning_suffix_removed_only: true,
      no_fabricated_tests_or_outage_attempt_save: true,
      actual_wrong_correct_sample_full_preserved: true, request_payload_auth_and_no_auto_retry_preserved: true,
      guest_member_premium_boundaries_preserved: true, http401_403_and_sql_scope_preserved: true,
      editor_draft_and_focus_references_unchanged: true,
      scope: "Synthetic real API wrapper + actual extracted action handlers and server-rendered result panel; browser focus and account durability are not proved."
    }));
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
