import generatedScenarioData from "../data/scenarios.generated.json";

export type ScenarioDomain =
  | "sql"
  | "pyspark"
  | "airflow"
  | "aws"
  | "kafka"
  | "data_quality"
  | "data_modeling"
  | "system_design"
  | "mixed";

export type ScenarioDifficulty = "beginner" | "intermediate" | "advanced";

export type ScenarioType =
  | "mcq"
  | "broken_sql"
  | "broken_pyspark"
  | "log_analysis"
  | "output_mismatch"
  | "interview_explanation"
  | "mixed_lab";

export interface McqOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
}

export interface EvaluationRubric {
  rootCause: number;
  correctness: number;
  productionThinking: number;
  tradeoffs: number;
  communication: number;
}

export type ScenarioTableCell = string | number | boolean | null;

export interface ScenarioSampleTable {
  name: string;
  columns: string[];
  rows: ScenarioTableCell[][];
}

export interface Scenario {
  id: string;
  title: string;
  slug: string;
  domain: ScenarioDomain;
  difficulty: ScenarioDifficulty;
  scenarioType: ScenarioType;
  isFree: boolean;
  estimatedMinutes: number;
  tags: string[];
  businessContext: string;
  problemStatement: string;
  requirement?: string;
  schema?: string;
  sampleInput?: string;
  brokenCode?: string;
  actualOutput?: string;
  expectedOutput?: string;
  sampleTables?: ScenarioSampleTable[];
  expectedSql?: string;
  logs?: string;
  mcqOptions?: McqOption[];
  hints: string[];
  tasks: string[];
  modelSolution: string;
  productionExplanation: string;
  commonMistakes: string[];
  evaluationRubric: EvaluationRubric;
  followUps: string[];
  relatedProjectMissionId?: string;
}

export const DOMAIN_LABELS: Record<ScenarioDomain, string> = {
  sql: "SQL",
  pyspark: "PySpark",
  airflow: "Airflow",
  aws: "AWS / Data Lake",
  kafka: "Kafka",
  data_quality: "Data Quality",
  data_modeling: "Data Modeling",
  system_design: "System Design",
  mixed: "Mixed"
};

export const SCENARIO_TYPE_LABELS: Record<ScenarioType, string> = {
  mcq: "MCQ Diagnosis",
  broken_sql: "Broken SQL Fix",
  broken_pyspark: "Broken PySpark Fix",
  log_analysis: "Log / Error Analysis",
  output_mismatch: "Output Mismatch Debugging",
  interview_explanation: "Interview Explanation",
  mixed_lab: "Mixed Lab"
};

const DEFAULT_RUBRIC: EvaluationRubric = {
  rootCause: 25,
  correctness: 25,
  productionThinking: 20,
  tradeoffs: 15,
  communication: 15
};

const VALID_DOMAINS: ScenarioDomain[] = [
  "sql",
  "pyspark",
  "airflow",
  "aws",
  "kafka",
  "data_quality",
  "data_modeling",
  "system_design",
  "mixed"
];

const VALID_DIFFICULTIES: ScenarioDifficulty[] = [
  "beginner",
  "intermediate",
  "advanced"
];

const VALID_SCENARIO_TYPES: ScenarioType[] = [
  "mcq",
  "broken_sql",
  "broken_pyspark",
  "log_analysis",
  "output_mismatch",
  "interview_explanation",
  "mixed_lab"
];

