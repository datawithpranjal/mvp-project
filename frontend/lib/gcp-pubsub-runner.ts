import { encodePubsub, GCP_LOAD_MS, GCP_REQUEST_BYTES, GCP_RUN_MS, readPubsubReply,
  type PubsubReply, type PubsubRequest } from "./gcp-pubsub";

interface PubsubWorker {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (payload: string) => void;
  terminate: () => void;
}
export type PubsubOutcome =
  | { kind: "reply"; reply: PubsubReply }
  | { kind: "cancelled" | "load-timeout" | "execution-timeout" | "unavailable" }
  | { kind: "resource"; message: string };

export function startPubsubRun(request: PubsubRequest, done: (outcome: PubsubOutcome) => void,
  createWorker: () => PubsubWorker = () => new Worker(new URL("../workers/gcp-pubsub.worker.ts", import.meta.url))) {
  let worker: PubsubWorker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let ready = false;
  function finish(outcome: PubsubOutcome) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    worker?.terminate();
    done(outcome);
  }
  const cancel = () => finish({ kind: "cancelled" });
  let payload: string;
  try {
    payload = encodePubsub(request, GCP_REQUEST_BYTES, "worker request");
  } catch (error) {
    queueMicrotask(() => finish({ kind: "resource", message: (error as Error).message }));
    return { cancel };
  }
  try {
    timer = setTimeout(() => finish({ kind: "load-timeout" }), GCP_LOAD_MS);
    const instance = createWorker();
    worker = instance;
    instance.onerror = () => finish({ kind: "unavailable" });
    instance.onmessage = event => {
      if (settled || typeof event.data !== "string") return;
      if (event.data === "ready") {
        if (ready) return;
        ready = true;
        clearTimeout(timer);
        timer = setTimeout(() => finish({ kind: "execution-timeout" }), GCP_RUN_MS);
        try { instance.postMessage(payload); }
        catch { finish({ kind: "unavailable" }); }
        return;
      }
      if (!ready) return;
      let reply: PubsubReply | null;
      try { reply = readPubsubReply(event.data, request.id); }
      catch { finish({ kind: "unavailable" }); return; }
      if (reply) finish({ kind: "reply", reply });
    };
  } catch {
    queueMicrotask(() => finish({ kind: "unavailable" }));
  }
  return { cancel };
}
