export type GoldCoreKind = "coding" | "scenario" | "operations" | "system_design";
export type GoldCoreTrack = "sql" | "python" | "pyspark" | "airflow" | "aws" | "production" | "system-design";

export interface GoldCoreItem {
  order: number;
  module: string;
  kind: GoldCoreKind;
  track: GoldCoreTrack;
  slug: string;
  title: string;
  competency: string;
  prerequisite: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  estimatedMinutes: number;
  isFree: boolean;
  validation: "Executable checks" | "Structured incident rubric" | "Architecture rubric";
  href: string;
}

function coding(
  order: number,
  module: string,
  track: "sql" | "python" | "pyspark",
  slug: string,
  title: string,
  competency: string,
  prerequisite: string,
  difficulty: GoldCoreItem["difficulty"],
  estimatedMinutes: number,
  isFree: boolean
): GoldCoreItem {
  return {
    order,
    module,
    kind: "coding",
    track,
    slug,
    title,
    competency,
    prerequisite,
    difficulty,
    estimatedMinutes,
    isFree,
    validation: "Executable checks",
    href: `/labs/${track}?lab=${slug}`
  };
}

function operations(
  order: number,
  module: string,
  track: "airflow" | "aws",
  slug: string,
  title: string,
  competency: string,
  prerequisite: string,
  difficulty: GoldCoreItem["difficulty"],
  estimatedMinutes: number,
  isFree: boolean
): GoldCoreItem {
  return {
    order,
    module,
    kind: "operations",
    track,
    slug,
    title,
    competency,
    prerequisite,
    difficulty,
    estimatedMinutes,
    isFree,
    validation: "Structured incident rubric",
    href: `/labs/${track}?lab=${slug}`
  };
}

function scenario(
  order: number,
  module: string,
  slug: string,
  title: string,
  competency: string,
  prerequisite: string,
  difficulty: GoldCoreItem["difficulty"],
  estimatedMinutes: number,
  isFree: boolean
): GoldCoreItem {
  return {
    order,
    module,
    kind: "scenario",
    track: "production",
    slug,
    title,
    competency,
    prerequisite,
    difficulty,
    estimatedMinutes,
    isFree,
    validation: "Structured incident rubric",
    href: `/scenarios/${slug}`
  };
}

function systemDesign(
  order: number,
  module: string,
  slug: string,
  title: string,
  competency: string,
  prerequisite: string,
  difficulty: GoldCoreItem["difficulty"],
  estimatedMinutes: number,
  isFree: boolean
): GoldCoreItem {
  return {
    order,
    module,
    kind: "system_design",
    track: "system-design",
    slug,
    title,
    competency,
    prerequisite,
    difficulty,
    estimatedMinutes,
    isFree,
    validation: "Architecture rubric",
    href: `/system-design?case=${slug}`
  };
}

