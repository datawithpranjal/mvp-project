import initSqlJs from "sql.js";
import { evaluateProjectStage, type ProjectRequest } from "../lib/project-pipeline";

const engine = initSqlJs({ locateFile: () => "/vendor/sqljs/sql-wasm.wasm" });
engine.then(() => self.postMessage({ type: "ready" })).catch(() => self.postMessage({ type: "unavailable" }));
self.onmessage = async (event: MessageEvent<ProjectRequest>) => {
  try {
    const SQL = await engine;
    self.postMessage({ type: "result", id: event.data.id, result: evaluateProjectStage(SQL, event.data) });
  } catch { self.postMessage({ type: "unavailable", id: event.data.id }); }
};
