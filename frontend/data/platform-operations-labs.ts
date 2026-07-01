import {
  filterLaunchReady,
  isLaunchReadyOperationsLab,
  type LaunchReadyFilterOptions
} from "../lib/launch-ready-content";

export type OperationsLabTrack = "airflow" | "aws";

export interface OperationsLabOption {
  id: string;
  text: string;
  feedback: string;
  isCorrect: boolean;
}

export interface OperationsLab {
  slug: string;
  track: OperationsLabTrack;
  title: string;
  section: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  isFree: boolean;
  estimatedMinutes: number;
  skills: string[];
  businessContext: string;
  problemStatement: string;
  evidenceLabel: string;
  evidence: string;
  studentTask: string;
  options: OperationsLabOption[];
  hints: string[];
  expectedKeywords: string[];
  modelAnswer: {
    diagnosis: string;
    fix: string;
    tradeoffs: string;
    monitoring: string;
  };
  launchReady?: boolean;
}

const airflowLabs: OperationsLab[] = [
  {
    slug: "airflow-dag-starts-hours-late",
    track: "airflow",
    title: "The Three-Hour Scheduling Delay",
    section: "Scheduler",
    difficulty: "beginner",
    isFree: true,
    estimatedMinutes: 18,
    skills: ["Scheduler", "DAG parsing", "Queues", "Pools"],
    businessContext:
      "The finance reporting DAG must begin at 02:00 so the warehouse is ready before business users arrive.",
    problemStatement:
      "The scheduler is healthy, but the DAG consistently starts between 04:30 and 05:00. The team keeps adding workers without proving where the delay occurs.",
    evidenceLabel: "Scheduler evidence",
    evidence: `[scheduler]
dag_processing.total_parse_time = 142s
queued_tasks = 318
pool.etl_pool.used_slots = 40/40

DAG config:
schedule="0 2 * * *"
max_active_runs=1`,
    studentTask:
      "Identify whether this is parse delay, capacity backlog, dependency waiting, or task runtime. Propose a safe investigation and fix.",
    options: [
      {
        id: "a",
        text: "Increase every DAG's parallelism immediately",
        feedback: "Blind parallelism can overload downstream systems and does not isolate the delay.",
        isCorrect: false
      },
      {
        id: "b",
        text: "Measure parse time, queued-task age, pool saturation, and first-task start latency",
        feedback: "Correct. Separate scheduling delay from execution delay before changing capacity.",
        isCorrect: true
      },
      {
        id: "c",
        text: "Add retries to the first task",
        feedback: "Retries help task failures, not a DAG that has not started.",
        isCorrect: false
      }
    ],
    hints: [
      "Ask where the elapsed time occurs: before queueing, while queued, or while executing.",
      "Top-level API calls and saturated pools are two different failure classes."
    ],
    expectedKeywords: ["parse", "queue", "pool", "scheduler", "latency", "concurrency"],
    modelAnswer: {
      diagnosis:
        "This is scheduling latency. Slow DAG parsing and a saturated ETL pool are both credible contributors; worker count alone may not be the constraint.",
      fix:
        "Remove expensive top-level DAG work, inspect queue age and pool demand, then tune only the constrained layer. Keep downstream protection in place.",
      tradeoffs:
        "More parallelism reduces backlog only when capacity is the bottleneck and can otherwise create database or API incidents.",
      monitoring:
        "Track parse duration, schedule delay, queued-task age, pool occupancy, executor backlog, and first-task start time."
    }
  },
  {
    slug: "airflow-first-attempt-fails",
    track: "airflow",
    title: "The Retry That Hides a Race Condition",
    section: "Retries",
    difficulty: "beginner",
    isFree: true,
    estimatedMinutes: 16,
    skills: ["Retries", "Readiness checks", "Backoff", "Idempotency"],
    businessContext:
      "A customer export usually succeeds on its second attempt, so the DAG is green by morning but repeatedly burns 25 minutes.",
    problemStatement:
      "The team wants to increase retries from 2 to 8. The first failure is nearly always a missing upstream object that appears a few minutes later.",
    evidenceLabel: "Task log",
    evidence: `02:10:04 GET s3://partner-drop/orders/_SUCCESS
02:10:04 404 Not Found
02:20:07 retry 1
02:20:08 object found
02:20:09 export started`,
    studentTask:
      "Decide whether more retries are the right fix and redesign the dependency check.",
    options: [
      {
        id: "a",
        text: "Increase retries because the DAG eventually succeeds",
        feedback: "This masks a weak readiness contract and lengthens incidents.",
        isCorrect: false
      },
      {
        id: "b",
        text: "Use an explicit readiness wait with bounded timeout and sensible backoff",
        feedback: "Correct. Model waiting as waiting, not as repeated task failure.",
        isCorrect: true
      },
      {
        id: "c",
        text: "Disable retries and fail immediately",
        feedback: "That removes resilience without fixing the timing dependency.",
        isCorrect: false
      }
    ],
    hints: ["A retry policy should not replace an upstream data contract.", "Classify waiting separately from processing failure."],
    expectedKeywords: ["sensor", "readiness", "backoff", "timeout", "retry", "idempotent"],
    modelAnswer: {
      diagnosis:
        "The task starts before its input is ready. Success on retry is a symptom of an implicit timing dependency.",
      fix:
        "Add a bounded, preferably deferrable readiness check for the marker or partition, then keep limited retries for truly transient processing failures.",
      tradeoffs:
        "Longer wait intervals reduce polling pressure but may add a small amount of response latency.",
      monitoring:
        "Track first-attempt failure rate, wait duration, retry count, upstream arrival delay, and total time to useful success."
    }
  },
  {
    slug: "airflow-sensor-gridlock",
    track: "airflow",
    title: "The Sensor Gridlock",
    section: "Sensors",
    difficulty: "intermediate",
    isFree: true,
    estimatedMinutes: 18,
    skills: ["Sensors", "Deferrable operators", "Worker slots", "Triggerer"],
    businessContext:
      "Hundreds of regional pipelines wait for files that may arrive any time during a six-hour window.",
    problemStatement:
      "Workers are fully occupied even though CPU usage is low. Most running tasks are sensors in poke mode.",
    evidenceLabel: "Cluster snapshot",
    evidence: `running_tasks=200
sensor_tasks=184
worker_cpu=12%
queued_tasks=427

FileSensor(
  poke_interval=30,
  timeout=21600,
  mode="poke"
)`,
    studentTask:
      "Free worker capacity without losing the file-arrival dependency.",
    options: [
      {
        id: "a",
        text: "Add more workers and keep poke mode",
        feedback: "This scales the waste and delays the real design fix.",
        isCorrect: false
      },
      {
        id: "b",
        text: "Move to reschedule or deferrable sensors and review event-based triggering",
        feedback: "Correct. Waiting work should not occupy compute slots.",
        isCorrect: true
      },
      {
        id: "c",
        text: "Reduce the sensor timeout to five minutes",
        feedback: "That may create false failures while still wasting slots.",
        isCorrect: false
      }
    ],
    hints: ["Low CPU plus occupied workers points to idle slot consumption.", "Modern Airflow can move waiting to the triggerer."],
    expectedKeywords: ["deferrable", "reschedule", "triggerer", "worker slot", "polling", "event"],
    modelAnswer: {
      diagnosis:
        "Long-running poke-mode sensors are holding worker slots while doing almost no compute.",
      fix:
        "Use deferrable sensors where supported, otherwise reschedule mode, increase sensible polling intervals, and consider event-driven arrival signals.",
      tradeoffs:
        "Deferral needs triggerer capacity and operator support; less frequent polling slightly increases detection latency.",
      monitoring:
        "Track sensor wait time, worker slot occupancy, queued-task growth, triggerer health, and end-to-end file-arrival lag."
    }
  },
  {
    slug: "airflow-backfill-duplicates",
    track: "airflow",
    title: "The Backfill That Doubled Revenue",
    section: "Backfills",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 20,
    skills: ["Backfill", "Idempotency", "Upsert", "Data intervals"],
    businessContext:
      "Finance requested a seven-day backfill after a source correction. The DAG completed successfully, but revenue doubled for those dates.",
    problemStatement:
      "The load task appends every run and does not scope writes to the logical data interval.",
    evidenceLabel: "Broken task",
    evidence: `INSERT INTO gold.daily_revenue
SELECT order_date, SUM(amount)
FROM silver.orders
WHERE order_date BETWEEN '{{ ds }}' AND '{{ next_ds }}'
GROUP BY order_date;`,
    studentTask:
      "Make historical reruns safe and explain how you would reconcile the repaired partitions.",
    options: [
      {
        id: "a",
        text: "Delete all warehouse history before every run",
        feedback: "This is unsafe, expensive, and far broader than the affected interval.",
        isCorrect: false
      },
      {
        id: "b",
        text: "Replace or merge the target interval atomically using a stable business key",
        feedback: "Correct. The same logical interval should produce the same final state.",
        isCorrect: true
      },
      {
        id: "c",
        text: "Disable backfills permanently",
        feedback: "Historical correction is normal; the write pattern must support it.",
        isCorrect: false
      }
    ],
    hints: ["Retries and backfills are safe only when repeated execution is safe.", "Think partition replacement, MERGE, or staged atomic swap."],
    expectedKeywords: ["idempotent", "merge", "upsert", "partition", "logical date", "reconciliation"],
    modelAnswer: {
      diagnosis:
        "Append-only writes made the backfill non-idempotent, so the same business interval was inserted twice.",
      fix:
        "Stage the interval, validate it, then MERGE or atomically replace only the affected partition. Preserve run IDs and business keys for auditability.",
      tradeoffs:
        "Safer writes add staging and transaction complexity, while careless overwrite logic can delete valid late-arriving records.",
      monitoring:
        "Add duplicate-key tests, row-count and revenue reconciliation by partition, repeated-run tests, and run-level audit records."
    }
  },
  {
    slug: "airflow-dynamic-mapping-explosion",
    track: "airflow",
    title: "The 48,000-Task Fan-Out",
    section: "Dynamic mapping",
    difficulty: "advanced",
    isFree: false,
    estimatedMinutes: 20,
    skills: ["Dynamic mapping", "Cardinality", "Batching", "Scheduler"],
    businessContext:
      "A tenant pipeline normally creates 200 mapped tasks. A malformed discovery response suddenly creates 48,000.",
    problemStatement:
      "The scheduler slows down, the UI becomes difficult to use, and other critical DAGs wait behind the fan-out.",
    evidenceLabel: "Mapping input",
    evidence: `tenant_ids = discover_tenants()
# expected: active customer tenants
# actual: every tenant x every historical partition
process_tenant.expand(tenant_id=tenant_ids)`,
    studentTask:
      "Contain the incident and decide whether the work belongs in Airflow tasks or a distributed compute job.",
    options: [
      {
        id: "a",
        text: "Allow unlimited mapping so every unit remains visible",
        feedback: "Visibility is not worth destabilizing the orchestration control plane.",
        isCorrect: false
      },
      {
        id: "b",
        text: "Validate and cap input, then batch or move high-cardinality work into compute",
        feedback: "Correct. Airflow should coordinate bounded work, not model every record as a task.",
        isCorrect: true
      },
      {
        id: "c",
        text: "Increase UI memory only",
        feedback: "The UI is a symptom; scheduler and metadata pressure remain.",
        isCorrect: false
      }
    ],
    hints: ["Dynamic mapping still needs a cardinality contract.", "Ask whether orchestration-level visibility is needed for every item."],
    expectedKeywords: ["cap", "validate", "batch", "chunk", "cardinality", "scheduler"],
    modelAnswer: {
      diagnosis:
        "An unbounded mapping input turned a useful fan-out pattern into scheduler and metadata pressure.",
      fix:
        "Stop or clear the run, validate and cap discovery results, batch work into bounded chunks, and move record-scale parallelism into Spark or another compute engine.",
      tradeoffs:
        "Batching reduces task-level visibility but protects platform stability and usually executes more efficiently.",
      monitoring:
        "Alert on mapped-task count, scheduler throughput, queue age, metadata DB load, and unusual discovery cardinality."
    }
  },
  {
    slug: "airflow-worker-logs-missing",
    track: "airflow",
    title: "The Missing Worker Logs",
    section: "Observability",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 17,
    skills: ["Remote logging", "Permissions", "Networking", "Observability"],
    businessContext:
      "On-call engineers can open the Airflow UI, but task logs intermittently return an empty panel during incidents.",
    problemStatement:
      "Tasks may still be running successfully. The failure is in the log retrieval path, not necessarily task execution.",
    evidenceLabel: "Webserver message",
    evidence: `*** Failed to fetch log file from worker
Could not read remote log:
s3://airflow-prod-logs/dag_id=orders/...
AccessDenied: kms:Decrypt`,
    studentTask:
      "Trace the log path and restore reliable incident visibility.",
    options: [
      {
        id: "a",
        text: "Retry every business task",
        feedback: "Task retries do not repair remote-log access.",
        isCorrect: false
      },
      {
        id: "b",
        text: "Verify remote-log config, bucket/KMS access, network path, and component consistency",
        feedback: "Correct. Debug observability as its own production dependency.",
        isCorrect: true
      },
      {
        id: "c",
        text: "Disable remote logging",
        feedback: "That may remove shared logs and make distributed debugging worse.",
        isCorrect: false
      }
    ],
    hints: ["The webserver needs a reliable route to the configured log backend.", "The error already names a permission outside Airflow task logic."],
    expectedKeywords: ["remote logging", "s3", "kms", "permission", "network", "webserver"],
    modelAnswer: {
      diagnosis:
        "The observability path cannot decrypt or retrieve remote logs even though task execution may be healthy.",
      fix:
        "Align remote logging configuration across components and grant the correct S3 and KMS permissions through workload roles. Verify private network endpoints if applicable.",
      tradeoffs:
        "Central remote logs improve durability but add storage, encryption, and access dependencies that must be monitored.",
      monitoring:
        "Test log retrieval continuously and alert on remote-log write/read failures, KMS denies, and missing logs for completed task instances."
    }
  },
  {
    slug: "airflow-api-rate-limit-storm",
    track: "airflow",
    title: "The API Rate-Limit Storm",
    section: "Concurrency",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 18,
    skills: ["Pools", "Rate limits", "Backoff", "Concurrency"],
    businessContext:
      "A partner API allows ten concurrent requests. A new backfill launches hundreds of Airflow tasks at once.",
    problemStatement:
      "The API returns 429 errors, retries synchronize, and the partner threatens to revoke access.",
    evidenceLabel: "Incident log",
    evidence: `HTTP 429 Too Many Requests
Retry-After: 30
active_tasks(api_extract)=146
pool=default_pool
retry_delay=30s`,
    studentTask:
      "Protect the downstream service while preserving throughput and safe recovery.",
    options: [
      {
        id: "a",
        text: "Use an Airflow pool plus jittered backoff and API-aware retry handling",
        feedback: "Correct. Protect the dependency at the orchestration layer and respect its signals.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Remove retry delay so failures recover faster",
        feedback: "This creates a tighter retry storm.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Add more Airflow workers",
        feedback: "More workers increase pressure on the already limited API.",
        isCorrect: false
      }
    ],
    hints: ["Airflow pools are safety valves for scarce downstream capacity.", "Avoid synchronized retries."],
    expectedKeywords: ["pool", "rate limit", "backoff", "jitter", "429", "concurrency"],
    modelAnswer: {
      diagnosis:
        "Unbounded task concurrency overwhelms a rate-limited dependency, and identical retry delays amplify the incident.",
      fix:
        "Create a dedicated pool sized below the API limit, honor Retry-After, use exponential backoff with jitter, and make requests idempotent.",
      tradeoffs:
        "Lower concurrency increases backfill duration but protects the relationship and improves successful throughput.",
      monitoring:
        "Track 429 rate, pool queue age, request latency, retries per task, and partner quota consumption."
    }
  },
  {
    slug: "airflow-monolithic-dag",
    track: "airflow",
    title: "The DAG Nobody Wants to Touch",
    section: "Maintainability",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 18,
    skills: ["DAG design", "TaskGroups", "Business logic", "Ownership"],
    businessContext:
      "A 2,800-line DAG mixes API clients, Spark transformations, SQL strings, notifications, and environment branching.",
    problemStatement:
      "New engineers avoid changes because every edit risks unrelated pipelines and the file is expensive to parse.",
    evidenceLabel: "DAG smell",
    evidence: `# orders_pipeline.py
def transform_everything(...): ...
def call_all_apis(...): ...
SQL = \"\"\"... 600 lines ...\"\"\"
if ENV == "prod": ...
# 74 task definitions below`,
    studentTask:
      "Refactor for operational readability without hiding behavior behind excessive abstraction.",
    options: [
      {
        id: "a",
        text: "Move business logic into tested modules and keep the DAG focused on orchestration",
        feedback: "Correct. The DAG should reveal control flow while reusable logic lives elsewhere.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Put the entire file inside one PythonOperator",
        feedback: "This hides failure boundaries and makes observability worse.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Generate all tasks through deeply nested metaprogramming",
        feedback: "Over-abstraction can make on-call debugging even harder.",
        isCorrect: false
      }
    ],
    hints: ["Optimize DAG code for the engineer debugging at 2 a.m.", "Separate orchestration from transformation logic."],
    expectedKeywords: ["module", "test", "taskgroup", "orchestration", "business logic", "parse"],
    modelAnswer: {
      diagnosis:
        "The DAG mixes control flow, compute, configuration, and integration code, producing slow parsing and a large blast radius.",
      fix:
        "Extract tested business modules, standardize operators/helpers, use TaskGroups for readable sections, and keep dependencies explicit in the DAG.",
      tradeoffs:
        "Abstraction reduces duplication but can hide behavior if helpers become too magical, so preserve clear task names and ownership.",
      monitoring:
        "Track parse time, change failure rate, DAG size/complexity, task ownership, and test coverage for extracted logic."
    }
  },
  {
    slug: "airflow-one-logical-date-fails",
    track: "airflow",
    title: "The One Bad Logical Date",
    section: "Backfills",
    difficulty: "advanced",
    isFree: false,
    estimatedMinutes: 19,
    skills: ["Logical date", "Data intervals", "Templates", "Data quality"],
    businessContext:
      "A 90-day backfill succeeds for every interval except March 31.",
    problemStatement:
      "The team assumes Airflow is unreliable, but the failure repeats deterministically only for the same logical date.",
    evidenceLabel: "Rendered context",
    evidence: `logical_date=2026-03-31T00:00:00Z
data_interval_start=2026-03-31T00:00:00Z
data_interval_end=2026-04-01T00:00:00Z
source rows=0
quality gate: expected >= 1`,
    studentTask:
      "Classify the failure and explain how you would inspect interval semantics and source data.",
    options: [
      {
        id: "a",
        text: "Increase scheduler resources",
        feedback: "A deterministic single-interval failure is unlikely to be scheduler capacity.",
        isCorrect: false
      },
      {
        id: "b",
        text: "Inspect rendered interval parameters, source availability, timezone boundaries, and date-specific data",
        feedback: "Correct. Repeated failure for one interval points to data or parameter semantics.",
        isCorrect: true
      },
      {
        id: "c",
        text: "Clear all successful task instances",
        feedback: "That expands the incident without explaining the failing interval.",
        isCorrect: false
      }
    ],
    hints: ["Deterministic failures deserve deterministic investigation.", "Logical date is not simply wall-clock start time."],
    expectedKeywords: ["logical date", "data interval", "timezone", "rendered", "source", "data quality"],
    modelAnswer: {
      diagnosis:
        "This is likely interval-specific data, templating, calendar, or timezone behavior rather than random Airflow instability.",
      fix:
        "Inspect rendered templates and source partitions for the exact interval, verify inclusive/exclusive boundaries, and define expected handling for legitimately empty dates.",
      tradeoffs:
        "Relaxing a quality gate may permit real data loss; special-case handling must be based on a documented business rule.",
      monitoring:
        "Log rendered intervals and row counts, track empty partitions, and test month-end, daylight-saving, and leap-date boundaries."
    }
  },
  {
    slug: "airflow-event-driven-assets",
    track: "airflow",
    title: "Beyond Cron: The Asset-Driven Pipeline",
    section: "Scheduling",
    difficulty: "advanced",
    isFree: false,
    estimatedMinutes: 18,
    skills: ["Assets", "Events", "Cross-DAG dependencies", "Freshness"],
    businessContext:
      "A downstream mart runs hourly, but its upstream dataset arrives at irregular times and is often 40 minutes late.",
    problemStatement:
      "Fixed cron scheduling creates empty runs, stale dashboards, and brittle time assumptions.",
    evidenceLabel: "Current schedule",
    evidence: `upstream arrival: 00:12, 01:47, 02:05, 04:28
downstream cron: 15 * * * *
result: 3 empty runs, 2 stale publishes`,
    studentTask:
      "Choose an event or asset-aware coordination pattern and explain the coupling trade-off.",
    options: [
      {
        id: "a",
        text: "Run the downstream DAG every five minutes",
        feedback: "More polling increases noise without creating a reliable data contract.",
        isCorrect: false
      },
      {
        id: "b",
        text: "Trigger from a trustworthy asset update or event with freshness validation",
        feedback: "Correct. Coordinate on data readiness rather than an assumed clock.",
        isCorrect: true
      },
      {
        id: "c",
        text: "Add a two-hour sleep at the start of every run",
        feedback: "Sleep-based coordination is brittle and wastes capacity.",
        isCorrect: false
      }
    ],
    hints: ["The real dependency is a dataset state, not a wall-clock minute.", "Avoid creating tightly coupled trigger spaghetti."],
    expectedKeywords: ["asset", "event", "freshness", "dependency", "data ready", "lineage"],
    modelAnswer: {
      diagnosis:
        "Cron schedules are being used as a proxy for data readiness, so the downstream run has no trustworthy freshness contract.",
      fix:
        "Use asset-aware scheduling or a durable event when the upstream publish completes, then validate partition freshness before processing.",
      tradeoffs:
        "Event-driven coordination improves freshness but needs reliable event delivery, deduplication, ownership, and clear lineage.",
      monitoring:
        "Track upstream publish time, event delivery lag, downstream start lag, missing events, duplicate events, and data freshness."
    }
  }
];

