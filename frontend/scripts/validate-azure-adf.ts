import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeAdfRequest, ADF_LOAD_MS, ADF_RUN_MS, AZURE_MANIFEST, type AdfConfirmed, type AdfCapture, type AdfFault, type AdfRequest, type AdfResult, type AdfRow } from "../lib/azure-adf";
import { adfContent, adfConfigs } from "../lib/azure-adf-content";
import { initialAdfSession, changeAdfDraft, beginAdfAction, finishAdfAction, adfRequest, parseAdfSession, serializeAdfSession, prettyAdf } from "../lib/azure-adf-state";
import { startAdfRun, type AdfWorker, type AdfOutcome } from "../lib/azure-adf-runner";

type CaseStep = { config: string; start_target: string; checkpoint: number; captured_lower: number; captured_upper: number | null; source: string; fault: string | null };
const cases = adfContent.cases as Record<string, CaseStep[]>;
const expected = adfContent.expected.cases as Record<string, Record<string, unknown>[]>;
const states = adfContent.fixtures.target_states as Record<string, number[][]>;
const clone = <T,>(v: T): T => structuredClone(v);
const checks: string[] = [], evidence: unknown[] = [];
function check(name: string, f: () => void) { f(); checks.push(name); }
function source(name: string, atCapture = false): number[][] {
  const f = adfContent.fixtures;
  if (name === "empty") return [];
  if (name === "wrong_key") return clone(atCapture ? f.wrong_key_fixture.source_at_upper_lookup : f.wrong_key_fixture.source_at_copy);
  if (!atCapture && (name === "duplicate_source_order_id" || name === "invalid_integer")) return clone(f.invalid_fixtures[name]);
  return clone(atCapture ? name === "next" ? f.source_at_next_upper_lookup : f.source_at_upper_lookup : f.source_at_copy);
}
function request(config: unknown, state: AdfConfirmed, bounds: AdfCapture | null, copy = source("normal"), fault: AdfFault = "none", capture = source("normal", true)): AdfRequest {
  return { id: 1, action: "run", configText: prettyAdf(config), captureText: prettyAdf(capture), copyText: prettyAdf(copy), confirmed: clone(state), captured: clone(bounds), fault };
}
const initial = () => ({ target_rows: clone(states.initial) as AdfRow[], checkpoint: 100 });
const bounds = () => ({ lower: 100, upper: 104, capture_rows: clone(source("normal", true)) as AdfRow[] });

// Separate row-map/dependency oracle: no feature simulator, parser, selection or transition helper is called.
function independent(config: any, rows: number[][], state: AdfConfirmed, b: AdfCapture, fault: string) {
  const activities = new Map(config.activities.map((a: any) => [a.name, a]));
  const old: any = activities.get("LookupOld"), next: any = activities.get("LookupNew"), copy: any = activities.get("CopyOrders"), advance: any = activities.get("AdvanceWatermark");
  const numeric = (n: unknown, minimum: number) => typeof n === "number" && Number.isInteger(n) && n >= minimum && n <= 2147483647;
  const ids = new Set<number>();
  for (const r of rows) { if (!Array.isArray(r) || r.length !== 3 || !numeric(r[0], 0) || !numeric(r[1], 1) || !numeric(r[2], 0) || ids.has(r[0])) return null; ids.add(r[0]); }
  if (typeof old.typeProperties.firstRowOnly !== "boolean" || typeof next.typeProperties.firstRowOnly !== "boolean") return null;
  const pred = config.simulatorPredicate;
  const path = (name: string, field: string, first: boolean) => `@activity('${name}').output.${first ? "firstRow" : "value[0]"}.${field}`;
  if (pred.lowerExpression !== path("LookupOld", "WatermarkValue", old.typeProperties.firstRowOnly) || pred.upperExpression !== path("LookupNew", "NewWatermarkValue", next.typeProperties.firstRowOnly)) return null;
  if (copy.typeProperties.sink.upsertSettings?.keys && JSON.stringify(copy.typeProperties.sink.upsertSettings.keys) !== '["order_id"]') return null;
  if (b.lower !== state.checkpoint || b.upper !== null && b.upper < b.lower) return null;
  const target = new Map(state.target_rows.map(row => [row[0], clone(row)]));
  if (b.upper === null) return { selected_rows: [], committed_rows: [], target_rows: [...target.values()].sort((a, z) => a[0] - z[0]), checkpoint: state.checkpoint, copy_status: "Skipped", advance_status: "Skipped" };
  const selected = rows.filter(row => (pred.lowerOperator === ">" ? row[1] > b.lower : row[1] >= b.lower) && (!pred.includeUpper || (pred.upperOperator === "<=" ? row[1] <= b.upper! : row[1] < b.upper!))).sort((a, z) => a[1] - z[1] || a[0] - z[0]);
  const committed: number[][] = []; let failed = false;
  for (const row of selected) {
    if (fault === "fail_before_write" || copy.typeProperties.sink.writeBehavior === "insert" && target.has(row[0])) { failed = true; break; }
    target.set(row[0], clone(row) as AdfRow); committed.push(clone(row));
    if (fault === "partial_after_first") { failed = true; break; }
  }
  const runs = !failed || advance.dependsOn[0].dependencyConditions[0] === "Completed";
  const changed = runs && fault !== "checkpoint_fail_before_mutation";
  return { selected_rows: selected, committed_rows: committed, target_rows: [...target.values()].sort((a, z) => a[0] - z[0]), checkpoint: changed ? b.upper : state.checkpoint, copy_status: failed ? "Failed" : "Succeeded", advance_status: !runs ? "Skipped" : changed ? "Succeeded" : "Failed" };
}

