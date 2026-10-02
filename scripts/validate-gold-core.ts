import { OPERATIONS_LABS } from "../frontend/data/platform-operations-labs";
import { getCodingLabBySlug, type CodingLab } from "../frontend/lib/coding-labs";
import { GOLD_CORE_ITEMS } from "../frontend/lib/gold-core";
import { getScenarioBySlug } from "../frontend/lib/scenarios";
import { SYSTEM_DESIGN_CASES } from "../frontend/lib/system-design";

const errors: string[] = [];

function fail(slug: string, message: string) {
  errors.push(`${slug}: ${message}`);
}

function requireText(slug: string, label: string, value: string | undefined, minimum: number) {
  if (!value || value.trim().length < minimum) {
    fail(slug, `${label} must contain at least ${minimum} characters.`);
  }
}

function normalizedSolution(lab: CodingLab): string {
  return (lab.expectedSql ?? lab.solutionCode)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

if (GOLD_CORE_ITEMS.length !== 30) {
  fail("gold-core", `Expected exactly 30 items, found ${GOLD_CORE_ITEMS.length}.`);
}

const slugs = GOLD_CORE_ITEMS.map((item) => item.slug);
if (new Set(slugs).size !== slugs.length) {
  fail("gold-core", "Every Gold Core slug must be unique.");
}

const orders = GOLD_CORE_ITEMS.map((item) => item.order);
if (orders.some((order, index) => order !== index + 1)) {
  fail("gold-core", "Orders must be unique and continuous from 1 to 30.");
}

const expectedModuleCounts: Record<string, number> = {
  "SQL correctness": 8,
  "Python for pipelines": 5,
  "PySpark production": 5,
  "Airflow and operations": 4,
  "AWS judgment": 2,
  "Broken-pipeline scenarios": 2,
  "System design": 4
};

for (const [module, expectedCount] of Object.entries(expectedModuleCounts)) {
  const actualCount = GOLD_CORE_ITEMS.filter((item) => item.module === module).length;
  if (actualCount !== expectedCount) {
    fail("gold-core", `${module} must contain ${expectedCount} items; found ${actualCount}.`);
  }
}

const goldCodingLabs: CodingLab[] = [];

for (const item of GOLD_CORE_ITEMS) {
  requireText(item.slug, "competency", item.competency, 12);
  requireText(item.slug, "prerequisite", item.prerequisite, 8);
  if (item.estimatedMinutes < 10 || item.estimatedMinutes > 60) {
    fail(item.slug, "Estimated time must stay between 10 and 60 minutes.");
  }

  if (item.kind === "coding") {
    const lab = getCodingLabBySlug(item.slug);
    if (!lab) {
      fail(item.slug, "Coding lab does not exist or is not launch-ready.");
      continue;
    }
    goldCodingLabs.push(lab);
    if (lab.track !== item.track) fail(item.slug, `Manifest track ${item.track} does not match ${lab.track}.`);
    requireText(item.slug, "business context", lab.businessContext, 80);
    requireText(item.slug, "problem statement", lab.problemStatement, 70);
    requireText(item.slug, "student task", lab.studentTask, 35);
    requireText(item.slug, "explanation", lab.explanation, 130);
    if (lab.hints.length < 3) fail(item.slug, "Gold coding labs require three progressive hints.");
    if ((lab.commonMistakes?.length ?? 0) < 2) fail(item.slug, "Gold coding labs require at least two common mistakes.");

    if (lab.track === "sql") {
      if (!lab.expectedSql?.trim()) fail(item.slug, "Gold SQL labs require an expected query.");
      if (!lab.tables.length) fail(item.slug, "Gold SQL labs require visible source tables.");
      if (!lab.sqlTestCases?.length) fail(item.slug, "Gold SQL labs require a hidden edge-case dataset.");
      if (lab.sqlTestCases?.some((test) => !test.description.trim() || !test.expectedSql?.trim())) {
        fail(item.slug, "Every SQL edge case requires a description and expected query.");
      }
    }

    if (lab.track === "python") {
      if (lab.serverValidation !== "python") fail(item.slug, "Gold Python labs must use server validation.");
      if (!lab.functionName) fail(item.slug, "Gold Python labs require an explicit function contract.");
      if (!lab.testCases?.length) fail(item.slug, "Gold Python labs require a visible example plus hidden server checks.");
    }

    if (lab.track === "pyspark") {
      if (lab.validationMode !== "pyspark") fail(item.slug, "Gold PySpark labs cannot use keyword-only review scoring.");
      if (!lab.expectedOutputTable) fail(item.slug, "Gold PySpark labs require an expected DataFrame.");
      if (!lab.solutionCode.trim()) fail(item.slug, "Gold PySpark labs require a reviewed solution.");
    }
    continue;
  }

  if (item.kind === "scenario") {
    const lab = getScenarioBySlug(item.slug);
    if (!lab) {
      fail(item.slug, "Scenario does not exist or is not launch-ready.");
      continue;
    }
    requireText(item.slug, "business context", lab.businessContext, 80);
    requireText(item.slug, "problem statement", lab.problemStatement, 70);
    requireText(item.slug, "model solution", lab.modelSolution, 180);
    requireText(item.slug, "production explanation", lab.productionExplanation, 100);
    if (lab.hints.length < 3) fail(item.slug, "Gold scenarios require three progressive hints.");
    if (lab.commonMistakes.length < 2) fail(item.slug, "Gold scenarios require at least two common mistakes.");
    if (lab.followUps.length < 2) fail(item.slug, "Gold scenarios require at least two follow-up questions.");
    if (Object.values(lab.evaluationRubric).reduce((sum, value) => sum + value, 0) !== 100) {
      fail(item.slug, "Scenario evaluation rubric must total 100.");
    }
    continue;
  }

  if (item.kind === "operations") {
    const lab = OPERATIONS_LABS.find((candidate) => candidate.slug === item.slug);
    if (!lab) {
      fail(item.slug, "Operations lab does not exist or is not launch-ready.");
      continue;
    }
    requireText(item.slug, "business context", lab.businessContext, 70);
    requireText(item.slug, "problem statement", lab.problemStatement, 70);
    requireText(item.slug, "evidence", lab.evidence, 40);
    if (lab.hints.length < 3) fail(item.slug, "Gold operations labs require three progressive hints.");
    if (lab.expectedKeywords.length < 4) fail(item.slug, "Gold operations labs require at least four rubric concepts.");
    for (const [section, value] of Object.entries(lab.modelAnswer)) {
      requireText(item.slug, `model answer ${section}`, value, 80);
    }
    continue;
  }

  const design = SYSTEM_DESIGN_CASES.find((candidate) => candidate.slug === item.slug);
  if (!design) {
    fail(item.slug, "System-design case does not exist or is not launch-ready.");
    continue;
  }
  requireText(item.slug, "business context", design.businessContext, 100);
  requireText(item.slug, "learner task", design.learnerTask, 70);
  if (design.hints.length < 3) fail(item.slug, "Gold system-design cases require three progressive hints.");
  if (!design.decisions.length) fail(item.slug, "Gold system-design cases require an explicit decision point.");
  if (design.followUps.length < 2) fail(item.slug, "Gold system-design cases require at least two follow-up questions.");
  if (design.evaluationKeywords.length < 6) fail(item.slug, "Gold system-design cases require a detailed evaluation rubric.");
  for (const [section, value] of Object.entries(design.modelAnswer)) {
    requireText(item.slug, `model answer ${section}`, value, 90);
  }
}

const solutionOwners = new Map<string, string>();
for (const lab of goldCodingLabs) {
  const solution = normalizedSolution(lab);
  if (!solution) continue;
  const existing = solutionOwners.get(solution);
  if (existing) {
    fail(lab.slug, `Duplicates the reviewed solution used by ${existing}.`);
  } else {
    solutionOwners.set(solution, lab.slug);
  }
}

if (errors.length) {
  console.error(`Gold Core validation failed with ${errors.length} issue(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(
  `Gold Core validation passed: ${GOLD_CORE_ITEMS.length} reviewed items across ${Object.keys(expectedModuleCounts).length} modules.`
);
