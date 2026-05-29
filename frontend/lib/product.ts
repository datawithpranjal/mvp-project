import type { ScenarioSummary, ValidationType } from "./types";

export const BRAND = {
  name: "The Data Foundry",
  trustLine: "Built by Data with Pranjal",
  positioning:
    "A practice-first platform for Data Engineering interviews, production scenarios, project simulation, and job readiness."
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
    description: "Debug query logic, grain issues, NULL traps, CDC, rankings, and warehouse outputs."
  },
  {
    title: "PySpark Lab",
    description: "Practice performance, partitioning, UDF replacement, skew, and DataFrame reasoning."
  },
  {
    title: "Airflow Lab",
    description: "Diagnose retries, sensors, DAG dependencies, green-but-wrong runs, and alerting gaps."
  },
  {
    title: "AWS/Data Platform Lab",
    description: "Reason through storage formats, lakehouse layers, batch jobs, and operational trade-offs."
  },
  {
    title: "Scenario Playground",
    description: "Work through production-style incidents with broken logic, logs, data, hints, and feedback."
  },
  {
    title: "Project Simulator",
    description: "Make engineering decisions in a simulated pipeline and see the production consequences."
  },
  {
    title: "Mock Interview Room",
    description: "Practice explaining root causes, trade-offs, monitoring, and strong interview framing."
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
  day: number;
  title: string;
  taskType: "scenario" | "sql" | "project" | "interview" | "revision";
  description: string;
}

export interface LearningPathTemplate {
  slug: string;
  name: string;
  durationDays: number;
  targetUser: string;
  description: string;
  steps: LearningPathStep[];
}

export const LEARNING_PATHS: LearningPathTemplate[] = [
  {
    slug: "7-day-interview-crash-plan",
    name: "7-Day Interview Crash Plan",
    durationDays: 7,
    targetUser: "Preparing for interviews",
    description: "A tight revision sprint focused on SQL bugs, production incidents, and answer framing.",
    steps: [
      {
        day: 1,
        title: "SQL correctness drill",
        taskType: "sql",
        description: "Solve one output-matching SQL scenario and write the grain assumption explicitly."
      },
      {
        day: 2,
        title: "Watermark debugging",
        taskType: "scenario",
        description: "Practice incremental-load failure modes and reconciliation checks."
      },
      {
        day: 3,
        title: "Spark performance triage",
        taskType: "scenario",
        description: "Explain one Spark bottleneck and propose a production-safe fix."
      },
      {
        day: 4,
        title: "Airflow incident framing",
        taskType: "interview",
        description: "Answer a green-DAG-but-wrong-data prompt with monitoring and rollback steps."
      },
      {
        day: 5,
        title: "Data quality review",
        taskType: "revision",
        description: "Review weak areas and create three validation checks for a pipeline."
      },
      {
        day: 6,
        title: "Project simulator mission",
        taskType: "project",
        description: "Complete one e-commerce pipeline decision mission and capture the lesson."
      },
      {
        day: 7,
        title: "Mock mixed interview",
        taskType: "interview",
        description: "Attempt three mixed data engineering prompts and refine your answer."
      }
    ]
  },
  {
    slug: "30-day-data-engineering-interview-plan",
    name: "30-Day Data Engineering Interview Plan",
    durationDays: 30,
    targetUser: "Interview candidates",
    description: "A balanced plan for SQL, Spark, orchestration, data quality, and speaking practice.",
    steps: [
      {
        day: 1,
        title: "Baseline assessment",
        taskType: "scenario",
        description: "Attempt one free scenario without hints and record your confidence."
      },
      {
        day: 7,
        title: "SQL debugging block",
        taskType: "sql",
        description: "Complete three SQL output-match labs and summarize the recurring trap."
      },
      {
        day: 14,
        title: "Production incident block",
        taskType: "scenario",
        description: "Practice Airflow, Kafka, and data quality incidents with root-cause notes."
      },
      {
        day: 21,
        title: "Project simulator checkpoint",
        taskType: "project",
        description: "Finish at least four project missions and explain trade-offs."
      },
      {
        day: 30,
        title: "Readiness review",
        taskType: "interview",
        description: "Run a mixed mock interview and compare readiness score movement."
      }
    ]
  },
  {
    slug: "60-day-career-switcher-plan",
    name: "60-Day Career Switcher Plan",
    durationDays: 60,
    targetUser: "Career switchers",
    description: "A slower path that builds fundamentals, project thinking, and interview vocabulary.",
    steps: [
      {
        day: 1,
        title: "Foundations map",
        taskType: "revision",
        description: "Identify your gaps across SQL, Spark, orchestration, modeling, and cloud."
      },
      {
        day: 14,
        title: "SQL confidence block",
        taskType: "sql",
        description: "Practice NULL, ranking, deduplication, and CDC scenarios."
      },
      {
        day: 30,
        title: "Pipeline simulator block",
        taskType: "project",
        description: "Complete storage, dedup, late-arrival, and revenue-mart missions."
      },
      {
        day: 45,
        title: "Production debugging block",
        taskType: "scenario",
        description: "Practice Spark, Airflow, Kafka, and monitoring incidents."
      },
      {
        day: 60,
        title: "Interview story block",
        taskType: "interview",
        description: "Turn your simulator decisions into interview-ready project stories."
      }
    ]
  },
  {
    slug: "90-day-job-ready-data-engineer-plan",
    name: "90-Day Job-Ready Data Engineer Plan",
    durationDays: 90,
    targetUser: "Recently joined or job-ready aspirants",
    description: "A deep practice plan for becoming comfortable with real pipeline ownership.",
    steps: [
      {
        day: 1,
        title: "Baseline and onboarding",
        taskType: "revision",
        description: "Set goals, timeline, and weak-area baseline."
      },
      {
        day: 21,
        title: "Data correctness sprint",
        taskType: "sql",
        description: "Complete SQL and data quality labs until weak areas are visible."
      },
      {
        day: 45,
        title: "Platform debugging sprint",
        taskType: "scenario",
        description: "Practice Spark, Airflow, Kafka, and lakehouse operational failures."
      },
      {
        day: 70,
        title: "Project ownership sprint",
        taskType: "project",
        description: "Finish the e-commerce simulator and document monitoring choices."
      },
      {
        day: 90,
        title: "Job-ready review",
        taskType: "interview",
        description: "Run mixed mock interviews and review readiness score by dimension."
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

