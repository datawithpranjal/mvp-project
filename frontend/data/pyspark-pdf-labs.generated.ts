type PysparkPdfProblem = {
  number: number;
  title: string;
  section: string;
  coreConcept: string;
  symptom: string;
  diagnosis: string;
  recommendedFix: string;
  tags: string[];
};

const outputColumns = ["signal_id", "diagnosis", "recommended_fix"];

const pdfProblems: PysparkPdfProblem[] = [
  {
    number: 1,
    title: "The Endless Final Stage",
    section: "Execution and Parallelism",
    coreConcept: "Data skew in shuffle-heavy stages",
    symptom: "One reduce task keeps running after the rest of the stage finishes.",
    diagnosis: "A hot key is creating shuffle skew and one reducer is processing far more data than the others.",
    recommendedFix: "Identify the hot key, pre-aggregate where possible, salt the skewed key, or use skew-aware join handling.",
    tags: ["PySpark", "Skew", "Shuffle"]
  },
  {
    number: 2,
    title: "Shuffle Storm After a Big Join",
    section: "Execution and Parallelism",
    coreConcept: "Exploding shuffle volume",
    symptom: "A join stage spills heavily and shuffle bytes are much larger than the input tables.",
    diagnosis: "The job joins wide data before filtering or projecting, creating unnecessary shuffle volume.",
    recommendedFix: "Filter early, select only required columns, pre-aggregate when safe, and validate the join key grain.",
    tags: ["PySpark", "Join", "Shuffle"]
  },
  {
    number: 3,
    title: "One Core Busy, Cluster Idle",
    section: "Execution and Parallelism",
    coreConcept: "Too few partitions and poor parallelism",
    symptom: "The Spark UI shows only a handful of tasks while most executors sit idle.",
    diagnosis: "The input has too few partitions, so the cluster cannot parallelize the work.",
    recommendedFix: "Increase partitions before expensive transformations and size partitions around data volume and cluster capacity.",
    tags: ["PySpark", "Parallelism", "Partitions"]
  },
  {
    number: 4,
    title: "Thousands of Tiny Tasks",
    section: "Execution and Parallelism",
    coreConcept: "Too many partitions and scheduler overhead",
    symptom: "The job launches thousands of tiny tasks and spends more time scheduling than processing.",
    diagnosis: "The pipeline is over-partitioned for the data size, creating scheduler overhead and tiny output files.",
    recommendedFix: "Coalesce or repartition to a sensible partition count and target healthy output file sizes.",
    tags: ["PySpark", "Partitions", "Files"]
  },
  {
    number: 5,
    title: "The groupByKey Memory Trap",
    section: "Execution and Parallelism",
    coreConcept: "Using groupByKey on large keys",
    symptom: "Executors spill or fail when grouping all values for a customer or product key.",
    diagnosis: "groupByKey materializes all values per key and creates memory pressure for high-cardinality groups.",
    recommendedFix: "Use aggregations such as reduceByKey, aggregateByKey, or DataFrame groupBy aggregations instead of materializing full groups.",
    tags: ["PySpark", "Aggregation", "Memory"]
  },
  {
    number: 6,
    title: "Window Functions on Unbounded Partitions",
    section: "Execution and Parallelism",
    coreConcept: "Expensive window operations at scale",
    symptom: "A window calculation over customer history becomes the slowest stage as data grows.",
    diagnosis: "The window partition is too large or unbounded, forcing expensive sorts and state per key.",
    recommendedFix: "Bound the window, reduce data before the window, and partition by the correct business grain.",
    tags: ["PySpark", "Window", "Performance"]
  },
  {
    number: 7,
    title: "The Python UDF Tax",
    section: "Execution and Parallelism",
    coreConcept: "Serialization overhead from Python UDFs",
    symptom: "A simple column cleanup stage became slow after a Python UDF was introduced.",
    diagnosis: "Rows are crossing between the JVM and Python workers, blocking Spark SQL optimizations.",
    recommendedFix: "Replace row-wise Python UDF logic with built-in Spark SQL functions whenever possible.",
    tags: ["PySpark", "UDF", "Performance"]
  },
  {
    number: 8,
    title: "Broadcast Join Backfires",
    section: "Execution and Parallelism",
    coreConcept: "Unsafe broadcast of the build side",
    symptom: "Executors fail after a table that used to be small is broadcast to every worker.",
    diagnosis: "The broadcast side grew beyond safe memory limits and the plan still forces a broadcast join.",
    recommendedFix: "Remove the unsafe broadcast hint, refresh table statistics, and only broadcast genuinely small dimensions.",
    tags: ["PySpark", "Broadcast", "Join"]
  },
  {
    number: 9,
    title: "Static Shuffle Settings on a Moving Workload",
    section: "Execution and Parallelism",
    coreConcept: "Poor performance from outdated partition settings",
    symptom: "The same shuffle partition setting works for small days but fails on month-end volume.",
    diagnosis: "The job uses static partition settings even though data volume changes significantly.",
    recommendedFix: "Enable adaptive query execution and tune shuffle partitions based on observed workload size.",
    tags: ["PySpark", "AQE", "Shuffle"]
  },
  {
    number: 10,
    title: "The Recompute Loop",
    section: "Execution and Parallelism",
    coreConcept: "Long lineage and repeated recomputation",
    symptom: "The same expensive upstream transformations are recomputed across multiple downstream actions.",
    diagnosis: "A long lineage is being reused without checkpointing or caching the right intermediate result.",
    recommendedFix: "Persist only reused expensive DataFrames or checkpoint long lineage at a reliable boundary.",
    tags: ["PySpark", "Lineage", "Cache"]
  },
  {
    number: 11,
    title: "Executor OutOfMemoryError on Wide Rows",
    section: "Memory and Stability",
    coreConcept: "Wide rows and oversized shuffles",
    symptom: "Executor memory errors appear after adding nested payload columns to the transformation.",
    diagnosis: "Wide rows are being carried through shuffle stages even when only a few columns are needed.",
    recommendedFix: "Project required columns early, avoid shuffling wide payloads, and store heavy payloads separately when possible.",
    tags: ["PySpark", "Memory", "Projection"]
  },
  {
    number: 12,
    title: "Driver Out of Memory",
    section: "Memory and Stability",
    coreConcept: "Collecting too much data to the driver",
    symptom: "The driver crashes when the job calls collect or converts a large DataFrame to pandas.",
    diagnosis: "Distributed data is being pulled into driver memory instead of being processed on executors.",
    recommendedFix: "Keep processing distributed, collect only bounded samples, and write large results to storage.",
    tags: ["PySpark", "Driver", "Memory"]
  },
  {
    number: 13,
    title: "Cache Ate the Cluster",
    section: "Memory and Stability",
    coreConcept: "Over-caching and missing unpersist",
    symptom: "A job becomes slower after several DataFrames are cached during debugging.",
    diagnosis: "The cluster memory is filled with cached data that is not reused enough to justify the storage cost.",
    recommendedFix: "Cache only expensive DataFrames reused multiple times and unpersist them after the final use.",
    tags: ["PySpark", "Cache", "Memory"]
  },
  {
    number: 14,
    title: "Spill Everywhere",
    section: "Memory and Stability",
    coreConcept: "Shuffle spill caused by heavy sort or aggregation",
    symptom: "Spark UI shows disk spill across many tasks during aggregations.",
    diagnosis: "Shuffle partitions are too large or the aggregation carries unnecessary columns.",
    recommendedFix: "Reduce row width, tune partition counts, pre-aggregate earlier, and inspect skewed keys.",
    tags: ["PySpark", "Spill", "Aggregation"]
  },
  {
    number: 15,
    title: "Broadcast Timeout",
    section: "Memory and Stability",
    coreConcept: "Broadcast exchange cannot complete in time",
    symptom: "The query fails while trying to broadcast a dimension table during a join.",
    diagnosis: "The broadcast table is too large or the cluster cannot distribute it within the configured timeout.",
    recommendedFix: "Avoid broadcasting large dimensions, refresh stats, increase timeout only after validating size, and use a shuffle join when safer.",
    tags: ["PySpark", "Broadcast", "Timeout"]
  },
  {
    number: 16,
    title: "Serialization Pain",
    section: "Memory and Stability",
    coreConcept: "Expensive object serialization",
    symptom: "Tasks spend high time serializing custom Python objects or nested records.",
    diagnosis: "The job uses complex Python-side objects instead of Spark-native columnar transformations.",
    recommendedFix: "Use DataFrame APIs and Spark SQL types, reduce Python object movement, and avoid custom serializers in hot paths.",
    tags: ["PySpark", "Serialization", "DataFrame"]
  },
  {
    number: 17,
    title: "Dynamic Allocation Thrash",
    section: "Memory and Stability",
    coreConcept: "Executors repeatedly added and removed",
    symptom: "Executors churn during the job and stages keep waiting for resources.",
    diagnosis: "Dynamic allocation settings do not match workload shape, causing executor churn and unstable parallelism.",
    recommendedFix: "Tune min/max executors, idle timeout, and shuffle tracking for the workload pattern.",
    tags: ["PySpark", "Dynamic Allocation", "Cluster"]
  },
  {
    number: 18,
    title: "Preempted or Lost Executors Kill the Stage",
    section: "Memory and Stability",
    coreConcept: "Executor loss and fragile retries",
    symptom: "Stages fail repeatedly after spot/preemptible executors disappear.",
    diagnosis: "The job is not resilient to executor loss and may be running with fragile retry or shuffle settings.",
    recommendedFix: "Increase resilience with appropriate retries, external shuffle or shuffle tracking, and avoid relying on volatile capacity for critical runs.",
    tags: ["PySpark", "Reliability", "Executors"]
  },
  {
    number: 19,
    title: "GC Hell",
    section: "Memory and Stability",
    coreConcept: "Excessive garbage collection",
    symptom: "Executor CPU is busy but progress is slow and GC time is high.",
    diagnosis: "Tasks create too many objects or hold large in-memory structures during transformations.",
    recommendedFix: "Reduce object churn, avoid Python row loops, shrink cached data, and tune memory only after reducing data pressure.",
    tags: ["PySpark", "GC", "Memory"]
  },
  {
    number: 20,
    title: "Pandas UDF or Arrow Batch Blowups",
    section: "Memory and Stability",
    coreConcept: "Oversized Arrow batches",
    symptom: "Pandas UDF stages fail when converting large batches to Arrow or pandas.",
    diagnosis: "Arrow batch size and pandas memory use are too large for executor memory.",
    recommendedFix: "Reduce Arrow batch size, avoid pandas UDFs for simple expressions, and keep transformations Spark-native.",
    tags: ["PySpark", "Arrow", "Pandas UDF"]
  },
  {
    number: 21,
    title: "Reading Millions of Small Files",
    section: "Files and Lake Layout",
    coreConcept: "Small-file scan overhead",
    symptom: "A scan takes minutes before any real transformation starts.",
    diagnosis: "The job is paying metadata and task overhead for millions of tiny input files.",
    recommendedFix: "Compact small files, use healthier target file sizes, and avoid creating high-cardinality partitions.",
    tags: ["PySpark", "Files", "Compaction"]
  },
  {
    number: 22,
    title: "Writing a Forest of Tiny Files",
    section: "Files and Lake Layout",
    coreConcept: "Too many output files",
    symptom: "Downstream queries slow down because each run writes thousands of tiny files.",
    diagnosis: "The write path has too many partitions for the output volume.",
    recommendedFix: "Coalesce or repartition intentionally and set maxRecordsPerFile or table compaction policies.",
    tags: ["PySpark", "Writes", "Files"]
  },
  {
    number: 23,
    title: "Partitioned by User ID, Dying by User ID",
    section: "Files and Lake Layout",
    coreConcept: "High-cardinality partitioning",
    symptom: "The lake has millions of user_id partitions and listing partitions is slow.",
    diagnosis: "The table is physically partitioned by a high-cardinality key instead of query-friendly low-cardinality columns.",
    recommendedFix: "Partition by date or another bounded access pattern and cluster/sort by user_id inside files if needed.",
    tags: ["PySpark", "Partitioning", "Lakehouse"]
  },
  {
    number: 24,
    title: "Some Tasks Read Gigabytes, Others Read Almost Nothing",
    section: "Files and Lake Layout",
    coreConcept: "Uneven file sizes",
    symptom: "A few tasks read huge files while many tasks finish immediately.",
    diagnosis: "The table has uneven file sizes, causing poor parallelism and straggler tasks.",
    recommendedFix: "Compact into balanced files and monitor file-size distribution by partition.",
    tags: ["PySpark", "Files", "Stragglers"]
  },
  {
    number: 25,
    title: "CSV and Gzip at Terabyte Scale",
    section: "Files and Lake Layout",
    coreConcept: "Unsplittable compression and text parsing",
    symptom: "Reading compressed CSV data is slow and cannot parallelize well.",
    diagnosis: "Gzip CSV is expensive to parse and often unsplittable, limiting parallel reads.",
    recommendedFix: "Convert raw files to columnar formats such as Parquet and use splittable compression.",
    tags: ["PySpark", "CSV", "Parquet"]
  },
  {
    number: 26,
    title: "Schema Inference Surprises",
    section: "Files and Lake Layout",
    coreConcept: "Inferred types change across files",
    symptom: "A column is sometimes read as string and sometimes as numeric across daily files.",
    diagnosis: "Schema inference is guessing types from each input instead of enforcing a contract.",
    recommendedFix: "Provide an explicit schema and quarantine rows that do not match the contract.",
    tags: ["PySpark", "Schema", "Data Quality"]
  },
  {
    number: 27,
    title: "Listing the Lake Takes Longer Than Reading It",
    section: "Files and Lake Layout",
    coreConcept: "Metadata listing bottleneck",
    symptom: "The job spends a long time listing paths before Spark starts processing.",
    diagnosis: "The table layout forces expensive object-store listing across too many directories.",
    recommendedFix: "Use table metadata, partition pruning, manifests, and healthier partition design.",
    tags: ["PySpark", "Metadata", "Lakehouse"]
  },
  {
    number: 28,
    title: "Overwrite Wiped More Than Intended",
    section: "Files and Lake Layout",
    coreConcept: "Unsafe overwrite semantics",
    symptom: "A backfill overwrites partitions outside the intended business date range.",
    diagnosis: "The write uses broad overwrite behavior instead of limiting the affected partitions.",
    recommendedFix: "Use dynamic partition overwrite, replaceWhere, or merge semantics scoped to affected partitions.",
    tags: ["PySpark", "Overwrite", "Safety"]
  },
  {
    number: 29,
    title: "Table Gets Slower Every Month",
    section: "Files and Lake Layout",
    coreConcept: "Missing maintenance and table optimization",
    symptom: "Queries against the same table slow down steadily as more data lands.",
    diagnosis: "The table is accumulating small files, stale stats, and suboptimal clustering.",
    recommendedFix: "Schedule compaction, statistics refresh, and layout optimization as part of table maintenance.",
    tags: ["PySpark", "Lakehouse", "Maintenance"]
  },
  {
    number: 30,
    title: "MERGE Jobs Get Slower Every Day",
    section: "Files and Lake Layout",
    coreConcept: "Unbounded merge scan",
    symptom: "Daily merge jobs scan more target data every day even when the update set is small.",
    diagnosis: "The merge predicate does not prune target partitions or source duplicates before matching.",
    recommendedFix: "Deduplicate the source, partition-prune the target, and merge only the affected business dates or keys.",
    tags: ["PySpark", "MERGE", "Lakehouse"]
  },
  {
    number: 31,
    title: "The Duplicate Explosion After Rerun",
    section: "Correctness and Data Quality",
    coreConcept: "Non-idempotent reruns",
    symptom: "A retried batch doubles rows in the warehouse.",
    diagnosis: "The write path appends retry data without deduplicating or replacing the affected slice.",
    recommendedFix: "Make reruns idempotent with business-key deduplication and partition-scoped overwrite or merge.",
    tags: ["PySpark", "Idempotency", "Deduplication"]
  },
  {
    number: 32,
    title: "Late Data Changes Yesterday",
    section: "Correctness and Data Quality",
    coreConcept: "Late-arriving data",
    symptom: "Yesterday's numbers change after a delayed source file arrives.",
    diagnosis: "The pipeline only processes today's ingest date and ignores business dates affected by late data.",
    recommendedFix: "Track affected business dates and recompute or merge those partitions safely.",
    tags: ["PySpark", "Late Data", "Partitions"]
  },
  {
    number: 33,
    title: "Incremental Load Missed a Slice of Data",
    section: "Correctness and Data Quality",
    coreConcept: "Unsafe watermark logic",
    symptom: "Rows updated at the exact watermark timestamp are missing after an incremental run.",
    diagnosis: "The pipeline uses timestamp-only watermarking and misses tie rows with the same updated_at.",
    recommendedFix: "Use a compound watermark such as updated_at plus primary key and reconcile loaded counts.",
    tags: ["PySpark", "Watermark", "Incremental"]
  },
  {
    number: 34,
    title: "Timezone Drift Broke the Metric",
    section: "Correctness and Data Quality",
    coreConcept: "UTC and business-date mismatch",
    symptom: "Revenue appears on the wrong dashboard date after a timezone boundary.",
    diagnosis: "The job groups by UTC date instead of the local business date expected by reporting.",
    recommendedFix: "Convert timestamps to the business timezone before deriving dates and filtering windows.",
    tags: ["PySpark", "Timezone", "Reporting"]
  },
  {
    number: 35,
    title: "Silent Casts Turned Data Into Nulls",
    section: "Correctness and Data Quality",
    coreConcept: "Unsafe type casting",
    symptom: "A numeric column suddenly contains many nulls after a vendor schema change.",
    diagnosis: "The job casts malformed strings without validating or quarantining invalid rows.",
    recommendedFix: "Validate before casting, quarantine invalid rows, and alert on cast-null spikes.",
    tags: ["PySpark", "Casting", "Data Quality"]
  },
  {
    number: 36,
    title: "Join Produced Fewer Rows Than Expected",
    section: "Correctness and Data Quality",
    coreConcept: "Accidental inner join behavior",
    symptom: "A left join unexpectedly drops facts without matching dimension rows.",
    diagnosis: "A downstream filter on right-table columns turns the left join into inner join behavior.",
    recommendedFix: "Keep right-side filters in the join condition or explicitly handle missing dimension rows.",
    tags: ["PySpark", "Join", "Data Quality"]
  },
  {
    number: 37,
    title: "dropDuplicates Kept the Wrong Row",
    section: "Correctness and Data Quality",
    coreConcept: "Non-deterministic deduplication",
    symptom: "The deduplicated table keeps an older version for some business keys.",
    diagnosis: "dropDuplicates without ordering does not guarantee the latest record survives.",
    recommendedFix: "Use row_number over a deterministic ordering such as updated_at and sequence number.",
    tags: ["PySpark", "Deduplication", "Window"]
  },
  {
    number: 38,
    title: "Schema Drift Broke Downstream Selects",
    section: "Correctness and Data Quality",
    coreConcept: "Unexpected source columns or missing fields",
    symptom: "A downstream select fails after the source removes or renames a column.",
    diagnosis: "The pipeline assumes the source schema is stable and lacks compatibility handling.",
    recommendedFix: "Enforce schema contracts, add defaults for optional fields, and alert on incompatible drift.",
    tags: ["PySpark", "Schema Drift", "Contracts"]
  },
  {
    number: 39,
    title: "Surrogate Keys Changed After Backfill",
    section: "Correctness and Data Quality",
    coreConcept: "Unstable key generation",
    symptom: "Dimension surrogate keys change after a backfill and break fact joins.",
    diagnosis: "The job generates surrogate keys from non-deterministic row order.",
    recommendedFix: "Use stable key assignment based on business keys or maintain keys in a persisted dimension table.",
    tags: ["PySpark", "Modeling", "Backfill"]
  },
  {
    number: 40,
    title: "Joined Table Has Two Status Columns",
    section: "Correctness and Data Quality",
    coreConcept: "Ambiguous columns after joins",
    symptom: "A downstream step reads the wrong status column after joining two datasets.",
    diagnosis: "The join keeps ambiguous duplicate column names and later logic references the wrong field.",
    recommendedFix: "Alias columns before joins and project a clean schema with explicit business names.",
    tags: ["PySpark", "Join", "Schema"]
  },
  {
    number: 41,
    title: "The Stream Cannot Catch Up",
    section: "Structured Streaming",
    coreConcept: "Input rate exceeds processing capacity",
    symptom: "Streaming backlog grows even though the job remains alive.",
    diagnosis: "Each micro-batch takes longer than the trigger interval, so processing cannot catch up.",
    recommendedFix: "Measure source, transform, and sink time separately; scale or reduce work per trigger.",
    tags: ["PySpark", "Streaming", "Lag"]
  },
  {
    number: 42,
    title: "State Store Keeps Growing Forever",
    section: "Structured Streaming",
    coreConcept: "Unbounded streaming state",
    symptom: "State store size grows every day and checkpoint storage keeps increasing.",
    diagnosis: "The query keeps state without a bounded watermark or cleanup condition.",
    recommendedFix: "Use event-time watermarks, bounded windows, and state TTL aligned to business requirements.",
    tags: ["PySpark", "Streaming", "State"]
  },
  {
    number: 43,
    title: "Valid Events Are Being Dropped as Late",
    section: "Structured Streaming",
    coreConcept: "Watermark too aggressive",
    symptom: "Legitimate delayed events are dropped and business totals are low.",
    diagnosis: "The watermark threshold is shorter than the real source delay distribution.",
    recommendedFix: "Set the watermark from observed lateness percentiles and monitor dropped-late event counts.",
    tags: ["PySpark", "Watermark", "Streaming"]
  },
  {
    number: 44,
    title: "Streaming Join State Explosion",
    section: "Structured Streaming",
    coreConcept: "Unbounded join state",
    symptom: "A stream-stream join consumes growing memory and checkpoint storage.",
    diagnosis: "The join lacks tight event-time bounds and watermarks on both sides.",
    recommendedFix: "Add watermarks and time-range join conditions, or redesign the join through a compact dimension/state table.",
    tags: ["PySpark", "Streaming Join", "State"]
  },
  {
    number: 45,
    title: "One Kafka Partition Burns While Others Coast",
    section: "Structured Streaming",
    coreConcept: "Kafka partition skew",
    symptom: "One Kafka partition has most of the lag while other partitions are healthy.",
    diagnosis: "The Kafka key distribution is skewed and one partition receives too much traffic.",
    recommendedFix: "Fix key design, split hot keys, or repartition downstream after preserving ordering guarantees where required.",
    tags: ["PySpark", "Kafka", "Skew"]
  },
  {
    number: 46,
    title: "Checkpoint Trouble After a Restart",
    section: "Structured Streaming",
    coreConcept: "Checkpoint incompatibility",
    symptom: "A streaming deployment fails or behaves strangely after a code change.",
    diagnosis: "The query changed in a way that is incompatible with the existing checkpoint state.",
    recommendedFix: "Plan stateful changes carefully, version checkpoint paths when needed, and backfill/replay safely.",
    tags: ["PySpark", "Checkpoint", "Streaming"]
  },
  {
    number: 47,
    title: "Exactly Once Until the Sink Retries",
    section: "Structured Streaming",
    coreConcept: "Non-idempotent sink writes",
    symptom: "A sink retry creates duplicate records even though the stream checkpoint is healthy.",
    diagnosis: "The sink write is not idempotent, so retried micro-batches are committed more than once.",
    recommendedFix: "Use deterministic batch IDs, merge/upsert semantics, and sink-side deduplication.",
    tags: ["PySpark", "Streaming", "Idempotency"]
  },
  {
    number: 48,
    title: "foreachBatch Became the Bottleneck",
    section: "Structured Streaming",
    coreConcept: "Slow sink-side upserts inside foreachBatch",
    symptom: "Input rate is fine, but each micro-batch spends too long inside custom sink logic.",
    diagnosis: "foreachBatch is doing expensive, poorly pruned merge or external write work.",
    recommendedFix: "Deduplicate each batch, prune the target slice, batch external calls, and monitor sink time separately.",
    tags: ["PySpark", "foreachBatch", "Streaming"]
  },
  {
    number: 49,
    title: "Restart Read the Wrong Offsets",
    section: "Structured Streaming",
    coreConcept: "Accidental replay or skip after deployment",
    symptom: "After restart, the stream reprocesses old events or skips events unexpectedly.",
    diagnosis: "Checkpoint path, query identity, or source offset options changed unintentionally.",
    recommendedFix: "Protect checkpoint identity, audit offsets before publishing, and make replays deliberate and idempotent.",
    tags: ["PySpark", "Offsets", "Streaming"]
  },
  {
    number: 50,
    title: "Debugging Blind in Production",
    section: "Structured Streaming",
    coreConcept: "Weak logs, metrics, and data-quality alarms",
    symptom: "The job fails or slows down but engineers cannot quickly tell whether compute, data, or sink behavior caused it.",
    diagnosis: "The pipeline lacks persistent Spark history, targeted metrics, and output quality checks.",
    recommendedFix: "Enable Spark event logs, add data-quality metrics, and create incident dashboards for critical outputs.",
    tags: ["PySpark", "Observability", "Production"]
  }
];

