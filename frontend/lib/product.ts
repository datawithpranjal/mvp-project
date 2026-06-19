import type { ScenarioSummary, ValidationType } from "./types";

export const BRAND = {
  name: "The Data Foundry",
  trustLine: "Built by Data with Pranjal",
  positioning:
    "A practice-first platform for Data Engineering interviews, production scenarios, and job readiness."
};

export const DIFFICULTY_FILTERS = ["All", "Beginner", "Intermediate", "Advanced"];
export const TOPIC_FILTERS = [
  "All",
  "SQL",
  "Spark",
  "Airflow",
  "Kafka",
  "Lakehouse",
  "Data Quality"
];

export const CORE_LABS = [
  {
    title: "SQL Lab",
    description: "Debug query logic, grain issues, NULL traps, CDC, rankings, and warehouse outputs.",
    href: "/labs/sql",
    status: "available"
  },
  {
    title: "PySpark Lab",
    description: "Practice performance, partitioning, UDF replacement, skew, and DataFrame reasoning.",
    href: "/labs/pyspark",
    status: "available"
  },
  {
    title: "Airflow Lab",
    description: "Diagnose retries, sensors, DAG dependencies, scheduler delays, backfills, and operational failures.",
    href: "/labs/airflow",
    status: "available"
  },
  {
    title: "AWS/Data Platform Lab",
    description: "Choose AWS services through storage, security, compute, streaming, governance, and cost incidents.",
    href: "/labs/aws",
    status: "available"
  },
  {
    title: "System Design Studio",
    description: "Design data platforms, defend architecture trade-offs, and practice interview framing.",
    href: "/system-design",
    status: "available"
  },
  {
    title: "Scenario Playground",
    description: "Work through production-style incidents with broken logic, logs, data, hints, and feedback.",
    href: "/scenarios",
    status: "available"
  },
  {
    title: "Project Sandbox",
    description: "Practice end-to-end pipeline decisions and production consequences in a guided sandbox.",
    href: "/projects/ecommerce-pipeline",
    status: "coming-soon"
  },
  {
    title: "Mock Interview Room",
    description: "Practice explaining root causes, trade-offs, monitoring, and strong interview framing.",
    href: "/mock-interview",
    status: "coming-soon"
  }
];

export const HOMEPAGE_STATS = [
  {
    value: "132+",
    label: "Practice scenarios",
    detail: "SQL, pipelines, incidents, and interview cases"
  },
  {
    value: "SQL + PySpark",
    label: "Hands-on labs",
    detail: "Interactive exercises with immediate feedback"
  },
  {
    value: "Production",
    label: "Debugging mindset",
    detail: "Broken logic, logs, trade-offs, and monitoring"
  },
  {
    value: "Free",
    label: "Starter labs",
    detail: "Begin with guided practice before upgrading"
  }
];

export const PRODUCT_PREVIEW_STEPS = [
  {
    label: "Broken problem",
    title: "Pipeline rerun doubled revenue",
    detail: "Inspect the business context, sample data, logs, and broken logic."
  },
  {
    label: "User attempt",
    title: "Write the fix",
    detail: "Solve with SQL, PySpark reasoning, architecture trade-offs, or incident analysis."
  },
  {
    label: "Feedback",
    title: "Check the answer",
    detail: "Get validation, rubric scoring, hints, and missing production considerations."
  },
  {
    label: "Model answer",
    title: "Learn the interview framing",
    detail: "Reveal root cause, fix, monitoring, trade-offs, and follow-up questions."
  }
];

export const TRUST_SIGNALS = [
  {
    label: "Creator",
    value: "Built by Pranjal",
    detail: "Creator of Data with Pranjal, focused on practical Data Engineering preparation."
  },
  {
    label: "Practical guidance",
    value: "Creator-led learning",
    detail: "Clear walkthroughs shaped by real Data Engineering interview and production problems."
  },
  {
    label: "Built for learners",
    value: "Practice-led progress",
    detail: "Designed for freshers, career switchers, and engineers preparing for their next role."
  }
];

