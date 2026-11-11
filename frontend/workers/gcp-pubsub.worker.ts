import { executePubsubRequest } from "../lib/gcp-pubsub";

self.postMessage("ready");
self.onmessage = (event: MessageEvent<unknown>) => self.postMessage(executePubsubRequest(event.data));
