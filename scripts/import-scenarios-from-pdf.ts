import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
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

const requireFromFrontend = createRequire(path.resolve("frontend/package.json"));
const INPUT_PDF = path.resolve(
  process.argv[2] ?? "docs/120-data-engineering-scenarios.pdf"
);
const OUTPUT_JSON = path.resolve("data/scenarios.generated.json");
const FRONTEND_OUTPUT_JSON = path.resolve("frontend/data/scenarios.generated.json");

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
  if (domain === "pyspark") return "broken_pyspark";
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
  const scenarioMatches = [
    ...normalized.matchAll(
      /Scenario\s+\d{1,3}\s*:\s*[\s\S]*?(?=\n\s*Scenario\s+\d{1,3}\s*:|\s*$)/gi
    ),
  ].map((match) => match[0].trim());

  if (scenarioMatches.length > 10) {
    return scenarioMatches;
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

function cleanText(value: string): string {
  return value
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "")
    .replace(/Data with Pranjal - Scenario-Based Data Engineering Interview Handbook Page \d+/gi, "")
    .replace(/\nData with Pranjal\s*\n/gi, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBetween(text: string, start: RegExp, end: RegExp): string {
  const startMatch = start.exec(text);
  if (!startMatch || typeof startMatch.index !== "number") return "";
  const startIndex = startMatch.index + startMatch[0].length;
  const afterStart = text.slice(startIndex);
  const endMatch = end.exec(afterStart);
  const raw = endMatch ? afterStart.slice(0, endMatch.index) : afterStart;
  return cleanText(raw);
}

function linesToBullets(value: string, fallback: string[]): string[] {
  const bullets = value
    .split("\n")
    .map((line) => line.replace(/^[•\-\s]+/, "").trim())
    .filter((line) => line.length > 12)
    .slice(0, 5);
  return bullets.length ? bullets : fallback;
}

function sentence(value: string, fallback: string): string {
  const compact = cleanText(value).replace(/\s+/g, " ");
  return compact || fallback;
}

function sectionInfo(chunk: string): {
  section: string;
  coreConcept: string;
  level: ImportedScenario["difficulty"];
} {
  const match = chunk.match(/Section:\s*([^|]+)\|\s*Core concept:\s*([^|]+)\|\s*Level:\s*(Beginner|Intermediate|Advanced)/i);
  return {
    section: sentence(match?.[1] ?? "", "Mixed"),
    coreConcept: sentence(match?.[2] ?? "", "Production debugging scenario"),
    level: (match?.[3]?.toLowerCase() as ImportedScenario["difficulty"]) ?? "intermediate",
  };
}

function titleCaseTag(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function inferDomainFromSection(section: string, coreConcept: string): ScenarioDomain {
  return inferDomain(`${section} ${coreConcept}`);
}

function buildSparkBrokenCode(title: string, coreConcept: string): string {
  const lower = `${title} ${coreConcept}`.toLowerCase();

  if (lower.includes("skew") || lower.includes("final stage")) {
    return [
      "from pyspark.sql import functions as F",
      "",
      "events = spark.read.parquet(clickstream_path)",
      "profiles = spark.read.parquet(user_profiles_path)",
      "",
      "# Broken: one hot/null user_id can push most rows into one shuffle task.",
      "result = (events",
      "  .join(profiles, on='user_id', how='left')",
      "  .groupBy('user_id')",
      "  .agg(F.count('*').alias('event_count')))",
      "",
      "result.write.mode('overwrite').parquet(output_path)"
    ].join("\n");
  }

  if (lower.includes("groupbykey") || lower.includes("shuffle storm")) {
    return [
      "# Broken: groupByKey shuffles all values before reducing.",
      "metrics = raw_rdd.map(lambda r: (r.account_id, r.amount))",
      "daily_totals = metrics.groupByKey().mapValues(lambda values: sum(values))",
      "daily_totals.saveAsTextFile(output_path)"
    ].join("\n");
  }

  if (lower.includes("small file") || lower.includes("tiny file")) {
    return [
      "from pyspark.sql import functions as F",
      "",
      "hourly_df = spark.read.parquet(hourly_input_path)",
      "",
      "# Broken: too many partitions and append-only hourly writes create thousands of tiny files.",
      "(hourly_df",
      "  .repartition(2000)",
      "  .write",
      "  .mode('append')",
      "  .partitionBy('event_date', 'event_hour')",
      "  .parquet(silver_path))"
    ].join("\n");
  }

  if (lower.includes("udf")) {
    return [
      "from pyspark.sql import functions as F",
      "from pyspark.sql.types import StringType",
      "",
      "def normalize_status(status):",
      "    return status.strip().lower().replace(' ', '_') if status else None",
      "",
      "normalize_status_udf = F.udf(normalize_status, StringType())",
      "",
      "# Broken: Python UDF runs row-by-row and blocks Spark SQL optimizations.",
      "clean_df = orders_df.withColumn('status_normalized', normalize_status_udf(F.col('status')))"
    ].join("\n");
  }

  if (lower.includes("broadcast")) {
    return [
      "from pyspark.sql.functions import broadcast",
      "",
      "events = spark.read.parquet(events_path)",
      "customers = spark.read.parquet(customers_path)",
      "",
      "# Broken: forced broadcast can crash executors if customers is no longer small.",
      "enriched = events.join(broadcast(customers), on='customer_id', how='left')",
      "enriched.write.mode('overwrite').parquet(output_path)"
    ].join("\n");
  }

  if (lower.includes("cache")) {
    return [
      "# Broken: caching every intermediate DataFrame consumes executor memory.",
      "raw = spark.read.parquet(raw_path).cache()",
      "filtered = raw.filter(\"event_date = '${run_date}'\").cache()",
      "joined = filtered.join(dim_customers, 'customer_id', 'left').cache()",
      "result = joined.groupBy('customer_id').count().cache()",
      "result.write.mode('overwrite').parquet(output_path)"
    ].join("\n");
  }

  if (lower.includes("backfill")) {
    return [
      "# Broken: each loop scans the full history and appends output again.",
      "for run_date in backfill_dates:",
      "    df = spark.read.parquet(raw_path)",
      "    daily = df.filter(F.col('event_date') <= run_date)",
      "    daily.write.mode('append').partitionBy('event_date').parquet(output_path)"
    ].join("\n");
  }

  return [
    "from pyspark.sql import functions as F",
    "",
    "source_df = spark.read.parquet(source_path)",
    "",
    "# Broken: this code is functionally plausible but unsafe for production scale/reruns.",
    "result_df = (source_df",
    "  .join(reference_df, on='id', how='left')",
    "  .groupBy('id')",
    "  .agg(F.count('*').alias('record_count')))",
    "",
    "result_df.write.mode('append').parquet(output_path)"
  ].join("\n");
}

function buildSqlBrokenCode(title: string, coreConcept: string): string {
  const lower = `${title} ${coreConcept}`.toLowerCase();
  if (lower.includes("join") || lower.includes("duplicate")) {
    return [
      "SELECT",
      "  o.order_id,",
      "  SUM(p.payment_amount) - COALESCE(SUM(r.refund_amount), 0) AS net_revenue",
      "FROM orders o",
      "LEFT JOIN payments p ON o.order_id = p.order_id",
      "LEFT JOIN refunds r ON o.order_id = r.order_id",
      "GROUP BY o.order_id;"
    ].join("\n");
  }

  if (lower.includes("null")) {
    return [
      "SELECT c.customer_id",
      "FROM customers c",
      "WHERE c.customer_id NOT IN (",
      "  SELECT customer_id",
      "  FROM orders",
      ");"
    ].join("\n");
  }

  return [
    "SELECT",
    "  customer_id,",
    "  order_status,",
    "  SUM(amount) AS revenue",
    "FROM orders",
    "GROUP BY customer_id, order_status;"
  ].join("\n");
}

function buildLogs(domain: ScenarioDomain, issue: string, title: string): string {
  if (domain === "pyspark") {
    return [
      `[Spark] ${title}`,
      "Stage progress: most tasks finished, one or more tasks are long-running.",
      "Metrics to inspect: shuffle read, spill, skew ratio, executor lost count, file count.",
      issue
    ].filter(Boolean).join("\n");
  }

  if (domain === "airflow") {
    return [
      `[Airflow] ${title}`,
      "Task state: SUCCESS or RETRY does not guarantee correct data.",
      "Inspect: try_number, input rows, output rows, partition freshness, and idempotency.",
      issue
    ].filter(Boolean).join("\n");
  }

  if (domain === "kafka") {
    return [
      `[Kafka] ${title}`,
      "Consumer symptoms: lag, replay, duplicate processing, schema error, or poison event.",
      "Inspect: offsets, consumer group lag, DLQ rate, retry count, and event keys.",
      issue
    ].filter(Boolean).join("\n");
  }

  return issue;
}

function toScenario(chunk: string, index: number): ImportedScenario {
  const cleanedChunk = cleanText(chunk);
  const title = titleFromChunk(cleanedChunk, index);
  const { section, coreConcept, level } = sectionInfo(cleanedChunk);
  const domain = inferDomainFromSection(section, coreConcept);
  const scenarioType = inferScenarioType(chunk, domain);
  const background = extractBetween(cleanedChunk, /Background:\s*/i, /The issue:\s*/i);
  const issue = extractBetween(
    cleanedChunk,
    /The issue:\s*/i,
    /What the interviewer is really testing/i
  );
  const testing = extractBetween(
    cleanedChunk,
    /What the interviewer is really testing\s*/i,
    /1\)\s*Understand the problem/i
  );
  const understand = extractBetween(
    cleanedChunk,
    /1\)\s*Understand the problem\s*/i,
    /2\)\s*Possible root causes/i
  );
  const rootCauses = extractBetween(
    cleanedChunk,
    /2\)\s*Possible root causes\s*/i,
    /3\)\s*Solution design/i
  );
  const solution = extractBetween(
    cleanedChunk,
    /3\)\s*Solution design\s*/i,
    /4\)\s*Trade-offs/i
  );
  const tradeoffs = extractBetween(
    cleanedChunk,
    /4\)\s*Trade-offs\s*/i,
    /5\)\s*Monitoring and testing/i
  );
  const monitoring = extractBetween(
    cleanedChunk,
    /5\)\s*Monitoring and testing\s*/i,
    /6\)\s*Strong interview answer/i
  );
  const strongAnswer = extractBetween(
    cleanedChunk,
    /6\)\s*Strong interview answer\s*/i,
    /Interviewer follow-up questions/i
  );
  const followUpText = extractBetween(
    cleanedChunk,
    /Interviewer follow-up questions\s*/i,
    /$/i
  );
  const generatedBrokenCode =
    domain === "pyspark"
      ? buildSparkBrokenCode(title, coreConcept)
      : domain === "sql"
        ? buildSqlBrokenCode(title, coreConcept)
        : "";

  return {
    id: `pdf-scenario-${String(index).padStart(3, "0")}`,
    title,
    slug: slugify(title || `pdf-scenario-${index}`),
    domain,
    difficulty: level || inferDifficulty(index, chunk),
    scenarioType,
    isFree: index <= 15,
    estimatedMinutes: scenarioType === "mcq" ? 10 : domain === "pyspark" ? 24 : 20,
    tags: [
      titleCaseTag(domain),
      titleCaseTag(scenarioType),
      section,
      coreConcept.replace(/\.$/, ""),
    ].filter(Boolean).slice(0, 6),
    businessContext: sentence(background, `You are debugging a production ${section} scenario.`),
    problemStatement: sentence(issue || understand, coreConcept),
    requirement:
      domain === "pyspark"
        ? "Fix the PySpark code so the pipeline is correct, scalable, and safe to rerun."
        : `Diagnose and fix the issue: ${coreConcept}`,
    schema:
      domain === "pyspark"
        ? "DataFrames depend on the scenario. Assume large production-scale inputs, skewed keys, retries, and partitioned lake storage."
        : "",
    sampleInput:
      domain === "pyspark"
        ? "Use the code comments and logs to infer the input shape. Focus on the production failure mode, not local toy execution."
        : "",
    brokenCode: generatedBrokenCode,
    actualOutput: "",
    expectedOutput:
      domain === "pyspark"
        ? "Corrected PySpark code or approach should reduce the failure mode, preserve correctness, and include validation/monitoring."
        : "",
    logs: buildLogs(domain, issue, title),
    mcqOptions: [],
    hints: [
      sentence(testing, "Move from symptom to root-cause evidence before tuning blindly."),
      linesToBullets(rootCauses, ["Inspect the data distribution and execution metrics."])[0],
      linesToBullets(solution, ["Propose a fix that is safe for production reruns."])[0],
    ],
    tasks: [
      "Diagnose the issue.",
      domain === "pyspark" ? "Fix the broken PySpark code sample." : "Fix or explain the production-safe solution.",
      "Explain the answer in interview style."
    ],
    modelSolution: sentence(
      domain === "pyspark"
        ? `Fix the PySpark pipeline by addressing the root production issue, not just adding resources.\n\n${solution}`
        : solution,
      "Diagnose the symptom, confirm the root cause with metrics, implement the safest fix, then validate the output."
    ),
    productionExplanation:
      sentence(
        `${understand}\n\nTrade-offs:\n${tradeoffs}\n\nMonitoring and testing:\n${monitoring}`,
        "Production answers should include root cause, fix, trade-offs, validation, and monitoring."
      ),
    commonMistakes: linesToBullets(rootCauses, [
      "Tuning cluster size before proving the root cause.",
      "Fixing code without validating row counts or operational metrics.",
    ]),
    evaluationRubric: {
      rootCause: 25,
      correctness: 25,
      productionThinking: 20,
      tradeoffs: 15,
      communication: 15
    },
    followUps: linesToBullets(followUpText, [
      "How would you prove the fix worked in production?",
      "What metric or alert would prevent this from recurring?",
    ]),
  };
}

