import { ADF_LOAD_MS, ADF_RUN_MS, type AdfReply, type AdfRequest } from "./azure-adf";
export interface AdfWorker { onmessage: ((event: MessageEvent) => void) | null; onerror: ((event: ErrorEvent) => void) | null; postMessage: (value: AdfRequest) => void; terminate: () => void }
export type AdfOutcome = { kind: "reply"; reply: AdfReply } | { kind: "cancelled" | "timeout" | "unavailable" };
export function startAdfRun(request: AdfRequest, done: (outcome: AdfOutcome) => void,
  createWorker: () => AdfWorker = () => new Worker(new URL("../workers/azure-adf.worker.ts", import.meta.url))) {
  let worker: AdfWorker | undefined, settled = false, ready = false;
  let timer: ReturnType<typeof setTimeout>;
  const finish = (outcome: AdfOutcome) => { if (settled) return; settled = true; clearTimeout(timer); worker?.terminate(); done(outcome); };
  try {
    worker = createWorker(); timer = setTimeout(() => finish({ kind: "unavailable" }), ADF_LOAD_MS);
    worker.onerror = () => finish({ kind: "unavailable" });
    worker.onmessage = event => {
      if (settled) return;
      const data = event.data;
      if (data.type === "ready" && !ready) { ready = true; clearTimeout(timer); timer = setTimeout(() => finish({ kind: "timeout" }), ADF_RUN_MS); try { worker!.postMessage(request); } catch { finish({ kind: "unavailable" }); } }
      else if (data.type === "reply" && data.id === request.id) finish({ kind: "reply", reply: data.reply });
    };
  } catch { queueMicrotask(() => finish({ kind: "unavailable" })); }
  return { cancel: () => finish({ kind: "cancelled" }) };
}
