import { executeAdfRequest, type AdfRequest } from "../lib/azure-adf";
self.postMessage({ type: "ready" });
self.onmessage = (event: MessageEvent<AdfRequest>) => {
  self.postMessage({ type: "reply", id: event.data.id, reply: executeAdfRequest(event.data) });
};
