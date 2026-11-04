import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { getCodingLabs } from "../lib/coding-labs";
import { isPythonIntroLab, isPythonIntroStarter, pythonIntroError, pythonIntroSampleSuccess } from "../lib/python-intro-feedback";

async function main() {
  const labs = (["sql", "python", "pyspark"] as const).flatMap((track) => getCodingLabs(track));
  const intro = labs.find((lab) => lab.id === "python-coding-001")!;
  assert(intro); assert.deepEqual(labs.filter(isPythonIntroLab).map((lab) => lab.id), [intro.id]);
  assert.deepEqual(intro.testCases, [{ name: "basic", args: ["pipeline"], expected: "enilepip" }]);
  assert(isPythonIntroStarter(intro, intro.starterCode));
  assert(!isPythonIntroStarter(intro, ""));
  assert(!isPythonIntroStarter(intro, intro.starterCode + "\n# learner edit"));
  const unfinished = pythonIntroError(intro, intro.starterCode, "checking", new Error("Traceback\nNotImplementedError"))!;
  assert.equal(unfinished.heading, "Starter not implemented yet");
  assert(!/passed|unavailable|outage/i.test(unfinished.message));
  for (const code of ["", "def reverse_a_string(s):\n    raise NotImplementedError('my own exception')", intro.starterCode + "\n# learner edit"]) {
    const correction = pythonIntroError(intro, code, "checking", new Error("Traceback\nNotImplementedError: my own exception"))!;
    assert.equal(correction.heading, "Python needs a correction"); assert(correction.message.includes("Run sample"));
    assert(!/starter|SQL|query|unavailable/i.test(correction.message));
  }
  for (const exception of ["SyntaxError: expected ':'", "ZeroDivisionError: division by zero"]) {
    const correction = pythonIntroError(intro, "edited Python", "checking", new Error("Traceback\n" + exception))!;
    assert(correction.message.startsWith(exception)); assert.equal(correction.heading, "Python needs a correction");
  }
  const unavailable = pythonIntroError(intro, intro.starterCode, "preparing", new Error("NotImplementedError"))!;
  assert.equal(unavailable.heading, "Python checking unavailable");
  assert(unavailable.message.includes("confirm a successful device-save message before reloading"));
  assert(unavailable.message.includes("If saving fails, copy your code"));
  assert(!/wrong|incorrect|saved to your account/i.test(unavailable.message));
  assert.equal(pythonIntroError(intro, intro.starterCode, undefined, new Error("unknown phase")), undefined);
  for (const change of [{ id: "other" }, { slug: "other" }, { isFree: false }, { serverValidation: "python" as const }, { testCases: [...intro.testCases!, ...intro.testCases!] }, { starterCode: "new starter" }]) {
    const other = { ...intro, ...change }; assert(!isPythonIntroLab(other));
    assert.equal(pythonIntroError(other, other.starterCode, "preparing", new Error("error")), undefined);
  }
  assert(pythonIntroSampleSuccess(false).includes("Sign in"));
  assert(!pythonIntroSampleSuccess(true).includes("Sign in"));
  assert(!/hidden|edge-case|general correctness/.test(pythonIntroSampleSuccess(false)));

  // Exercise the actual private runner functions without changing their evaluator.
  const file = new URL("../components/labs/BrowserCodingLab.tsx", import.meta.url);
  const source = ts.createSourceFile(String(file), fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ["loadScript", "getPyodide", "buildPythonHarness", "runPythonLab"];
  const functions = source.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? "")).map((node) => node.getText(source));
  assert.equal(functions.length, 4);
  const compiled = ts.transpile(functions.join("\n"), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS });
  let runnerCalls = 0, serverCalls = 0, receivedCode = "";
  const context: any = { window: {}, document: {}, validatePythonLab: async (...args: unknown[]) => { serverCalls++; return { passed: true, tests: [], args }; } };
  vm.createContext(context); vm.runInContext(compiled, context);
  const result = [{ name: "basic", passed: true, actual: "enilepip", expected: "enilepip" }];
  context.window.__dataFoundryPyodide = Promise.resolve({ runPythonAsync: async (code: string) => { runnerCalls++; receivedCode = code; return JSON.stringify(result); } });
  const phases: string[] = [];
  const passed = await context.runPythonLab(intro, intro.solutionCode, intro.testCases, "sample", null, (phase: string) => phases.push(phase));
  assert.deepEqual(phases, ["preparing", "checking"]); assert.equal(passed.passed, true); assert.equal(runnerCalls, 1);
  assert.equal(receivedCode, intro.solutionCode + "\n\n" + context.buildPythonHarness(intro, intro.testCases));
  context.window.__dataFoundryPyodide = Promise.resolve({ runPythonAsync: async () => JSON.stringify([{ ...result[0], passed: false, actual: "pipeline" }]) });
  assert.equal((await context.runPythonLab(intro, intro.solutionCode, intro.testCases)).passed, false);
  let preparations = 0;
  const loadFailure = new Error("synthetic initialization unavailable");
  delete context.window.__dataFoundryPyodide;
  context.document = { querySelector: () => null, createElement: () => ({}), head: { appendChild: (script: any) => script.onload() } };
  context.window.loadPyodide = async () => { preparations++; throw loadFailure; };
  const failedPhases: string[] = [];
  await assert.rejects(() => context.runPythonLab(intro, intro.solutionCode, intro.testCases, "sample", null, (phase: string) => failedPhases.push(phase)), (error) => error === loadFailure);
  await assert.rejects(() => context.runPythonLab(intro, intro.solutionCode, intro.testCases), (error) => error === loadFailure);
  assert.deepEqual(failedPhases, ["preparing"]); assert.equal(preparations, 1, "cached loader rejection remains cached; no automatic/reset retry");
  await context.runPythonLab({ ...intro, serverValidation: "python" }, intro.solutionCode, intro.testCases, "hidden", "synthetic-token");
  assert.equal(serverCalls, 1, "existing authenticated server-validation route is preserved");
  console.log(JSON.stringify({ only_scoped_existing_lab: true, existing_case_unchanged: true, exact_starter_and_edited_empty_syntax_runtime_distinctions: true, known_phase_and_safe_save_reload_copy: true, actual_runner_phase_observation: true, evaluator_input_and_pass_fail_unchanged: true, cached_rejection_no_reset_or_automatic_retry: true, server_route_preserved: true }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