export const GUIDED_SCENARIO_PATHS = [
  {
    title: "SQL interviews",
    description: "Start with joins, grain, NULL traps, windows, and metric correctness.",
    filters: { domain: "SQL", difficulty: "All", type: "All", access: "All" }
  },
  {
    title: "PySpark debugging",
    description: "Practice skew, UDFs, partitions, retries, and production Spark code review.",
    filters: { domain: "PySpark", difficulty: "All", type: "All", access: "All" }
  },
  {
    title: "Interview in 7 days",
    description: "Focus on beginner/intermediate free labs with fast feedback.",
    filters: { domain: "All", difficulty: "beginner", type: "All", access: "Free" }
  },
  {
    title: "Career switcher",
    description: "Build confidence with readable production cases and guided explanations.",
    filters: { domain: "All", difficulty: "beginner", type: "All", access: "All" }
  },
  {
    title: "Production scenarios",
    description: "Skip theory and practice incidents, logs, output mismatches, and trade-offs.",
    filters: { domain: "All", difficulty: "All", type: "Mixed Lab", access: "All" }
  }
];

export const AUDIENCE_SEGMENTS = [
  "Freshers building job-ready confidence",
  "Career switchers moving from analytics or software",
  "Junior data engineers learning production thinking",
  "Interview candidates who need scenario practice",
  "Recently joined data engineers surviving the first 90 days"
];

export interface LearningPathStep {
  stage: number;
  title: string;
  taskType:
    | "sql"
    | "python"
    | "pyspark"
    | "airflow"
    | "aws"
    | "scenario"
    | "system-design"
    | "revision";
  description: string;
  href: string;
  practiceTarget: string;
  checkpoints: string[];
}

export interface LearningPathTemplate {
  slug: string;
  name: string;
  stageCount: number;
  targetUser: string;
  description: string;
  steps: LearningPathStep[];
}

