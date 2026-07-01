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
  "sql-coding-17-same-day-repeat-orders",
  "sql-coding-18-orders-and-their-immediate-previous-order",
  "sql-coding-19-find-duplicate-business-keys",
  "sql-coding-20-customers-with-orders-in-consecutive-months",
  "sql-coding-21-recursive-employee-hierarchy",
  "sql-coding-22-hierarchy-path-from-ceo-to-employee",
  "sql-coding-23-sessionization-with-a-30-minute-gap",
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
  "sql-coding-38-find-changed-rows-between-two-snapshots-by-key",
  "sql-coding-40-current-active-scd-row-per-customer",
  "python-coding-01-reverse-a-string",
  "python-coding-02-check-whether-a-string-is-a-palindrome",
  "python-coding-03-find-the-first-non-repeating-character",
  "python-coding-04-check-whether-two-strings-are-anagrams",
  "python-coding-05-find-the-most-frequent-character",
  "python-coding-06-longest-common-prefix",
  "python-coding-07-compress-a-string-with-counts",
  "python-coding-08-validate-parentheses",
  "python-coding-09-count-vowels-and-consonants",
  "python-coding-10-word-frequency-from-a-sentence",
  "python-coding-11-remove-duplicates-while-preserving-order",
  "python-coding-12-find-the-missing-number-from-1-to-n",
  "python-coding-13-two-sum",
  "python-coding-14-rotate-a-list-by-k-steps",
  "python-coding-15-move-all-zeros-to-the-end",
  "python-coding-16-merge-two-sorted-lists",
  "python-coding-17-find-the-intersection-of-two-lists",
  "python-coding-18-top-k-frequent-elements",
  "python-coding-19-group-records-by-key",
  "python-coding-20-flatten-a-nested-list",
  "python-coding-21-count-occurrences-using-a-dictionary",
  "python-coding-22-invert-a-dictionary-with-duplicate-values",
  "python-coding-23-merge-a-list-of-dictionaries-by-id",
  "python-coding-24-detect-duplicates-in-a-list",
  "python-coding-25-sort-a-dictionary-by-value",
  "python-coding-26-count-pairs-with-a-given-sum",
  "python-coding-27-find-symmetric-pairs",
  "python-coding-28-build-running-balance-from-transactions",
  "python-coding-29-factorial",
  "python-coding-30-fibonacci-number",
  "python-coding-31-prime-number-check",
  "python-coding-32-generate-all-primes-up-to-n",
  "python-coding-33-binary-search-in-a-sorted-array",
  "python-coding-34-longest-substring-without-repeating-characters",
  "python-coding-35-merge-overlapping-intervals",
  "python-coding-36-maximum-subarray-sum",
  "python-coding-37-read-a-large-log-file-and-count-error-lines",
  "python-coding-38-parse-csv-and-aggregate-a-numeric-column",
  "python-coding-39-parse-nested-json-and-extract-selected-fields",
  "python-coding-40-compare-two-files-line-by-line",
  "python-coding-41-find-duplicate-records-in-a-csv-by-key",
  "python-coding-42-compute-a-rolling-7-day-average",
  "python-coding-43-convert-a-list-of-tuples-into-a-nested-dictionary",
  "python-coding-44-implement-a-simple-log-parser",
  "python-coding-45-write-a-decorator-that-measures-execution-time",
  "python-coding-46-create-a-generator-that-yields-chunks-from-an-iterable",
  "python-coding-47-implement-a-simple-lru-cache",
  "python-coding-48-find-common-elements-across-multiple-lists",
  "python-coding-49-normalize-an-email-list",
  "python-coding-50-find-the-top-customer-by-revenue-from-transactions",
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
