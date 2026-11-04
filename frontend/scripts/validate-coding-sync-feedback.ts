import assert from "node:assert/strict";
import { ApiError, ApiDecodeError, ApiTransportError, getLearnerProgress, saveLearnerDraft, getAuthProfile } from "../lib/api";
import { CodingSyncFeedback, classifyCodingSyncError, codingSyncMessage, confirmCodingDraft, type CodingSyncDetails } from "../lib/coding-sync-feedback";
import { saveCodingLabDraft } from "../lib/coding-lab-session";

class Clock {
  time = 0;
  timers = new Map<object, { at: number; callback: () => void }>();
  now = () => this.time;
  setTimeout = (callback: () => void, ms: number) => { const key = {}; this.timers.set(key, { at: this.time + ms, callback }); return key; };
  clearTimeout = (timer: unknown) => { this.timers.delete(timer as object); };
  advance(ms: number) {
    const end = this.time + ms;
    while (true) {
      const next = [...this.timers].sort((a,b) => a[1].at-b[1].at)[0];
      if (!next || next[1].at > end) break;
      this.time = next[1].at; this.timers.delete(next[0]); next[1].callback();
    }
    this.time = end;
  }
}

async function main() {
  const originalFetch = globalThis.fetch;
  const forbidden = "synthetic-private-error-body";
  const payload = { draft_answer: "SELECT 1", draft_interview_answer: "", hints_revealed: 0, client_revision: 17 };
  const item = { content_type:"coding_lab:sql", content_id:"synthetic-lab", draft_answer:payload.draft_answer, draft_revision:17 };
  let comparisons = 0;
  try {
    for (const operation of ["load","draft-save"] as const) {
      const call = () => operation === "load" ? getLearnerProgress("synthetic") : saveLearnerDraft("synthetic","coding_lab:sql","synthetic-lab",payload);
      for (const status of [401,403,404,422,429,500,503]) {
        globalThis.fetch = async (_url, init) => {
          assert.equal(init?.method, operation === "load" ? undefined : "PUT");
          assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic");
          if (operation === "draft-save") assert.deepEqual(JSON.parse(init!.body as string), payload);
          return new Response(JSON.stringify({detail:forbidden}),{status});
        };
        await assert.rejects(call, error => {
          assert(error instanceof ApiError); assert.equal(error.status,status); assert.equal(error.message,forbidden);
          const classified=classifyCodingSyncError(error);
          assert.equal(classified.class,status===401?"session-required":status>=500?"service-unavailable":"other-http");
          const details: CodingSyncDetails={operation,outcome:"failure",...classified,durationBucket:"<1s",trigger:"initial",manualRetry:false};
          assert(!JSON.stringify(details).includes(forbidden)); assert(!codingSyncMessage(details).includes(forbidden));
          assert(!/expired|database|offline/i.test(codingSyncMessage(details))); comparisons++;
          return true;
        });
      }
      globalThis.fetch=async()=>{throw new TypeError(forbidden);};
      await assert.rejects(call, error => { assert(error instanceof ApiTransportError); assert.equal(error.message,forbidden); assert.equal(classifyCodingSyncError(error).class,"no-response"); comparisons++;return true; });
      globalThis.fetch=async()=>new Response("not json",{status:200});
      await assert.rejects(call,error=>{assert(error instanceof ApiDecodeError);assert.equal(classifyCodingSyncError(error).class,"unknown");assert.equal(classifyCodingSyncError(error).status,200);comparisons++;return true;});
      globalThis.fetch=async()=>new Response(JSON.stringify(operation==="load"?{items:[]}:{item}),{status:200});
      assert.deepEqual(await call(),operation==="load"?{items:[]}:{item}); comparisons++;
    }
    // Existing other API callers still receive the same HTTP error status/message.
    globalThis.fetch=async()=>new Response(JSON.stringify({detail:forbidden}),{status:401});
    await assert.rejects(()=>getAuthProfile("synthetic"),error=>error instanceof ApiError && error.status===401 && error.message===forbidden);
  } finally { globalThis.fetch=originalFetch; }
  assert.equal(classifyCodingSyncError(new TypeError(forbidden)).class,"unknown","an arbitrary TypeError is not proven no-response");
  confirmCodingDraft({item} as any,"coding_lab:sql","synthetic-lab",payload);
  for (const broken of [null,{}, {item:{...item,draft_revision:18}}, {item:{...item,draft_answer:"different"}}, {item:{...item,content_id:"other"}}]) {
    assert.throws(()=>confirmCodingDraft(broken as any,"coding_lab:sql","synthetic-lab",payload),ApiDecodeError);
  }
  const clock=new Clock();let latest: CodingSyncDetails|undefined;let publications=0;
  const feedback=new CodingSyncFeedback(value=>{latest=value;publications++;if(value){const allowed=["class","durationBucket","manualRetry","operation","outcome","trigger","status"];assert(Object.keys(value).every(key=>allowed.includes(key)));assert(!JSON.stringify(value).includes(forbidden));}},clock);
  const load=feedback.begin("load","initial",()=>true);
  clock.advance(4999);assert.equal(latest?.durationBucket,"1–5s");assert(!codingSyncMessage(latest!).includes("taking longer"));
  clock.advance(1);assert(codingSyncMessage(latest!).includes("taking longer"));assert.equal(latest?.outcome,"pending");
  clock.advance(10001);assert.equal(latest?.durationBucket,">15s");load.success();assert.equal(latest?.outcome,"success");assert.equal(clock.timers.size,0);
  // A late load may not replace a current save; no timer may continue publishing.
  const staleLoad=feedback.begin("load","manual",()=>true,true);
  const save=feedback.begin("draft-save","manual",()=>true);
  staleLoad.failure(new ApiError(forbidden,503));assert.equal(latest?.operation,"draft-save");assert.equal(latest?.outcome,"pending");
  save.success();assert.equal(latest?.manualRetry,false);assert.equal(latest?.outcome,"success");
  const failed=feedback.begin("draft-save","autosave",()=>true);failed.failure(new ApiError(forbidden,503));assert.equal(latest?.status,503);assert(!codingSyncMessage(latest!).includes(forbidden));
  const retry=feedback.begin("draft-save","manual",()=>true,true);retry.success();assert.equal(latest?.manualRetry,true);
  for (const scope of ["account","slug","revision","conflict"]) {
    let current=true;const stale=feedback.begin("draft-save","autosave",()=>current);current=false;
    stale.success();assert.equal(latest,undefined,scope);assert.equal(clock.timers.size,0);
  }
  feedback.begin("load","initial",()=>true);feedback.reset();const before=publications;clock.advance(30000);assert.equal(publications,before);assert.equal(clock.timers.size,0);
  class MemoryStorage {
    items=new Map<string,string>(); fail=false;
    getItem(key:string){return this.items.get(key)??null;}
    setItem(key:string,value:string){if(this.fail)throw Error("blocked");this.items.set(key,value);}
  }
  const global=globalThis as any;const previousWindow=global.window;const storage=new MemoryStorage();
  try {
    global.window={localStorage:storage};const draft=saveCodingLabDraft("synthetic-lab","SELECT 1");assert.equal(draft.code,"SELECT 1");assert.equal(storage.items.size,1);
    storage.fail=true;assert.throws(()=>saveCodingLabDraft("synthetic-lab","SELECT 2"));
    assert(JSON.stringify([...storage.items.values()]).includes("SELECT 1"));assert(!JSON.stringify([...storage.items.values()]).includes("SELECT 2"));
    global.window={get localStorage(){throw Error("blocked");}};assert.throws(()=>saveCodingLabDraft("synthetic-lab","SELECT 2"));
    delete global.window;assert.throws(()=>saveCodingLabDraft("synthetic-lab","SELECT 2"));
  } finally {if(previousWindow===undefined)delete global.window;else global.window=previousWindow;}
  console.log(JSON.stringify({api_classifications:comparisons,http_compatibility:true,phase_decode_and_ack_validation:true,pending_5s_and_all_duration_buckets:true,late_load_and_four_scope_guards:true,manual_retry_flag:true,timers_cleared:true,diagnostic_allowlist:true,local_write_failure_never_acknowledged:true,scope:"synthetic Node API/controller/storage tests; rendered workspace and real-account durability separate"}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
