import { getCodingLabs, type CodingLab } from "../frontend/lib/coding-labs";
import { getScenarios, type Scenario } from "../frontend/lib/scenarios";
import {
  OPERATIONS_LABS,
  type OperationsLab
} from "../frontend/data/platform-operations-labs";

interface ContentWarning {
  category: string;
  id: string;
  message: string;
  severe?: boolean;
}

const warnings: ContentWarning[] = [];
const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function addWarning(category: string, id: string, message: string, severe = false) {
  warnings.push({ category, id, message, severe });
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function repeatedValues<T>(
  items: T[],
  valueFor: (item: T) => string,
  idFor: (item: T) => string,
  label: string
) {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const value = normalized(valueFor(item));
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), idFor(item)]);
  }

  for (const ids of groups.values()) {
    if (ids.length > 1) {
      addWarning(label, ids[0], `Repeated across ${ids.length} records: ${ids.slice(0, 5).join(", ")}`);
    }
  }
}

function expectedTopicFromText(text: string): string | null {
  const value = normalized(text);
  if (/\b(finance|ledger|debit|credit|account movement)\b/.test(value)) return "finance";
  if (/\b(salary|employee|department ranking|workforce|payroll)\b/.test(value)) return "workforce";
  if (/\b(revenue|order|commerce|product sales)\b/.test(value)) return "commerce";
  if (/\b(retention|first activity|activation cohort)\b/.test(value)) return "retention";
  if (/\b(inventory|warehouse|stock|bin)\b/.test(value)) return "warehouse";
  if (/\b(delivery|shipment|logistics|sla)\b/.test(value)) return "operations";
  return null;
}

function expectedTopicFromTags(tags: string[]): string | null {
  const value = normalized(tags.join(" "));
  if (/\bfinance\b/.test(value)) return "finance";
  if (/\b(workforce|salary|window functions)\b/.test(value)) return "workforce";
  if (/\b(commerce|revenue)\b/.test(value)) return "commerce";
  if (/\bretention\b/.test(value)) return "retention";
  if (/\bwarehouse\b/.test(value)) return "warehouse";
  if (/\boperations\b/.test(value)) return "operations";
  return null;
}

function validateCodingLab(lab: CodingLab) {
  const id = `coding:${lab.slug}`;
  if (!VALID_SLUG.test(lab.slug)) addWarning("invalid_slug", id, `Invalid route slug: ${lab.slug}`, true);
  if (typeof lab.isFree !== "boolean") addWarning("missing_access", id, "isFree must be true or false.", true);
  if (lab.topicTags.length === 0) addWarning("missing_skills", id, "No topic tags or skills configured.");
  if (!lab.expectedOutcome?.trim() && !lab.testCases?.length) {
    addWarning("missing_expected_output", id, "Expected outcome is empty.");
  }
  if (!lab.problemStatement.trim()) addWarning("missing_description", id, "Problem statement is empty.", true);
  if (lab.hints.length === 0) addWarning("missing_hints", id, "No question-specific hints configured.");

  if (lab.track === "sql") {
    if (lab.tables.length === 0) addWarning("missing_sample_data", id, "SQL lab has no sample tables.", true);
    if (!lab.expectedSql?.trim()) addWarning("missing_expected_output", id, "SQL lab has no expected query.", true);
    if (!lab.sqlTestCases?.length) addWarning("missing_edge_cases", id, "SQL lab has no edge-case test data.");
  }

  if (lab.track === "python" && !lab.testCases?.length) {
    addWarning("missing_sample_data", id, "Python lab has no executable input/output examples.");
  }

  if (lab.track === "pyspark" && !lab.validationKeywords?.length) {
    addWarning("missing_rubric", id, "PySpark lab has no validation keywords.");
  }

  const titleTopic = expectedTopicFromText(lab.title);
  const contentTopic =
    expectedTopicFromTags(lab.topicTags) ??
    expectedTopicFromText(`${lab.businessContext} ${lab.problemStatement}`);
  if (titleTopic && contentTopic && titleTopic !== contentTopic) {
    addWarning(
      "title_category_mismatch",
      id,
      `Title looks like ${titleTopic}, but the lab content looks like ${contentTopic}.`
    );
  }
}