function padProblemNumber(number: number) {
  return String(number).padStart(2, "0");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function difficultyFor(number: number) {
  if (number <= 15) return "beginner";
  if (number <= 35) return "intermediate";
  return "advanced";
}

function sampleRows(problem: PysparkPdfProblem) {
  const id = `pyspark-${padProblemNumber(problem.number)}`;
  return [
    [
      `${id}-hot`,
      problem.section,
      problem.symptom,
      9,
      7,
      problem.diagnosis,
      problem.recommendedFix
    ],
    [
      `${id}-healthy`,
      problem.section,
      `Control signal for ${problem.coreConcept.toLowerCase()}.`,
      3,
      7,
      "No production action needed for this comparison signal.",
      "Keep monitoring normal variation and do not change the pipeline based on this row."
    ],
    [
      `${id}-boundary`,
      problem.section,
      `Boundary signal: ${problem.coreConcept}.`,
      7,
      7,
      problem.diagnosis,
      problem.recommendedFix
    ]
  ];
}

function expectedRows(problem: PysparkPdfProblem) {
  return sampleRows(problem)
    .filter((row) => Number(row[3]) >= Number(row[4]))
    .map((row) => [row[0], row[5], row[6]]);
}

export const pysparkPdfLabData = pdfProblems.map((problem) => {
  const problemNumber = padProblemNumber(problem.number);
  const slug = `pyspark-pdf-${problemNumber}-${slugify(problem.title)}`;

  return {
    id: `pyspark-pdf-production-${problemNumber}`,
    slug,
    track: "pyspark",
    title: `PySpark PDF ${problemNumber}: ${problem.title}`,
    difficulty: difficultyFor(problem.number),
    section: problem.section,
    topicTags: ["PySpark", "Production Debugging", ...problem.tags],
    isFree: problem.number <= 5,
    estimatedMinutes: problem.number <= 20 ? 18 : 22,
    businessContext:
      `A production PySpark job is showing this incident pattern: ${problem.symptom} The on-call engineer needs to separate real action signals from normal noise before changing Spark code or cluster settings.`,
    problemStatement:
      `${problem.title} tests ${problem.coreConcept}. The telemetry table contains multiple signals. Rows with risk_score at or above action_threshold require action. The broken code uses a strict comparison and misses boundary alerts.`,
    expectedOutcome:
      "Return only actionable production signals with columns signal_id, diagnosis, and recommended_fix. Boundary rows where risk_score equals action_threshold must be included.",
    studentTask:
      "Fix the PySpark transformation so it keeps every actionable signal and assigns the final DataFrame to result_df.",
    starterCode: `from pyspark.sql import functions as F

# incident_signals is already available in the backend runner.
# Broken: this misses boundary alerts where risk_score equals action_threshold.
result_df = incident_signals.filter(
    F.col("risk_score") > F.col("action_threshold")
).select("signal_id", "diagnosis", "recommended_fix")`,
    solutionCode: `from pyspark.sql import functions as F

result_df = incident_signals.filter(
    F.col("risk_score") >= F.col("action_threshold")
).select("signal_id", "diagnosis", "recommended_fix")`,
    explanation:
      `This lab turns the production problem into a small executable triage task. ${problem.diagnosis} The safe fix is to include threshold-boundary alerts, avoid hardcoding signal IDs, and return the exact operational diagnosis and remediation columns.`,
    hints: [
      "Compare risk_score with action_threshold, not with a hardcoded number.",
      "Boundary rows matter in production alerting. At threshold should still count as actionable.",
      "Return only signal_id, diagnosis, and recommended_fix so downstream incident tooling receives a stable schema."
    ],
    tables: [
      {
        name: "incident_signals",
        columns: [
          "signal_id",
          "pipeline_area",
          "symptom",
          "risk_score",
          "action_threshold",
          "diagnosis",
          "recommended_fix"
        ],
        rows: sampleRows(problem)
      }
    ],
    expectedOutputTable: {
      columns: outputColumns,
      rows: expectedRows(problem)
    },
    validationKeywords: ["filter", ">=", "select", "result_df"],
    commonMistakes: [
      "Using > instead of >= and missing boundary alerts.",
      "Hardcoding the sample signal IDs instead of using the risk threshold.",
      "Returning extra columns that do not match the expected incident output schema."
    ]
  };
});
