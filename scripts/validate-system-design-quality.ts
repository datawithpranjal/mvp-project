import assert from "node:assert/strict";
import { ALL_SYSTEM_DESIGN_CASES } from "../frontend/lib/system-design";
import { INTERVIEW_SYSTEM_DESIGN_CASES } from "../frontend/data/system-design-interview-cases";
import { LAUNCH_READY_SYSTEM_DESIGN_SLUGS } from "../frontend/lib/launch-ready-content";

assert.equal(ALL_SYSTEM_DESIGN_CASES.length, 20);
assert.equal(INTERVIEW_SYSTEM_DESIGN_CASES.length, 10);
for (const key of ["id", "slug", "title"] as const) {
  assert.equal(new Set(ALL_SYSTEM_DESIGN_CASES.map(c => c[key])).size, 20, `Duplicate ${key}`);
}
for (const c of ALL_SYSTEM_DESIGN_CASES) {
  assert.match(c.businessContext, /fictional workload/i, `${c.slug}: distinguish assumptions from facts`);
  assert.match(c.businessContext, /\d/, `${c.slug}: missing workload`);
  for (const key of ["hints", "followUps", "functionalRequirements", "nonFunctionalRequirements"] as const) {
    assert.ok(c[key].length >= 3, `${c.slug}: ${key}`);
    assert.equal(new Set(c[key]).size, c[key].length, `${c.slug}: repeated ${key}`);
  }
  assert.ok(c.learnerTask.length > 130, `${c.slug}: shallow task`);
  assert.match(c.modelAnswer.reliability, /test|verify|compare|assert|replay|inject/i, `${c.slug}: missing verification`);
  for (const value of Object.values(c.modelAnswer)) assert.ok(value.length > 65, `${c.slug}: shallow reference`);
  assert.ok(c.decisions.length > 0);
  assert.equal(new Set(c.decisions.map(d => d.id)).size, c.decisions.length);
  for (const d of c.decisions) {
    assert.equal(d.options.filter(o => o.isBest).length, 1);
    assert.equal(new Set(d.options.map(o => o.id)).size, d.options.length);
    assert.ok(d.options.every(o => o.feedback.trim().length > 25));
  }
}
for (const c of INTERVIEW_SYSTEM_DESIGN_CASES) {
  assert.equal(c.isFree, false);
  assert.ok((LAUNCH_READY_SYSTEM_DESIGN_SLUGS as readonly string[]).includes(c.slug));
}
assert.deepEqual(ALL_SYSTEM_DESIGN_CASES.filter(c => c.isFree).map(c => c.id), ["system-design-001", "system-design-002", "system-design-003", "system-design-004"]);
const cdc = ALL_SYSTEM_DESIGN_CASES.find(c => c.slug === "postgres-cdc-to-warehouse")!;
assert.match(cdc.modelAnswer.processing, /LSN alone need not uniquely/);
assert.match(cdc.modelAnswer.storageModel, /deletion metadata/);
const revenue = ALL_SYSTEM_DESIGN_CASES.find(c => c.slug === "daily-revenue-mart")!;
assert.match(revenue.modelAnswer.reliability, /850/);
assert.match(revenue.modelAnswer.processing, /allocation rule/);
console.log("PASS: 20 unique cases, workload/verification coverage, stable free tiers, 10 new curated cases, CDC and revenue regression checks. Not proof of live AI calibration.");