export const BROKEN_PIPELINE_SCENARIOS: Scenario[] = [
  {
    id: "bpl-sql-001",
    title: "Wrong GROUP BY Grain Causing Customer Revenue Inflation",
    slug: "wrong-group-by-grain-customer-revenue",
    domain: "sql",
    difficulty: "beginner",
    scenarioType: "broken_sql",
    isFree: true,
    estimatedMinutes: 18,
    tags: ["SQL", "Grain", "Revenue", "Data Quality"],
    businessContext:
      "You are on the analytics engineering rota for an e-commerce company. Finance has escalated that the customer revenue mart is higher than the payment processor report after last night's model change.",
    problemStatement:
      "The query groups by customer and order status, but the dashboard expects one row per customer. When downstream users sum the status-level rows again, cancelled and completed order rows are mixed into the customer metric.",
    requirement: "Build a customer-level revenue result with exactly one row per customer. Include only completed orders, return customer_id, customer_name, and completed_revenue, and make sure duplicate status rows cannot inflate the dashboard.",
    schema:
      "orders(order_id, customer_id, order_status, order_amount, order_date)\ncustomers(customer_id, customer_name)",
    sampleInput:
      "orders\n1, 101, COMPLETED, 120, 2026-05-01\n2, 101, CANCELLED, 80, 2026-05-01\n3, 101, COMPLETED, 30, 2026-05-02\n4, 102, COMPLETED, 50, 2026-05-02",
    brokenCode:
      "SELECT\n  c.customer_id,\n  c.customer_name,\n  o.order_status,\n  SUM(o.order_amount) AS revenue\nFROM customers c\nJOIN orders o ON c.customer_id = o.customer_id\nGROUP BY 1, 2, 3;",
    expectedOutput:
      "customer_id | customer_name | completed_revenue\n101 | Asha | 150\n102 | Ben | 50",
    sampleTables: [
      {
        name: "customers",
        columns: ["customer_id", "customer_name"],
        rows: [
          [101, "Asha"],
          [102, "Ben"],
          [103, "Chen"]
        ]
      },
      {
        name: "orders",
        columns: ["order_id", "customer_id", "order_status", "order_amount", "order_date"],
        rows: [
          [1, 101, "COMPLETED", 120, "2026-05-01"],
          [2, 101, "CANCELLED", 80, "2026-05-01"],
          [3, 101, "COMPLETED", 30, "2026-05-02"],
          [4, 102, "COMPLETED", 50, "2026-05-02"],
          [5, 103, "CANCELLED", 40, "2026-05-03"]
        ]
      }
    ],
    expectedSql:
      "SELECT\n  c.customer_id,\n  c.customer_name,\n  SUM(o.order_amount) AS completed_revenue\nFROM customers c\nJOIN orders o ON c.customer_id = o.customer_id\nWHERE o.order_status = 'COMPLETED'\nGROUP BY c.customer_id, c.customer_name;",
    hints: [
      "Start by stating the output grain in one sentence.",
      "The business wants customer-level revenue, not status-level rows.",
      "Filter to completed orders before aggregation and group only by customer columns."
    ],
    tasks: [
      "Identify the grain bug.",
      "Write corrected SQL.",
      "Explain how you would prevent this dashboard regression."
    ],
    modelSolution:
      "SELECT\n  c.customer_id,\n  c.customer_name,\n  SUM(o.order_amount) AS completed_revenue\nFROM customers c\nJOIN orders o ON c.customer_id = o.customer_id\nWHERE o.order_status = 'COMPLETED'\nGROUP BY c.customer_id, c.customer_name;",
    productionExplanation:
      "The root cause is grain mismatch. The mart emits one row per customer and status, while the dashboard expects one row per customer. Production fixes should include explicit grain documentation, reconciliation to payment totals, and tests that assert one row per customer.",
    commonMistakes: [
      "Grouping by order_status because it exists in the SELECT.",
      "Using DISTINCT to hide the duplicate rows.",
      "Not documenting the expected mart grain."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "How would this change if cancelled orders must be shown as a separate metric?",
      "What test would catch this before dashboard refresh?"
    ]
  },
  {
    id: "bpl-sql-002",
    title: "LEFT JOIN Turned Into INNER JOIN by WHERE Filter",
    slug: "left-join-where-filter-inner-join",
    domain: "sql",
    difficulty: "beginner",
    scenarioType: "broken_sql",
    isFree: true,
    estimatedMinutes: 16,
    tags: ["SQL", "Joins", "NULLs", "Retention"],
    businessContext:
      "Marketing is preparing a reactivation campaign and needs a customer list with the latest Spring campaign click when one exists. The exported audience is missing active customers who never clicked.",
    problemStatement:
      "The query uses a LEFT JOIN, but a filter on the campaign table is placed in the WHERE clause. That removes NULL right-side rows and silently turns the result into an inner join for this campaign.",
    requirement: "Return every active customer. For customers who clicked campaign SPRING_26, show their latest click timestamp. For customers with no click, keep the customer row and return NULL for last_click_at.",
    schema:
      "customers(customer_id, customer_name, is_active)\ncampaign_clicks(customer_id, campaign_id, clicked_at)",
    brokenCode:
      "SELECT c.customer_id, c.customer_name, MAX(cc.clicked_at) AS last_click_at\nFROM customers c\nLEFT JOIN campaign_clicks cc ON c.customer_id = cc.customer_id\nWHERE c.is_active = TRUE\n  AND cc.campaign_id = 'SPRING_26'\nGROUP BY 1, 2;",
    expectedOutput:
      "All active customers should appear. Customers without SPRING_26 clicks should have last_click_at = NULL.",
    sampleTables: [
      {
        name: "customers",
        columns: ["customer_id", "customer_name", "is_active"],
        rows: [
          [1, "Asha", 1],
          [2, "Ben", 1],
          [3, "Chen", 1],
          [4, "Diya", 0]
        ]
      },
      {
        name: "campaign_clicks",
        columns: ["customer_id", "campaign_id", "clicked_at"],
        rows: [
          [1, "SPRING_26", "2026-05-01 09:00:00"],
          [1, "SPRING_26", "2026-05-03 10:30:00"],
          [2, "WINTER_25", "2026-01-11 08:00:00"]
        ]
      }
    ],
    expectedSql:
      "SELECT c.customer_id, c.customer_name, MAX(cc.clicked_at) AS last_click_at\nFROM customers c\nLEFT JOIN campaign_clicks cc\n  ON c.customer_id = cc.customer_id\n AND cc.campaign_id = 'SPRING_26'\nWHERE c.is_active = 1\nGROUP BY c.customer_id, c.customer_name;",
    hints: [
      "Ask which rows should survive when the right side is missing.",
      "A WHERE condition on the right table removes NULL right-side matches.",
      "Move the campaign filter into the JOIN condition."
    ],
    tasks: [
      "Fix the query while preserving unmatched customers.",
      "Explain why the old query dropped customers.",
      "Name one monitoring check."
    ],
    modelSolution:
      "SELECT c.customer_id, c.customer_name, MAX(cc.clicked_at) AS last_click_at\nFROM customers c\nLEFT JOIN campaign_clicks cc\n  ON c.customer_id = cc.customer_id\n AND cc.campaign_id = 'SPRING_26'\nWHERE c.is_active = TRUE\nGROUP BY 1, 2;",
    productionExplanation:
      "The LEFT JOIN is correct, but the WHERE clause turns it into an effective INNER JOIN for campaign rows. Put right-table filters in the ON clause when unmatched left rows must remain.",
    commonMistakes: [
      "Adding OR cc.campaign_id IS NULL without understanding multi-campaign behavior.",
      "Switching to FULL JOIN.",
      "Not checking row counts before and after the join."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "How would you return the latest click across any campaign?",
      "What row-count check would you add?"
    ]
  },
  {
    id: "bpl-sql-003",
    title: "Duplicate Revenue from Joining Orders to Multiple Payments and Refunds",
    slug: "duplicate-revenue-payments-refunds-join",
    domain: "sql",
    difficulty: "intermediate",
    scenarioType: "output_mismatch",
    isFree: true,
    estimatedMinutes: 22,
    tags: ["SQL", "Join Explosion", "Revenue", "Output Mismatch"],
    businessContext:
      "The CFO dashboard is showing inflated net revenue for a subset of orders. The issue only appears on orders that have multiple successful payment captures or multiple refund records.",
    problemStatement:
      "The mart joins orders directly to payments and refunds at row level. Because both child tables can have multiple rows per order, the join multiplies records before aggregation.",
    requirement: "Return one row per order with paid_amount, refunded_amount, and net_revenue. Aggregate each child table to order_id before joining so payment and refund rows cannot multiply each other.",
    schema:
      "orders(order_id, order_amount)\npayments(payment_id, order_id, payment_amount, status)\nrefunds(refund_id, order_id, refund_amount)",
    brokenCode:
      "SELECT\n  o.order_id,\n  SUM(p.payment_amount) - COALESCE(SUM(r.refund_amount), 0) AS net_revenue\nFROM orders o\nLEFT JOIN payments p ON o.order_id = p.order_id AND p.status = 'SUCCESS'\nLEFT JOIN refunds r ON o.order_id = r.order_id\nGROUP BY 1;",
    actualOutput: "order_id 5001 net_revenue 260",
    expectedOutput: "order_id 5001 net_revenue 130",
    sampleTables: [
      {
        name: "orders",
        columns: ["order_id", "order_amount"],
        rows: [
          [5001, 150],
          [5002, 80]
        ]
      },
      {
        name: "payments",
        columns: ["payment_id", "order_id", "payment_amount", "status"],
        rows: [
          [1, 5001, 100, "SUCCESS"],
          [2, 5001, 50, "SUCCESS"],
          [3, 5002, 80, "SUCCESS"],
          [4, 5002, 80, "FAILED"]
        ]
      },
      {
        name: "refunds",
        columns: ["refund_id", "order_id", "refund_amount"],
        rows: [
          [10, 5001, 20],
          [11, 5002, 5]
        ]
      }
    ],
    expectedSql:
      "WITH payment_totals AS (\n  SELECT order_id, SUM(payment_amount) AS paid_amount\n  FROM payments\n  WHERE status = 'SUCCESS'\n  GROUP BY order_id\n), refund_totals AS (\n  SELECT order_id, SUM(refund_amount) AS refunded_amount\n  FROM refunds\n  GROUP BY order_id\n)\nSELECT\n  o.order_id,\n  COALESCE(p.paid_amount, 0) AS paid_amount,\n  COALESCE(r.refunded_amount, 0) AS refunded_amount,\n  COALESCE(p.paid_amount, 0) - COALESCE(r.refunded_amount, 0) AS net_revenue\nFROM orders o\nLEFT JOIN payment_totals p ON o.order_id = p.order_id\nLEFT JOIN refund_totals r ON o.order_id = r.order_id;",
    hints: [
      "Count rows after each join.",
      "Payments and refunds are both one-to-many relative to orders.",
      "Aggregate each child table to order grain before joining."
    ],
    tasks: [
      "Identify the join explosion.",
      "Rewrite with pre-aggregated payment and refund CTEs.",
      "Explain how to monitor for this class of bug."
    ],
    modelSolution:
      "WITH payment_totals AS (\n  SELECT order_id, SUM(payment_amount) AS paid_amount\n  FROM payments\n  WHERE status = 'SUCCESS'\n  GROUP BY order_id\n), refund_totals AS (\n  SELECT order_id, SUM(refund_amount) AS refunded_amount\n  FROM refunds\n  GROUP BY order_id\n)\nSELECT\n  o.order_id,\n  COALESCE(p.paid_amount, 0) - COALESCE(r.refunded_amount, 0) AS net_revenue\nFROM orders o\nLEFT JOIN payment_totals p ON o.order_id = p.order_id\nLEFT JOIN refund_totals r ON o.order_id = r.order_id;",
    productionExplanation:
      "The safe pattern is to join tables at the same grain. Pre-aggregate child tables to order_id, then join. Add tests for duplicate row count by order and compare net revenue to processor totals.",
    commonMistakes: [
      "Using SUM(DISTINCT payment_amount), which fails when two payments have the same amount.",
      "Joining all child tables first and hoping GROUP BY fixes it.",
      "Not checking intermediate row counts."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "What if refunds have statuses too?",
      "How would you design the revenue mart grain?"
    ],
    relatedProjectMissionId: "daily-revenue-mart"
  },
  {
    id: "bpl-pyspark-001",
    title: "Append Mode Created Duplicate Daily Loads",
    slug: "pyspark-append-mode-duplicate-daily-loads",
    domain: "pyspark",
    difficulty: "intermediate",
    scenarioType: "broken_pyspark",
    isFree: true,
    estimatedMinutes: 20,
    tags: ["PySpark", "Idempotency", "Daily Loads", "Lakehouse"],
    businessContext:
      "A daily orders job was rerun after a cluster failure. The DAG succeeded, but the dashboard shows exactly 2x orders for the rerun date.",
    problemStatement:
      "The PySpark job writes in append mode for a deterministic daily partition, so retries and reruns duplicate the same day.",
    requirement: "Make the daily write idempotent for order_date.",
    brokenCode:
      "orders_df\n  .filter(F.col('order_date') == run_date)\n  .write\n  .mode('append')\n  .partitionBy('order_date')\n  .parquet(gold_orders_path)",
    actualOutput: "order_date=2026-05-02 has 2 copies of the same order_id values after rerun.",
    expectedOutput: "Rerunning the same date replaces or merges that date without duplicates.",
    sampleTables: [
      {
        name: "orders_df",
        columns: ["order_id", "customer_id", "order_date", "updated_at", "amount"],
        rows: [
          [9001, 101, "2026-05-02", "2026-05-02 09:10:00", 120],
          [9002, 102, "2026-05-02", "2026-05-02 09:12:00", 80],
          [9001, 101, "2026-05-02", "2026-05-02 09:10:00", 120]
        ]
      },
      {
        name: "gold_orders_partition_after_retry",
        columns: ["order_id", "order_date", "load_attempt"],
        rows: [
          [9001, "2026-05-02", 1],
          [9002, "2026-05-02", 1],
          [9001, "2026-05-02", 2],
          [9002, "2026-05-02", 2]
        ]
      }
    ],
    hints: [
      "Append is safe for immutable event logs, not always for rebuilt daily marts.",
      "Think about overwrite-by-partition or merge/upsert semantics.",
      "Add deduplication on a stable key before writing."
    ],
    tasks: [
      "Fix the write strategy.",
      "Explain idempotency for reruns.",
      "Add one validation check."
    ],
    modelSolution:
      "For a rebuilt daily mart, write the target partition idempotently. In Delta, use replaceWhere/order_date partition overwrite or MERGE by order_id. Also deduplicate the input by order_id using latest updated_at before writing.\n\nExample:\norders_for_day = orders_df.filter(F.col('order_date') == run_date).dropDuplicates(['order_id'])\norders_for_day.write.format('delta').mode('overwrite').option('replaceWhere', f\"order_date = '{run_date}'\").save(gold_orders_path)",
    productionExplanation:
      "Retries must be safe. Use append for immutable raw events, but use partition replacement or merge for derived daily tables. Add count-by-partition and duplicate-key checks after each write.",
    commonMistakes: [
      "Only deleting duplicates after dashboards are wrong.",
      "Using overwrite on the whole table instead of one partition.",
      "Ignoring retry semantics in orchestration."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "When is append mode actually the right choice?",
      "How would Airflow pass run_date safely?"
    ],
    relatedProjectMissionId: "deduplicate-orders"
  },
  {
    id: "bpl-pyspark-002",
    title: "Spark Join Slowed Down Due to Skewed Customer Key",
    slug: "spark-join-slow-customer-key-skew",
    domain: "pyspark",
    difficulty: "intermediate",
    scenarioType: "mcq",
    isFree: false,
    estimatedMinutes: 12,
    tags: ["PySpark", "Skew", "Join", "Performance"],
    businessContext:
      "A customer enrichment job normally finishes in 12 minutes. Today it runs for 90 minutes and one task is stuck at 99%.",
    problemStatement:
      "The join key has one customer_id that owns a massive share of events, causing one reducer partition to process most rows.",
    logs:
      "Stage 47: 199/200 tasks finished quickly. Task 198 running for 76 min.\nTop key profile: customer_id = 0 has 41% of rows.",
    mcqOptions: [
      {
        id: "A",
        text: "Wrong Python version on the driver",
        isCorrect: false,
        explanation: "A Python version mismatch would usually fail quickly, not leave one reducer task processing most rows."
      },
      {
        id: "B",
        text: "Data skew on the join key",
        isCorrect: true,
        explanation: "One key owns a large percentage of rows, so one partition becomes a bottleneck."
      },
      {
        id: "C",
        text: "Airflow retry delay",
        isCorrect: false,
        explanation: "Airflow retry timing does not explain one Spark task stuck inside a join stage."
      },
      {
        id: "D",
        text: "Wrong IAM role",
        isCorrect: false,
        explanation: "IAM issues generally show access denied errors rather than a skewed long-running task."
      }
    ],
    hints: [
      "Look at task distribution, not only total runtime.",
      "One task stuck while others finish is a skew smell.",
      "Profile join-key frequency before choosing salting/broadcast strategies."
    ],
    tasks: [
      "Choose the likely root cause.",
      "Explain the production fix.",
      "Mention one metric that confirms skew."
    ],
    modelSolution:
      "The likely root cause is data skew on customer_id. Profile key distribution, isolate hot keys, and choose a fix such as broadcast join for small dimensions, salting hot keys, skew join optimization, or special handling for default/null keys.",
    productionExplanation:
      "Spark performance debugging starts with stage and task distribution. Skew is not solved by simply adding executors if one key still funnels most data into one partition.",
    commonMistakes: [
      "Increasing cluster size without key profiling.",
      "Caching everything.",
      "Assuming all slow joins are caused by missing partitioning."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "How would you detect skew before the job runs?",
      "When would broadcast join be unsafe?"
    ]
  },
  {
    id: "bpl-pyspark-003",
    title: "Too Many Small Files from Hourly Writes",
    slug: "too-many-small-files-hourly-writes",
    domain: "pyspark",
    difficulty: "intermediate",
    scenarioType: "log_analysis",
    isFree: false,
    estimatedMinutes: 17,
    tags: ["PySpark", "Small Files", "Compaction", "Lakehouse"],
    businessContext:
      "A dashboard query that reads yesterday's orders slowed from 20 seconds to 8 minutes after enabling hourly micro-batch writes.",
    problemStatement:
      "Each hourly job writes many tiny files into the same date partition. Metadata overhead dominates scan time.",
    logs:
      "Partition order_date=2026-05-12: 19,842 parquet files\nMedian file size: 1.6 MB\nQuery planning time: 311 seconds",
    brokenCode:
      "hourly_df.write.mode('append').partitionBy('order_date').parquet(silver_path)",
    hints: [
      "Check file count and median file size per partition.",
      "Hourly scheduling does not mean the lake must keep hourly tiny files forever.",
      "Think compaction and target file size."
    ],
    tasks: [
      "Diagnose the performance issue from logs.",
      "Suggest a write/compaction strategy.",
      "Explain what not to partition by."
    ],
    modelSolution:
      "The root cause is small-file avalanche. Keep partitioning aligned with query patterns, reduce output partitions before write when safe, and run scheduled compaction/OPTIMIZE to produce larger files. Track file count, average file size, and query planning time.",
    productionExplanation:
      "Small files hurt lakehouse systems through metadata and planning overhead. A production fix should include compaction policy, target file size, and prevention against over-partitioning.",
    commonMistakes: [
      "Partitioning by hour when queries filter by day.",
      "Calling coalesce(1) globally and creating a bottleneck.",
      "Ignoring compaction because the write job itself is green."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "What target file size would you aim for?",
      "How would streaming change the answer?"
    ],
    relatedProjectMissionId: "partition-strategy"
  },
  {
    id: "bpl-airflow-001",
    title: "DAG Green but Dashboard Wrong",
    slug: "airflow-green-dashboard-wrong",
    domain: "airflow",
    difficulty: "intermediate",
    scenarioType: "log_analysis",
    isFree: false,
    estimatedMinutes: 18,
    tags: ["Airflow", "Monitoring", "Data Quality", "Incident"],
    businessContext:
      "Airflow shows all tasks green, but the revenue dashboard is missing data for the last two hours.",
    problemStatement:
      "The DAG only checks task completion, not data freshness or row-count expectations.",
    logs:
      "[extract_orders] SUCCESS rows_written=0\n[transform_revenue] SUCCESS input_rows=0 output_rows=0\n[load_gold] SUCCESS partitions_loaded=0",
    hints: [
      "Green orchestration does not mean correct data.",
      "Look at rows_written and freshness, not only task status.",
      "Add data quality gates that can fail the DAG."
    ],
    tasks: [
      "Find why green status is misleading.",
      "Propose data quality checks.",
      "Explain alerting improvements."
    ],
    modelSolution:
      "The DAG succeeded mechanically but processed zero rows. Add checks for freshness, minimum row counts, expected partition arrival, and reconciliation to source events. Fail or quarantine when a required partition has zero rows unexpectedly.",
    productionExplanation:
      "Airflow is an orchestrator, not a data correctness guarantee. Production pipelines need data-aware checks and alerts that business metrics are stale or incomplete.",
    commonMistakes: [
      "Only checking task status.",
      "Adding retries instead of validating input availability.",
      "Not distinguishing valid zero rows from suspicious zero rows."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "How would you define a safe minimum-row threshold?",
      "Who should be alerted: platform team or business owner?"
    ],
    relatedProjectMissionId: "green-dag-wrong-data"
  },
  {
    id: "bpl-airflow-002",
    title: "Airflow Retry Reprocessed Same File and Created Duplicates",
    slug: "airflow-retry-reprocessed-file-duplicates",
    domain: "airflow",
    difficulty: "intermediate",
    scenarioType: "mixed_lab",
    isFree: false,
    estimatedMinutes: 22,
    tags: ["Airflow", "Retries", "Idempotency", "Duplicates"],
    businessContext:
      "An ingestion task failed after writing half the file, then retried and wrote the same file again. Downstream tables now have duplicates.",
    problemStatement:
      "Retry behavior is not idempotent. The pipeline lacks file-level checkpointing and deduplication keys.",
    logs:
      "try_number=1 wrote 482,991 rows then failed on network timeout\ntry_number=2 wrote 973,104 rows and marked SUCCESS\nDuplicate file_name=input_2026_05_10.json count=482,991",
    hints: [
      "Retries should be safe by design.",
      "Track file ingestion status before and after processing.",
      "Use deterministic load IDs or dedup keys."
    ],
    tasks: [
      "Explain the retry/idempotency bug.",
      "Design a safer ingestion pattern.",
      "Write your interview explanation."
    ],
    modelSolution:
      "Use a file manifest/checkpoint table with states such as discovered, processing, loaded, failed. Write to a staging location first, commit atomically, and deduplicate by event_id or file_name plus row_number. Retries should either resume safely or replace the partial output.",
    productionExplanation:
      "Airflow retries are useful only when tasks are idempotent. Side effects need transactional writes, checkpoints, and replay-safe keys.",
    commonMistakes: [
      "Disabling retries entirely.",
      "Deleting all target data manually after each failure.",
      "Not storing source file metadata."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "How would you recover today's duplicates?",
      "What metadata belongs in the file manifest?"
    ]
  },
  {
    id: "bpl-dq-001",
    title: "Revenue Dropped 30% After New SUCCESSFUL Status",
    slug: "revenue-drop-new-successful-status",
    domain: "data_quality",
    difficulty: "beginner",
    scenarioType: "output_mismatch",
    isFree: false,
    estimatedMinutes: 15,
    tags: ["Data Quality", "Status Mapping", "Revenue", "Monitoring"],
    businessContext:
      "Revenue dropped by 30% overnight, but product says order volume is normal. A new payment provider was launched yesterday.",
    problemStatement:
      "The revenue query only accepts status = 'SUCCESS'. The new provider sends 'SUCCESSFUL'.",
    brokenCode:
      "SELECT order_date, SUM(amount) AS revenue\nFROM payments\nWHERE payment_status = 'SUCCESS'\nGROUP BY order_date;",
    actualOutput: "2026-05-21 revenue = 700000",
    expectedOutput: "2026-05-21 revenue = 1000000",
    sampleTables: [
      {
        name: "payments",
        columns: ["payment_id", "order_date", "amount", "payment_status", "provider"],
        rows: [
          [1, "2026-05-21", 400000, "SUCCESS", "legacy_gateway"],
          [2, "2026-05-21", 300000, "SUCCESS", "legacy_gateway"],
          [3, "2026-05-21", 300000, "SUCCESSFUL", "new_gateway"]
        ]
      },
      {
        name: "status_mapping",
        columns: ["payment_status", "normalized_status"],
        rows: [
          ["SUCCESS", "paid_success"],
          ["SUCCESSFUL", "paid_success"],
          ["FAILED", "failed"]
        ]
      }
    ],
    hints: [
      "Inspect distinct payment_status values by date.",
      "Do not hardcode business status mapping in one hidden query.",
      "Add unknown-status alerts."
    ],
    tasks: [
      "Find the data quality issue.",
      "Fix the status mapping.",
      "Suggest a prevention check."
    ],
    modelSolution:
      "Create a controlled status mapping table where SUCCESS and SUCCESSFUL map to paid_success. Join payments to that mapping and alert when an unmapped payment_status appears. Backfill the affected date after validating totals.",
    productionExplanation:
      "Business enums drift. Production pipelines should treat new statuses as observable events, not silently exclude them.",
    commonMistakes: [
      "Changing the WHERE clause to IN without adding an unmapped-status check.",
      "Not backfilling the affected day.",
      "Not confirming semantics with the payment provider."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "How would you version status mappings?",
      "Should unknown statuses fail the pipeline or quarantine records?"
    ]
  },
  {
    id: "bpl-dq-002",
    title: "UTC to Local Timezone Boundary Broke Daily Dashboard",
    slug: "utc-local-timezone-dashboard-mismatch",
    domain: "data_quality",
    difficulty: "intermediate",
    scenarioType: "broken_sql",
    isFree: false,
    estimatedMinutes: 19,
    tags: ["SQL", "Timezone", "Reporting", "Data Quality"],
    businessContext:
      "India business users report that yesterday's order dashboard is missing late-night orders. The raw events are stored in UTC, but business reviews happen by India business date.",
    problemStatement:
      "The report groups by the UTC calendar date. Orders between 18:30 and 23:59 UTC belong to the next calendar day in Asia/Kolkata, so the dashboard shifts late-night revenue into the wrong business date.",
    requirement: "Convert event_ts_utc to India business time before deriving the reporting date. Return business_date and revenue so late-night UTC events are counted on the correct India date.",
    schema: "orders(order_id, event_ts_utc, amount)",
    brokenCode:
      "SELECT CAST(event_ts_utc AS DATE) AS order_date, SUM(amount) AS revenue\nFROM orders\nGROUP BY 1;",
    expectedOutput:
      "Events between 18:30 UTC and 23:59 UTC should belong to the next India business date.",
    sampleTables: [
      {
        name: "orders",
        columns: ["order_id", "event_ts_utc", "amount"],
        rows: [
          [1, "2026-05-01 18:20:00", 100],
          [2, "2026-05-01 18:45:00", 200],
          [3, "2026-05-02 03:00:00", 150]
        ]
      }
    ],
    expectedSql:
      "SELECT DATE(datetime(event_ts_utc, '+5 hours', '+30 minutes')) AS business_date,\n       SUM(amount) AS revenue\nFROM orders\nGROUP BY DATE(datetime(event_ts_utc, '+5 hours', '+30 minutes'))\nORDER BY business_date;",
    hints: [
      "Define business date before writing the filter.",
      "UTC date and local business date are different near midnight.",
      "Convert timestamp first, then cast to date."
    ],
    tasks: [
      "Fix the business-date aggregation.",
      "Explain why the old report was wrong.",
      "Name a boundary test case."
    ],
    modelSolution:
      "Convert event_ts_utc to the business timezone first, then derive the date. In DuckDB-style SQL this can be expressed as CAST(event_ts_utc + INTERVAL '5 hours 30 minutes' AS DATE) for IST, but production systems should use timezone-aware functions and a configured business timezone.",
    productionExplanation:
      "Timezone bugs are boundary bugs. Add tests for events just before and after local midnight, and document whether reports use UTC or local business time.",
    commonMistakes: [
      "Filtering by UTC date and grouping by local date.",
      "Hardcoding offsets for timezones with daylight savings.",
      "Not aligning dashboard labels with business definitions."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "How would this differ for US timezones with DST?",
      "Where should business timezone be configured?"
    ]
  },
  {
    id: "bpl-aws-001",
    title: "Bad Partition Strategy by customer_id",
    slug: "bad-partition-strategy-customer-id",
    domain: "aws",
    difficulty: "intermediate",
    scenarioType: "mcq",
    isFree: false,
    estimatedMinutes: 10,
    tags: ["AWS", "S3", "Partitioning", "Lakehouse"],
    businessContext:
      "A table in S3 has become expensive and slow to query after being partitioned by customer_id.",
    problemStatement:
      "customer_id is high-cardinality and query filters mostly use order_date. The lake now has millions of tiny partitions.",
    mcqOptions: [
      {
        id: "A",
        text: "Keep customer_id partitioning because customer is a business entity",
        isCorrect: false,
        explanation: "Business importance does not make a column a good partition key."
      },
      {
        id: "B",
        text: "Partition by common filter columns such as order_date and compact files",
        isCorrect: true,
        explanation: "Partitioning should match access patterns and avoid high-cardinality metadata overhead."
      },
      {
        id: "C",
        text: "Partition by every frequently selected column",
        isCorrect: false,
        explanation: "Too many partitions increase metadata and small-file problems."
      },
      {
        id: "D",
        text: "Stop using columnar files",
        isCorrect: false,
        explanation: "The issue is partition strategy, not columnar storage itself."
      }
    ],
    hints: [
      "A good partition key is not just a common dimension.",
      "Check query filters and cardinality.",
      "Metadata overhead can dominate actual data scan."
    ],
    tasks: [
      "Choose the safest partition strategy.",
      "Explain the customer_id trap.",
      "Suggest a migration plan."
    ],
    modelSolution:
      "Use order_date or event_date partitioning if most queries filter by date, then compact files and optionally cluster/sort by customer_id inside files. Migrate by rewriting affected partitions and updating table metadata carefully.",
    productionExplanation:
      "Partitioning is a physical design decision. It should optimize common reads while keeping partition count and file sizes healthy.",
    commonMistakes: [
      "Partitioning by user/customer/account IDs.",
      "Confusing clustering/sorting with partitioning.",
      "Not measuring partition count."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "When would customer_id bucketing help?",
      "What metrics would show partition health?"
    ],
    relatedProjectMissionId: "partition-strategy"
  },
  {
    id: "bpl-mixed-001",
    title: "Late Arriving Records Changed Previous Revenue Partitions",
    slug: "late-arriving-records-revenue-partitions",
    domain: "mixed",
    difficulty: "advanced",
    scenarioType: "mixed_lab",
    isFree: false,
    estimatedMinutes: 25,
    tags: ["Watermark", "Late Data", "SQL", "Airflow", "Interview"],
    businessContext:
      "Yesterday's revenue was certified at 10 AM, but late events arrived at noon and changed yesterday's partition. Finance now sees two different numbers.",
    problemStatement:
      "The pipeline assumes closed daily partitions are final. It has no late-arrival correction window or restatement process.",
    actualOutput: "Certified revenue for 2026-05-20: 12.4M. Updated dashboard at noon: 12.7M.",
    expectedOutput:
      "A controlled restatement process should explain when historical partitions can change and how Finance is notified.",
    hints: [
      "Late data is not only a SQL problem; it is a business-contract problem.",
      "Think watermark, correction window, and reporting SLA.",
      "Separate raw arrival time from business event time."
    ],
    tasks: [
      "Diagnose the late-arrival issue.",
      "Design a safe correction strategy.",
      "Explain it in interview style."
    ],
    modelSolution:
      "Use event_time for business reporting, ingestion_time for operations, and define a correction window. Reprocess affected partitions inside that window, record restatements, and alert Finance when certified numbers change. For closed periods, route late records through an adjustment process instead of silently mutating dashboards.",
    productionExplanation:
      "Late-arriving data requires both pipeline design and stakeholder contract. The best answer mentions watermarking, backfill, idempotency, reconciliation, and communication.",
    commonMistakes: [
      "Dropping late records.",
      "Silently updating certified dashboards.",
      "Using ingestion date as business date without agreement."
    ],
    evaluationRubric: DEFAULT_RUBRIC,
    followUps: [
      "How would you choose a correction window?",
      "What should happen after the finance close?"
    ],
    relatedProjectMissionId: "late-arriving-records"
  }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSampleTables(value: unknown): ScenarioSampleTable[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tables = value
    .filter(isRecord)
    .map((table) => ({
      name: normalizeString(table.name),
      columns: normalizeStringArray(table.columns),
      rows: Array.isArray(table.rows)
        ? (table.rows.filter(Array.isArray) as ScenarioTableCell[][])
        : []
    }))
    .filter((table) => table.name && table.columns.length > 0);

  return tables.length ? tables : undefined;
}

function normalizeDomain(value: unknown): ScenarioDomain {
  return VALID_DOMAINS.includes(value as ScenarioDomain) ? (value as ScenarioDomain) : "mixed";
}

function normalizeDifficulty(value: unknown): ScenarioDifficulty {
  return VALID_DIFFICULTIES.includes(value as ScenarioDifficulty)
    ? (value as ScenarioDifficulty)
    : "intermediate";
}

function normalizeScenarioType(value: unknown): ScenarioType {
  return VALID_SCENARIO_TYPES.includes(value as ScenarioType)
    ? (value as ScenarioType)
    : "mixed_lab";
}

function normalizeRubric(value: unknown): EvaluationRubric {
  if (!isRecord(value)) return DEFAULT_RUBRIC;

  return {
    rootCause: normalizeNumber(value.rootCause, DEFAULT_RUBRIC.rootCause),
    correctness: normalizeNumber(value.correctness, DEFAULT_RUBRIC.correctness),
    productionThinking: normalizeNumber(value.productionThinking, DEFAULT_RUBRIC.productionThinking),
    tradeoffs: normalizeNumber(value.tradeoffs, DEFAULT_RUBRIC.tradeoffs),
    communication: normalizeNumber(value.communication, DEFAULT_RUBRIC.communication)
  };
}

function normalizeMcqOptions(value: unknown): McqOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value
    .filter(isRecord)
    .map((option) => ({
      id: normalizeString(option.id),
      text: normalizeString(option.text),
      isCorrect: Boolean(option.isCorrect),
      explanation: normalizeString(option.explanation)
    }))
    .filter((option) => option.id && option.text);

  return options.length ? options : undefined;
}

