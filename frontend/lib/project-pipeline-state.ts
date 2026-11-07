import type { BrowserSqlResultTable } from "./browser-sql";
import type { ProjectOutcome } from "./project-pipeline-runner";
import {
  PROJECT_STAGES, PROJECT_SQL_LIMIT, expectedProjectTable, projectQueries, snapshotNames,
  strictProjectMatch, validExpected, type ProjectStage, type ProjectStageResult
} from "./project-pipeline";

export interface ProjectDraft {
  version: 1; revision: string; fixture: string; queries: Record<ProjectStage, string>;
  hints: number; reviewed: ProjectStage[];
}
export interface PublishedProjectReport {
  id: string; fixture: string; signature: string; report: BrowserSqlResultTable;
  publishedAt: string; assisted: boolean; emptyRowsOnly: boolean;
}
interface CheckedStage { signature: string; result: ProjectStageResult }
export interface ProjectState {
  draft: ProjectDraft; results: Partial<Record<ProjectStage, CheckedStage>>;
  running: { id: number; stage: ProjectStage; signature: string } | null;
  lastPublished: PublishedProjectReport | null; failureBeforePublish: boolean; message: string;
}
export function initialProjectState(): ProjectState {
  return { draft: { version: 1, revision: "", fixture: "baseline", queries: { ...projectQueries.starter }, hints: 0, reviewed: [] },
    results: {}, running: null, lastPublished: null, failureBeforePublish: false, message: "Run Stage 1, then use its actual output in Stage 2 and Stage 3. Previews are unpublished." };
}
export function stageSignature(draft: ProjectDraft, stage: ProjectStage): string {
  return JSON.stringify([draft.fixture, ...PROJECT_STAGES.slice(0, PROJECT_STAGES.indexOf(stage) + 1).map(s => draft.queries[s])]);
}
export function checkedStage(state: ProjectState, stage: ProjectStage): boolean {
  const checked = state.results[stage];
  return !!checked && checked.signature === stageSignature(state.draft, stage) && ["match", "empty"].includes(checked.result.state);
}
export function canRunProjectStage(state: ProjectState, stage: ProjectStage): boolean {
  return !state.running && PROJECT_STAGES.slice(0, PROJECT_STAGES.indexOf(stage)).every(s => checkedStage(state, s));
}
export function changeProjectDraft(state: ProjectState, draft: ProjectDraft): ProjectState {
  let first = state.draft.fixture === draft.fixture ? PROJECT_STAGES.findIndex(s => state.draft.queries[s] !== draft.queries[s]) : 0;
  if (first < 0) return { ...state, draft };
  const results = { ...state.results };
  for (const stage of PROJECT_STAGES.slice(first)) delete results[stage];
  return { ...state, draft, results, running: null, failureBeforePublish: false,
    message: "Input or query changed. Affected previews are invalidated; other drafts and the last published report are preserved." };
}
export function beginProjectRun(state: ProjectState, id: number, stage: ProjectStage): ProjectState {
  if (!canRunProjectStage(state, stage)) return state;
  const results = { ...state.results };
  for (const s of PROJECT_STAGES.slice(PROJECT_STAGES.indexOf(stage))) delete results[s];
  return { ...state, results, failureBeforePublish: false, running: { id, stage, signature: stageSignature(state.draft, stage) }, message: `Running ${stage}. Cancel terminates this worker; last published report is preserved.` };
}
export function finishProjectRun(state: ProjectState, id: number, outcome: ProjectOutcome): ProjectState {
  const run = state.running;
  if (!run || run.id !== id || run.signature !== stageSignature(state.draft, run.stage)) return state;
  if (outcome.kind === "result") return { ...state, running: null,
    results: { ...state.results, [run.stage]: { signature: run.signature, result: outcome.result } }, message: outcome.result.message };
  const message = outcome.kind === "timeout" ? "Stopped after the 3-second query budget. Execution terminated; simplify and retry."
    : outcome.kind === "cancelled" ? "Run cancelled. Execution terminated; retry when ready."
    : "SQL engine unavailable. Check the connection and retry Run to load a fresh worker.";
  return { ...state, running: null, message: message + " All drafts and the last published report/run ID are preserved." };
}
export function injectProjectFailure(state: ProjectState): ProjectState {
  if (state.running || !checkedStage(state, "current_orders")) return state;
  const results = { ...state.results }; delete results.daily_revenue;
  return { ...state, results, failureBeforePublish: true,
    message: "Simulated failure after Stage 2, before publication. Last published report and run ID are unchanged. Retry Stage 3, then explicitly publish." };
}
export function canPublishProject(state: ProjectState): boolean {
  return !state.running && !state.failureBeforePublish && PROJECT_STAGES.every(stage => checkedStage(state, stage));
}
export function publishProjectReport(state: ProjectState, id: string, publishedAt: string): ProjectState {
  if (!canPublishProject(state)) return { ...state, message: "Publish blocked: match all three stages on the current input/query revisions first. Last good report is unchanged." };
  const report = state.results.daily_revenue!.result.actual;
  return { ...state, lastPublished: { id, fixture: state.draft.fixture, signature: stageSignature(state.draft, "daily_revenue"),
    report: { columns: [...report.columns], rows: report.rows.map(row => [...row]) }, publishedAt,
    assisted: state.draft.hints > 0 || state.draft.reviewed.length > 0, emptyRowsOnly: state.draft.fixture === "empty" },
    message: "Simulated report published on this device. This is a local teaching snapshot, not a warehouse transaction or cloud completion." };
}
export function serializeProjectState(state: ProjectState, revision: string): string {
  return JSON.stringify({ draft: { ...state.draft, revision }, lastPublished: state.lastPublished });
}
export function parseProjectState(raw: string): ProjectState {
  if (raw.length > 200000) throw new Error("Saved device copy exceeds the supported limit.");
  const saved = JSON.parse(raw), d = saved?.draft as ProjectDraft;
  if (!d || d.version !== 1 || typeof d.revision !== "string" || d.revision.length > 100 || !snapshotNames.includes(d.fixture) ||
    !d.queries || !PROJECT_STAGES.every(s => typeof d.queries[s] === "string" && d.queries[s].length <= PROJECT_SQL_LIMIT) ||
    !Number.isInteger(d.hints) || d.hints < 0 || d.hints > 3 || !Array.isArray(d.reviewed) ||
    d.reviewed.length > 3 || !d.reviewed.every(s => PROJECT_STAGES.includes(s))) throw new Error("Saved draft version or content is unsupported. Current editors are preserved.");
  const published = saved.lastPublished as PublishedProjectReport | null;
  if (published && (typeof published.id !== "string" || published.id.length > 100 || !Object.prototype.hasOwnProperty.call(validExpected, published.fixture) ||
    typeof published.signature !== "string" || published.signature.length > 61000 || typeof published.publishedAt !== "string" ||
    !Number.isFinite(Date.parse(published.publishedAt)) || typeof published.assisted !== "boolean" || published.emptyRowsOnly !== (published.fixture === "empty") ||
    !published.report || !Array.isArray(published.report.rows) || !Array.isArray(published.report.columns) ||
    !(published.fixture === "empty" && published.emptyRowsOnly && published.report.rows.length === 0 ||
      strictProjectMatch(published.report, expectedProjectTable(published.fixture, "daily_revenue"), "daily_revenue")))) throw new Error("Saved report snapshot is unsupported. Current editors are preserved.");
  return { ...initialProjectState(), draft: d, lastPublished: published ?? null,
    message: "Restored device-only drafts and saved report snapshot. Checks must be run again; saved run history is not independently reverified." };
}
