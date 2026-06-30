export const LAUNCH_READY_CODING_LAB_SLUGS = [
  "sql-coding-01-second-highest-salary",
  "sql-coding-02-nth-highest-salary",
  "sql-coding-03-top-3-salaries-per-department",
  "sql-coding-04-latest-order-per-customer",
  "sql-coding-05-first-and-last-order-per-customer",
  "sql-coding-06-running-total-by-date",
  "sql-coding-07-3-day-moving-average",
  "sql-coding-08-month-over-month-growth",
  "sql-coding-09-rank-cities-by-sales-with-ties",
  "sql-coding-10-top-10-percent-of-customers-by-spend",
  "sql-coding-11-customers-with-no-orders",
  "sql-coding-12-employees-earning-above-department-average",
  "sql-coding-13-orders-with-missing-customer-records",
  "sql-coding-14-intersection-of-active-users-across-two-months",
  "sql-coding-15-customers-who-bought-every-product-in-a-category",
  "sql-coding-16-compare-two-tables-and-find-added-rows",
  "sql-coding-17-same-day-repeat-orders",
  "sql-coding-18-orders-and-their-immediate-previous-order",
  "sql-coding-19-find-duplicate-business-keys",
  "sql-coding-20-customers-with-orders-in-consecutive-months",
  "sql-coding-21-recursive-employee-hierarchy",
  "sql-coding-22-hierarchy-path-from-ceo-to-employee",
  "sql-coding-23-sessionization-with-a-30-minute-gap",
  "sql-coding-24-rolling-7-day-active-users",
  "sql-coding-25-customers-who-churned-no-orders-in-last-90-days",
  "sql-coding-26-repeat-purchase-within-7-days",
  "sql-coding-27-consecutive-login-streaks",
  "sql-coding-28-gap-greater-than-30-days-between-orders",
  "sql-coding-29-median-salary",
  "sql-coding-30-pareto-80-percent-customers",
  "sql-coding-31-deduplicate-and-keep-the-latest-record-per-business-key",
  "sql-coding-32-scd-type-2-find-changed-customer-rows",
  "sql-coding-33-scd-type-2-close-old-row-and-insert-new-row",
  "sql-coding-34-incremental-load-using-watermark",
  "sql-coding-35-merge-staging-into-target-by-business-key",
  "sql-coding-36-snapshot-table-latest-balance-per-account",
  "sql-coding-37-late-arriving-facts-that-missed-the-correct-date-partition",
  "sql-coding-38-find-changed-rows-between-two-snapshots-by-key",
  "sql-coding-39-fact-table-missing-dimension-keys-by-load-date",
  "sql-coding-40-current-active-scd-row-per-customer",
  "pyspark-append-rerun-duplicates",
  "pyspark-python-udf-slow-normalization",
  "pyspark-skewed-customer-join",
  "pyspark-small-files-hourly-writes",
  "pyspark-cache-everything-memory-pressure",
  "pyspark-driver-collect-oom",
  "pyspark-window-dedup-latest-record",
  "pyspark-union-column-order-corruption",
  "pyspark-null-join-key-skew",
  "pyspark-explode-row-count-blowup"
] as const;

export const LAUNCH_READY_OPERATIONS_LAB_SLUGS = [
  "airflow-dag-starts-hours-late",
  "airflow-first-attempt-fails",
  "airflow-sensor-gridlock",
  "airflow-backfill-duplicates",
  "airflow-dynamic-mapping-explosion",
  "airflow-worker-logs-missing",
  "airflow-api-rate-limit-storm",
  "airflow-monolithic-dag",
  "airflow-one-logical-date-fails",
  "airflow-event-driven-assets",
  "aws-athena-cost-spike",
  "aws-emr-kms-access-denied",
  "aws-mwaa-private-postgres",
  "aws-secret-rotation-breaks-lambda",
  "aws-s3-event-duplicates",
  "aws-glue-job-slowdown",
  "aws-emr-cost-too-high",
  "aws-athena-serverless-slow",
  "aws-redshift-dashboard-contention",
  "aws-dms-cdc-lag"
] as const;

export const LAUNCH_READY_SCENARIO_SLUGS = [
  "wrong-group-by-grain-customer-revenue",
  "left-join-where-filter-inner-join",
  "duplicate-revenue-payments-refunds-join",
  "pyspark-append-mode-duplicate-daily-loads",
  "spark-join-slow-customer-key-skew",
  "too-many-small-files-hourly-writes",
  "airflow-green-dashboard-wrong",
  "airflow-retry-reprocessed-file-duplicates",
  "revenue-drop-new-successful-status",
  "utc-local-timezone-dashboard-mismatch"
] as const;

export const LAUNCH_READY_SYSTEM_DESIGN_SLUGS = [
  "ecommerce-orders-data-platform",
  "clickstream-analytics-platform",
  "postgres-cdc-to-warehouse"
] as const;

const LAUNCH_READY_CODING_LABS = new Set<string>(LAUNCH_READY_CODING_LAB_SLUGS);
const LAUNCH_READY_OPERATIONS_LABS = new Set<string>(LAUNCH_READY_OPERATIONS_LAB_SLUGS);
const LAUNCH_READY_SCENARIOS = new Set<string>(LAUNCH_READY_SCENARIO_SLUGS);
const LAUNCH_READY_SYSTEM_DESIGN = new Set<string>(LAUNCH_READY_SYSTEM_DESIGN_SLUGS);

export interface LaunchReadyFilterOptions {
  includeHidden?: boolean;
}

export function shouldIncludeHiddenContent(options: LaunchReadyFilterOptions = {}) {
  return (
    options.includeHidden === true ||
    process.env.NEXT_PUBLIC_SHOW_HIDDEN_CONTENT === "true"
  );
}

export function isLaunchReadyCodingLab(slug: string) {
  return LAUNCH_READY_CODING_LABS.has(slug);
}

export function isLaunchReadyOperationsLab(slug: string) {
  return LAUNCH_READY_OPERATIONS_LABS.has(slug);
}

export function isLaunchReadyScenario(slug: string) {
  return LAUNCH_READY_SCENARIOS.has(slug);
}

export function isLaunchReadySystemDesign(slug: string) {
  return LAUNCH_READY_SYSTEM_DESIGN.has(slug);
}

export function filterLaunchReady<T extends { launchReady?: boolean }>(
  items: T[],
  options: LaunchReadyFilterOptions = {}
) {
  return shouldIncludeHiddenContent(options)
    ? items
    : items.filter((item) => item.launchReady);
}
