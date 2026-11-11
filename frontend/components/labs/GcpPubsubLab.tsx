"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { GCP_PUBSUB_MANIFEST, pubsubContent } from "../../lib/gcp-pubsub-content";
import { GCP_PUBSUB_LAB } from "../../lib/product";
import { GCP_EDITOR_BYTES, prettyPubsub, pubsubSnapshot, samePubsubValue,
  type FaultMode, type Publication, type PubsubRun, type PubsubState } from "../../lib/gcp-pubsub";
import { useGcpPubsub } from "../../lib/use-gcp-pubsub";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300";
const button = `inline-flex min-h-11 items-center rounded-xl border border-slate-600 px-3 py-2 text-left text-sm font-semibold text-slate-100 hover:border-teal-300 disabled:opacity-50 ${focus}`;
const field = `mt-2 w-full min-w-0 rounded-xl border border-slate-600 bg-slate-950 p-3 text-sm text-slate-100 ${focus}`;
const editor = `${field} resize-y font-mono text-xs leading-6 text-teal-100`;
const panel = "panel min-w-0 scroll-mt-44 rounded-3xl p-4 sm:p-6";
const text = "text-sm leading-6 text-slate-300";
const faultOptions: Record<FaultMode, string> = {
  teaching: "Default faults for the example",
  none: "No injected fault",
  sink_failure_before_write: "Sink failure before write",
  crash_after_commit_before_ack: "Crash after commit before late ACK"
};
const hints = [
  "Can acknowledgment succeed before the business write?",
  "If the write committed but acknowledgment did not, what survives?",
  "Compare m2 and m3 by message ID and by producer and event ID. Then compare the orders for e1 and e3."
];
const sections = [["Workspace", "run"], ["Publications", "data"], ["Actual trace", "trace"],
  ["Expected states", "expected"], ["Help", "help"], ["Device save", "device"]];
const human = (value: string) => value.replaceAll("_", " ");
const total = (state: PubsubState) => state.ledger.reduce((sum, row) => sum + row.amount_cents, 0);
type ExpectedStep = PubsubState & {
  expected_status: string | null;
  expected_sink: string | null;
  expected_error_contains: string | null;
};
const expected = pubsubContent.expected as unknown as Record<string, ExpectedStep[]>;

function JsonDetails({ title, value }: { title: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)} className="min-w-0 rounded-xl border border-slate-700 p-3">
    <summary className={`cursor-pointer text-sm font-semibold text-teal-200 ${focus}`}>{title}</summary>
    {open && <pre tabIndex={0} aria-label={title} className={`mt-3 max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-6 text-slate-100 ${focus}`}>
      {prettyPubsub(value)}
    </pre>}
  </details>;
}

