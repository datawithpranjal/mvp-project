export const pysparkLabData = [
  {
    id: "pyspark-production-001",
    slug: "pyspark-append-rerun-duplicates",
    track: "pyspark",
    title: "PySpark 1: Daily Rerun Created Duplicate Orders",
    difficulty: "beginner",
    section: "Safe writes",
    topicTags: ["PySpark", "Deduplication", "Idempotency"],
    isFree: true,
    estimatedMinutes: 18,
    businessContext:
      "The daily orders job failed after writing half the partition. The Airflow retry ran the same input again and the revenue dashboard doubled a few orders.",
    problemStatement:
      "The job appends the full day each time it runs. In production, retries and backfills must be idempotent so the same input does not create duplicate warehouse rows.",
    expectedOutcome:
      "A safe PySpark fix should deduplicate by order_id or event_id, write only the affected partition, and avoid blind append for reruns.",
    studentTask:
      "Rewrite the broken PySpark write so rerunning the same daily file does not duplicate records.",
    starterCode: `from pyspark.sql import functions as F

orders = spark.read.parquet("s3://raw/orders/dt=2026-05-30")

# Broken: every retry appends the same rows again.
orders.write.mode("append").partitionBy("order_date").parquet("s3://warehouse/orders")`,
    solutionCode: `from pyspark.sql import functions as F

orders = spark.read.parquet("s3://raw/orders/dt=2026-05-30")

clean_orders = orders.dropDuplicates(["order_id"])

spark.conf.set("spark.sql.sources.partitionOverwriteMode", "dynamic")

clean_orders.write \
  .mode("overwrite") \
  .partitionBy("order_date") \
  .parquet("s3://warehouse/orders")`,
    explanation:
      "Append is unsafe for retryable batch pipelines. Make the write idempotent by deduplicating business keys and overwriting only the affected partition or using a merge/upsert table format.",
    hints: [
      "Ask what happens if the same input file is processed twice.",
      "A retry-safe job should produce the same final table after one run or many runs.",
      "Blind append is usually wrong for daily partition rewrites."
    ],
    tables: [
      {
        name: "raw_orders",
        columns: ["order_id", "order_date", "amount", "ingest_run_id"],
        rows: [
          [101, "2026-05-30", 599, "run_17"],
          [102, "2026-05-30", 1299, "run_17"],
          [101, "2026-05-30", 599, "run_retry_17"]
        ]
      }
    ],
    validationKeywords: ["dropduplicates", "overwrite", "partitionby", "order_date", "idempotent"],
    commonMistakes: ["Using append after deduplication but leaving old duplicate rows in the target."]
  },
  {
    id: "pyspark-production-002",
    slug: "pyspark-python-udf-slow-normalization",
    track: "pyspark",
    title: "PySpark 2: Python UDF Made Cleanup 8x Slower",
    difficulty: "beginner",
    section: "Built-in functions",
    topicTags: ["PySpark", "Performance", "UDF"],
    isFree: true,
    estimatedMinutes: 15,
    businessContext:
      "A simple customer email cleanup step became the slowest stage in the pipeline after a teammate added a Python UDF.",
    problemStatement:
      "Row-wise Python UDFs move data through Python workers and block many Spark optimizations. This cleanup can be done with native Spark SQL functions.",
    expectedOutcome:
      "Replace the UDF with built-in functions such as lower, trim, and regexp_replace.",
    studentTask:
      "Rewrite the cleanup using PySpark built-ins so it can run inside the Spark execution engine.",
    starterCode: `from pyspark.sql import functions as F
from pyspark.sql.types import StringType

def clean_email(email):
    if email is None:
        return None
    return email.strip().lower().replace(" ", "")

clean_email_udf = F.udf(clean_email, StringType())

customers_clean = customers.withColumn("email_clean", clean_email_udf("email"))`,
    solutionCode: `from pyspark.sql import functions as F

customers_clean = customers.withColumn(
    "email_clean",
    F.lower(F.regexp_replace(F.trim(F.col("email")), " ", ""))
)`,
    explanation:
      "Use Spark built-ins whenever they express the transformation. Spark can optimize built-ins, push work into the JVM engine, and avoid Python serialization overhead.",
    hints: [
      "Check if the UDF only performs string operations.",
      "Spark already has trim, lower, regexp_replace, split, concat, date, and JSON helpers.",
      "If the logic is column-wise and simple, prefer built-ins over udf."
    ],
    tables: [
      {
        name: "customers",
        columns: ["customer_id", "email"],
        rows: [
          [1, " Asha@Example.COM "],
          [2, "ben kumar@example.com"],
          [3, null]
        ]
      }
    ],
    validationKeywords: ["lower", "trim", "regexp_replace", "col", "built-in"],
    commonMistakes: ["Keeping a Python UDF because it looks more familiar than Spark expressions."]
  },
  {
    id: "pyspark-production-003",
    slug: "pyspark-skewed-customer-join",
    track: "pyspark",
    title: "PySpark 3: One Customer Key Slowed the Join",
    difficulty: "intermediate",
    section: "Skew",
    topicTags: ["PySpark", "Joins", "Skew"],
    isFree: true,
    estimatedMinutes: 22,
    businessContext:
      "The orders-to-customer join usually finishes in 12 minutes, but one partition now runs for 70 minutes while others finish quickly.",
    problemStatement:
      "A hot customer_id value is concentrating too many rows into one shuffle partition. The fix depends on table sizes and whether the dimension can be broadcast.",
    expectedOutcome:
      "Detect skew, broadcast the small side when possible, or salt the hot key before the join.",
    studentTask:
      "Fix or explain the PySpark join so it handles the hot key without one executor doing most of the work.",
    starterCode: `from pyspark.sql import functions as F

joined = orders.join(customers, on="customer_id", how="left")

joined.write.mode("overwrite").parquet("s3://warehouse/order_customer_daily")`,
    solutionCode: `from pyspark.sql import functions as F
from pyspark.sql.functions import broadcast

# If customers is small enough, avoid shuffling it.
joined = orders.join(broadcast(customers), on="customer_id", how="left")

# For a large non-broadcastable table, salt only known hot keys before joining.
# Also keep AQE skew join enabled in production clusters.
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")`,
    explanation:
      "Skew is visible when one or a few tasks run much longer than the rest. Broadcast small dimensions, enable AQE skew handling, or salt hot keys when both sides are large.",
    hints: [
      "Look for one task running much longer than the others.",
      "Check if customers is small enough to broadcast.",
      "Salting is useful when the hot key is on a large-to-large join."
    ],
    tables: [
      {
        name: "orders_key_counts",
        columns: ["customer_id", "order_count"],
        rows: [
          [1001, 42],
          [1002, 39],
          [9999, 1800000],
          [1003, 51]
        ]
      }
    ],
    validationKeywords: ["broadcast", "skew", "salting", "adaptive", "customer_id"],
    commonMistakes: ["Increasing executors without fixing the hot key distribution."]
  },
  {
    id: "pyspark-production-004",
    slug: "pyspark-small-files-hourly-writes",
    track: "pyspark",
    title: "PySpark 4: Hourly Writes Created Thousands of Small Files",
    difficulty: "intermediate",
    section: "Files",
    topicTags: ["PySpark", "Lakehouse", "Performance"],
    isFree: true,
    estimatedMinutes: 18,
    businessContext:
      "Athena and Spark reads became slow because each daily partition contains thousands of tiny Parquet files from hourly micro-batches.",
    problemStatement:
      "Too many small files increase metadata overhead and scheduling cost. The job needs better write sizing and a compaction strategy.",
    expectedOutcome:
      "Control output partitions, partition by business date, and run compaction to target reasonable Parquet file sizes.",
    studentTask:
      "Update the PySpark write plan so it avoids a small-files avalanche.",
    starterCode: `hourly_orders.write \
  .mode("append") \
  .partitionBy("order_date", "hour") \
  .parquet("s3://lake/silver/orders")`,
    solutionCode: `target = hourly_orders.repartition("order_date")

target.write \
  .mode("append") \
  .partitionBy("order_date") \
  .option("maxRecordsPerFile", 500000) \
  .parquet("s3://lake/silver/orders")

# Schedule a compaction job for old small files per order_date partition.`,
    explanation:
      "Partitioning by hour can create many tiny partitions when volume is low. Use coarser partitions, control writer parallelism, and compact files after ingestion.",
    hints: [
      "Count files per partition, not just total data size.",
      "Do not partition by a high-cardinality or low-volume column unless queries need it.",
      "A compaction job is part of operating a lakehouse, not a nice-to-have."
    ],
    tables: [
      {
        name: "file_metrics",
        columns: ["order_date", "file_count", "avg_file_mb"],
        rows: [
          ["2026-05-29", 2460, 2],
          ["2026-05-30", 2598, 1],
          ["2026-05-31", 2311, 3]
        ]
      }
    ],
    validationKeywords: ["repartition", "partitionby", "maxrecordsperfile", "compaction", "order_date"],
    commonMistakes: ["Calling coalesce(1), which creates one slow file and a driver/executor bottleneck."]
  },
  {
    id: "pyspark-production-005",
    slug: "pyspark-cache-everything-memory-pressure",
    track: "pyspark",
    title: "PySpark 5: Cache Everything Made the Job Slower",
    difficulty: "beginner",
    section: "Caching",
    topicTags: ["PySpark", "Performance", "Memory"],
    isFree: true,
    estimatedMinutes: 16,
    businessContext:
      "A teammate added cache to every DataFrame hoping the job would speed up. Now executors spill and the job is slower.",
    problemStatement:
      "Caching is useful only when an expensive DataFrame is reused. Caching one-time DataFrames consumes memory and causes eviction/spill overhead.",
    expectedOutcome:
      "Cache only reused expensive intermediate data, trigger it intentionally, and unpersist after the last use.",
    studentTask:
      "Rewrite the code so only the reusable DataFrame is cached and memory is released.",
    starterCode: `raw = spark.read.parquet(raw_path).cache()
clean = raw.filter("status = 'SUCCESS'").cache()
enriched = clean.join(dim_customers, "customer_id").cache()

daily = enriched.groupBy("order_date").sum("amount")
top_customers = enriched.groupBy("customer_id").sum("amount")`,
    solutionCode: `raw = spark.read.parquet(raw_path)
clean = raw.filter("status = 'SUCCESS'")

# Reused by multiple downstream actions, so cache this one.
enriched = clean.join(dim_customers, "customer_id").cache()
enriched.count()

daily = enriched.groupBy("order_date").sum("amount")
top_customers = enriched.groupBy("customer_id").sum("amount")

enriched.unpersist()`,
    explanation:
      "Cache at reuse boundaries. Avoid caching raw and clean if they are consumed once. Always unpersist long-lived cached DataFrames after use.",
    hints: [
      "Ask which DataFrame is referenced more than once.",
      "Cache is lazy until an action materializes it.",
      "Memory pressure can make caching slower than recomputation."
    ],
    tables: [
      {
        name: "stage_usage",
        columns: ["dataframe", "downstream_uses", "expensive_to_recompute"],
        rows: [
          ["raw", 1, false],
          ["clean", 1, false],
          ["enriched", 2, true]
        ]
      }
    ],
    validationKeywords: ["cache", "count", "unpersist", "reused", "memory"],
    commonMistakes: ["Calling cache on every DataFrame because cache sounds like a universal performance feature."]
  },
  {
    id: "pyspark-production-006",
    slug: "pyspark-driver-collect-oom",
    track: "pyspark",
    title: "PySpark 6: collect() Crashed the Driver",
    difficulty: "beginner",
    section: "Driver safety",
    topicTags: ["PySpark", "Driver", "Memory"],
    isFree: false,
    estimatedMinutes: 16,
    businessContext:
      "A validation job worked in dev but crashed in production when it tried to bring millions of customer ids to the driver.",
    problemStatement:
      "collect and toPandas pull distributed data into driver memory. Production fixes should keep aggregation and filtering distributed.",
    expectedOutcome:
      "Replace collect with distributed joins, aggregations, writes, or bounded samples.",
    studentTask:
      "Fix the code so it does not load the full dataset into the Spark driver.",
    starterCode: `vip_ids = [row.customer_id for row in vip_customers.collect()]

vip_orders = orders.filter(F.col("customer_id").isin(vip_ids))`,
    solutionCode: `from pyspark.sql.functions import broadcast

vip_orders = orders.join(
    broadcast(vip_customers.select("customer_id").dropDuplicates()),
    on="customer_id",
    how="inner"
)`,
    explanation:
      "Use a distributed join instead of collecting keys into a Python list. Only use collect for tiny bounded results that you explicitly limit.",
    hints: [
      "The danger is not the filter; it is moving all ids to the driver.",
      "Spark joins keep the operation distributed.",
      "Broadcast is acceptable only when the VIP table is small enough."
    ],
    tables: [
      {
        name: "vip_customers",
        columns: ["customer_id", "tier"],
        rows: [
          [101, "gold"],
          [102, "platinum"],
          [103, "gold"]
        ]
      }
    ],
    validationKeywords: ["join", "broadcast", "dropduplicates", "vip_customers", "inner"],
    commonMistakes: ["Replacing collect with toPandas, which creates the same driver memory risk."]
  },
  {
    id: "pyspark-production-007",
    slug: "pyspark-window-dedup-latest-record",
    track: "pyspark",
    title: "PySpark 7: dropDuplicates Kept the Wrong Customer Version",
    difficulty: "intermediate",
    section: "Windows",
    topicTags: ["PySpark", "Windows", "Deduplication"],
    isFree: false,
    estimatedMinutes: 20,
    businessContext:
      "Customer records arrive multiple times per day. The mart should keep the latest update, but some old statuses are still visible.",
    problemStatement:
      "dropDuplicates is not deterministic for choosing the latest record. You need an explicit ordering rule.",
    expectedOutcome:
      "Use row_number over customer_id ordered by updated_at descending and a deterministic tie-breaker.",
    studentTask:
      "Replace nondeterministic deduplication with a latest-record window.",
    starterCode: `latest_customers = customer_updates.dropDuplicates(["customer_id"])`,
    solutionCode: `from pyspark.sql import functions as F
from pyspark.sql.window import Window

w = Window.partitionBy("customer_id").orderBy(
    F.col("updated_at").desc(),
    F.col("ingest_sequence").desc()
)

latest_customers = customer_updates \
    .withColumn("rn", F.row_number().over(w)) \
    .filter(F.col("rn") == 1) \
    .drop("rn")`,
    explanation:
      "A latest-record rule must be explicit. Window ordering makes the output deterministic and easier to explain in interviews and production reviews.",
    hints: [
      "Ask how Spark chooses the row when two rows share the same key.",
      "Use a window partitioned by the business key.",
      "Add a tie-breaker if updated_at can be equal."
    ],
    tables: [
      {
        name: "customer_updates",
        columns: ["customer_id", "status", "updated_at", "ingest_sequence"],
        rows: [
          [11, "silver", "2026-05-30 10:00:00", 41],
          [11, "gold", "2026-05-30 11:00:00", 42],
          [12, "active", "2026-05-30 09:00:00", 43]
        ]
      }
    ],
    validationKeywords: ["row_number", "window", "partitionby", "orderby", "desc"],
    commonMistakes: ["Sorting before dropDuplicates and assuming Spark will preserve that order."]
  },
  {
    id: "pyspark-production-008",
    slug: "pyspark-union-column-order-corruption",
    track: "pyspark",
    title: "PySpark 8: union Corrupted Columns",
    difficulty: "beginner",
    section: "Schema safety",
    topicTags: ["PySpark", "Schema Drift", "Data Quality"],
    isFree: false,
    estimatedMinutes: 15,
    businessContext:
      "The app and web event feeds have the same logical columns but in different order. The union ran successfully, yet device values appeared inside the amount column.",
    problemStatement:
      "DataFrame union aligns columns by position, not by name. Different column order can silently corrupt data.",
    expectedOutcome:
      "Use unionByName and allow missing columns only when that behavior is intentional.",
    studentTask:
      "Fix the union so columns are aligned by name and missing fields are handled safely.",
    starterCode: `combined_events = web_events.union(app_events)`,
    solutionCode: `combined_events = web_events.unionByName(
    app_events,
    allowMissingColumns=True
)`,
    explanation:
      "When schemas can drift or columns arrive in different order, unionByName protects column meaning. Add schema checks so drift is visible, not silent.",
    hints: [
      "The code runs, so the bug is semantic corruption, not a syntax error.",
      "Check whether Spark aligns union columns by name or position.",
      "Use allowMissingColumns only after deciding how NULLs should be handled."
    ],
    tables: [
      {
        name: "web_events_columns",
        columns: ["position", "web_events", "app_events"],
        rows: [
          [1, "event_id", "event_id"],
          [2, "amount", "device_type"],
          [3, "device_type", "amount"]
        ]
      }
    ],
    validationKeywords: ["unionbyname", "allowmissingcolumns", "schema", "columns", "null"],
    commonMistakes: ["Using select('*') and assuming both feeds were produced with identical column order."]
  },
  {
    id: "pyspark-production-009",
    slug: "pyspark-null-join-key-skew",
    track: "pyspark",
    title: "PySpark 9: NULL Join Keys Created a Hot Partition",
    difficulty: "intermediate",
    section: "Data quality",
    topicTags: ["PySpark", "Skew", "Data Quality"],
    isFree: false,
    estimatedMinutes: 18,
    businessContext:
      "The fact-to-product join slowed down after a source bug sent many records with NULL product_id.",
    problemStatement:
      "Invalid/default keys can funnel many rows into the same processing path and hide a data quality issue. Treat invalid keys separately instead of forcing them through the normal join.",
    expectedOutcome:
      "Split invalid keys to a quarantine or unknown-member path, and join only valid keys to the dimension.",
    studentTask:
      "Rewrite the flow so NULL/default product keys do not break the main join.",
    starterCode: `facts_with_product = facts.join(products, on="product_id", how="left")`,
    solutionCode: `from pyspark.sql import functions as F

valid_facts = facts.filter(F.col("product_id").isNotNull() & (F.col("product_id") != F.lit("UNKNOWN")))
invalid_facts = facts.exceptAll(valid_facts)

facts_with_product = valid_facts.join(products, on="product_id", how="left")

invalid_facts.write.mode("append").parquet("s3://quality/quarantine/missing_product_id")`,
    explanation:
      "NULL/default keys are both quality and performance signals. Route bad records explicitly so the main join remains predictable and operations can alert on invalid-key spikes.",
    hints: [
      "Do not hide invalid product_id by filling every NULL with the same default too early.",
      "Separate data quality handling from normal dimension enrichment.",
      "The quarantine count should become a monitored metric."
    ],
    tables: [
      {
        name: "fact_key_profile",
        columns: ["product_id", "row_count"],
        rows: [
          ["P-100", 8400],
          ["P-101", 9100],
          [null, 650000],
          ["UNKNOWN", 120000]
        ]
      }
    ],
    validationKeywords: ["isnotnull", "filter", "quarantine", "join", "data quality"],
    commonMistakes: ["Filling all NULL keys with one value and then joining, which can create another hot key."]
  },
  {
    id: "pyspark-production-010",
    slug: "pyspark-explode-row-count-blowup",
    track: "pyspark",
    title: "PySpark 10: Nested Explode Multiplied Rows",
    difficulty: "intermediate",
    section: "Nested data",
    topicTags: ["PySpark", "Explode", "Modeling"],
    isFree: false,
    estimatedMinutes: 20,
    businessContext:
      "A JSON flattening job changed from 2 million orders to 280 million rows after a new nested promotions array was added.",
    problemStatement:
      "Exploding multiple arrays in the same row can multiply row counts. Some nested structures should become child tables rather than one wide fact.",
    expectedOutcome:
      "Calculate the grain, explode only the required array, or model items/promotions as separate child datasets.",
    studentTask:
      "Fix or redesign the flattening code so it does not accidentally multiply items by promotions.",
    starterCode: `flat = orders \
    .withColumn("item", F.explode("items")) \
    .withColumn("promotion", F.explode("promotions"))`,
    solutionCode: `order_items = orders \
    .select("order_id", F.explode_outer("items").alias("item")) \
    .select("order_id", "item.sku", "item.qty")

order_promotions = orders \
    .select("order_id", F.explode_outer("promotions").alias("promotion")) \
    .select("order_id", "promotion.promo_id", "promotion.amount")

# Keep separate child tables unless the business requirement truly needs item x promotion pairs.`,
    explanation:
      "The production fix starts with grain. If items and promotions are independent child arrays, exploding both together creates a Cartesian product inside each order.",
    hints: [
      "For one order with 3 items and 4 promotions, how many rows does the broken code create?",
      "Decide whether the output grain is order-item, order-promotion, or item-promotion.",
      "Child tables often make nested data safer than one flattened mega-table."
    ],
    tables: [
      {
        name: "nested_order_counts",
        columns: ["order_id", "item_count", "promotion_count", "broken_rows"],
        rows: [
          [501, 3, 4, 12],
          [502, 2, 0, 0],
          [503, 1, 2, 2]
        ]
      }
    ],
    validationKeywords: ["explode_outer", "order_items", "order_promotions", "select", "separate"],
    commonMistakes: ["Exploding every array into one table because flat tables feel easier to query."]
  },
  {
    id: "pyspark-production-011",
    slug: "pyspark-timezone-business-date",
    track: "pyspark",
    title: "PySpark 11: UTC Timestamp Broke Business Date",
    difficulty: "intermediate",
    section: "Time",
    topicTags: ["PySpark", "Timezones", "Reporting"],
    isFree: false,
    estimatedMinutes: 18,
    businessContext:
      "India revenue reports are off near midnight because the pipeline uses UTC date instead of Asia/Kolkata business date.",
    problemStatement:
      "Taking to_date directly on a UTC timestamp assigns late-night local events to the wrong business day.",
    expectedOutcome:
      "Convert UTC timestamps to the business timezone before deriving report_date.",
    studentTask:
      "Fix the report date derivation for local business reporting.",
    starterCode: `daily = events.withColumn("report_date", F.to_date("event_ts_utc")) \
    .groupBy("report_date") \
    .agg(F.sum("amount").alias("revenue"))`,
    solutionCode: `daily = events \
    .withColumn("event_ts_local", F.from_utc_timestamp("event_ts_utc", "Asia/Kolkata")) \
    .withColumn("report_date", F.to_date("event_ts_local")) \
    .groupBy("report_date") \
    .agg(F.sum("amount").alias("revenue"))`,
    explanation:
      "Timezone bugs are usually boundary bugs. Convert to the business timezone first, then derive date and aggregate.",
    hints: [
      "Check events between 18:30 and 23:59 UTC for India reporting.",
      "Do not derive local business date from the raw UTC date.",
      "Timezone choice should be a named business rule."
    ],
    tables: [
      {
        name: "events",
        columns: ["event_id", "event_ts_utc", "amount"],
        rows: [
          [1, "2026-05-30 19:10:00", 500],
          [2, "2026-05-30 23:50:00", 700],
          [3, "2026-05-31 03:00:00", 300]
        ]
      }
    ],
    validationKeywords: ["from_utc_timestamp", "asia/kolkata", "to_date", "report_date", "business"],
    commonMistakes: ["Filtering by UTC date and then converting to local date after aggregation."]
  },
  {
    id: "pyspark-production-012",
    slug: "pyspark-schema-drift-json",
    track: "pyspark",
    title: "PySpark 12: JSON Schema Drift Dropped a New Field",
    difficulty: "intermediate",
    section: "Schema drift",
    topicTags: ["PySpark", "Schema Drift", "Ingestion"],
    isFree: false,
    estimatedMinutes: 20,
    businessContext:
      "The mobile app started sending payment_mode, but the bronze-to-silver job silently ignored it because the schema was inferred from older files.",
    problemStatement:
      "Schema inference can be unstable across files and dates. Production ingestion should define contracts and capture unexpected fields.",
    expectedOutcome:
      "Use an explicit schema, add controlled nullable fields, and route corrupt or unknown payloads for review.",
    studentTask:
      "Rewrite the read so schema drift is handled deliberately instead of silently.",
    starterCode: `events = spark.read.json("s3://raw/mobile-events/dt=2026-05-30")
silver = events.select("event_id", "customer_id", "amount")`,
    solutionCode: `from pyspark.sql.types import StructType, StructField, StringType, DoubleType

schema = StructType([
    StructField("event_id", StringType()),
    StructField("customer_id", StringType()),
    StructField("amount", DoubleType()),
    StructField("payment_mode", StringType())
])

events = spark.read \
    .schema(schema) \
    .option("mode", "PERMISSIVE") \
    .json("s3://raw/mobile-events/dt=2026-05-30")

silver = events.select("event_id", "customer_id", "amount", "payment_mode")`,
    explanation:
      "Explicit schemas make data contracts visible. New fields should be added intentionally and monitored, not discovered randomly by inference.",
    hints: [
      "Ask whether schema inference is reading all files or a sample.",
      "A production table should have a contract.",
      "Unknown or corrupt records need observability."
    ],
    tables: [
      {
        name: "raw_event_payloads",
        columns: ["event_id", "payload_has_payment_mode"],
        rows: [
          ["e1", false],
          ["e2", true],
          ["e3", true]
        ]
      }
    ],
    validationKeywords: ["schema", "structtype", "permissive", "select", "payment_mode"],
    commonMistakes: ["Letting every read infer schema and hoping Spark sees the same fields every run."]
  },
  {
    id: "pyspark-production-013",
    slug: "pyspark-broadcast-wrong-side",
    track: "pyspark",
    title: "PySpark 13: Broadcast Hint on the Wrong Table",
    difficulty: "intermediate",
    section: "Joins",
    topicTags: ["PySpark", "Joins", "Performance"],
    isFree: false,
    estimatedMinutes: 16,
    businessContext:
      "A job started failing with executor memory errors after someone forced a broadcast hint on the orders fact table.",
    problemStatement:
      "Broadcast joins are powerful only when the broadcast side is small enough. Broadcasting a large fact can crash executors.",
    expectedOutcome:
      "Broadcast the small dimension table or remove the hint and let Spark choose.",
    studentTask:
      "Fix the join hint and explain when broadcast is safe.",
    starterCode: `from pyspark.sql.functions import broadcast

joined = broadcast(orders).join(products, "product_id", "left")`,
    solutionCode: `from pyspark.sql.functions import broadcast

joined = orders.join(
    broadcast(products),
    on="product_id",
    how="left"
)`,
    explanation:
      "Broadcast the small lookup side so each executor can join locally. Validate table size and avoid forcing hints when stats are stale.",
    hints: [
      "Check which table is fact and which table is dimension.",
      "Broadcast means copying that table to executors.",
      "A hint can override a safer optimizer choice."
    ],
    tables: [
      {
        name: "table_sizes",
        columns: ["table_name", "rows", "approx_gb"],
        rows: [
          ["orders", 900000000, 480],
          ["products", 120000, 0.2]
        ]
      }
    ],
    validationKeywords: ["broadcast", "products", "orders", "product_id", "left"],
    commonMistakes: ["Adding broadcast to whichever DataFrame appears first in the code."]
  },
  {
    id: "pyspark-production-014",
    slug: "pyspark-repartition-by-user-id",
    track: "pyspark",
    title: "PySpark 14: Partitioning by user_id Exploded Metadata",
    difficulty: "intermediate",
    section: "Partitioning",
    topicTags: ["PySpark", "Lakehouse", "Partitions"],
    isFree: false,
    estimatedMinutes: 18,
    businessContext:
      "A silver events table has millions of tiny folders because it was partitioned by user_id. Listing files is now slower than reading data.",
    problemStatement:
      "High-cardinality partition columns create too many physical partitions and metadata overhead.",
    expectedOutcome:
      "Partition by a low-cardinality query filter such as event_date and optionally cluster/sort within files.",
    studentTask:
      "Fix the write layout for a production event lake table.",
    starterCode: `events.write \
  .mode("append") \
  .partitionBy("user_id") \
  .parquet("s3://lake/silver/events")`,
    solutionCode: `events.repartition("event_date").write \
  .mode("append") \
  .partitionBy("event_date") \
  .option("maxRecordsPerFile", 500000) \
  .parquet("s3://lake/silver/events")

# If supported by the table format, cluster or sort by user_id inside files.`,
    explanation:
      "Physical partitions should match common pruning filters and stay manageable. user_id is usually better as a clustering/sorting key than a folder partition.",
    hints: [
      "Count distinct values before choosing a partition column.",
      "A folder per user is rarely a good lake layout.",
      "Partition for pruning; cluster or sort for secondary access patterns."
    ],
    tables: [
      {
        name: "partition_candidates",
        columns: ["column_name", "distinct_values", "common_filter"],
        rows: [
          ["event_date", 90, true],
          ["country", 18, false],
          ["user_id", 24000000, true]
        ]
      }
    ],
    validationKeywords: ["partitionby", "event_date", "repartition", "maxrecordsperfile", "cluster"],
    commonMistakes: ["Picking the column users search by without considering distinct count and file layout."]
  },
  {
    id: "pyspark-production-015",
    slug: "pyspark-late-arriving-partition-overwrite",
    track: "pyspark",
    title: "PySpark 15: Late Events Were Ignored After Daily Partition Closed",
    difficulty: "advanced",
    section: "Late data",
    topicTags: ["PySpark", "Watermarking", "Backfills"],
    isFree: false,
    estimatedMinutes: 22,
    businessContext:
      "Orders can arrive two days late from a partner API. The job only rewrites today, so yesterday's revenue remains wrong.",
    problemStatement:
      "Late-arriving facts require rewriting an affected window, not only the current processing date.",
    expectedOutcome:
      "Identify affected order_date partitions from input and overwrite only those partitions.",
    studentTask:
      "Update the batch strategy so late arrivals repair previous business dates safely.",
    starterCode: `today_orders = raw_orders.filter(F.col("ingest_date") == run_date)

daily = today_orders.groupBy("order_date").agg(F.sum("amount").alias("revenue"))

daily.write.mode("overwrite").partitionBy("order_date").parquet(gold_path)`,
    solutionCode: `affected_dates = [r.order_date for r in raw_orders
    .filter(F.col("ingest_date") == run_date)
    .select("order_date")
    .distinct()
    .collect()]

window_orders = raw_orders.filter(F.col("order_date").isin(affected_dates))

daily = window_orders.groupBy("order_date").agg(F.sum("amount").alias("revenue"))

spark.conf.set("spark.sql.sources.partitionOverwriteMode", "dynamic")
daily.write.mode("overwrite").partitionBy("order_date").parquet(gold_path)`,
    explanation:
      "Late data changes old business partitions. Recompute the affected partitions and use dynamic partition overwrite or a table-format merge.",
    hints: [
      "The processing date and business date are not always the same.",
      "Find which order_date values are affected by today's input.",
      "Overwrite only those partitions, not the whole table."
    ],
    tables: [
      {
        name: "incoming_orders",
        columns: ["order_id", "order_date", "ingest_date", "amount"],
        rows: [
          [901, "2026-05-29", "2026-05-31", 300],
          [902, "2026-05-31", "2026-05-31", 700],
          [903, "2026-05-30", "2026-05-31", 200]
        ]
      }
    ],
    validationKeywords: ["affected_dates", "distinct", "order_date", "dynamic", "overwrite"],
    commonMistakes: ["Filtering only on ingest_date and assuming it is the same as the revenue date."]
  },
  {
    id: "pyspark-production-016",
    slug: "pyspark-watermark-too-tight",
    track: "pyspark",
    title: "PySpark 16: Tight Watermark Dropped Valid Events",
    difficulty: "advanced",
    section: "Streaming",
    topicTags: ["PySpark", "Streaming", "Watermarking"],
    isFree: false,
    estimatedMinutes: 22,
    businessContext:
      "A streaming revenue job misses orders from a mobile network that can be delayed by 45 minutes, but the watermark is only 10 minutes.",
    problemStatement:
      "Watermarks bound state size but also define how late data can arrive before being dropped from stateful aggregation.",
    expectedOutcome:
      "Set the watermark based on observed lateness SLA and route too-late events to a side path for reconciliation.",
    studentTask:
      "Adjust the streaming logic and explain how to monitor late-event drops.",
    starterCode: `agg = events.withWatermark("event_time", "10 minutes") \
    .groupBy(F.window("event_time", "1 hour"), "country") \
    .agg(F.sum("amount").alias("revenue"))`,
    solutionCode: `agg = events.withWatermark("event_time", "2 hours") \
    .groupBy(F.window("event_time", "1 hour"), "country") \
    .agg(F.sum("amount").alias("revenue"))

# Track late records and reconcile them through a late-event repair path.
# Monitor watermark delay, dropped rows, and source-specific lateness percentiles.`,
    explanation:
      "A watermark is a business decision, not just a Spark setting. Pick it using lateness distribution and downstream freshness requirements.",
    hints: [
      "Compare the watermark to the real source lateness distribution.",
      "A longer watermark increases state size.",
      "Too-late events still need observability or reconciliation."
    ],
    tables: [
      {
        name: "source_lateness",
        columns: ["source", "p95_delay_minutes", "max_delay_minutes"],
        rows: [
          ["web", 4, 12],
          ["mobile", 38, 71],
          ["partner", 55, 118]
        ]
      }
    ],
    validationKeywords: ["withwatermark", "2 hours", "late", "monitor", "reconcile"],
    commonMistakes: ["Increasing the watermark without considering state growth and checkpoint pressure."]
  },
  {
    id: "pyspark-production-017",
    slug: "pyspark-count-distinct-expensive",
    track: "pyspark",
    title: "PySpark 17: Exact Distinct Count Broke the SLA",
    difficulty: "intermediate",
    section: "Aggregations",
    topicTags: ["PySpark", "Aggregations", "Performance"],
    isFree: false,
    estimatedMinutes: 16,
    businessContext:
      "A dashboard needs daily unique visitors within five minutes, but exact countDistinct now takes 45 minutes on peak traffic.",
    problemStatement:
      "Exact distinct counts are expensive at high cardinality. Some reporting use cases can use approximate distinct with an agreed error tolerance.",
    expectedOutcome:
      "Use approx_count_distinct where business tolerance allows, or pre-aggregate exact results for critical finance metrics.",
    studentTask:
      "Rewrite the metric to meet the SLA and explain the accuracy trade-off.",
    starterCode: `daily_visitors = events.groupBy("event_date").agg(
    F.countDistinct("visitor_id").alias("unique_visitors")
)`,
    solutionCode: `daily_visitors = events.groupBy("event_date").agg(
    F.approx_count_distinct("visitor_id", rsd=0.02).alias("unique_visitors")
)

# Document the 2 percent relative standard deviation and keep exact counts for use cases that require audit accuracy.`,
    explanation:
      "Approximate distinct is a product and SLA decision. It is often acceptable for engagement analytics but not for audited financial reporting.",
    hints: [
      "Ask whether the metric is approximate analytics or audited finance.",
      "The output is faster because Spark tracks sketches instead of all ids exactly.",
      "Always document the error tolerance."
    ],
    tables: [
      {
        name: "metric_sla",
        columns: ["metric", "required_latency_minutes", "tolerance"],
        rows: [
          ["daily_unique_visitors", 5, "2 percent ok"],
          ["paid_invoice_count", 60, "exact required"]
        ]
      }
    ],
    validationKeywords: ["approx_count_distinct", "rsd", "tolerance", "sla", "countdistinct"],
    commonMistakes: ["Switching audited metrics to approximate counts without business approval."]
  },
  {
    id: "pyspark-production-018",
    slug: "pyspark-case-sensitive-status",
    track: "pyspark",
    title: "PySpark 18: New SUCCESSFUL Status Dropped Revenue",
    difficulty: "beginner",
    section: "Data quality",
    topicTags: ["PySpark", "Data Quality", "Business Rules"],
    isFree: false,
    estimatedMinutes: 15,
    businessContext:
      "Revenue dropped 30 percent after a partner changed status from SUCCESS to SUCCESSFUL. The job still technically succeeded.",
    problemStatement:
      "Hard-coded status filters are brittle. Production pipelines need normalized status mapping and unknown-value monitoring.",
    expectedOutcome:
      "Normalize status, map accepted success values, and quarantine or report unknown statuses.",
    studentTask:
      "Fix the filter so it handles the new status safely without accepting every value.",
    starterCode: `paid_orders = orders.filter(F.col("payment_status") == "SUCCESS")`,
    solutionCode: `from pyspark.sql import functions as F

normalized = orders.withColumn("status_norm", F.upper(F.trim("payment_status")))

paid_orders = normalized.filter(F.col("status_norm").isin("SUCCESS", "SUCCESSFUL", "PAID"))
unknown_statuses = normalized.filter(~F.col("status_norm").isin("SUCCESS", "SUCCESSFUL", "PAID", "FAILED", "CANCELLED"))

unknown_statuses.write.mode("append").parquet("s3://quality/unknown_payment_status")`,
    explanation:
      "A status mapping table or controlled list makes the business rule explicit. Unknown statuses should trigger data quality alerts.",
    hints: [
      "Normalize case and whitespace before comparing.",
      "Do not simply remove the filter.",
      "Unknown values are production signals."
    ],
    tables: [
      {
        name: "orders",
        columns: ["order_id", "payment_status", "amount"],
        rows: [
          [1, "SUCCESS", 1000],
          [2, "SUCCESSFUL", 500],
          [3, " success ", 250],
          [4, "FAILED", 700]
        ]
      }
    ],
    validationKeywords: ["upper", "trim", "isin", "successful", "unknown"],
    commonMistakes: ["Adding SUCCESSFUL but still missing lowercase or whitespace variants."]
  },
  {
    id: "pyspark-production-019",
    slug: "pyspark-missing-corrupt-records",
    track: "pyspark",
    title: "PySpark 19: Bad CSV Rows Disappeared",
    difficulty: "intermediate",
    section: "Ingestion quality",
    topicTags: ["PySpark", "Ingestion", "Data Quality"],
    isFree: false,
    estimatedMinutes: 18,
    businessContext:
      "A vendor file had malformed rows. The pipeline completed, but finance found missing transactions because bad records were not visible.",
    problemStatement:
      "File readers need explicit corrupt-record handling so malformed input is counted, quarantined, and replayable.",
    expectedOutcome:
      "Read in permissive mode with a corrupt record column, separate valid and invalid rows, and alert on invalid counts.",
    studentTask:
      "Update the ingestion so malformed records do not silently disappear.",
    starterCode: `txns = spark.read.option("header", True).csv("s3://vendor/transactions/2026-05-30.csv")

valid_txns = txns.filter("transaction_id is not null")`,
    solutionCode: `schema = "transaction_id string, customer_id string, amount double, txn_date string, _corrupt_record string"

txns = spark.read \
    .option("header", True) \
    .option("mode", "PERMISSIVE") \
    .option("columnNameOfCorruptRecord", "_corrupt_record") \
    .schema(schema) \
    .csv("s3://vendor/transactions/2026-05-30.csv")

valid_txns = txns.filter(F.col("_corrupt_record").isNull())
bad_txns = txns.filter(F.col("_corrupt_record").isNotNull())

bad_txns.write.mode("append").parquet("s3://quality/vendor_transaction_corrupt")`,
    explanation:
      "Bad rows are not just technical noise. They need counts, samples, alerts, and a replay path so data owners can fix the upstream file.",
    hints: [
      "Look for mode and corrupt-record options on the reader.",
      "Valid and invalid rows should be separated deliberately.",
      "The invalid count should be visible in monitoring."
    ],
    tables: [
      {
        name: "vendor_file_profile",
        columns: ["file_name", "row_count", "malformed_rows"],
        rows: [
          ["transactions_20260529.csv", 12000, 0],
          ["transactions_20260530.csv", 11890, 37]
        ]
      }
    ],
    validationKeywords: ["permissive", "corrupt_record", "schema", "isnotnull", "quarantine"],
    commonMistakes: ["Using DROPMALFORMED because it makes the job green while hiding missing data."]
  },
  {
    id: "pyspark-production-020",
    slug: "pyspark-writing-single-file",
    track: "pyspark",
    title: "PySpark 20: coalesce(1) Bottlenecked the Export",
    difficulty: "beginner",
    section: "Writes",
    topicTags: ["PySpark", "Files", "Performance"],
    isFree: false,
    estimatedMinutes: 15,
    businessContext:
      "An export job uses coalesce(1) because the downstream team asked for one file. It now runs for hours and sometimes fails.",
    problemStatement:
      "coalesce(1) forces output through one task. Production exports should stay distributed unless the file is truly tiny.",
    expectedOutcome:
      "Write distributed files with a naming/manifest contract, or create a small final file only for small bounded outputs.",
    studentTask:
      "Fix the export approach so it scales while still giving downstream a reliable handoff.",
    starterCode: `daily_export.coalesce(1).write \
    .mode("overwrite") \
    .option("header", True) \
    .csv("s3://exports/orders_daily")`,
    solutionCode: `daily_export.repartition(24).write \
    .mode("overwrite") \
    .option("header", True) \
    .option("maxRecordsPerFile", 500000) \
    .csv("s3://exports/orders_daily/run_date=2026-05-30")

# Publish a manifest file with the output paths instead of forcing one giant file.`,
    explanation:
      "One output file is a downstream convenience that can destroy Spark parallelism. Prefer multiple files plus a manifest or a controlled post-processing step for genuinely small exports.",
    hints: [
      "coalesce(1) means one writer task.",
      "Ask if the downstream system can read a folder or manifest.",
      "Target file size is more important than forcing one file."
    ],
    tables: [
      {
        name: "export_volume",
        columns: ["run_date", "rows", "size_gb"],
        rows: [
          ["2026-05-28", 8000000, 18],
          ["2026-05-29", 9500000, 22],
          ["2026-05-30", 12000000, 27]
        ]
      }
    ],
    validationKeywords: ["repartition", "maxrecordsperfile", "manifest", "csv", "write"],
    commonMistakes: ["Using coalesce(1) for every export because one file is easier to download manually."]
  }
];
