import assert from "node:assert/strict";
import { getScenarioContinuationSlug } from "../frontend/lib/scenario-continuation";
import { getScenarioBySlug } from "../frontend/lib/scenarios";
import type { PysparkValidationResponse } from "../frontend/lib/types";

const source = "yesterdays-sales-missing-late-source-arrival";
const target = "airflow-green-dashboard-wrong";
const pass: PysparkValidationResponse = {
  validation_type: "PYSPARK_OUTPUT_MATCH", mode: "sample", passed: true,
  message: "Output matched", execution_engine: "local",
  tests: [{ name: "visible sales", passed: true, message: "Matched" }]
};

assert.equal(getScenarioBySlug(source)?.isFree, true);
assert.equal(getScenarioBySlug(target)?.title, "DAG Green but Dashboard Wrong");
assert.equal(getScenarioBySlug(target)?.isFree, false, "Continuation must clearly require Premium");
assert.equal(getScenarioContinuationSlug(source, pass), target);
assert.equal(getScenarioContinuationSlug(source, { ...pass, mode: "hidden" }), target);
assert.equal(getScenarioContinuationSlug(source, { ...pass, execution_engine: "remote" }), target);
assert.equal(getScenarioContinuationSlug(source, null), null, "Review/legacy Done alone must not qualify");
assert.equal(getScenarioContinuationSlug("another-scenario", pass), null);
assert.equal(getScenarioContinuationSlug(source, { ...pass, passed: false }), null);
assert.equal(getScenarioContinuationSlug(source, { ...pass, tests: [] }), null);
assert.equal(getScenarioContinuationSlug(source, {
  ...pass, tests: [{ name: "executor", passed: false, message: "Unavailable" }]
}), null, "An unavailable or inconsistent result must not qualify");
console.log("Scenario continuation passed: sample/hidden successes, failure/unavailability/review exclusions, exact destination and Premium access.");