export const GOLD_CORE_ITEMS: GoldCoreItem[] = [
  coding(1, "SQL correctness", "sql", "sql-coding-03-top-3-salaries-per-department", "Top salary bands per department", "Partitioned ranking and tie handling", "SELECT, GROUP BY, window-function basics", "Beginner", 20, true),
  coding(2, "SQL correctness", "sql", "sql-coding-06-running-total-by-date", "Daily revenue running total", "Aggregate before applying a window", "SUM, GROUP BY, ORDER BY", "Beginner", 18, true),
  coding(3, "SQL correctness", "sql", "sql-coding-08-month-over-month-growth", "Month-over-month revenue change", "Time-grain aggregation and LAG", "Date grouping and window functions", "Beginner", 20, true),
  coding(4, "SQL correctness", "sql", "sql-coding-19-find-duplicate-business-keys", "Detect duplicate business keys", "Grain definition and duplicate detection", "GROUP BY and HAVING", "Intermediate", 20, false),
  coding(5, "SQL correctness", "sql", "sql-coding-23-sessionization-with-a-30-minute-gap", "Sessionize events by inactivity gap", "Event ordering and session boundaries", "LAG and timestamp arithmetic", "Intermediate", 25, false),
  coding(6, "SQL correctness", "sql", "sql-coding-31-deduplicate-and-keep-the-latest-record-per-business-key", "Keep the latest row per business key", "Deterministic deduplication", "ROW_NUMBER and business keys", "Intermediate", 22, false),
  coding(7, "SQL correctness", "sql", "sql-coding-32-scd-type-2-find-changed-customer-rows", "Detect SCD Type 2 changes", "Current-row comparison and change detection", "Joins, NULL handling and SCD basics", "Intermediate", 25, false),
  coding(8, "SQL correctness", "sql", "sql-coding-37-late-arriving-facts-that-missed-the-correct-date-partition", "Find late facts in the wrong partition", "Event time, load time and partition reconciliation", "Filtering and data-lake partition concepts", "Intermediate", 22, false),

  coding(9, "Python for pipelines", "python", "python-foundry-03-deduplicate-event-ids", "Deduplicate replayed events", "Idempotent event handling", "Lists, dictionaries and sets", "Beginner", 12, true),
  coding(10, "Python for pipelines", "python", "python-foundry-04-find-missing-required-fields", "Build a required-field reject list", "Data-quality validation and quarantine", "Loops and dictionaries", "Beginner", 12, true),
  coding(11, "Python for pipelines", "python", "python-foundry-09-latest-customer-updates", "Keep the latest update per key", "Deterministic record selection", "Dictionaries and sorting", "Intermediate", 18, false),
  coding(12, "Python for pipelines", "python", "python-foundry-10-reconcile-snapshot-keys", "Reconcile source and warehouse keys", "Completeness reconciliation", "Sets and structured output", "Intermediate", 18, false),
  coding(13, "Python for pipelines", "python", "python-foundry-19-apply-cdc-events", "Apply CDC events to current state", "Ordered upserts and deletes", "Dictionary mutation and event ordering", "Advanced", 25, false),

  coding(14, "PySpark production", "pyspark", "pyspark-window-dedup-latest-record", "Keep the latest customer version", "Window-based deterministic deduplication", "PySpark DataFrames and windows", "Intermediate", 22, false),
  coding(15, "PySpark production", "pyspark", "pyspark-union-column-order-corruption", "Union evolving schemas safely", "Name-based union and schema evolution", "PySpark select and union", "Beginner", 18, false),
  coding(16, "PySpark production", "pyspark", "pyspark-timezone-business-date", "Build the correct local business date", "UTC conversion before daily aggregation", "PySpark dates and groupBy", "Intermediate", 22, false),
  coding(17, "PySpark production", "pyspark", "pyspark-schema-drift-json", "Preserve a new field after schema drift", "Explicit schemas and curated outputs", "PySpark DataFrame selection", "Intermediate", 22, false),
  coding(18, "PySpark production", "pyspark", "pyspark-broadcast-wrong-side", "Broadcast the correct join side", "Join strategy and size-aware optimization", "PySpark joins", "Intermediate", 22, false),

  scenario(19, "Production incidents", "yesterdays-sales-missing-late-source-arrival", "Recover revenue after a late source arrival", "Late data, reconciliation and safe recovery", "Batch pipelines and business dates", "Intermediate", 25, true),
  scenario(20, "Production incidents", "revenue-drop-new-successful-status", "Diagnose a revenue drop after a status change", "Data-contract drift and monitoring", "SQL filters and data-quality checks", "Beginner", 20, false),
  operations(21, "Production incidents", "airflow", "airflow-backfill-duplicates", "Prevent a backfill from doubling revenue", "Idempotent backfills", "Airflow DAG runs and write modes", "Intermediate", 22, false),
  operations(22, "Production incidents", "airflow", "airflow-api-rate-limit-storm", "Recover from an API rate-limit storm", "Bounded retries, backoff and shared limits", "Airflow retries and APIs", "Intermediate", 22, false),
  operations(23, "Production incidents", "airflow", "airflow-worker-logs-missing", "Restore missing worker logs", "Operational observability and evidence preservation", "Airflow workers and remote logging", "Intermediate", 20, false),
  operations(24, "Production incidents", "airflow", "airflow-event-driven-assets", "Replace brittle cron coupling", "Dataset readiness and event-driven orchestration", "Airflow scheduling and dependencies", "Advanced", 25, false),

  operations(25, "Cloud judgment", "aws", "aws-s3-event-duplicates", "Make duplicate S3 events harmless", "At-least-once delivery and idempotency", "S3 events and object keys", "Intermediate", 20, false),
  operations(26, "Cloud judgment", "aws", "aws-glue-vs-emr-selection", "Choose Glue or EMR for a nightly workload", "Workload-driven service selection", "Basic AWS data services", "Intermediate", 22, false),

  systemDesign(27, "System design", "ecommerce-orders-data-platform", "Design an e-commerce orders data platform", "Batch architecture, auditability and revenue reconciliation", "Core pipeline components", "Beginner", 35, true),
  systemDesign(28, "System design", "postgres-cdc-to-warehouse", "Design Postgres CDC to a warehouse", "Change capture, ordering and replay", "CDC fundamentals", "Intermediate", 40, true),
  systemDesign(29, "System design", "data-quality-monitoring-system", "Design a data-quality monitoring system", "Quality contracts, alerting and ownership", "Data-quality fundamentals", "Intermediate", 40, false),
  systemDesign(30, "System design", "backfill-safe-pipeline", "Design a backfill-safe pipeline", "Isolation, idempotency and controlled promotion", "Batch architecture and partitioning", "Advanced", 45, false)
];