export const LEARNING_PATHS: LearningPathTemplate[] = [
  {
    slug: "data-foundry-practice-roadmap",
    name: "The Data Foundry Practice Roadmap",
    stageCount: 8,
    targetUser: "Every Data Engineering learner",
    description:
      "A practical route through the platform. Move forward when you can demonstrate the skill, not because a calendar day has passed.",
    steps: [
      {
        stage: 1,
        title: "Build SQL foundations",
        taskType: "sql",
        description:
          "Start with hands-on SQL practice so joins, aggregations, NULL handling, windows, and output grain become reliable.",
        href: "/labs/sql?lab=sql-coding-01-second-highest-salary",
        practiceTarget: "Complete 8-10 SQL labs before moving forward.",
        checkpoints: [
          "Filter and aggregate data at the correct grain",
          "Use joins without duplicating or silently dropping rows",
          "Handle NULL values, rankings, and deduplication",
          "Explain why your output matches the business requirement"
        ]
      },
      {
        stage: 2,
        title: "Practice Python for data work",
        taskType: "python",
        description:
          "Use Python to transform records, handle files and nested data, and write clear logic that survives realistic edge cases.",
        href: "/labs/python?lab=python-coding-01-reverse-a-string",
        practiceTarget: "Complete 5-8 Python labs with all sample cases passing.",
        checkpoints: [
          "Work confidently with lists, dictionaries, strings, and records",
          "Process JSON, CSV, and file-like data safely",
          "Test empty, duplicate, malformed, and missing-value cases",
          "Write readable functions instead of one-off scripts"
        ]
      },
      {
        stage: 3,
        title: "Debug PySpark pipelines",
        taskType: "pyspark",
        description:
          "Move from syntax to production reasoning by fixing DataFrame logic, skew, rerun duplication, partitions, and small-file problems.",
        href: "/labs/pyspark?lab=pyspark-append-rerun-duplicates",
        practiceTarget: "Complete at least 5 PySpark production labs.",
        checkpoints: [
          "Use built-in DataFrame functions before Python UDFs",
          "Reason about joins, shuffle, skew, and partition counts",
          "Make reruns idempotent and safe",
          "Explain the operational trade-off behind your fix"
        ]
      },
      {
        stage: 4,
        title: "Operate Airflow workflows",
        taskType: "airflow",
        description:
          "Learn to classify scheduling delays, retries, sensor pressure, backfill failures, and orchestration anti-patterns from real evidence.",
        href: "/labs/airflow?lab=airflow-dag-starts-hours-late",
        practiceTarget: "Complete 5 Airflow incident labs across different failure classes.",
        checkpoints: [
          "Separate scheduler, executor, worker, and downstream failures",
          "Design retries, sensors, pools, and backfills safely",
          "Keep heavy compute and large payloads outside Airflow",
          "Explain idempotency, observability, and operational trade-offs"
        ]
      },
      {
        stage: 5,
        title: "Make AWS platform decisions",
        taskType: "aws",
        description:
          "Choose storage, compute, streaming, security, governance, and serving services from workload evidence rather than memorized definitions.",
        href: "/labs/aws?lab=aws-athena-cost-spike",
        practiceTarget: "Complete 6 AWS incidents covering at least 4 service areas.",
        checkpoints: [
          "Start with workload, scale, latency, and operating constraints",
          "Compare the chosen service with its nearest alternative",
          "Include IAM, networking, encryption, cost, and failure handling",
          "Name monitoring signals that prove the design works"
        ]
      },
      {
        stage: 6,
        title: "Enter the Broken Pipeline Lab",
        taskType: "scenario",
        description:
          "Apply SQL, PySpark, orchestration, and data-quality skills to incidents that look like a data engineer's daily production work.",
        href: "/scenarios/wrong-group-by-grain-customer-revenue",
        practiceTarget: "Solve 6 production scenarios across at least 3 topics.",
        checkpoints: [
          "Attempt the diagnosis before opening hints",
          "Run the corrected query or logic when execution is available",
          "State the root cause and business impact clearly",
          "Add monitoring, reconciliation, or prevention steps"
        ]
      },
      {
        stage: 7,
        title: "Develop system design judgment",
        taskType: "system-design",
        description:
          "Practice turning requirements into a dependable data platform and defending architecture choices instead of memorizing diagrams.",
        href: "/system-design",
        practiceTarget: "Complete 3 system design cases and explain each aloud.",
        checkpoints: [
          "Clarify scale, latency, consumers, and data contracts",
          "Choose batch, streaming, storage, and serving layers deliberately",
          "Discuss cost, reliability, consistency, and complexity trade-offs",
          "Include observability, replay, security, and failure recovery"
        ]
      },
      {
        stage: 8,
        title: "Use feedback to close weak areas",
        taskType: "revision",
        description:
          "Return to the dashboard, review weak skills and incomplete attempts, then repeat the platform loop with harder material.",
        href: "/dashboard",
        practiceTarget: "Review your dashboard after every 5 completed practices.",
        checkpoints: [
          "Re-attempt scenarios marked Weak or Okay",
          "Compare scores and identify recurring gaps",
          "Explain completed fixes in interview-ready language",
          "Choose the next lab from evidence, not random browsing"
        ]
      }
    ]
  }
];

export interface ProjectMission {
  id: string;
  title: string;
  stage: string;
  context: string;
  task: string;
  options: Array<{
    label: string;
    feedback: string;
    isCorrect: boolean;
  }>;
  correctApproach: string;
  productionLesson: string;
  xpReward: number;
}