let primary = 0, alternative = 0, rejected = 0;
for (const [name, steps] of Object.entries(cases)) {
  let actual: AdfConfirmed = { target_rows: clone(states[steps[0].start_target]) as AdfRow[], checkpoint: steps[0].checkpoint };
  for (const [index, step] of steps.entries()) {
    check(`actual-engine/manual-oracle/${name}/${index + 1}`, () => {
      const config = adfConfigs[step.config], capture = source(step.source, true) as AdfRow[];
      const b = { lower: step.captured_lower, upper: step.captured_upper, capture_rows: capture };
      const input = request(config, actual, b, source(step.source), (step.fault ?? "none") as AdfFault, capture);
      const unchanged = JSON.stringify(input); const reply = executeAdfRequest(input); assert.equal(JSON.stringify(input), unchanged, "caller input mutated");
      const want = expected[name][index], oracle = independent(config, source(step.source), actual, b, step.fault ?? "none");
      if (want.copy_status === "NotStarted") {
        assert.equal(reply.kind, "error"); if (reply.kind !== "error") throw Error("expected rejection"); assert.ok(reply.message.length > 10);
        if (name.startsWith('old_')) assert.match(reply.message, /LookupOld.*firstRowOnly/);
        if (name.startsWith('new_')) assert.match(reply.message, /LookupNew.*firstRowOnly/);
        assert.deepEqual(actual.target_rows, states[String(want.target_state)]); assert.equal(actual.checkpoint, want.checkpoint); assert.equal(oracle, null); rejected++;
      } else {
        assert.equal(reply.kind, "result"); if (reply.kind !== "result") throw Error(JSON.stringify(reply));
        const result = reply.result;
        for (const field of ["selected_order_ids", "selected_rows", "committed_order_ids", "committed_rows", "copy_status", "advance_status", "checkpoint"] as const) assert.deepEqual(result[field], want[field], `${name}/${field}`);
        assert.deepEqual(result.target_rows, states[String(want.target_state)]);
        assert.ok(oracle); for (const field of ["selected_rows", "committed_rows", "target_rows", "checkpoint", "copy_status", "advance_status"] as const) assert.deepEqual(result[field], oracle[field]);
        assert.deepEqual(result.stages[0].target_rows, actual.target_rows); assert.equal(result.stages[0].checkpoint, actual.checkpoint);
        if (result.copy_status !== "Skipped") { assert.equal(result.stages[2].phase, "after_copy"); assert.equal(result.stages[2].checkpoint, actual.checkpoint); assert.deepEqual(result.stages[2].target_rows, result.target_rows); assert.equal(result.stages[3].checkpoint, result.checkpoint); }
        actual = { target_rows: clone(result.target_rows), checkpoint: result.checkpoint };
      }
      primary++; evidence.push({ name, step: index + 1, kind: reply.kind, state: clone(actual) });
    });
    if (["clean", "checkpoint_failure_then_replay", "partial_then_retry", "failure_before_first_write", "no_change", "empty_new_watermark"].includes(name)) for (const [altName, config] of Object.entries(adfContent.alternatives)) check(`alternative/${name}/${index + 1}/${altName}`, () => {
      // Independent finite case input for this alternative, not a claim of chained UI behavior.
      const b = { lower: step.captured_lower, upper: step.captured_upper, capture_rows: source(step.source, true) as AdfRow[] };
      const reply = executeAdfRequest(request(config, { target_rows: clone(states[step.start_target]) as AdfRow[], checkpoint: step.checkpoint }, b, source(step.source), (step.fault ?? 'none') as AdfFault, source(step.source, true)));
      assert.equal(reply.kind, 'result'); if (reply.kind !== 'result') throw Error(JSON.stringify(reply)); const want = expected[name][index];
      assert.deepEqual(reply.result.selected_rows, want.selected_rows); assert.deepEqual(reply.result.committed_rows, want.committed_rows); assert.deepEqual(reply.result.target_rows, states[String(want.target_state)]); assert.equal(reply.result.checkpoint, want.checkpoint); assert.equal(reply.result.copy_status, want.copy_status); assert.equal(reply.result.advance_status, want.advance_status); alternative++;
    });
  }
}
check("actual capture→partial accepted state→same-window retry→new capture uses actual returned state", () => {
  let s = initialAdfSession(); s = changeAdfDraft(s, { configText: prettyAdf(adfContent.reference), fault: "partial_after_first" });
  const perform = (id: number, action: "capture" | "run") => { s = beginAdfAction(s, id, action); s = finishAdfAction(s, id, { kind: "reply", reply: executeAdfRequest(adfRequest(s)) }); };
  perform(1, "capture"); assert.equal(s.captured?.upper, 104); perform(2, "run"); assert.equal(s.trace?.copy_status, "Failed"); assert.equal(s.confirmed.checkpoint, 100); assert.deepEqual(s.confirmed.target_rows, states.partial);
  s = changeAdfDraft(s, { fault: "none" }); perform(3, "run"); assert.deepEqual(s.confirmed.target_rows, states.complete104); assert.equal(s.confirmed.checkpoint, 104);
  const same = clone(s.confirmed); perform(4, "run"); assert.ok(s.error); assert.deepEqual(s.confirmed, same); assert.match(s.message, /differs from actual checkpoint/);
  s = changeAdfDraft(s, { captureText: prettyAdf(adfContent.fixtures.source_at_next_upper_lookup) }); perform(5, "capture"); assert.equal(s.captured?.lower, 104); assert.equal(s.captured?.upper, 105); perform(6, "run"); assert.deepEqual(s.confirmed.target_rows, states.complete105); assert.equal(s.confirmed.checkpoint, 105);
});
check("actual completed Copy→failed checkpoint→same-window retry keeps written rows", () => {
  const first = executeAdfRequest(request(adfContent.reference, initial(), bounds(), source("normal"), "checkpoint_fail_before_mutation")); assert.equal(first.kind, "result"); if (first.kind !== 'result') throw Error('bad');
  assert.deepEqual(first.result.target_rows, states.complete104); assert.equal(first.result.checkpoint, 100);
  const retry = executeAdfRequest(request(adfContent.reference, { target_rows: first.result.target_rows, checkpoint: first.result.checkpoint }, bounds())); assert.equal(retry.kind, "result"); if (retry.kind === 'result') { assert.deepEqual(retry.result.target_rows, states.complete104); assert.equal(retry.result.checkpoint, 104); }
});
check("actual edited source and target drive result, not fixture/oracle substitution", () => {
  const capture = [[77, 107, 900]], state = { target_rows: [[12, 100, 33]], checkpoint: 100 } as AdfConfirmed;
  const result = executeAdfRequest(request(adfContent.reference, state, { lower: 100, upper: 107, capture_rows: capture as AdfRow[] }, capture, "none", capture)); assert.equal(result.kind, "result"); if (result.kind === 'result') { assert.deepEqual(result.result.selected_order_ids, [77]); assert.deepEqual(result.result.target_rows, [[12,100,33],[77,107,900]]); assert.equal(result.result.checkpoint,107); }
});
check("single-selected-row declared partial fault still reports Failed after its write", () => {
  const rows = [[8, 101, 25]] as AdfRow[]; const reply = executeAdfRequest(request(adfContent.reference, initial(), { lower:100,upper:101,capture_rows:rows },rows,'partial_after_first',rows)); assert.equal(reply.kind,'result'); if(reply.kind==='result'){assert.equal(reply.result.copy_status,'Failed');assert.equal(reply.result.advance_status,'Skipped');assert.equal(reply.result.committed_rows.length,1);assert.equal(reply.result.checkpoint,100);}
});
function reject(name: string, change: (r: AdfRequest) => void, field: RegExp) { check(name, () => { const r = request(adfContent.reference, initial(), bounds()); change(r); const before = JSON.stringify(r); const reply = executeAdfRequest(r); assert.equal(JSON.stringify(r), before); assert.equal(reply.kind, "error"); if (reply.kind === "error") assert.match(reply.message, field); }); }
reject('schema/extra-root-field', r=>{const c:any=JSON.parse(r.configText);c.secret='no';r.configText=prettyAdf(c)},/config.secret/);
reject('schema/fifth-activity',r=>{const c:any=JSON.parse(r.configText);c.activities.push(clone(c.activities[0]));r.configText=prettyAdf(c)},/activities/);
reject('schema/duplicate-activity',r=>{const c:any=JSON.parse(r.configText);c.activities[1].name='LookupOld';r.configText=prettyAdf(c)},/duplicate activity/);
reject('schema/extra-dependency',r=>{const c:any=JSON.parse(r.configText);c.activities[3].dependsOn.push(clone(c.activities[3].dependsOn[0]));r.configText=prettyAdf(c)},/dependsOn/);
reject('schema/includeUpper-number',r=>{const c:any=JSON.parse(r.configText);c.simulatorPredicate.includeUpper=1;r.configText=prettyAdf(c)},/includeUpper.*Boolean/);
reject('schema/unsupported-expression',r=>{const c:any=JSON.parse(r.configText);c.simulatorPredicate.lowerExpression='@utcNow()';r.configText=prettyAdf(c)},/lowerExpression/);
reject('schema/unsupported-sink-field',r=>{const c:any=JSON.parse(r.configText);c.activities[2].typeProperties.sink.preCopyScript='DELETE';r.configText=prettyAdf(c)},/preCopyScript/);
reject('schema/extra-procedure-parameter',r=>{const c:any=JSON.parse(r.configText);c.activities[3].typeProperties.storedProcedureParameters.Other={};r.configText=prettyAdf(c)},/Other/);
for (const n of [-1, 2147483648, 1.5, true, '100', null]) reject(`INT32/checkpoint/${JSON.stringify(n)}`,r=>{(r.confirmed as any).checkpoint=n},/state.checkpoint/);
reject('INT32/lower-overflow',r=>{r.captured!.lower=2147483648},/captured.lower/);
reject('INT32/upper-overflow',r=>{r.captured!.upper=2147483648},/captured.upper/);
reject('target/invalid-retained-row',r=>{r.confirmed.target_rows[0][2]=-1},/state.target_rows/);
reject('source/captured-window-mutation',r=>{const rows=JSON.parse(r.copyText);rows[0][2]=999;r.copyText=prettyAdf(rows)},/captured-window rows changed/);
reject('bounds/forged-maximum',r=>{r.captured!.upper=103},/maximum/);
reject('parser/invalid-config',r=>{r.configText='{'},/config.*invalid JSON/);
reject('parser/empty-draft',r=>{r.configText=''},/config.*invalid JSON/);
reject('resource/config-length',r=>{r.configText=' '.repeat(60001)},/60,000/);
reject('resource/nesting',r=>{r.configText='['.repeat(22)+'0'+']'.repeat(22)},/nesting/);
reject('resource/source-rows',r=>{r.copyText=prettyAdf(Array.from({length:251},(_,i)=>[i,101,1]))},/250/);
check('equivalent activity/dependency ordering accepted',()=>{const c=clone(adfContent.reference);c.activities.reverse();const cp:any=c.activities.find(a=>a.name==='CopyOrders');cp.dependsOn.reverse();const r=executeAdfRequest(request(c,initial(),bounds()));assert.equal(r.kind,'result');if(r.kind==='result')assert.deepEqual(r.result.target_rows,states.complete104)});
check('state/cancel-timeout-stale-parser-error retain already accepted partial state and trace',()=>{
 let s=initialAdfSession();s=changeAdfDraft(s,{configText:prettyAdf(adfContent.reference),fault:'partial_after_first'});s=beginAdfAction(s,1,'capture');s=finishAdfAction(s,1,{kind:'reply',reply:executeAdfRequest(adfRequest(s))});s=beginAdfAction(s,2,'run');s=finishAdfAction(s,2,{kind:'reply',reply:executeAdfRequest(adfRequest(s))});const accepted=JSON.stringify([s.confirmed,s.acceptedId,s.trace]);
 for(const kind of ['cancelled','timeout','unavailable'] as const){const next=finishAdfAction(beginAdfAction(s,10,'run'),10,{kind});assert.equal(JSON.stringify([next.confirmed,next.acceptedId,next.trace]),accepted)}
 const run=beginAdfAction(s,11,'run');assert.equal(finishAdfAction(run,10,{kind:'timeout'}),run);const edited=changeAdfDraft(run,{configText:'{'});assert.equal(finishAdfAction(edited,11,{kind:'timeout'}),edited);const errored=finishAdfAction(beginAdfAction(edited,12,'run'),12,{kind:'reply',reply:{kind:'error',message:'config: invalid JSON'}});assert.equal(JSON.stringify([errored.confirmed,errored.acceptedId,errored.trace]),accepted);assert.equal(errored.traceCurrent,false);
 const empty=changeAdfDraft(s,{configText:'',captureText:'',copyText:'',reviewed:true,hints:2});const restored=parseAdfSession(serializeAdfSession(empty,'rev'));assert.equal(restored.session.draft.configText,'');assert.deepEqual(restored.session.confirmed,s.confirmed);assert.deepEqual(restored.session.trace,s.trace);assert.equal(restored.session.traceCurrent,false);assert.equal(restored.session.draft.reviewed,true);
 for(const raw of ['null','{}',serializeAdfSession(empty,'rev').replace('"version":1','"version":2')])assert.throws(()=>parseAdfSession(raw));
});
const originalSetTimeout=globalThis.setTimeout,originalClearTimeout=globalThis.clearTimeout;let timer:{cb:()=>void;ms:number}|undefined;
globalThis.setTimeout=((cb:()=>void,ms:number)=>{timer={cb,ms};return 1}) as typeof setTimeout;globalThis.clearTimeout=(()=>{timer=undefined}) as typeof clearTimeout;
try{
 function fake(){let terminated=0;const outcomes:AdfOutcome[]=[],sent:unknown[]=[];const worker:AdfWorker={onmessage:null,onerror:null,postMessage:r=>{sent.push(r)},terminate:()=>{terminated++}};const r=request(adfContent.reference,initial(),bounds());const run=startAdfRun(r,o=>outcomes.push(o),()=>worker);return{run,worker,outcomes,sent,terminated:()=>terminated,emit:(data:unknown)=>worker.onmessage?.({data} as MessageEvent)}}
 check('worker/load-budget-and-termination',()=>{const f=fake();assert.equal(timer?.ms,ADF_LOAD_MS);timer!.cb();assert.equal(f.outcomes[0].kind,'unavailable');assert.equal(f.terminated(),1)});
 check('worker/run-budget-and-duplicate-ready',()=>{const f=fake();f.emit({type:'ready'});const before=timer;f.emit({type:'ready'});assert.equal(timer,before);assert.equal(timer?.ms,ADF_RUN_MS);assert.equal(f.sent.length,1);timer!.cb();assert.equal(f.outcomes[0].kind,'timeout');assert.equal(f.terminated(),1)});
 check('worker/cancel-and-late-reply',()=>{const f=fake();f.emit({type:'ready'});f.run.cancel();f.emit({type:'reply',id:1,reply:{kind:'error',message:'late'}});assert.deepEqual(f.outcomes,[{kind:'cancelled'}]);assert.equal(f.terminated(),1)});
 check('worker/wrong-id-ignored-and-result-terminates',()=>{const f=fake();f.emit({type:'ready'});f.emit({type:'reply',id:0,reply:{}});assert.equal(f.outcomes.length,0);f.emit({type:'reply',id:1,reply:{kind:'error',message:'done'}});assert.equal(f.outcomes.length,1);assert.equal(f.terminated(),1)});
}finally{globalThis.setTimeout=originalSetTimeout;globalThis.clearTimeout=originalClearTimeout}
check('worker/engine-has-no-runtime-content-or-network-eval-import',()=>{const s=readFileSync('lib/azure-adf.ts','utf8')+readFileSync('workers/azure-adf.worker.ts','utf8');assert.doesNotMatch(s,/\b(?:eval|fetch|XMLHttpRequest)\s*\(|new Function|azure-adf-content|manual-expected|reference\.json/)});
console.log(JSON.stringify({status:'PASS',manifest:AZURE_MANIFEST,checks:checks.length,cases:checks,disclosed_scenarios:27,actual_primary_steps:primary,actual_alternative_steps:alternative,preflight_rejections:rejected,actual_chained_state: true,evidence,limits:'Actual feature TypeScript engine/state and independent row-map oracle/manual cases. Worker controller uses labelled fake clock; actual browser worker/UI/storage evidence is separate. No unchanged Python author QA/Azure/TSQL/hosted/learner proof.'},null,2));