const awsLabs: OperationsLab[] = [
  {
    slug: "aws-athena-cost-spike",
    track: "aws",
    title: "The Athena Bill That Tripled Overnight",
    section: "S3 + Athena",
    difficulty: "beginner",
    isFree: true,
    estimatedMinutes: 18,
    skills: ["S3", "Athena", "Parquet", "Partitioning"],
    businessContext:
      "A new clickstream ingestion job goes live. Dashboard queries still work, but daily Athena spend triples.",
    problemStatement:
      "The new pipeline writes small gzip JSON files and no longer partitions by event date.",
    evidenceLabel: "Storage metrics",
    evidence: `before: Parquet, 256 MB avg file, partitioned by event_date
after: JSON.gz, 1.8 MB avg file, prefix by ingestion_id
Athena bytes scanned: +340%`,
    studentTask:
      "Identify the storage-layout regression and propose a cost-safe repair.",
    options: [
      {
        id: "a",
        text: "Convert curated data to Parquet, restore useful partitions, and compact small files",
        feedback: "Correct. Athena cost and speed depend heavily on S3 layout.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Increase Athena query timeout",
        feedback: "Timeout does not reduce scanned bytes or file-listing overhead.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Partition by customer_id",
        feedback: "That high-cardinality key likely creates even more small partitions.",
        isCorrect: false
      }
    ],
    hints: ["Serverless does not mean layout-independent.", "Look at format, pruning, and average file size."],
    expectedKeywords: ["parquet", "partition", "compact", "bytes scanned", "small files", "predicate"],
    modelAnswer: {
      diagnosis:
        "The ingestion release regressed from a query-efficient columnar layout to small row-format files with poor pruning.",
      fix:
        "Build curated Parquet tables partitioned by common date filters, compact micro-batches, and direct dashboards to those tables.",
      tradeoffs:
        "Compaction and curated tables add maintenance work; overly fine partitions can create new metadata overhead.",
      monitoring:
        "Track Athena bytes scanned, query cost, average file size, file count per partition, and top query predicates."
    }
  },
  {
    slug: "aws-emr-kms-access-denied",
    track: "aws",
    title: "The EMR Job That Can List but Cannot Read",
    section: "IAM + KMS",
    difficulty: "intermediate",
    isFree: true,
    estimatedMinutes: 17,
    skills: ["IAM", "KMS", "S3", "CloudTrail"],
    businessContext:
      "A Spark job on EMR lists the raw bucket successfully but fails when reading encrypted Parquet objects.",
    problemStatement:
      "The role has s3:GetObject. Engineers keep changing bucket permissions without checking the encryption layer.",
    evidenceLabel: "Error",
    evidence: `AccessDeniedException:
User arn:aws:iam::123:role/emr-job-role
is not authorized to perform kms:Decrypt
on key arn:aws:kms:ap-south-1:123:key/...`,
    studentTask:
      "Trace the complete permission chain and propose the least-privilege fix.",
    options: [
      {
        id: "a",
        text: "Grant kms:Decrypt to the workload role and allow it in the key policy",
        feedback: "Correct. S3 object access and KMS decryption are separate checks.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Make the S3 bucket public",
        feedback: "This is dangerous and still does not correctly solve KMS authorization.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Add s3:* on all resources",
        feedback: "The named denial is KMS, and wildcard S3 access widens blast radius.",
        isCorrect: false
      }
    ],
    hints: ["Encrypted-object access involves more than S3 permissions.", "Check both IAM permission and KMS key policy."],
    expectedKeywords: ["kms:decrypt", "key policy", "role", "least privilege", "cloudtrail", "s3"],
    modelAnswer: {
      diagnosis:
        "The EMR role can reach S3 but lacks authorization to decrypt objects protected by the KMS key.",
      fix:
        "Grant scoped kms:Decrypt permission to the EMR workload role and ensure the key policy trusts that role or account.",
      tradeoffs:
        "Shared keys simplify operations but widen blast radius; domain-specific keys improve isolation at the cost of administration.",
      monitoring:
        "Use CloudTrail and KMS denial metrics, test a known object path, and add permission regression checks."
    }
  },
  {
    slug: "aws-mwaa-private-postgres",
    track: "aws",
    title: "MWAA Cannot Reach Private Postgres",
    section: "VPC + MWAA",
    difficulty: "intermediate",
    isFree: true,
    estimatedMinutes: 19,
    skills: ["MWAA", "VPC", "Security groups", "DNS"],
    businessContext:
      "The managed Airflow environment is healthy, but every task connecting to a private RDS Postgres database times out.",
    problemStatement:
      "Credentials are valid. Network reachability between MWAA subnets and the database has not been proven.",
    evidenceLabel: "Connection log",
    evidence: `psycopg2.OperationalError:
connection to server at "orders-db.internal" (10.21.4.18),
port 5432 failed: Connection timed out`,
    studentTask:
      "Diagnose the private network path before changing database code.",
    options: [
      {
        id: "a",
        text: "Verify subnet routes, DNS, security-group rules, NACLs, and MWAA network placement",
        feedback: "Correct. A timeout is a network-path symptom, not an authentication failure.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Rotate the database password repeatedly",
        feedback: "Bad credentials usually produce authentication errors, not a connection timeout.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Expose Postgres publicly",
        feedback: "That weakens security instead of repairing private connectivity.",
        isCorrect: false
      }
    ],
    hints: ["Timeout and authentication failure are different classes.", "Prove DNS and routing before touching SQL."],
    expectedKeywords: ["subnet", "security group", "route", "dns", "5432", "vpc"],
    modelAnswer: {
      diagnosis:
        "MWAA cannot establish a network connection to the private RDS endpoint.",
      fix:
        "Validate VPC/subnet placement, private DNS resolution, route tables, RDS ingress from the MWAA security group, and NACL behavior.",
      tradeoffs:
        "Private networking improves security but requires deliberate egress, endpoints, DNS, and dependency routing.",
      monitoring:
        "Track connection timeouts, VPC flow logs, database connection counts, DNS failures, and environment health."
    }
  },
  {
    slug: "aws-secret-rotation-breaks-lambda",
    track: "aws",
    title: "The Secret Rotated, Production Broke",
    section: "Secrets Manager",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 17,
    skills: ["Secrets Manager", "Lambda", "Rotation", "Caching"],
    businessContext:
      "A Lambda-based ingestion function works in development but fails in production immediately after database secret rotation.",
    problemStatement:
      "The function caches credentials in a warm execution environment and the rotation process was never tested end-to-end.",
    evidenceLabel: "Lambda log",
    evidence: `INIT: loaded secret version AWSCURRENT
... 5 hours later ...
FATAL: password authentication failed
Lambda environment reused cached client`,
    studentTask:
      "Make secret rotation safe without fetching the secret on every record.",
    options: [
      {
        id: "a",
        text: "Use bounded caching with refresh-on-auth-failure and test rotation stages",
        feedback: "Correct. Balance performance with timely credential refresh.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Hardcode the new password in the Lambda environment",
        feedback: "This defeats centralized secret management and future rotation.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Disable rotation",
        feedback: "That removes a security control instead of making the client rotation-aware.",
        isCorrect: false
      }
    ],
    hints: ["Warm runtimes can preserve stale clients.", "Plan what happens during and immediately after rotation."],
    expectedKeywords: ["cache", "refresh", "rotation", "awscurrent", "retry", "secret"],
    modelAnswer: {
      diagnosis:
        "The warm Lambda runtime continued using stale cached credentials after the secret changed.",
      fix:
        "Use a bounded secret cache, rebuild the client after an authentication failure, and validate the rotation workflow against production-like connections.",
      tradeoffs:
        "Frequent secret fetches add latency and API cost; long caches increase stale-credential risk.",
      monitoring:
        "Alert on authentication failures, rotation errors, secret-version age, refresh attempts, and post-rotation canary checks."
    }
  },
  {
    slug: "aws-s3-event-duplicates",
    track: "aws",
    title: "The Duplicate S3 Event",
    section: "S3 + Lambda",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 18,
    skills: ["S3 events", "Lambda", "Idempotency", "Deduplication"],
    businessContext:
      "An S3 upload triggers a Lambda transform. Occasionally one file produces two identical warehouse loads.",
    problemStatement:
      "The design assumes event notifications are exactly once and has no processed-object ledger.",
    evidenceLabel: "Invocation evidence",
    evidence: `event 1: bucket=raw key=orders/2026-06-15.json etag=abc123
event 2: bucket=raw key=orders/2026-06-15.json etag=abc123
warehouse loads: 2`,
    studentTask:
      "Design an idempotent event consumer and safe replay path.",
    options: [
      {
        id: "a",
        text: "Deduplicate by bucket, key, version/etag using a conditional write before processing",
        feedback: "Correct. Treat event delivery as at-least-once.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Sleep for ten seconds before processing",
        feedback: "Timing does not guarantee duplicate suppression.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Disable Lambda retries",
        feedback: "That sacrifices resilience and still does not prevent duplicate notifications.",
        isCorrect: false
      }
    ],
    hints: ["Event-driven systems commonly deliver at least once.", "Build a stable idempotency key from the object identity."],
    expectedKeywords: ["idempotent", "etag", "version", "conditional write", "dedup", "replay"],
    modelAnswer: {
      diagnosis:
        "Duplicate or retried S3 events are causing the same immutable object to be processed twice.",
      fix:
        "Create an idempotency key from bucket/key/version or ETag, claim it with a conditional write, and make the downstream write merge-safe.",
      tradeoffs:
        "A deduplication ledger adds state and retention decisions but provides safe retry and replay semantics.",
      monitoring:
        "Track duplicate-event rate, conditional-write conflicts, processing status, DLQ volume, and source-to-target reconciliation."
    }
  },
  {
    slug: "aws-glue-job-slowdown",
    track: "aws",
    title: "The Glue Job That Went from 15 to 90 Minutes",
    section: "AWS Glue",
    difficulty: "advanced",
    isFree: false,
    estimatedMinutes: 20,
    skills: ["Glue", "Spark", "Skew", "Small files"],
    businessContext:
      "A daily Glue job processes six times more data than last quarter and now misses the reporting SLA.",
    problemStatement:
      "The team wants to increase worker size before checking partition pruning, skew, and file layout.",
    evidenceLabel: "Job metrics",
    evidence: `input size: 420 GB -> 2.4 TB
files: 4,800 -> 190,000
largest join key: 31% of rows
executor utilization: uneven`,
    studentTask:
      "Separate data-layout and Spark-plan problems from raw capacity needs.",
    options: [
      {
        id: "a",
        text: "Profile stages, compact files, improve pruning, and address skew before resizing",
        feedback: "Correct. Capacity may help, but first remove structural waste.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Always choose the largest Glue worker",
        feedback: "That can increase cost without fixing skew or metadata overhead.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Convert Parquet back to CSV",
        feedback: "That generally increases scan volume and weakens analytics performance.",
        isCorrect: false
      }
    ],
    hints: ["Uneven executors suggest skew; huge file counts suggest planning overhead.", "Scale only after understanding the plan."],
    expectedKeywords: ["skew", "compact", "partition pruning", "spark ui", "files", "worker"],
    modelAnswer: {
      diagnosis:
        "Growth exposed both a small-file explosion and a skewed join, so much of the 90 minutes is overhead and uneven work.",
      fix:
        "Inspect Glue/Spark stage metrics, compact input, prune partitions early, handle hot keys, then right-size workers using measured utilization.",
      tradeoffs:
        "Compaction adds a maintenance job; skew mitigation and repartitioning can increase shuffle if applied carelessly.",
      monitoring:
        "Track runtime per input volume, file count and size, skewed partition duration, shuffle bytes, worker utilization, and SLA margin."
    }
  },
  {
    slug: "aws-emr-cost-too-high",
    track: "aws",
    title: "The Stable but Expensive EMR Job",
    section: "Amazon EMR",
    difficulty: "advanced",
    isFree: false,
    estimatedMinutes: 19,
    skills: ["EMR", "Cost", "Sizing", "Spot"],
    businessContext:
      "A nightly Spark job is reliable, but its cost per run is far above budget and the cluster sits idle for long periods.",
    problemStatement:
      "The job uses a persistent on-demand cluster sized for peak volume even though it runs once nightly.",
    evidenceLabel: "Cost profile",
    evidence: `cluster uptime: 24h/day
useful job runtime: 52 min/day
average CPU outside job: 3%
instance mix: 100% on-demand`,
    studentTask:
      "Reduce cost without turning a stable pipeline into an unreliable one.",
    options: [
      {
        id: "a",
        text: "Use transient or serverless execution, right-size, and consider a safe Spot mix",
        feedback: "Correct. Match infrastructure lifecycle to the workload.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Keep the cluster because stability means the design is optimal",
        feedback: "Correctness and economic efficiency are separate concerns.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Move all data into Lambda",
        feedback: "Lambda is not a drop-in replacement for a large distributed Spark workload.",
        isCorrect: false
      }
    ],
    hints: ["Compare cluster uptime with useful compute time.", "Cost optimization includes job efficiency and purchase model."],
    expectedKeywords: ["transient", "serverless", "right-size", "spot", "idle", "cost per run"],
    modelAnswer: {
      diagnosis:
        "A bursty nightly workload is paying for a persistent peak-sized cluster and idle on-demand capacity.",
      fix:
        "Test an ephemeral cluster or EMR Serverless, right-size from utilization, improve the Spark plan, and use Spot only where interruption is safe.",
      tradeoffs:
        "Ephemeral startup and Spot interruption can affect runtime, so protect deadlines and critical nodes.",
      monitoring:
        "Track cost per run, idle time, runtime per input volume, utilization, Spot interruption rate, and SLA success."
    }
  },
  {
    slug: "aws-athena-serverless-slow",
    track: "aws",
    title: "Serverless, Yet Athena Is Slow",
    section: "Amazon Athena",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 17,
    skills: ["Athena", "Query design", "Partitions", "Curated tables"],
    businessContext:
      "Analysts expect instant queries because Athena is serverless, but common reports scan hundreds of gigabytes.",
    problemStatement:
      "The underlying lake uses CSV, broad prefixes, and repeated SELECT * queries.",
    evidenceLabel: "Query profile",
    evidence: `query time: 94s
bytes scanned: 612 GB
format: CSV
predicate: WHERE date_format(event_ts, '%Y-%m') = '2026-05'`,
    studentTask:
      "Explain why serverless does not remove query physics and propose a better serving pattern.",
    options: [
      {
        id: "a",
        text: "Create columnar curated tables and filter directly on partition columns",
        feedback: "Correct. Reduce data read and enable partition pruning.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Run the same query more often to warm Athena",
        feedback: "Athena is not a traditional always-warm database cache strategy.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Remove all predicates",
        feedback: "That increases scanned data further.",
        isCorrect: false
      }
    ],
    hints: ["The predicate transforms the partition candidate instead of filtering it directly.", "Repeated reports may deserve a curated serving table."],
    expectedKeywords: ["parquet", "partition pruning", "column", "curated", "bytes scanned", "predicate"],
    modelAnswer: {
      diagnosis:
        "The query scans row-format data broadly and prevents effective partition pruning.",
      fix:
        "Build Parquet curated tables, partition by useful date fields, filter those columns directly, and avoid SELECT * for repeated reports.",
      tradeoffs:
        "Curated tables improve speed and cost but add transformation ownership and storage duplication.",
      monitoring:
        "Track bytes scanned, recurring slow queries, partition pruning, query cost, and report latency."
    }
  },
  {
    slug: "aws-redshift-dashboard-contention",
    track: "aws",
    title: "The Dashboard Fighting Analyst Queries",
    section: "Amazon Redshift",
    difficulty: "advanced",
    isFree: false,
    estimatedMinutes: 19,
    skills: ["Redshift", "Workload isolation", "Data marts", "Concurrency"],
    businessContext:
      "Executive dashboards become unpredictable after analysts begin running large exploratory joins on the same warehouse.",
    problemStatement:
      "Dashboard and exploration workloads share queues and both query raw wide tables.",
    evidenceLabel: "Warehouse signals",
    evidence: `09:00-11:00 dashboard p95: 28s -> 141s
top query: analyst raw join, 37 min
ETL loads overlap at 09:30
serving tables: none`,
    studentTask:
      "Stabilize BI latency while preserving useful analyst access.",
    options: [
      {
        id: "a",
        text: "Separate workload classes and serve dashboards from curated models",
        feedback: "Correct. Isolate predictable BI from exploratory pressure.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Ban all analyst queries",
        feedback: "That removes value instead of designing appropriate workload controls.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Move dashboard SQL to the raw layer",
        feedback: "That usually increases repeated joins and semantic inconsistency.",
        isCorrect: false
      }
    ],
    hints: ["Serving workloads and exploration have different latency contracts.", "Model data for repeated consumption."],
    expectedKeywords: ["workload", "queue", "curated", "mart", "concurrency", "load window"],
    modelAnswer: {
      diagnosis:
        "Exploratory queries and overlapping loads are contending with dashboards, which also lack purpose-built serving models.",
      fix:
        "Create curated marts, isolate workload classes/queues, schedule heavy loads away from peaks, and govern runaway queries.",
      tradeoffs:
        "Isolation and materialized serving models add cost and maintenance while reducing analyst flexibility on shared resources.",
      monitoring:
        "Track dashboard p95, queue wait, query class, load overlap, concurrency pressure, and slow-query ownership."
    }
  },
  {
    slug: "aws-dms-cdc-lag",
    track: "aws",
    title: "The Peak-Hour CDC Lag",
    section: "AWS DMS",
    difficulty: "advanced",
    isFree: false,
    estimatedMinutes: 19,
    skills: ["DMS", "CDC", "Lag", "Throughput"],
    businessContext:
      "A retail CDC pipeline is near real time overnight but falls 90 minutes behind during the afternoon sales peak.",
    problemStatement:
      "The DMS task remains running, so the team dashboard shows green even while analytics freshness is unacceptable.",
    evidenceLabel: "Replication metrics",
    evidence: `CDCLatencySource: 4s
CDCLatencyTarget: 5,420s
hot table: order_events
target write IOPS: 96% utilized`,
    studentTask:
      "Identify whether the bottleneck is source capture, replication capacity, or target apply.",
    options: [
      {
        id: "a",
        text: "Investigate target apply pressure and hot-table throughput first",
        feedback: "Correct. Source latency is low while target latency is high.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Restart DMS every hour",
        feedback: "Restarting may increase backlog and does not remove target pressure.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Disable CDC and run one annual full load",
        feedback: "That fails the stated freshness requirement.",
        isCorrect: false
      }
    ],
    hints: ["Compare source latency with target latency.", "A running task can still violate the business freshness SLA."],
    expectedKeywords: ["target latency", "hot table", "iops", "split task", "freshness", "capacity"],
    modelAnswer: {
      diagnosis:
        "Capture is current, but changes cannot be applied to the target fast enough during peak load.",
      fix:
        "Profile target writes and hot tables, increase or tune target/replication capacity, and consider splitting high-volume tables into dedicated tasks.",
      tradeoffs:
        "More capacity costs more; splitting tasks improves isolation but increases operational complexity.",
      monitoring:
        "Alert on CDC freshness, source and target latency separately, table-level errors, target IOPS, and peak throughput."
    }
  },
  {
    slug: "aws-streams-vs-firehose",
    track: "aws",
    title: "Kinesis Streams for a Delivery-Pipe Problem",
    section: "Kinesis",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 17,
    skills: ["Kinesis", "Firehose", "Streaming", "Operations"],
    businessContext:
      "A team only needs to land application logs in S3 but built custom Kinesis consumers, shard scaling, and checkpoint management.",
    problemStatement:
      "Operational effort is high even though there are no custom consumers or replay requirements.",
    evidenceLabel: "Requirements",
    evidence: `destination: S3
acceptable buffering: 60-120 seconds
custom consumers: 0
replay requirement: none
current: Kinesis Data Streams + Lambda consumer`,
    studentTask:
      "Choose the simpler managed service and explain when Data Streams would still be justified.",
    options: [
      {
        id: "a",
        text: "Use Data Firehose for managed buffered delivery to S3",
        feedback: "Correct. The workload is delivery-oriented, not a programmable stream backbone.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Add more custom consumers",
        feedback: "There is no consumer requirement; this increases unnecessary complexity.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Store logs in an EC2 local disk",
        feedback: "That weakens durability and operational simplicity.",
        isCorrect: false
      }
    ],
    hints: ["Differentiate custom streaming from managed destination delivery.", "Buffering is acceptable here."],
    expectedKeywords: ["firehose", "delivery", "buffer", "s3", "consumer", "replay"],
    modelAnswer: {
      diagnosis:
        "The team selected a programmable streaming backbone for a simple managed-delivery requirement.",
      fix:
        "Use Data Firehose to buffer and deliver logs to S3. Keep Data Streams for multiple consumers, replay, custom processing, or tighter stream control.",
      tradeoffs:
        "Firehose reduces operations but offers less consumer flexibility and introduces delivery buffering.",
      monitoring:
        "Track delivery freshness, failed records, backup/error prefixes, transform failures, and S3 object sizes."
    }
  },
  {
    slug: "aws-kafka-vs-kinesis",
    track: "aws",
    title: "Should We Replace Kafka with Kinesis Everywhere?",
    section: "MSK + Kinesis",
    difficulty: "advanced",
    isFree: false,
    estimatedMinutes: 21,
    skills: ["MSK", "Kinesis", "Migration", "Trade-offs"],
    businessContext:
      "Leadership wants one AWS-native streaming service, but several teams depend on Kafka APIs, connectors, consumer groups, and cross-cloud portability.",
    problemStatement:
      "The proposal treats all streams as identical and ignores ecosystem compatibility and migration risk.",
    evidenceLabel: "Platform inventory",
    evidence: `Kafka topics: 420
Kafka Connect integrations: 37
custom Kafka clients: 64
simple AWS-only event streams: 18
multi-cloud requirement: yes`,
    studentTask:
      "Create a workload-based decision rather than a blanket platform mandate.",
    options: [
      {
        id: "a",
        text: "Evaluate workloads individually; retain MSK where Kafka compatibility matters",
        feedback: "Correct. Standardization should follow requirements, not erase them.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Replace every topic immediately",
        feedback: "This ignores migration cost, compatibility, and business risk.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Run both services for every stream forever",
        feedback: "Dual-running everything creates unnecessary cost and complexity.",
        isCorrect: false
      }
    ],
    hints: ["Compare ecosystem, portability, operational model, replay, and throughput.", "One platform decision can still allow more than one justified pattern."],
    expectedKeywords: ["kafka", "msk", "kinesis", "compatibility", "migration", "workload"],
    modelAnswer: {
      diagnosis:
        "A blanket migration ignores existing Kafka contracts and treats simple AWS event streams the same as ecosystem-dependent workloads.",
      fix:
        "Define decision criteria, keep MSK for Kafka compatibility and portability, and use Kinesis for AWS-native streams where managed integration is the stronger fit.",
      tradeoffs:
        "Two supported patterns increase platform governance work, while forced standardization creates migration and lock-in risk.",
      monitoring:
        "Measure migration cost, consumer lag, throughput, operational effort, incident rate, and service cost per workload."
    }
  },
  {
    slug: "aws-lake-formation-table-access",
    track: "aws",
    title: "The Athena Table You Can See but Cannot Query",
    section: "Lake Formation",
    difficulty: "advanced",
    isFree: false,
    estimatedMinutes: 18,
    skills: ["Lake Formation", "IAM", "Glue Catalog", "Permissions"],
    businessContext:
      "An analyst can browse a database and table in Athena but receives an access error when querying the data.",
    problemStatement:
      "The team checks only S3 IAM policies even though the catalog is governed by Lake Formation.",
    evidenceLabel: "Access evidence",
    evidence: `Glue GetTable: allowed
S3 GetObject: allowed
Athena query: AccessDeniedException
Lake Formation SELECT permission: missing`,
    studentTask:
      "Explain the layered permission model and grant only the required dataset access.",
    options: [
      {
        id: "a",
        text: "Grant scoped Lake Formation SELECT/data-location permissions",
        feedback: "Correct. Governed table access is evaluated beyond basic IAM and S3.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Grant AdministratorAccess",
        feedback: "This violates least privilege and hides the actual governance layer.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Make the Glue database public",
        feedback: "That is not the correct or safe resolution.",
        isCorrect: false
      }
    ],
    hints: ["Catalog visibility is not the same as data permission.", "Governed lakes add another authorization layer."],
    expectedKeywords: ["lake formation", "select", "data location", "iam", "catalog", "least privilege"],
    modelAnswer: {
      diagnosis:
        "IAM permits metadata and object access, but Lake Formation denies table-level query permission.",
      fix:
        "Grant scoped table/database SELECT and required data-location access through Lake Formation to the analyst role.",
      tradeoffs:
        "Fine-grained governance improves control and auditability but adds permission administration and troubleshooting layers.",
      monitoring:
        "Audit Lake Formation grants, CloudTrail denied calls, role-to-dataset mappings, and automated access tests."
    }
  },
  {
    slug: "aws-mwaa-heavy-python",
    track: "aws",
    title: "The MWAA DAG Doing the Compute",
    section: "MWAA + Compute",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 18,
    skills: ["MWAA", "Glue", "EMR", "Orchestration", "Compute"],
    businessContext:
      "An MWAA environment is slow and brittle because PythonOperators download and transform multi-gigabyte files inside Airflow workers.",
    problemStatement:
      "The orchestrator has become the data-processing engine, causing memory pressure and difficult retries.",
    evidenceLabel: "Broken DAG pattern",
    evidence: `@task
def transform():
    df = pandas.read_csv("s3://raw/orders-40gb.csv")
    # joins, grouping, writes all run inside MWAA worker
    return df.to_dict()`,
    studentTask:
      "Redesign the control plane and compute plane while preserving observability.",
    options: [
      {
        id: "a",
        text: "Have MWAA submit Glue/EMR work and pass references or job IDs",
        feedback: "Correct. Airflow coordinates; scalable compute performs the heavy transformation.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Increase XCom size and return the full dataframe",
        feedback: "This worsens metadata pressure and data movement.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Add more print statements only",
        feedback: "Logging does not solve the incorrect execution architecture.",
        isCorrect: false
      }
    ],
    hints: ["Airflow is the orchestrator, not the heavy compute engine.", "Pass job IDs and storage paths, not payloads."],
    expectedKeywords: ["glue", "emr", "orchestrate", "reference", "xcom", "compute"],
    modelAnswer: {
      diagnosis:
        "Large transformations are running inside MWAA workers and payloads risk flowing through the orchestration metadata plane.",
      fix:
        "Land inputs in S3, submit Glue/EMR or another compute job, monitor its job ID, and pass only paths, counts, and status through Airflow.",
      tradeoffs:
        "External compute adds service integration and startup latency but provides isolation, scale, and safer retries.",
      monitoring:
        "Track MWAA worker memory, task duration, external job status, XCom size, compute cost, and input/output reconciliation."
    }
  },
  {
    slug: "aws-observability-blind-spot",
    track: "aws",
    title: "The Pipeline That Sometimes Fails",
    section: "CloudWatch + CloudTrail",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 18,
    skills: ["CloudWatch", "CloudTrail", "Alarms", "Correlation IDs"],
    businessContext:
      "A multi-service ingestion pipeline intermittently misses files, but each team sees only its own service logs.",
    problemStatement:
      "There is no end-to-end run identifier, freshness alarm, or audit trail connecting S3, Lambda, Glue, and Redshift.",
    evidenceLabel: "Current observability",
    evidence: `S3 events: no shared run_id
Lambda errors: logged locally
Glue run: job succeeded
Redshift load: 18% fewer rows
freshness alarm: none`,
    studentTask:
      "Design observability that can locate technical failure and business data loss.",
    options: [
      {
        id: "a",
        text: "Add correlation IDs, structured logs, service metrics, freshness checks, and audit events",
        feedback: "Correct. Observe both component health and end-to-end data outcomes.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Check the console manually after users complain",
        feedback: "Reactive manual inspection is not an operating model.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Monitor only CPU utilization",
        feedback: "CPU can be healthy while data is missing or stale.",
        isCorrect: false
      }
    ],
    hints: ["A green service is not proof of correct data movement.", "Connect logs and metrics across the entire run."],
    expectedKeywords: ["correlation", "structured logs", "freshness", "row count", "cloudwatch", "cloudtrail"],
    modelAnswer: {
      diagnosis:
        "Service-level logs cannot reconstruct an end-to-end run, and there are no business data-quality or freshness signals.",
      fix:
        "Propagate a run/correlation ID, centralize structured logs and metrics, alarm on technical errors and missing data, and use CloudTrail for control-plane audit.",
      tradeoffs:
        "Richer telemetry adds cost and instrumentation work, so retain high-value fields and set practical retention policies.",
      monitoring:
        "Track source events, processed files, row counts, freshness, failed records, service errors, run duration, and control-plane changes."
    }
  },
  {
    slug: "aws-glue-vs-emr-selection",
    track: "aws",
    title: "Glue or EMR for the Nightly Transformation?",
    section: "Service selection",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 18,
    skills: ["Glue", "EMR", "Service selection", "Operations"],
    businessContext:
      "A team needs a nightly Spark transformation over 600 GB with standard joins and aggregations. The platform team is small.",
    problemStatement:
      "Engineers are choosing by personal preference instead of runtime control, operational burden, and workload complexity.",
    evidenceLabel: "Workload profile",
    evidence: `volume: 600 GB nightly
runtime target: < 45 min
custom native dependencies: none
team owns clusters today: no
job pattern: standard Spark ETL`,
    studentTask:
      "Choose a starting service and name the condition that would change your decision.",
    options: [
      {
        id: "a",
        text: "Start with Glue for lower operations; move to EMR if control/customization demands it",
        feedback: "Correct. Fit the operating model and revisit if requirements change.",
        isCorrect: true
      },
      {
        id: "b",
        text: "EMR is always better because it exposes more settings",
        feedback: "More control also means more operational responsibility.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Lambda because it is serverless",
        feedback: "This workload exceeds Lambda's intended execution model.",
        isCorrect: false
      }
    ],
    hints: ["Service choice includes team operations, not only engine features.", "Name what additional control would justify EMR."],
    expectedKeywords: ["glue", "emr", "operations", "control", "custom", "cost"],
    modelAnswer: {
      diagnosis:
        "This is a standard managed Spark ETL workload with limited need for cluster customization and a small operations team.",
      fix:
        "Start with Glue and benchmark SLA/cost. Choose EMR or EMR Serverless if dependency control, Spark tuning, ecosystem tooling, or economics justify it.",
      tradeoffs:
        "Glue reduces cluster operations but offers less environment control; EMR increases flexibility and ownership.",
      monitoring:
        "Compare runtime, cost per run, failure rate, scaling behavior, developer effort, and SLA margin."
    }
  },
  {
    slug: "aws-athena-vs-redshift",
    track: "aws",
    title: "Athena or Redshift for the Executive Dashboard?",
    section: "Service selection",
    difficulty: "intermediate",
    isFree: false,
    estimatedMinutes: 18,
    skills: ["Athena", "Redshift", "BI", "Serving"],
    businessContext:
      "An executive dashboard refreshes every five minutes, has hundreds of concurrent viewers, and needs predictable sub-ten-second performance.",
    problemStatement:
      "The data lake is already on S3, so the team assumes direct Athena queries are automatically the simplest final design.",
    evidenceLabel: "Consumption profile",
    evidence: `refresh: every 5 minutes
concurrency: 300 viewers
latency target: < 10 seconds
queries: repeated curated business metrics
source: S3 lake`,
    studentTask:
      "Choose the serving layer and explain whether Athena still has a role.",
    options: [
      {
        id: "a",
        text: "Use Redshift/warehouse serving for predictable BI; retain Athena for exploration",
        feedback: "Correct. Repeated high-concurrency serving differs from ad hoc lake query.",
        isCorrect: true
      },
      {
        id: "b",
        text: "Use Athena for every workload because no cluster is visible",
        feedback: "Serverless operation does not guarantee the required concurrency and latency.",
        isCorrect: false
      },
      {
        id: "c",
        text: "Query raw JSON directly from the dashboard",
        feedback: "That weakens latency, cost, and metric consistency.",
        isCorrect: false
      }
    ],
    hints: ["Separate exploration from predictable serving.", "The right architecture can use both services in different layers."],
    expectedKeywords: ["redshift", "athena", "concurrency", "serving", "curated", "latency"],
    modelAnswer: {
      diagnosis:
        "The workload is repeated, curated, high-concurrency BI with a tight latency contract, not occasional ad hoc analysis.",
      fix:
        "Serve modeled metrics from Redshift or an equivalent warehouse layer while retaining Athena for lake exploration and validation.",
      tradeoffs:
        "A warehouse adds cost and modeling operations but provides more predictable serving performance and workload controls.",
      monitoring:
        "Track dashboard p95, concurrency, queue time, refresh success, cost per workload, and semantic reconciliation."
    }
  }
];

function withOperationsLaunchReady(lab: OperationsLab): OperationsLab {
  return {
    ...lab,
    launchReady: isLaunchReadyOperationsLab(lab.slug)
  };
}

export const ALL_OPERATIONS_LABS: OperationsLab[] = [...airflowLabs, ...awsLabs].map(
  withOperationsLaunchReady
);

export const OPERATIONS_LABS: OperationsLab[] = filterLaunchReady(ALL_OPERATIONS_LABS);

export function getOperationsLabs(
  track: OperationsLabTrack,
  options: LaunchReadyFilterOptions = {}
): OperationsLab[] {
  return filterLaunchReady(ALL_OPERATIONS_LABS, options).filter((lab) => lab.track === track);
}