export const GOLD_CORE_MODULES = Array.from(
  new Set(GOLD_CORE_ITEMS.map((item) => item.module))
).map((name) => ({
  name,
  items: GOLD_CORE_ITEMS.filter((item) => item.module === name)
}));

export function isGoldCoreSlug(slug: string): boolean {
  return GOLD_CORE_ITEMS.some((item) => item.slug === slug);
}

export interface GoldCodingContentOverride {
  businessContext?: string;
  problemStatement?: string;
  expectedOutcome?: string;
  explanation?: string;
  commonMistakes?: string[];
  edgeCaseDescription?: string;
}

export const GOLD_CORE_CODING_OVERRIDES: Record<string, GoldCodingContentOverride> = {
  "sql-coding-03-top-3-salaries-per-department": {
    businessContext: "HR is publishing a department compensation report. It must include every employee whose salary falls within the top three distinct salary bands in that department, including ties.",
    problemStatement: "Return employees in the top three distinct salary bands inside each department. Ranking must restart per department, and employees tied at a qualifying salary must all remain in the output.",
    explanation: "Aggregate nothing away: the output grain remains one employee. DENSE_RANK partitions employees by department and gives tied salaries the same rank, so all employees in the top three distinct salary bands remain. A global LIMIT or ROW_NUMBER would silently remove valid tied employees.",
    commonMistakes: ["Applying a global LIMIT 3 instead of ranking independently inside each department.", "Using ROW_NUMBER when the business rule requires all employees tied at a qualifying salary."],
    edgeCaseDescription: "Confirms that ranking restarts by department and preserves employees tied inside the top three salary bands."
  },
  "sql-coding-06-running-total-by-date": {
    businessContext: "Finance needs a daily revenue series and a cumulative month-to-date-style total. The source can contain several sales rows on the same date.",
    problemStatement: "First aggregate all sales to one row per sale_date, then calculate cumulative revenue in ascending date order.",
    explanation: "The important ordering is aggregate first, window second. SUM(amount) establishes the required daily grain; the windowed SUM then accumulates those daily totals. Applying the window directly to raw sales creates multiple rows per date and makes downstream reporting ambiguous.",
    commonMistakes: ["Calculating the window over raw transaction rows before establishing the daily grain.", "Leaving the final result unordered and assuming a window ORDER BY guarantees display order."],
    edgeCaseDescription: "Confirms that multiple transactions are aggregated to one daily row before the running total is calculated."
  },
  "sql-coding-08-month-over-month-growth": {
    businessContext: "A finance dashboard needs monthly revenue and the absolute change from the previous available reporting month.",
    problemStatement: "Aggregate sales to one row per calendar month, then subtract the previous available month’s revenue using LAG. The first available month should have a NULL delta.",
    expectedOutcome: "Columns: month, revenue, revenue_delta.\nGrain: one row per available calendar month.\nBusiness rule: compare each available month with the previous available month after monthly aggregation; the first month has no comparison.",
    explanation: "Build the monthly grain before using LAG. Otherwise LAG compares transactions rather than months. This exercise compares adjacent available months; a production report that must display missing months would first join to a calendar table and explicitly fill or preserve those gaps.",
    commonMistakes: ["Applying LAG to daily or transaction rows before monthly aggregation.", "Treating the previous available month as the previous calendar month when missing months must be represented explicitly."],
    edgeCaseDescription: "Confirms that revenue is aggregated across each month before adjacent available months are compared."
  },
  "sql-coding-19-find-duplicate-business-keys": {
    businessContext: "A warehouse uniqueness check suspects that the same customer-date business key was loaded more than once. The output will drive quarantine and replay decisions.",
    problemStatement: "Find customer_id and order_date combinations that occur more than once. Ignore rows without a customer_id and return the duplicate count for each affected key.",
    commonMistakes: ["Grouping by order_id, which is unique and hides duplicate business keys.", "Counting NULL customer identifiers even though the stated contract excludes them."],
    edgeCaseDescription: "Confirms that only repeated customer-date business keys are returned and NULL customer identifiers are excluded."
  },
  "sql-coding-23-sessionization-with-a-30-minute-gap": {
    businessContext: "Product analytics needs a deterministic session boundary flag for every event. A user starts a new session after more than 30 minutes of inactivity.",
    problemStatement: "For each user, order events by timestamp and flag the first event plus any event occurring more than 30 minutes after the previous event.",
    commonMistakes: ["Using a global LAG and comparing an event with another user’s previous event.", "Treating a gap of exactly 30 minutes as a new session when the rule says greater than 30 minutes."],
    edgeCaseDescription: "Confirms per-user ordering, first-event handling, and the exact 30-minute boundary."
  },
  "sql-coding-31-deduplicate-and-keep-the-latest-record-per-business-key": {
    businessContext: "A retry produced multiple rows for the same customer and business date. Downstream reporting requires one deterministic survivor per customer-date key.",
    problemStatement: "Partition rows by customer_id and order_date, then keep the row with the highest order_id as the defined latest arrival. Exclude rows without a customer_id.",
    commonMistakes: ["Using DISTINCT, which cannot choose the required survivor when non-key values differ.", "Ranking only by customer_id and accidentally collapsing separate business dates."],
    edgeCaseDescription: "Confirms one deterministic survivor per customer-date key and excludes rows without a valid customer identifier."
  },
  "sql-coding-32-scd-type-2-find-changed-customer-rows": {
    businessContext: "A dimension load must identify new customers and changed attributes before closing old SCD Type 2 rows and inserting new versions.",
    problemStatement: "Compare incoming customer updates with only the current active dimension row. Return new customers and rows whose city changed; exclude unchanged updates.",
    explanation: "Join incoming updates to current_flag = 1 rows only. A missing match represents a new customer; a NULL-safe attribute comparison identifies a change. Joining historical rows as well would multiply matches and can falsely classify unchanged updates.",
    commonMistakes: ["Joining every historical dimension version instead of only the current active row.", "Using a normal inequality that misses changes involving NULL values."],
    edgeCaseDescription: "Confirms that unchanged customers are excluded while both new customers and changed current attributes are returned."
  },
  "sql-coding-37-late-arriving-facts-that-missed-the-correct-date-partition": {
    commonMistakes: ["Grouping revenue by load_date even though the business metric belongs to event_date.", "Reprocessing every partition instead of returning the exact affected facts and business dates."],
    edgeCaseDescription: "Confirms that only successful facts stored outside their business-date partition are flagged for repair."
  },
  "pyspark-window-dedup-latest-record": {
    explanation: "dropDuplicates does not define which duplicate survives. A window ordered by updated_at and a deterministic ingest_sequence makes the survivor explicit and repeatable. Production code must include enough ordering columns to break ties.",
    commonMistakes: ["Using dropDuplicates and assuming it keeps the latest row.", "Ordering only by updated_at when two events can share the same timestamp." ]
  },
  "pyspark-union-column-order-corruption": {
    explanation: "DataFrame.union matches columns by position, so compatible types can hide silent semantic corruption. unionByName aligns fields by name, while allowMissingColumns makes an intentional schema-evolution policy explicit.",
    commonMistakes: ["Using union when input columns arrive in a different order.", "Allowing missing columns without monitoring unexpected schema drift." ]
  },
  "pyspark-timezone-business-date": {
    explanation: "Business dates must be derived after converting the UTC timestamp to the agreed reporting timezone. Converting after to_date permanently assigns boundary events to the wrong reporting day.",
    commonMistakes: ["Calling to_date on the UTC value before timezone conversion.", "Using the machine’s session timezone without making the business timezone explicit." ]
  },
  "pyspark-schema-drift-json": {
    explanation: "A curated pipeline should apply an explicit schema contract and deliberately project new fields into the silver output. Silent inference or a stale select list can turn schema evolution into missing data.",
    commonMistakes: ["Relying on schema inference for production JSON ingestion.", "Adding a field to the raw schema but forgetting to propagate it into the curated output." ]
  },
  "pyspark-broadcast-wrong-side": {
    explanation: "Broadcast only the genuinely small lookup side after verifying its size. Broadcasting the large fact side can exhaust executor memory; blindly forcing either side also overrides safer optimizer choices when statistics change.",
    commonMistakes: ["Broadcasting the large orders fact because it appears first in the join.", "Forcing a broadcast without validating size, statistics, and executor memory headroom." ]
  }
};