export const ECOMMERCE_PROJECT_MISSIONS: ProjectMission[] = [
  {
    id: "raw-order-events",
    title: "Understand raw order events",
    stage: "Source API",
    context: "The orders API sends created, updated, cancelled, and refunded events with retryable delivery.",
    task: "Decide what must be preserved in the raw layer before transformation.",
    options: [
      {
        label: "Store only the latest order state",
        feedback: "This loses the audit trail and makes replay/reconciliation weak.",
        isCorrect: false
      },
      {
        label: "Store immutable raw events with event_id, order_id, event_time, payload, and ingestion_time",
        feedback: "Correct. Bronze should preserve replayable facts before business logic.",
        isCorrect: true
      },
      {
        label: "Drop failed records immediately",
        feedback: "This hides data quality issues. Quarantine them with a reason instead.",
        isCorrect: false
      }
    ],
    correctApproach:
      "Keep the raw payload immutable, include delivery metadata, and make replay possible.",
    productionLesson: "Raw data is your safety net when downstream assumptions break.",
    xpReward: 40
  },
  {
    id: "partition-strategy",
    title: "Choose storage format and partition strategy",
    stage: "Bronze",
    context: "Daily volume is high and most reporting queries filter by business order date.",
    task: "Choose a partition strategy that avoids small-file and high-cardinality traps.",
    options: [
      {
        label: "Partition by customer_id",
        feedback: "Bad choice. High cardinality creates many tiny partitions and metadata overhead.",
        isCorrect: false
      },
      {
        label: "Partition by order_date and compact files after ingestion",
        feedback: "Correct. This matches common query filters and keeps file counts controlled.",
        isCorrect: true
      },
      {
        label: "Do not partition anything ever",
        feedback: "Too broad. Some partitioning helps when it matches access patterns.",
        isCorrect: false
      }
    ],
    correctApproach:
      "Use Parquet/Delta-style columnar storage, partition by order_date, and compact small files.",
    productionLesson: "Partition for query patterns, not for every column that feels important.",
    xpReward: 45
  },
  {
    id: "deduplicate-orders",
    title: "Deduplicate orders",
    stage: "Silver",
    context: "API retries send the same order update multiple times with the same event_id.",
    task: "Pick a safe deduplication strategy.",
    options: [
      {
        label: "Use SELECT DISTINCT on all columns",
        feedback: "This can miss logical duplicates when metadata differs.",
        isCorrect: false
      },
      {
        label: "Deduplicate by event_id and keep the latest ingestion_time",
        feedback: "Correct. Event identity plus deterministic tie-breaker makes reruns idempotent.",
        isCorrect: true
      },
      {
        label: "Deduplicate only by order amount",
        feedback: "Amount is not a key and will collapse unrelated orders.",
        isCorrect: false
      }
    ],
    correctApproach:
      "Use a stable dedup key such as event_id, then apply deterministic ordering for ties.",
    productionLesson: "Idempotency is designed before the first retry happens.",
    xpReward: 50
  },
  {
    id: "late-arriving-records",
    title: "Handle late arriving records",
    stage: "Silver",
    context: "Some updates arrive two days late but affect previously reported revenue.",
    task: "Choose a correction strategy that keeps reporting accurate.",
    options: [
      {
        label: "Ignore events older than yesterday",
        feedback: "This makes dashboards fast but wrong.",
        isCorrect: false
      },
      {
        label: "Use event_time for business date and allow a lookback window with reconciliation",
        feedback: "Correct. Late data needs controlled reprocessing and checks.",
        isCorrect: true
      },
      {
        label: "Use ingestion_time as the business date",
        feedback: "This creates timezone and late-data reporting mismatches.",
        isCorrect: false
      }
    ],
    correctApproach:
      "Separate event_time from ingestion_time and reprocess a safe lookback window.",
    productionLesson: "Late data is normal. Pipelines should correct, not pretend it never happens.",
    xpReward: 55
  },
  {
    id: "daily-revenue-mart",
    title: "Build daily revenue mart",
    stage: "Gold",
    context: "Finance needs daily revenue by order_date, excluding cancelled and refunded orders.",
    task: "Choose the mart logic that protects business definitions.",
    options: [
      {
        label: "Sum every order amount regardless of status",
        feedback: "This overstates revenue and ignores business semantics.",
        isCorrect: false
      },
      {
        label: "Filter to revenue-eligible statuses and group by local business order_date",
        feedback: "Correct. Revenue marts must encode explicit business definitions.",
        isCorrect: true
      },
      {
        label: "Group by ingestion date only",
        feedback: "This measures processing date, not business revenue date.",
        isCorrect: false
      }
    ],
    correctApproach:
      "Define eligible statuses, business date, grain, and reconciliation totals.",
    productionLesson: "A green pipeline can still be wrong if business definitions are implicit.",
    xpReward: 60
  },
  {
    id: "airflow-green-wrong-data",
    title: "Debug Airflow DAG green but data wrong",
    stage: "Orchestration",
    context: "The DAG succeeds but yesterday's dashboard shows a revenue dip.",
    task: "Pick the best first debugging move.",
    options: [
      {
        label: "Rerun the whole DAG without checking inputs",
        feedback: "A rerun can hide the root cause and create duplicate writes.",
        isCorrect: false
      },
      {
        label: "Compare source counts, transformation counts, and mart totals by partition",
        feedback: "Correct. Reconciliation narrows the failing stage quickly.",
        isCorrect: true
      },
      {
        label: "Disable alerts because the DAG was green",
        feedback: "Green task status is not the same as correct data.",
        isCorrect: false
      }
    ],
    correctApproach:
      "Use stage-level reconciliation, data quality checks, and partition-specific diagnostics.",
    productionLesson: "Orchestration success is not a data correctness guarantee.",
    xpReward: 65
  },
  {
    id: "dashboard-mismatch",
    title: "Debug revenue dashboard mismatch",
    stage: "Monitoring",
    context: "Finance reports revenue differs from the BI dashboard after a timezone change.",
    task: "Choose the most likely investigation path.",
    options: [
      {
        label: "Check UTC-to-local business date handling and dashboard filters",
        feedback: "Correct. Boundary bugs are common around midnight and timezone changes.",
        isCorrect: true
      },
      {
        label: "Assume finance is using the wrong numbers",
        feedback: "Not enough. Start with shared definitions and reproducible checks.",
        isCorrect: false
      },
      {
        label: "Increase cluster size",
        feedback: "Performance capacity will not fix semantic mismatch.",
        isCorrect: false
      }
    ],
    correctApproach:
      "Verify timezone conversion, date filters, excluded statuses, and reconciliation reports.",
    productionLesson: "Dashboard trust comes from definitions, lineage, and reconciliation.",
    xpReward: 70
  }
];

