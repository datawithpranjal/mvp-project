import { ENGINE_LOAD_BUDGET_MS, QUERY_BUDGET_MS, type ModellingResult, type ReportStage } from "./data-modelling";

export interface ModellingWorker {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (value: unknown) => void;
  terminate: () => void;
}
export type RunOutcome = { kind: "result"; result: ModellingResult } | { kind: "cancelled" | "timeout" | "unavailable" };
export function startModellingRun(
  request: { id: number; fixture: string; stage: ReportStage; sql: string },
  done: (outcome: RunOutcome) => void,
  createWorker: () => ModellingWorker = () => new Worker(new URL("../workers/data-modelling.worker.ts", import.meta.url))
) {
  let worker: ModellingWorker;
  let settled = false;
  let timer: ReturnType<typeof setTimeout>;
  function finish(outcome: RunOutcome) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    worker?.terminate();
    done(outcome);
  }
  try {
    worker = createWorker();
    timer = setTimeout(() => finish({ kind: "unavailable" }), ENGINE_LOAD_BUDGET_MS);
    worker.onerror = () => finish({ kind: "unavailable" });
    worker.onmessage = event => {
      if (settled) return;
      const message = event.data;
      if (message.type === "ready") {
        clearTimeout(timer);
        timer = setTimeout(() => finish({ kind: "timeout" }), QUERY_BUDGET_MS);
        worker.postMessage(request);
      } else if (message.type === "unavailable") finish({ kind: "unavailable" });
      else if (message.type === "result" && message.id === request.id) finish({ kind: "result", result: message.result });
    };
  } catch { queueMicrotask(() => finish({ kind: "unavailable" })); }
  return { cancel: () => finish({ kind: "cancelled" }) };
}
