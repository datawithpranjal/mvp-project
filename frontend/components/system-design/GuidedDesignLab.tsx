"use client";

import { useState, type ReactNode } from "react";

export type GuidedDraft = {
  step: number; requirements: string; design: string; failure: string;
  initial: string; revision: string; reflection: string; transfer: string;
  referenceViewed: boolean;
};
export const EMPTY_GUIDED: GuidedDraft = { step: 0, requirements: "", design: "", failure: "", initial: "", revision: "", reflection: "", transfer: "", referenceViewed: false };
export function designSubmission(draft: GuidedDraft) {
  return `Requirements and assumptions:\n${draft.requirements}\n\nArchitecture and trade-offs:\n${draft.design}\n\nFailure handling and verification:\n${draft.failure}`;
}
const stages = ["Requirements", "Design", "Stress-test", "Review", "Revise & transfer"];
const input = "mt-3 min-h-48 w-full rounded-xl border border-slate-600 bg-slate-950 p-4 text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-300";
const button = "rounded-xl bg-teal-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40";

export function GuidedDesignLab({ draft, onChange, onReview, busy, feedback }: {
  draft: GuidedDraft; onChange: (draft: GuidedDraft) => void;
  onReview: (answer: string) => void; busy: boolean; feedback: ReactNode;
}) {
  const [hint, setHint] = useState(false);
  const update = (patch: Partial<GuidedDraft>) => onChange({ ...draft, ...patch });
  const ready = Boolean(draft.requirements.trim() && draft.design.trim() && draft.failure.trim());
  const revised = Boolean(draft.revision.trim() && draft.reflection.trim());
  return <div className="space-y-5">
    <header className="panel rounded-2xl p-6">
      <p className="text-sm text-teal-200">Guided practice · 30–40 minutes · Free</p>
      <h2 className="mt-2 text-2xl font-bold">Design a reliable daily revenue pipeline</h2>
      <p className="mt-3 text-slate-300">Practise requirements, data grain, safe retries and late corrections. Bring basic SQL and pipeline knowledge. Leave with a design you can explain—not a job-readiness score.</p>
      <p className="mt-2 text-xs text-slate-400">Draft saved with this case on this device. Reviewing a reference or writing a revision does not prove mastery.</p>
      <nav aria-label="Design review steps" className="mt-5 flex flex-wrap gap-2">{stages.map((stage, index) => <button key={stage} type="button" aria-current={draft.step === index ? "step" : undefined} onClick={() => { update({ step: index }); setHint(false); }} className={draft.step === index ? button : "rounded-xl border border-slate-600 px-4 py-2"}>{index + 1}. {stage}</button>)}</nav>
    </header>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <aside className="panel rounded-2xl p-5 xl:sticky xl:top-24">
        <details open><summary className="cursor-pointer font-semibold text-teal-200">Case reference · explicit exercise assumptions</summary>
          <p className="mt-4 text-sm leading-6">Finance needs yesterday’s certified revenue by 8 AM IST. Design for 100,000 orders/day, two years of history and a two-person data team. An existing warehouse and object storage are available; justify additional services and their operating cost.</p>
          <p className="mt-3 text-sm leading-6">Sources expose paginated orders, payments and refunds plus an updated_at filter. Extracts may repeat. Refunds may arrive seven days late. An order can contain multiple items, payments and refunds.</p>
          <p className="mt-3 text-sm leading-6">Finance defines revenue here as captured payments minus successful refunds, grouped by original order business date. Corrected days must be restated. Reconcile against provider totals before publishing; alert Finance if reconciliation fails.</p>
          <p className="mt-3 text-sm text-slate-400">You may challenge assumptions. State additional requirements rather than inventing certainty. SQL or Python can be defensible; Spark is not required.</p>
        </details>
        <details className="mt-5"><summary className="cursor-pointer text-teal-200">Clarification answers</summary><p className="mt-3 text-sm leading-6">Source IDs are stable. updated_at changes for corrections. The source retains records for backfill. Finance accepts a delayed, clearly labelled report rather than silently incorrect totals. You must define ownership, alerting and recovery.</p></details>
        <div className="mt-5 border-t border-slate-700 pt-4 text-xs text-slate-400">{draft.initial ? "First draft captured" : "First draft not captured"} · {revised ? "Revision recorded" : "Revision pending"} · {draft.transfer.trim() ? "Follow-up attempted" : "Follow-up pending"} · {draft.referenceViewed ? "Reference viewed" : "Reference not viewed"}</div>
      </aside>
      <section className="panel min-w-0 rounded-2xl p-5" aria-label={stages[draft.step]}>
        {draft.step === 0 && <><h3 className="text-xl font-semibold">Understand the business before choosing tools</h3><p className="mt-3 text-slate-300">What must be correct by 8 AM? What is the grain of each source? Which assumptions would you clarify with Finance? Name an explicit freshness/correctness trade-off.</p><textarea aria-label="Requirements and assumptions" className={input} value={draft.requirements} onChange={e => update({ requirements: e.target.value })} /></>}
        {draft.step === 1 && <><h3 className="text-xl font-semibold">Build and defend a simple design</h3><p className="mt-3 text-slate-300">Write a source-to-report flow. Define keys and grain, transformation order and publication checks. Explain why your tools fit this scale, and one reasonable alternative you rejected.</p><textarea aria-label="Architecture and trade-offs" className={input} placeholder="Source → durable landing → transformation → checked revenue table → report. Explain each arrow." value={draft.design} onChange={e => update({ design: e.target.value })} /></>}
        {draft.step === 2 && <><h3 className="text-xl font-semibold">The same input arrives twice</h3><p className="mt-3 text-slate-300">Yesterday’s load succeeded, but its acknowledgement failed. It retries. A refund also arrives for an order from seven days ago. What becomes incorrect, how do you recover safely, and what concrete checks prove the output is right?</p><textarea aria-label="Failure handling and verification" className={input} value={draft.failure} onChange={e => update({ failure: e.target.value })} /></>}
        {draft.step < 3 && <><button type="button" className="mt-3 text-sm text-teal-200 underline" onClick={() => setHint(!hint)}> {hint ? "Hide hint" : "Give me a nudge"}</button>{hint && <p className="mt-3 rounded-xl bg-teal-300/10 p-4 text-sm">{["Separate business correctness from freshness. What happens when a refund belongs to an older order?", "Joining two one-to-many tables can multiply amounts. Decide where to aggregate before joining.", "Name the stable key, the affected dates and an invariant: running the same batch twice must leave the same totals."][draft.step]}</p>}</>}
        {draft.step === 3 && <><h3 className="text-xl font-semibold">Review your reasoning</h3><p className="mt-3 text-slate-300">Capture your first draft before requesting advisory feedback. Sign-in is required for AI review. Your original stays available when you revise.</p><button type="button" disabled={!ready || busy} className={`${button} mt-4`} onClick={() => { const initial = draft.initial || designSubmission(draft); update({ initial }); onReview(initial); }}>{busy ? "Reviewing…" : "Capture draft & request feedback"}</button>{!ready && <p className="mt-2 text-sm text-amber-200">Add requirements, design and failure handling first.</p>}<div className="mt-5">{feedback}</div><h4 className="mt-5 font-semibold">Self-review (also available without AI)</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-300"><li>Can each output amount be traced to a payment or refund?</li><li>Does the same input twice produce the same result?</li><li>Can a late correction update the correct business date?</li><li>What blocks publication and who gets alerted?</li><li>Which alternative would become better if scale changed?</li></ul></>}
        {draft.step === 4 && <><h3 className="text-xl font-semibold">Make your improvement visible</h3>{draft.initial ? <details className="mt-3"><summary className="cursor-pointer text-teal-200">Your original design</summary><p className="mt-3 whitespace-pre-wrap text-sm">{draft.initial}</p></details> : <p className="mt-3 text-amber-200">Capture your first draft in Review to keep a before-and-after comparison.</p>}<label className="mt-5 block">Revised design<textarea className={input} value={draft.revision} onChange={e => update({ revision: e.target.value })} /></label><label className="mt-4 block">What did you change, and why?<textarea className={input} value={draft.reflection} onChange={e => update({ reflection: e.target.value })} /></label><label className="mt-4 block">New constraint: Finance now needs updates every five minutes. What changes, and what stays the same?<textarea className={input} value={draft.transfer} onChange={e => update({ transfer: e.target.value })} /></label><p className="mt-3 text-sm text-slate-400">These are your recorded explanations, not automatically verified learning outcomes. Compare the reasoning, not answer length.</p></>}
        <div className="mt-6 flex justify-between gap-3"><button type="button" disabled={draft.step === 0} className={button} onClick={() => update({ step: draft.step - 1 })}>Previous step</button><button type="button" disabled={draft.step === 4} className={button} onClick={() => { update({ step: draft.step + 1 }); setHint(false); }}>Next step</button></div>
      </section>
    </div>
    <details className="panel rounded-2xl p-5" onToggle={e => { if (e.currentTarget.open && !draft.referenceViewed) update({ referenceViewed: true }); }}><summary className="cursor-pointer font-semibold text-teal-200">One defensible design · opening records reference use</summary><div className="mt-4 space-y-3 text-sm leading-6 text-slate-300"><p>Land versioned raw extracts with run metadata. Incrementally ingest by updated_at with overlap; deduplicate stable source IDs using the newest version. Keep payments and refunds at their own grain before aggregating to orders and business dates.</p><p>Use SQL transformations in the existing warehouse. Merge corrected entities, identify impacted order dates and rebuild their revenue totals. Publish atomically only after uniqueness, row-count and payment/refund reconciliation checks pass. Retain the last certified report if checks fail and alert the named owner.</p><p>A small Python extract plus scheduled SQL can satisfy this daily workload. Spark adds operational complexity unless measured volume or processing limits justify it. Full daily rebuilds are simpler but become expensive with two years of history; targeted rebuilds require reliable changed-record tracking.</p><p>Replay a batch twice and compare keys and totals. Introduce a late refund and check the original business date changes once. Interrupt publication and verify readers never see a partial report. Five-minute updates require reassessing source freshness, ingestion frequency and cost—not automatically adding Kafka.</p></div></details>
  </div>;
}
