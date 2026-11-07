import { PROJECT_LOAD_MS, PROJECT_QUERY_MS, type ProjectRequest, type ProjectStageResult } from "./project-pipeline";

export interface ProjectWorker {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (request: ProjectRequest) => void;
  terminate: () => void;
}
export type ProjectOutcome = { kind: "result"; result: ProjectStageResult } | { kind: "cancelled" | "timeout" | "unavailable" };
export function startProjectRun(request: ProjectRequest, done: (result: ProjectOutcome) => void,
  createWorker: () => ProjectWorker = () => new Worker(new URL("../workers/project-pipeline.worker.ts", import.meta.url))) {
  let worker: ProjectWorker | undefined;
  let settled = false, ready = false;
  let timer: ReturnType<typeof setTimeout>;
  const finish = (outcome: ProjectOutcome) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    worker?.terminate();
    done(outcome);
  };
  try {
    worker = createWorker();
    timer = setTimeout(() => finish({ kind: "unavailable" }), PROJECT_LOAD_MS);
    worker.onerror = () => finish({ kind: "unavailable" });
    worker.onmessage = event => {
      if (settled) return;
      const data = event.data;
      if (data.type === "ready" && !ready) {
        ready = true;
        clearTimeout(timer);
        timer = setTimeout(() => finish({ kind: "timeout" }), PROJECT_QUERY_MS);
        try { worker!.postMessage(request); } catch { finish({ kind: "unavailable" }); }
      } else if (data.type === "unavailable") finish({ kind: "unavailable" });
      else if (data.type === "result" && data.id === request.id) finish({ kind: "result", result: data.result });
    };
  } catch { queueMicrotask(() => finish({ kind: "unavailable" })); }
  return { cancel: () => finish({ kind: "cancelled" }) };
}