function normalizeGeneratedScenario(value: unknown): Scenario | null {
  if (!isRecord(value)) return null;

  const id = normalizeString(value.id);
  const title = normalizeString(value.title);
  const slug = normalizeString(value.slug);

  if (!id || !title || !slug) return null;

  return {
    id,
    title,
    slug,
    domain: normalizeDomain(value.domain),
    difficulty: normalizeDifficulty(value.difficulty),
    scenarioType: normalizeScenarioType(value.scenarioType),
    isFree: Boolean(value.isFree),
    estimatedMinutes: normalizeNumber(value.estimatedMinutes, 20),
    tags: normalizeStringArray(value.tags),
    businessContext: normalizeString(value.businessContext, "You are debugging a production data engineering issue."),
    problemStatement: normalizeString(value.problemStatement, "Diagnose the issue and propose a production-safe fix."),
    requirement: normalizeString(value.requirement),
    schema: normalizeString(value.schema),
    sampleInput: normalizeString(value.sampleInput),
    brokenCode: normalizeString(value.brokenCode),
    actualOutput: normalizeString(value.actualOutput),
    expectedOutput: normalizeString(value.expectedOutput),
    sampleTables: normalizeSampleTables(value.sampleTables),
    expectedSql: normalizeString(value.expectedSql) || undefined,
    logs: normalizeString(value.logs),
    mcqOptions: normalizeMcqOptions(value.mcqOptions),
    hints: normalizeStringArray(value.hints),
    tasks: normalizeStringArray(value.tasks),
    modelSolution: normalizeString(
      value.modelSolution,
      "Confirm the root cause, apply the safest fix, validate the output, and explain the trade-offs."
    ),
    productionExplanation: normalizeString(
      value.productionExplanation,
      "A strong production answer includes root cause, fix, validation, monitoring, and trade-offs."
    ),
    commonMistakes: normalizeStringArray(value.commonMistakes),
    evaluationRubric: normalizeRubric(value.evaluationRubric),
    followUps: normalizeStringArray(value.followUps),
    relatedProjectMissionId: normalizeString(value.relatedProjectMissionId) || undefined
  };
}