function PublicationTable({ title, rows, showProvenance = false }: {
  title: string;
  rows: (Publication & { committed_from_ack_id?: string })[];
  showProvenance?: boolean;
}) {
  return <div role="region" aria-label={title} tabIndex={0} className={`min-w-0 overflow-x-auto rounded-xl border border-slate-700 ${focus}`}>
    <table className="w-full whitespace-nowrap text-left text-xs leading-6 text-slate-200">
      <caption className="px-3 py-2 text-left font-semibold">{title}</caption>
      <thead className="bg-slate-900">
        <tr>{["Message", "Producer", "Event", "Order", "Cents", ...(showProvenance ? ["Commit ACK ID"] : [])].map(label =>
          <th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr>
      </thead>
      <tbody>{rows.map((row, i) => <tr key={i} className="border-t border-slate-700">
        {[row.message_id, row.producer, row.event_id, row.order_id, row.amount_cents,
          ...(showProvenance ? [row.committed_from_ack_id] : [])].map((value, j) =>
          <td key={j} className="px-3 py-2">{value}</td>)}
      </tr>)}</tbody>
    </table>
    {!rows.length && <p className="p-3 text-sm text-slate-300">Zero rows.</p>}
  </div>;
}

function WorkspaceState({ state }: { state: PubsubState }) {
  const next = state.inflight ? "Simulate expiry" : state.retry_for !== null ? "Retry the current message"
    : state.pending.length ? "Process the next publication" : "Queue drained";
  return <section className={panel} aria-labelledby="gcp-state-title">
    <h2 id="gcp-state-title" className="text-xl font-semibold text-slate-50">Confirmed state</h2>
    <p className="mt-2 text-lg font-semibold text-teal-200" data-gcp-total={total(state)}>{total(state)} cents · {state.ledger.length} ledger rows</p>
    <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm text-slate-300">
      <dt className="font-semibold">Pending</dt><dd className="break-all" data-gcp-pending>{state.pending.join(", ") || "Empty"}</dd>
      <dt className="font-semibold">In flight</dt><dd className="break-all" data-gcp-inflight>{state.inflight ? `${state.inflight.message_id} · ${state.inflight.ack_id}` : "None"}</dd>
      <dt className="font-semibold">Retry ready</dt><dd className="break-all" data-gcp-retry>{state.retry_for ?? "None"}</dd>
      <dt className="font-semibold">Acknowledged</dt><dd className="break-all" data-gcp-acked>{state.acked_message_ids.join(", ") || "None"}</dd>
      <dt className="font-semibold">Next action</dt><dd>{next}</dd>
    </dl>
    <div className="mt-4 space-y-3">
      <PublicationTable title="Actual ledger and commit provenance" rows={state.ledger} showProvenance />
      <JsonDetails title="Full confirmed state, ACK receipts and attempts" value={state} />
    </div>
  </section>;
}

function ActualTrace({ run, restored }: { run: PubsubRun; restored: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const index = selected === null ? run.history.length - 1 : Math.min(selected, run.history.length - 1);
  const step = run.history[index];
  return <section id="gcp-trace" tabIndex={-1} className={panel} aria-labelledby="gcp-trace-title">
    <h2 id="gcp-trace-title" className="text-xl font-semibold text-slate-50">Actual trace</h2>
    {restored && <p className="mt-2 text-sm text-amber-200">Historical trace from a saved device copy.</p>}
    {!step ? <p className={`mt-2 ${text}`}>Process a delivery to inspect its effects.</p> : <>
      <label className="mt-3 block text-sm text-slate-200" htmlFor="gcp-trace-step">Recorded action</label>
      <select id="gcp-trace-step" className={field} value={selected === null ? "latest" : String(index)}
        onChange={event => setSelected(event.target.value === "latest" ? null : Number(event.target.value))}>
        <option value="latest">Latest action</option>
        {run.history.map((item, i) => <option key={i} value={i}>{i + 1}. {human(item.action)} · {item.message_id}</option>)}
      </select>
      <p className={`mt-3 break-words ${text}`} data-gcp-trace-status={step.status}>
        {step.message_id} · {step.ack_id ?? "Expiry"} · {step.status} · {faultOptions[step.fault]}
      </p>
      <p className={text}>Policy {human(step.policy.ackTiming)} / {human(step.policy.dedupKey)}. Sink {human(step.sink_effect)}. ACK {step.ack_effect}.</p>
      {step.reason && <p className={text}>{step.reason}</p>}
      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
        <JsonDetails title="Before this action" value={pubsubSnapshot(run, index)} />
        <JsonDetails title="After this action" value={pubsubSnapshot(run, index + 1)} />
      </div>
    </>}
  </section>;
}

function ExpectedStates({ run, loadDraft, canEdit, showPolicy }: {
  run: PubsubRun;
  loadDraft: (text: string) => void;
  canEdit: boolean;
  showPolicy: boolean;
}) {
  const [name, setName] = useState(pubsubContent.cases[0].name);
  const [index, setIndex] = useState(0);
  const sample = pubsubContent.cases.find(item => item.name === name)!;
  const steps = expected[name];
  const { expected_status, expected_sink, expected_error_contains, ...state } = steps[index];
  const step = sample.steps[index];
  const rule = "policy" in step ? step.policy : sample.policy;
  const policies = pubsubContent.policies as Record<string, unknown>;
  const policy = typeof rule === "string" && Object.hasOwn(policies, rule) ? policies[rule] : rule;
  const current = run.history.at(-1);
  const match = samePubsubValue(run.state, state);
  const statusMatch = current?.status === expected_status && (expected_sink === null || current.sink_effect === expected_sink);
  return <section id="gcp-expected" tabIndex={-1} className={panel} aria-labelledby="gcp-expected-title">
    <h2 id="gcp-expected-title" className="text-xl font-semibold text-slate-50">Expected states</h2>
    <p className={`mt-2 ${text}`}>Inspect the disclosed inputs and full expected state for each action. Choose a case and step to compare all state fields with your current run.</p>
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <label className="min-w-0 text-sm text-slate-200" htmlFor="gcp-expected-case">Case
        <select id="gcp-expected-case" className={field} value={name} onChange={event => { setName(event.target.value); setIndex(0); }}>
          {pubsubContent.cases.map(item => <option key={item.name} value={item.name}>{human(item.name)}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-sm text-slate-200" htmlFor="gcp-expected-step">Action
        <select id="gcp-expected-step" className={field} value={index} onChange={event => setIndex(Number(event.target.value))}>
          {sample.steps.map((item, i) => <option key={i} value={i}>{i + 1}. {human(item.action)}</option>)}
        </select>
      </label>
    </div>
    <p className={`mt-3 ${text}`}>Fault {human(step.fault)}. {expected_status ?? "Input rejected"}. {expected_error_contains && `Expected diagnostic includes “${expected_error_contains}”.`}</p>
    <p className={`mt-2 font-semibold ${match ? "text-teal-200" : "text-slate-300"}`} data-gcp-expected-match={match}>
      {match ? statusMatch ? "Full state and latest outcome match this disclosed step." : "Full state matches this disclosed step."
        : "The current state differs from this step."}
    </p>
    <div className="mt-3 space-y-3">
      <PublicationTable title={`Expected ledger · ${total(state)} cents`} rows={state.ledger} showProvenance />
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <JsonDetails title="Case publications" value={sample.source} />
        <JsonDetails title="Full expected state and provenance" value={steps[index]} />
        {"source" in step && <JsonDetails title="Source override for this action" value={step.source} />}
        {showPolicy && <JsonDetails title="Policy used for this action" value={policy} />}
      </div>
      <button type="button" className={button} disabled={!canEdit} onClick={() => {
        loadDraft(prettyPubsub(sample.source));
        document.getElementById("gcp-source")?.focus();
      }}>Copy case publications to source draft</button>
    </div>
  </section>;
}

export function GcpPubsubLab() {
  const lab = useGcpPubsub();
  const [revealed, setRevealed] = useState(false);
  const { draft, run } = lab.session;
  const workedVisible = revealed && draft.reviewed;
  const { state } = run;
  const blocked = !lab.ready || lab.busy || lab.recoveryRequired;
  const sourceError = lab.notice.error && lab.notice.text.startsWith("SOURCE");
  const policyError = lab.notice.error && lab.notice.text.startsWith("POLICY");
  const acknowledged = state.acked_message_ids;
  const forced = draft.messageId !== null && acknowledged.includes(draft.messageId) ? draft.messageId : "";
  const message = <p id="gcp-message" role={lab.notice.error ? "alert" : "status"}
    className={`mt-3 break-words text-sm leading-6 ${lab.notice.error ? "text-amber-200" : "text-slate-300"}`}>{lab.notice.text}</p>;
  const section = (id: string, title: string, children: ReactNode) =>
    <section id={`gcp-${id}`} tabIndex={-1} className={panel}>
      <h2 className="text-xl font-semibold text-slate-50">{title}</h2>
      {children}
    </section>;
  return <main data-gcp-manifest={GCP_PUBSUB_MANIFEST} className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-8">
    <Link className={`text-sm text-teal-200 underline ${focus}`} href="/labs">← All practice</Link>
    <header className="mt-5">
      <p className="text-sm font-semibold text-teal-200">Free · Local simulation · Intermediate</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-50 sm:text-4xl">{GCP_PUBSUB_LAB.title}</h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-slate-300">Repair a payment-event consumer. Choose when to acknowledge a delivery and how to identify a business event, then recover from a failed write and a crash after commit.</p>
      <p className={`mt-2 max-w-3xl ${text}`}>This browser simulation uses fictional Pub/Sub v1 pull deliveries and an atomic local ledger. Prerequisites are keys, event and order grain, queues and retries.</p>
      <nav aria-label="Pub/Sub lab sections" className="mt-4 flex flex-wrap gap-2">{sections.map(([label, id]) =>
        <a key={id} href={`#gcp-${id}`} className={button}>{label}</a>)}</nav>
    </header>
    <div className="mt-6 grid min-w-0 gap-5">
      <div id="gcp-run" tabIndex={-1} className="grid min-w-0 scroll-mt-44 items-start gap-5 lg:grid-cols-2">
        <section className={panel} aria-labelledby="gcp-workspace-title">
          <h2 id="gcp-workspace-title" className="text-xl font-semibold text-slate-50">Consumer policy and delivery</h2>
          <label className="mt-3 block text-sm font-semibold text-slate-200" htmlFor="gcp-policy">Policy JSON</label>
          <textarea id="gcp-policy" spellCheck={false} maxLength={GCP_EDITOR_BYTES} className={`${editor} min-h-28`}
            disabled={!lab.ready || lab.recoveryRequired} value={draft.policyText} aria-invalid={policyError}
            aria-describedby={policyError ? "gcp-message" : "gcp-policy-help"}
            onChange={event => lab.edit({ policyText: event.target.value })} />
          <p id="gcp-policy-help" className={text}><code>ackTiming</code> accepts <code>before_write</code> or <code>after_write</code>. <code>dedupKey</code> accepts <code>none</code>, <code>message_id</code>, <code>event_id</code>, <code>producer_event_id</code> or <code>order_id</code>.</p>
          {policyError && message}
          <label htmlFor="gcp-fault" className="mt-3 block text-sm font-semibold text-slate-200">Fault for this delivery</label>
          <select id="gcp-fault" className={field} disabled={!lab.ready || lab.recoveryRequired} value={draft.fault}
            onChange={event => lab.edit({ fault: event.target.value as FaultMode })}>
            {Object.entries(faultOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          {draft.fault === "teaching" && <p className={`mt-1 ${text}`}>The first m1 delivery fails before write. The first m2 delivery crashes after commit. Expiry is a manual action.</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={`${button} bg-teal-300 !text-slate-950`} disabled={blocked || !!state.inflight || state.retry_for !== null}
              onClick={() => lab.run("process_next")}>Process next delivery</button>
            <button type="button" className={button} disabled={blocked || !state.inflight}
              onClick={() => lab.run("expire_current")}>Simulate deadline expiry</button>
            <button type="button" className={button} disabled={blocked || state.retry_for === null}
              onClick={() => lab.run("retry_current")}>Retry current message</button>
            <button type="button" className={button} disabled={!lab.busy} onClick={lab.cancel}>Cancel</button>
            <button type="button" className={button} disabled={blocked} onClick={() => lab.run("reset_confirmed")}>Reset baseline</button>
          </div>
          {!policyError && !sourceError && message}
          {sourceError && <a className={`mt-3 inline-block text-sm text-amber-200 underline ${focus}`} href="#gcp-source">Review the source error</a>}
          <details className="mt-4 rounded-xl border border-slate-700 p-3">
            <summary className={`cursor-pointer text-sm font-semibold text-teal-200 ${focus}`}>Forced post-ACK redelivery</summary>
            <p className={`mt-2 ${text}`}>An explicit fixture gives an acknowledged message a new delivery ACK ID.</p>
            <label htmlFor="gcp-forced" className="mt-2 block text-sm text-slate-200">Acknowledged message</label>
            <select id="gcp-forced" className={field} disabled={!lab.ready || lab.recoveryRequired} value={forced}
              onChange={event => lab.edit({ messageId: event.target.value || null })}>
              <option value="">Choose a message</option>
              {acknowledged.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
            <button type="button" className={`${button} mt-2`} disabled={blocked || !forced || !!state.inflight || state.retry_for !== null}
              onClick={() => lab.run("force_redelivery")}>Redeliver acknowledged message</button>
          </details>
        </section>
        <WorkspaceState state={state} />
      </div>
      {section("data", "Source publications", <>
        <p className={`my-3 ${text}`}>In the original example, m2 and m3 publish the same business event. m1 and m4 are distinct payments for the same order. The reference ledger has three rows and totals 6,000 cents. Source edits take effect after you confirm a baseline reset.</p>
        <PublicationTable title="Publications in the confirmed run" rows={state.source_publications} />
        <label className="mt-4 block text-sm font-semibold text-slate-200" htmlFor="gcp-source">Source publications JSON</label>
        <textarea id="gcp-source" spellCheck={false} maxLength={GCP_EDITOR_BYTES} className={`${editor} min-h-56`}
          disabled={!lab.ready || lab.recoveryRequired} value={draft.sourceText} aria-invalid={sourceError}
          aria-describedby={sourceError ? "gcp-message gcp-source-help" : "gcp-source-help"} onChange={event => lab.edit({ sourceText: event.target.value })} />
        {sourceError && message}
        <p id="gcp-source-help" className={`mt-2 ${text}`}>Use up to 100 publications with unique message IDs, nonblank IDs of 1–40 characters and integer cents from 0 to 2,147,483,647. Publications of one producer and event pair must agree on the order and amount.</p>
      </>)}
      <ActualTrace run={run} restored={lab.restored} />
      <ExpectedStates run={run} loadDraft={sourceText => lab.edit({ sourceText })}
        canEdit={lab.ready && !lab.recoveryRequired} showPolicy={workedVisible} />
      {section("help", "Hints and worked policy", <>
        <p className={`mt-2 ${text}`}>{draft.reviewed ? "Assisted practice." : "Use a hint when you need it."}</p>
        {draft.hints > 0 && <ol className={`mt-2 list-decimal space-y-1 pl-5 ${text}`}>{hints.slice(0, draft.hints).map(hint => <li key={hint}>{hint}</li>)}</ol>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={button} disabled={draft.hints >= hints.length || !lab.ready || lab.recoveryRequired}
            onClick={() => lab.edit({ hints: draft.hints + 1, reviewed: true })}>Show next hint</button>
          <button type="button" className={button} aria-expanded={workedVisible} aria-controls="gcp-worked"
            disabled={!lab.ready || lab.recoveryRequired}
            onClick={() => { if (!workedVisible && !draft.reviewed) lab.edit({ reviewed: true }); setRevealed(!workedVisible); }}>
            {workedVisible ? "Hide worked policy" : "Reveal worked policy"}
          </button>
        </div>
        {workedVisible && <div id="gcp-worked" className="mt-4 space-y-3">
          <JsonDetails title="Worked policy JSON" value={pubsubContent.policies.reference} />
          <button type="button" className={button} onClick={() => lab.edit({ policyText: prettyPubsub(pubsubContent.policies.reference), reviewed: true })}>Use worked policy</button>
          <p className={text}>Commit by producer and event ID, then ACK. m2’s commit survives the crash. Its retry and the separate m3 publication both skip the existing event. An event ID alone works in this fixture because it is globally unique. A message ID misses republication, and an order ID merges distinct payments.</p>
        </div>}
        <p className={`mt-4 ${text}`}>Reflection: why can two separate publications still duplicate a payment even when transport delivery is scoped to a message ID? Use the expected states to check this exercise.</p>
        <details className="mt-3">
          <summary className={`cursor-pointer text-sm font-semibold text-teal-200 ${focus}`}>Pub/Sub service references and simulation rules</summary>
          <p className={`mt-2 ${text}`}>The simulator chooses the oldest pending publication, allows one active delivery, and models successful ACK operations. The ledger and deduplication decision commit atomically within this exercise.</p>
          <ul className={`mt-2 list-disc space-y-2 pl-5 ${text}`}>
            {pubsubContent.sourceReview.primary_sources.map(({ url, verified_point }) =>
              <li key={url}>{verified_point} <a className={`text-teal-200 underline ${focus}`} href={url}>Google Cloud documentation</a></li>)}
          </ul>
        </details>
      </>)}
      {section("device", "Save on this device", <>
        <p className={`mt-2 ${text}`}>Save your drafts, ledger, ACKs and trace in this browser. {lab.dirty ? "Unsaved changes." : ""}</p>
        <button type="button" className={`${button} mt-3`} disabled={blocked || !!lab.conflict} onClick={lab.save}>Save on this device</button>
        <p role={lab.deviceError ? "alert" : "status"} id="gcp-device-message" className={`mt-2 break-words ${text}`}>{lab.deviceMessage}</p>
        {lab.conflict && <div className="mt-3 rounded-xl border border-amber-300/60 p-3">
          <p className={text}>Another tab changed the saved copy. Choose which run to keep.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={button} disabled={lab.recoveryRequired || lab.busy} onClick={lab.keepCurrent}>Keep my run and save</button>
            <button type="button" className={button} disabled={lab.conflict.raw === null || lab.busy} onClick={lab.loadOther}>Load other saved copy</button>
          </div>
        </div>}
        {lab.invalidSave && <button type="button" className={`${button} mt-3`} disabled={lab.busy}
          onClick={lab.recoverBaseline}>Start a clean baseline</button>}
        <p className={`mt-3 ${text}`}>The worker has 5 seconds to load and 1 second to execute. Each editor allows 60,000 UTF-8 bytes. The serialized worker request and saved copy each allow 300,000 bytes. Results include confirmed state and up to 512 trace actions within 160,000 bytes.</p>
      </>)}
    </div>
  </main>;
}