export interface MockInterviewQuestion {
  id: string;
  type: "SQL" | "Spark" | "Scenario" | "Airflow" | "Mixed Data Engineering";
  prompt: string;
  expectedSignals: string[];
}

export const MOCK_INTERVIEW_QUESTIONS: MockInterviewQuestion[] = [
  {
    id: "sql-null-trap",
    type: "SQL",
    prompt: "How would you safely find customers who never placed an order if orders.customer_id may contain NULL?",
    expectedSignals: ["NOT EXISTS", "NULL semantics", "anti-join", "validation query"]
  },
  {
    id: "spark-small-files",
    type: "Spark",
    prompt: "A Spark job writes thousands of tiny files every hour. How do you debug and fix it?",
    expectedSignals: ["partition count", "file size", "compaction", "query pattern"]
  },
  {
    id: "airflow-green-wrong",
    type: "Airflow",
    prompt: "Your Airflow DAG is green, but dashboard numbers are wrong. What do you check first?",
    expectedSignals: ["data checks", "partition reconciliation", "logs", "rollback"]
  },
  {
    id: "scenario-cdc-delete",
    type: "Scenario",
    prompt: "CDC delete events are arriving. How should the current-state table handle tombstones?",
    expectedSignals: ["sequence ordering", "latest event", "soft/hard delete", "audit trail"]
  },
  {
    id: "mixed-late-data",
    type: "Mixed Data Engineering",
    prompt: "Late arriving order updates changed yesterday's revenue. Explain the pipeline design fix.",
    expectedSignals: ["lookback window", "event time", "idempotency", "reconciliation"]
  }
];

export const LEVELS = [
  { name: "Data Rookie", minXp: 0 },
  { name: "SQL Builder", minXp: 100 },
  { name: "Pipeline Builder", minXp: 250 },
  { name: "Spark Debugger", minXp: 450 },
  { name: "Production Thinker", minXp: 700 },
  { name: "Interview Ready", minXp: 1000 },
  { name: "Job Ready Data Engineer", minXp: 1500 }
];

export function formatValidationMode(validationType: ValidationType): string {
  if (validationType === "SQL_OUTPUT_MATCH") {
    return "SQL Lab";
  }
  if (validationType === "CODE_REVIEW_RUBRIC") {
    return "Code Review";
  }
  if (validationType === "DESIGN_RUBRIC") {
    return "Design Lab";
  }
  return "Debug Lab";
}

export function estimateScenarioMinutes(scenario: ScenarioSummary): number {
  const baseByDifficulty: Record<string, number> = {
    Beginner: 20,
    Intermediate: 30,
    Advanced: 45
  };
  const validationExtra = scenario.validation_type === "SQL_OUTPUT_MATCH" ? 0 : 10;
  return (baseByDifficulty[scenario.difficulty] ?? 30) + validationExtra;
}