function uniqueBySlug(scenarios: Scenario[]): Scenario[] {
  const seen = new Set<string>();
  return scenarios.filter((scenario) => {
    if (seen.has(scenario.slug)) return false;
    seen.add(scenario.slug);
    return true;
  });
}

const GENERATED_SCENARIOS = (generatedScenarioData as unknown[])
  .map(normalizeGeneratedScenario)
  .filter((scenario): scenario is Scenario => Boolean(scenario));

export const ALL_SCENARIOS = uniqueBySlug([
  ...BROKEN_PIPELINE_SCENARIOS,
  ...GENERATED_SCENARIOS
]);

export const DOMAIN_FILTERS = ["All", ...Object.values(DOMAIN_LABELS)];
export const DIFFICULTY_FILTERS = ["All", "beginner", "intermediate", "advanced"];
export const TYPE_FILTERS = ["All", ...Object.values(SCENARIO_TYPE_LABELS)];
export const ACCESS_FILTERS = ["All", "Free", "Premium"];

export function getScenarios(): Scenario[] {
  return ALL_SCENARIOS;
}

export function getScenarioBySlug(slug: string): Scenario | undefined {
  return ALL_SCENARIOS.find((scenario) => scenario.slug === slug);
}

export function getFreeScenarios(): Scenario[] {
  return ALL_SCENARIOS.filter((scenario) => scenario.isFree);
}

export function getRecommendedScenarioSlug(): string {
  return getFreeScenarios()[0]?.slug ?? ALL_SCENARIOS[0]?.slug ?? "scenarios";
}

export function formatDomain(domain: ScenarioDomain): string {
  return DOMAIN_LABELS[domain];
}

export function formatScenarioType(type: ScenarioType): string {
  return SCENARIO_TYPE_LABELS[type];
}

export function formatDifficulty(difficulty: ScenarioDifficulty): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}
