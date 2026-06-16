import type { OperationsLab } from "../data/platform-operations-labs";

export interface LearningFlowStage {
  id: string;
  label: string;
  detail: string;
  kind?: "source" | "process" | "storage" | "quality" | "serving" | "alert";
}

export interface LearningFlowDefinition {
  stages: LearningFlowStage[];
  focusStageId: string;
  caption: string;
}

const STAGE_DETAILS: Array<[RegExp, string, LearningFlowStage["kind"]]> = [
  [/source|api|producer|upstream/i, "Produces the events or records entering this design.", "source"],
  [/raw|bronze|s3|landing/i, "Keeps durable input for replay, audit, and investigation.", "storage"],
  [/spark|transform|silver|compute|glue|emr/i, "Applies distributed processing and business transformations.", "process"],
  [/quality|reconcil|validation/i, "Checks correctness, completeness, and business invariants.", "quality"],
  [/gold|mart|warehouse|redshift|athena/i, "Publishes trusted analytical data for downstream use.", "storage"],
  [/dashboard|bi|serving|analyst/i, "Serves the final data product to its consumers.", "serving"],
  [/alert|monitor|cloudwatch|on-call/i, "Detects failures and gives operators evidence to respond.", "alert"]
];

function stageId(label: string, index: number) {
  return `${index + 1}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function inferStage(label: string, index: number): LearningFlowStage {
  const match = STAGE_DETAILS.find(([pattern]) => pattern.test(label));

  return {
    id: stageId(label, index),
    label,
    detail:
      match?.[1] ??
      "Moves the workflow forward while preserving the contract with the next stage.",
    kind: match?.[2] ?? "process"
  };
}

export function buildArchitectureFlow(labels: string[]): LearningFlowStage[] {
  return labels.map(inferStage);
}

interface OperationsFlowTemplate {
  labels: string[];
  focus: number;
  caption: string;
}

const AIRFLOW_FLOWS: Record<string, OperationsFlowTemplate> = {
  Scheduler: {
    labels: ["DAG definition", "Scheduler parse", "Executor queue", "Pool capacity", "Worker", "Warehouse"],
    focus: 3,
    caption: "Follow a scheduled task from DAG parsing to the downstream system."
  },
  Retries: {
    labels: ["Upstream data", "Readiness contract", "Task attempt", "Retry policy", "Output"],
    focus: 1,
    caption: "Separate legitimate waiting from a processing failure that should be retried."
  },
  Sensors: {
    labels: ["External condition", "Sensor", "Worker pool", "Triggerer", "Downstream task"],
    focus: 2,
    caption: "See how sensor mode changes where waiting consumes capacity."
  },
  Backfills: {
    labels: ["Logical interval", "Source extract", "Transform", "Idempotent write", "Reconciliation"],
    focus: 3,
    caption: "Trace a historical interval through a rerun-safe backfill."
  },
  "Dynamic mapping": {
    labels: ["Discovery task", "Mapping input", "Scheduler expansion", "Worker tasks", "Downstream join"],
    focus: 1,
    caption: "Inspect where dynamic task expansion can become unsafe or unbounded."
  },
  Observability: {
    labels: ["Worker", "Remote logs", "Task metadata", "Metrics and alerts", "On-call"],
    focus: 1,
    caption: "Follow the evidence an operator needs from task execution to incident response."
  },
  Concurrency: {
    labels: ["Airflow tasks", "Pool and limits", "Partner API", "Response", "Retry queue"],
    focus: 1,
    caption: "See where concurrency should be controlled before pressure reaches a shared dependency."
  },
  Maintainability: {
    labels: ["DAG parse", "Orchestration", "Business logic", "Compute service", "Monitoring"],
    focus: 2,
    caption: "Separate orchestration concerns from testable processing code."
  },
  Scheduling: {
    labels: ["Upstream asset", "Freshness event", "Downstream DAG", "Data check", "Consumer"],
    focus: 1,
    caption: "Model data readiness explicitly instead of relying only on wall-clock timing."
  }
};

const AWS_FLOWS: Record<string, OperationsFlowTemplate> = {
  "S3 + Athena": {
    labels: ["Source data", "S3 raw", "Curated Parquet", "Glue Catalog", "Athena", "Dashboard"],
    focus: 2,
    caption: "Trace how storage layout and file format affect an analytical query."
  },
  "IAM + KMS": {
    labels: ["Workload role", "IAM policy", "S3 object", "KMS key policy", "Data read"],
    focus: 3,
    caption: "Follow both authorization layers required to decrypt protected data."
  },
  "VPC + MWAA": {
    labels: ["MWAA worker", "Private subnet", "Route and DNS", "Security group", "Private database"],
    focus: 2,
    caption: "Trace network reachability from the managed Airflow worker to a private dependency."
  },
  "Secrets Manager": {
    labels: ["Application", "Secret cache", "Secrets Manager", "Rotated credential", "Database"],
    focus: 1,
    caption: "See where stale credentials can survive after a successful rotation."
  },
  "S3 + Lambda": {
    labels: ["S3 event", "Lambda", "Idempotency ledger", "Transform", "Warehouse"],
    focus: 2,
    caption: "Follow a retried event through a duplicate-safe serverless ingestion path."
  },
  "AWS Glue": {
    labels: ["S3 inputs", "Glue Spark job", "Shuffle and skew", "Curated output", "Catalog"],
    focus: 2,
    caption: "Locate the distributed processing stage responsible for uneven runtime."
  },
  "Amazon EMR": {
    labels: ["Orchestrator", "EMR cluster", "Spark application", "S3 output", "Termination"],
    focus: 1,
    caption: "Explore the lifecycle and operational boundaries of a managed Spark cluster."
  },
  "Amazon Athena": {
    labels: ["S3 layout", "Glue Catalog", "Athena scan", "Result set", "Analyst"],
    focus: 0,
    caption: "See why partitioning and compact columnar files determine serverless query cost."
  },
  "Amazon Redshift": {
    labels: ["ETL load", "Redshift tables", "Workload queue", "Query execution", "BI users"],
    focus: 2,
    caption: "Trace how mixed workloads compete before they reach the serving layer."
  },
  "AWS DMS": {
    labels: ["Source database", "DMS capture", "Replication task", "Target apply", "Analytics"],
    focus: 3,
    caption: "Follow change data from transaction logs to the target apply stage."
  },
  Kinesis: {
    labels: ["Event producers", "Kinesis stream", "Firehose buffer", "S3 delivery", "Consumers"],
    focus: 2,
    caption: "Inspect buffering, delivery, and freshness across a managed streaming path."
  },
  "MSK + Kinesis": {
    labels: ["Producers", "Streaming platform", "Consumer groups", "Destinations", "Operations"],
    focus: 1,
    caption: "Compare where operational ownership changes between streaming choices."
  },
  "Lake Formation": {
    labels: ["Identity", "IAM permission", "Lake Formation grant", "Glue table", "S3 data"],
    focus: 2,
    caption: "Follow governance checks across identity, catalog, and storage."
  },
  "MWAA + Compute": {
    labels: ["MWAA DAG", "Job submission", "Glue or EMR", "S3 output", "Warehouse"],
    focus: 1,
    caption: "Keep orchestration lightweight while compute runs in the service designed for it."
  },
  "CloudWatch + CloudTrail": {
    labels: ["AWS services", "Structured logs", "Correlation ID", "Metrics and alarms", "On-call"],
    focus: 2,
    caption: "Trace how raw service activity becomes actionable incident evidence."
  },
  "Service selection": {
    labels: ["Workload requirements", "Service choice", "Data processing", "Serving layer", "Operations"],
    focus: 0,
    caption: "Start with workload constraints before selecting a familiar AWS service."
  }
};

export function getOperationsLearningFlow(lab: OperationsLab): LearningFlowDefinition {
  const templates = lab.track === "airflow" ? AIRFLOW_FLOWS : AWS_FLOWS;
  const template =
    templates[lab.section] ??
    ({
      labels: ["Input", "Orchestration", "Processing", "Storage", "Consumer"],
      focus: 2,
      caption: "Trace the production path and inspect each operational boundary."
    } satisfies OperationsFlowTemplate);
  const stages = template.labels.map(inferStage);

  return {
    stages,
    focusStageId: stages[Math.min(template.focus, stages.length - 1)].id,
    caption: template.caption
  };
}
