import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type ScenarioDomain =
  | "sql"
  | "pyspark"
  | "airflow"
  | "aws"
  | "kafka"
  | "data_quality"
  | "data_modeling"
  | "system_design"
  | "mixed";

type ScenarioType =
  | "mcq"
  | "broken_sql"
  | "broken_pyspark"
  | "log_analysis"
  | "output_mismatch"
  | "interview_explanation"
  | "mixed_lab";

interface ImportedScenario {
  id: string;
  title: string;
  slug: string;
  domain: ScenarioDomain;
  difficulty: "beginner" | "intermediate" | "advanced";
  scenarioType: ScenarioType;
  isFree: boolean;
  estimatedMinutes: number;
  tags: string[];
  businessContext: string;
  problemStatement: string;
  requirement: string;
  schema: string;
  sampleInput: string;
  brokenCode: string;
  actualOutput: string;
  expectedOutput: string;
  logs: string;
  mcqOptions: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
    explanation: string;
  }>;
  hints: string[];
  tasks: string[];
  modelSolution: string;
  productionExplanation: string;
  commonMistakes: string[];
  evaluationRubric: {
    rootCause: number;
    correctness: number;
    productionThinking: number;
    tradeoffs: number;
    communication: number;
  };
  followUps: string[];
}

const INPUT_PDF = path.resolve("docs/120-data-engineering-scenarios.pdf");
const OUTPUT_JSON = path.resolve("data/scenarios.generated.json");

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function inferDomain(text: string): ScenarioDomain {
  const lower = text.toLowerCase();
  if (lower.includes("pyspark") || lower.includes("spark")) return "pyspark";
  if (lower.includes("airflow") || lower.includes("dag")) return "airflow";
  if (lower.includes("kafka") || lower.includes("stream")) return "kafka";
  if (lower.includes("aws") || lower.includes("s3") || lower.includes("glue")) return "aws";
  if (lower.includes("quality") || lower.includes("dq") || lower.includes("reconciliation")) {
    return "data_quality";
  }
  if (lower.includes("sql") || lower.includes("join") || lower.includes("query")) return "sql";
  return "mixed";
}

function inferScenarioType(text: string, domain: ScenarioDomain): ScenarioType {
  const lower = text.toLowerCase();
  if (lower.includes("multiple choice") || lower.includes("mcq")) return "mcq";
  if (lower.includes("error") || lower.includes("log") || lower.includes("exception")) {
    return "log_analysis";
  }
  if (lower.includes("actual output") || lower.includes("expected output")) {
    return "output_mismatch";
  }
  if (domain === "sql") return "broken_sql";
  if (domain === "pyspark") return "broken_pyspark";
  return "mixed_lab";
}

function inferDifficulty(index: number, text: string): ImportedScenario["difficulty"] {
  const lower = text.toLowerCase();
  if (lower.includes("advanced") || lower.includes("system design")) return "advanced";
  if (lower.includes("beginner") || lower.includes("basic")) return "beginner";
  if (index <= 15) return "beginner";
  if (index <= 85) return "intermediate";
  return "advanced";
}

function splitScenarios(text: string): string[] {
  const normalized = text.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n");
  const chunks = normalized
    .split(/\n(?=(?:Scenario\s*)?\d{1,3}[\).:-]\s+)/gi)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 80);

  if (chunks.length > 10) {
    return chunks;
  }

  return normalized
    .split(/\n\s*Scenario\s+\d{1,3}\s*/gi)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 80);
}

function titleFromChunk(chunk: string, index: number): string {
  const firstLine = chunk
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const cleaned = (firstLine ?? `Scenario ${index}`)
    .replace(/^(Scenario\s*)?\d{1,3}[\).:-]\s*/i, "")
    .trim();
  return cleaned.length > 8 ? cleaned.slice(0, 120) : `Imported Scenario ${index}`;
}

function toScenario(chunk: string, index: number): ImportedScenario {
  const title = titleFromChunk(chunk, index);
  const domain = inferDomain(chunk);
  const scenarioType = inferScenarioType(chunk, domain);

  return {
    id: `pdf-scenario-${String(index).padStart(3, "0")}`,
    title,
    slug: slugify(title || `pdf-scenario-${index}`),
    domain,
    difficulty: inferDifficulty(index, chunk),
    scenarioType,
    isFree: index <= 15,
    estimatedMinutes: scenarioType === "mcq" ? 10 : 20,
    tags: [domain, scenarioType, "TODO: review"],
    businessContext: "TODO: Review imported PDF text and rewrite as business context.",
    problemStatement: chunk.slice(0, 1200),
    requirement: "TODO: Extract the exact business requirement.",
    schema: "",
    sampleInput: "",
    brokenCode: "",
    actualOutput: "",
    expectedOutput: "",
    logs: "",
    mcqOptions: [],
    hints: [
      "TODO: Add direction-only hint.",
      "TODO: Add what-to-check hint.",
      "TODO: Add partial-structure hint."
    ],
    tasks: [
      "Diagnose the issue.",
      "Fix or explain the production-safe solution.",
      "Explain the answer in interview style."
    ],
    modelSolution: "TODO: Rewrite the PDF solution as a practical model answer.",
    productionExplanation:
      "TODO: Explain the production lesson, validation, monitoring, and trade-offs.",
    commonMistakes: ["TODO: Add common mistake."],
    evaluationRubric: {
      rootCause: 25,
      correctness: 25,
      productionThinking: 20,
      tradeoffs: 15,
      communication: 15
    },
    followUps: ["TODO: Add interview follow-up."]
  };
}

async function main() {
  const pdfParse = await import("pdf-parse").catch(() => null);
  if (!pdfParse) {
    throw new Error(
      "Missing dependency: install with `npm install --save-dev tsx pdf-parse`, then rerun."
    );
  }

  const buffer = await readFile(INPUT_PDF);
  const parsed = await (pdfParse.default ?? pdfParse)(buffer);
  const chunks = splitScenarios(String(parsed.text ?? ""));
  const scenarios = chunks.map((chunk, index) => toScenario(chunk, index + 1));

  await mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await writeFile(OUTPUT_JSON, `${JSON.stringify(scenarios, null, 2)}\n`);
  console.log(`Imported ${scenarios.length} scenarios into ${OUTPUT_JSON}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