function validateScenario(scenario: Scenario) {
  const id = `scenario:${scenario.slug}`;
  if (!VALID_SLUG.test(scenario.slug)) addWarning("invalid_slug", id, `Invalid route slug: ${scenario.slug}`, true);
  if (typeof scenario.isFree !== "boolean") addWarning("missing_access", id, "isFree must be true or false.", true);
  if (scenario.tags.length === 0) addWarning("missing_skills", id, "No skills configured.");
  if (!scenario.problemStatement.trim()) addWarning("missing_description", id, "Problem statement is empty.", true);
  if (!scenario.modelSolution.trim()) addWarning("missing_model_solution", id, "Model solution is empty.", true);
  if (Object.values(scenario.evaluationRubric).reduce((sum, value) => sum + value, 0) !== 100) {
    addWarning("missing_rubric", id, "Evaluation rubric must total 100.", true);
  }

  if (scenario.scenarioType === "broken_sql" || scenario.scenarioType === "output_mismatch") {
    if (!scenario.expectedOutput?.trim()) {
      addWarning("missing_expected_output", id, "Executable SQL scenario has no expected output.", true);
    }
    if (!scenario.sampleTables?.length) {
      addWarning("missing_sample_data", id, "Executable SQL scenario has no sample tables.", true);
    }
    if (!scenario.expectedSql?.trim()) {
      addWarning("missing_expected_output", id, "Executable SQL scenario has no expected SQL.", true);
    }
  }
}

function validateOperationsLab(lab: OperationsLab) {
  const id = `operations:${lab.slug}`;
  if (!VALID_SLUG.test(lab.slug)) addWarning("invalid_slug", id, `Invalid route slug: ${lab.slug}`, true);
  if (typeof lab.isFree !== "boolean") addWarning("missing_access", id, "isFree must be true or false.", true);
  if (!lab.problemStatement.trim()) addWarning("missing_description", id, "Problem statement is empty.", true);
  if (!lab.businessContext.trim()) addWarning("missing_context", id, "Business context is empty.");
  if (!lab.evidence.trim()) addWarning("missing_sample_data", id, "No code, log, or architecture evidence is configured.", true);
  if (lab.skills.length === 0) addWarning("missing_skills", id, "No skills configured.");
  if (lab.expectedKeywords.length < 4) addWarning("missing_rubric", id, "Expected-answer rubric has fewer than four concepts.");
  if (lab.hints.length === 0) addWarning("missing_hints", id, "No incident-specific hints configured.");
  if (lab.options.filter((option) => option.isCorrect).length !== 1) {
    addWarning("invalid_options", id, "Exactly one diagnosis option must be correct.", true);
  }
  if (Object.values(lab.modelAnswer).some((value) => !value.trim())) {
    addWarning("missing_model_solution", id, "Model answer sections must all be populated.", true);
  }
}

const codingLabs = getCodingLabs();
const scenarios = getScenarios();
const operationsLabs = OPERATIONS_LABS;

codingLabs.forEach(validateCodingLab);
scenarios.forEach(validateScenario);
operationsLabs.forEach(validateOperationsLab);

repeatedValues(codingLabs, (lab) => lab.title, (lab) => lab.slug, "duplicate_title");
repeatedValues(scenarios, (scenario) => scenario.title, (scenario) => scenario.slug, "duplicate_title");
repeatedValues(operationsLabs, (lab) => lab.title, (lab) => lab.slug, "duplicate_title");
repeatedValues(
  codingLabs,
  (lab) => lab.problemStatement,
  (lab) => lab.slug,
  "repeated_description"
);
repeatedValues(
  scenarios,
  (scenario) => scenario.problemStatement,
  (scenario) => scenario.slug,
  "repeated_description"
);
repeatedValues(
  operationsLabs,
  (lab) => lab.problemStatement,
  (lab) => lab.slug,
  "repeated_description"
);

const grouped = new Map<string, ContentWarning[]>();
for (const warning of warnings) {
  grouped.set(warning.category, [...(grouped.get(warning.category) ?? []), warning]);
}

console.log(
  `\nContent validation: ${codingLabs.length} coding labs, ${scenarios.length} scenarios, ${operationsLabs.length} operations labs`
);
if (warnings.length === 0) {
  console.log("No content warnings found.\n");
} else {
  for (const [category, categoryWarnings] of grouped) {
    console.log(`\n[${category}] ${categoryWarnings.length} warning(s)`);
    categoryWarnings.slice(0, 12).forEach((warning) => {
      console.log(`- ${warning.severe ? "SEVERE " : ""}${warning.id}: ${warning.message}`);
    });
    if (categoryWarnings.length > 12) {
      console.log(`- ... ${categoryWarnings.length - 12} more`);
    }
  }

  const severeCount = warnings.filter((warning) => warning.severe).length;
  console.log(`\nSummary: ${warnings.length} warning(s), ${severeCount} severe.`);
  console.log("Build remains non-blocking; resolve severe warnings before publishing affected content.\n");
}
