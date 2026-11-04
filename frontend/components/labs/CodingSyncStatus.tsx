import { codingSyncMessage, type CodingSyncDetails } from "../../lib/coding-sync-feedback";

export function CodingSyncStatus({ localStatus, details, conflict, onRetryLoad, onRetrySave, onRetryLocal, onSignIn }: {
  localStatus: string;
  details?: CodingSyncDetails;
  conflict: boolean;
  onRetryLoad: () => void;
  onRetrySave: () => void;
  onRetryLocal: () => void;
  onSignIn: () => void;
}) {
  const actionClass = "rounded-full border border-amber-300/40 px-4 py-3 text-sm font-semibold text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-2)] disabled:opacity-50";
  return <section aria-label="Draft saving" className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
    <div aria-live="polite">
      <p>{conflict ? "Draft choice needed — automatic saving paused" : localStatus}</p>
      {!conflict && details ? <p className="mt-2">{codingSyncMessage(details)}</p> : null}
    </div>
    {!conflict && localStatus.startsWith("Device save failed") ? <button type="button" className={actionClass} onClick={onRetryLocal}>Retry device save</button> : null}
    {!conflict && details?.outcome === "failure" ? <div className="flex flex-wrap gap-3">
      {details.class === "session-required" ? <button type="button" className={actionClass} onClick={onSignIn}>Sign in</button> : null}
      <button type="button" className={actionClass} onClick={details.operation === "load" ? onRetryLoad : onRetrySave}>{details.operation === "load" ? "Retry loading account progress" : "Retry saving draft"}</button>
    </div> : null}
    {!conflict && details ? <details key={`${details.operation}-${details.outcome}-${details.trigger}`} className="rounded-xl border border-slate-700 p-3">
      <summary className="cursor-pointer font-semibold text-teal-100">Sync details</summary>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 break-words">
        <dt>Operation</dt><dd>{details.operation}</dd>
        <dt>Outcome</dt><dd>{details.outcome}</dd>
        <dt>HTTP status</dt><dd>{details.status ?? "Not available"}</dd>
        <dt>Class</dt><dd>{details.class}</dd>
        <dt>Duration</dt><dd>{details.durationBucket}</dd>
        <dt>Trigger</dt><dd>{details.trigger}</dd>
        <dt>Manual retry</dt><dd>{details.manualRetry ? "Yes" : "No"}</dd>
      </dl>
    </details> : null}
  </section>;
}