async function main() {
  const pdfParse = await import("pdf-parse").catch(() => {
    try {
      return requireFromFrontend("pdf-parse");
    } catch {
      return null;
    }
  });
  if (!pdfParse) {
    throw new Error(
      "Missing dependency: install with `npm install --save-dev tsx pdf-parse`, then rerun."
    );
  }

  const buffer = await readFile(INPUT_PDF);
  const parsed = await extractPdfText(pdfParse, buffer);
  const chunks = splitScenarios(parsed);
  const scenarios = chunks.map((chunk, index) => toScenario(chunk, index + 1));

  await mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await mkdir(path.dirname(FRONTEND_OUTPUT_JSON), { recursive: true });
  const json = `${JSON.stringify(scenarios, null, 2)}\n`;
  await writeFile(OUTPUT_JSON, json);
  await writeFile(FRONTEND_OUTPUT_JSON, json);
  console.log(`Imported ${scenarios.length} scenarios into ${OUTPUT_JSON}`);
  console.log(`Mirrored frontend copy into ${FRONTEND_OUTPUT_JSON}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function extractPdfText(pdfParse: any, buffer: Buffer): Promise<string> {
  const legacyParser = pdfParse?.default ?? pdfParse;
  if (typeof legacyParser === "function") {
    const parsed = await legacyParser(buffer);
    return String(parsed.text ?? "");
  }

  if (typeof pdfParse?.PDFParse === "function") {
    const parser = new pdfParse.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return String(result.text ?? "");
    } finally {
      await parser.destroy?.();
    }
  }

  throw new Error("Unable to load a compatible pdf-parse API.");
}
