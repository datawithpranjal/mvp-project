import initSqlJs from "sql.js";
import { evaluateModellingSql, type ReportStage } from "../lib/data-modelling";

const engine = initSqlJs({ locateFile: () => "/vendor/sqljs/sql-wasm.wasm" });
engine.then(() => self.postMessage({ type: "ready" })).catch(() => self.postMessage({ type: "unavailable" }));
self.onmessage = async (event: MessageEvent<{ id: number; fixture: string; stage: ReportStage; sql: string }>) => {
  const { id, fixture, stage, sql } = event.data;
  try {
    const SQL = await engine;
    self.postMessage({ type: "result", id, result: evaluateModellingSql(SQL, fixture, stage, sql) });
  } catch {
    self.postMessage({ type: "unavailable", id });
  }
};
