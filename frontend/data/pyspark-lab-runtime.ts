type ExpectedOutputTable = {
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
};

type PysparkLabRuntimeOverride = {
  studentTask?: string;
  starterCode?: string;
  solutionCode?: string;
  expectedOutputTable?: ExpectedOutputTable;
};

export const PYSPARK_LAB_RUNTIME_OVERRIDES: Record<string, PysparkLabRuntimeOverride> = {
  "pyspark-append-rerun-duplicates": {
    studentTask:
      "Fix the rerun-safe transformation and assign the final deduplicated daily dataset to result_df. Use the seeded orders DataFrame provided by the lab runner.",
    starterCode: `from pyspark.sql import functions as F

# orders is already available in the runner.
# Return the cleaned dataset as result_df.

result_df = orders`,
    solutionCode: `from pyspark.sql import functions as F

result_df = orders.dropDuplicates(["order_id"])`,
    expectedOutputTable: {
      columns: ["order_id", "order_date", "amount"],
      rows: [
        [101, "2026-05-30", 599],
        [102, "2026-05-30", 1299]
      ]
    }
  },
  "pyspark-python-udf-slow-normalization": {
    studentTask:
      "Rewrite the cleanup using Spark built-ins and return customer_id with the cleaned email in result_df.",
    starterCode: `from pyspark.sql import functions as F

# customers is already available in the runner.
# Create result_df with customer_id and email_clean.

result_df = customers`,
    solutionCode: `from pyspark.sql import functions as F

result_df = customers.select(
    "customer_id",
    F.lower(F.regexp_replace(F.trim(F.col("email")), " ", "")).alias("email_clean")
)`,
    expectedOutputTable: {
      columns: ["customer_id", "email_clean"],
      rows: [
        [1, "asha@example.com"],
        [2, "benkumar@example.com"],
        [3, null]
      ]
    }
  },
  "pyspark-skewed-customer-join": {
    studentTask:
      "Join the seeded orders and customers DataFrames, assign the joined output to result_df, and make the code production-safe for a skewed hot key.",
    starterCode: `from pyspark.sql import functions as F

# orders and customers are already available in the runner.
# Fix the join and return the enriched rows as result_df.

result_df = orders.join(customers, on="customer_id", how="left")`,
    solutionCode: `from pyspark.sql import functions as F
from pyspark.sql.functions import broadcast

result_df = orders.join(
    broadcast(customers),
    on="customer_id",
    how="left"
)`,
    expectedOutputTable: {
      columns: ["order_id", "customer_id", "segment", "amount"],
      rows: [
        [501, 1001, "mid_market", 120.0],
        [502, 1002, "enterprise", 240.0],
        [503, 9999, "marketplace", 90.0]
      ]
    }
  },
  "pyspark-small-files-hourly-writes": {
    studentTask:
      "Prepare the hourly_orders DataFrame for a healthier write layout. Assign the transformed DataFrame to result_df and include the write-strategy choices in code comments.",
    starterCode: `# hourly_orders is already available in the runner.
# Prepare result_df for a safer daily write layout.

result_df = hourly_orders`,
    solutionCode: `result_df = hourly_orders.repartition("order_date")

# Production write plan:
# .partitionBy("order_date")
# .option("maxRecordsPerFile", 500000)
# compact older small files per order_date`,
  },
  "pyspark-cache-everything-memory-pressure": {
    studentTask:
      "Keep only the reusable enriched DataFrame cached, release it after use, and return the enriched reusable dataset as result_df.",
    starterCode: `from pyspark.sql import functions as F

# raw and dim_customers are already available in the runner.

raw_cached = raw.cache()
clean = raw_cached.filter(F.col("status") == "SUCCESS")
result_df = clean.join(dim_customers, "customer_id").cache()`,
    solutionCode: `from pyspark.sql import functions as F

clean = raw.filter(F.col("status") == "SUCCESS")

result_df = clean.join(dim_customers, "customer_id").cache()
result_df.count()

# Downstream actions would use result_df more than once.
result_df.unpersist()`,
    expectedOutputTable: {
      columns: ["customer_id", "customer_name", "order_date", "amount"],
      rows: [
        [101, "Asha", "2026-05-30", 400.0],
        [102, "Ben", "2026-05-30", 250.0]
      ]
    }
  },
  "pyspark-driver-collect-oom": {
    studentTask:
      "Keep the filter distributed, avoid driver collection, and assign the filtered VIP orders to result_df.",
    starterCode: `from pyspark.sql import functions as F

# vip_customers and orders are already available in the runner.

result_df = orders`,
    solutionCode: `from pyspark.sql.functions import broadcast

result_df = orders.join(
    broadcast(vip_customers.select("customer_id").dropDuplicates()),
    on="customer_id",
    how="inner"
)`,
    expectedOutputTable: {
      columns: ["order_id", "customer_id", "amount"],
      rows: [
        [7001, 101, 900.0],
        [7003, 103, 250.0]
      ]
    }
  },
  "pyspark-window-dedup-latest-record": {
    studentTask:
      "Keep only the latest version per customer_id and assign the final DataFrame to result_df.",
    starterCode: `from pyspark.sql import functions as F
from pyspark.sql.window import Window

# customer_updates is already available in the runner.

result_df = customer_updates.dropDuplicates(["customer_id"])`,
    solutionCode: `from pyspark.sql import functions as F
from pyspark.sql.window import Window

w = Window.partitionBy("customer_id").orderBy(
    F.col("updated_at").desc(),
    F.col("ingest_sequence").desc()
)

result_df = customer_updates.withColumn("rn", F.row_number().over(w)) \
    .filter(F.col("rn") == 1) \
    .drop("rn")`,
    expectedOutputTable: {
      columns: ["customer_id", "status", "updated_at", "ingest_sequence"],
      rows: [
        [11, "gold", "2026-05-30 11:00:00", 42],
        [12, "active", "2026-05-30 09:00:00", 43]
      ]
    }
  },
  "pyspark-union-column-order-corruption": {
    studentTask:
      "Safely union the two seeded event DataFrames by column name and assign the final combined DataFrame to result_df.",
    starterCode: `# web_events and app_events are already available in the runner.

result_df = web_events.union(app_events)`,
    solutionCode: `result_df = web_events.unionByName(
    app_events,
    allowMissingColumns=True
)`,
    expectedOutputTable: {
      columns: ["event_id", "amount", "device_type"],
      rows: [
        ["w1", 120.0, "web"],
        ["w2", 80.0, "web"],
        ["a1", 200.0, "ios"],
        ["a2", 60.0, "android"]
      ]
    }
  },
  "pyspark-null-join-key-skew": {
    studentTask:
      "Join only valid facts to products, route invalid keys away from the main join, and assign the enriched valid dataset to result_df.",
    starterCode: `from pyspark.sql import functions as F

# facts and products are already available in the runner.

result_df = facts.join(products, on="product_id", how="left")`,
    solutionCode: `from pyspark.sql import functions as F

valid_facts = facts.filter(
    F.col("product_id").isNotNull() & (F.col("product_id") != F.lit("UNKNOWN"))
)

invalid_facts = facts.filter(
    F.col("product_id").isNull() | (F.col("product_id") == F.lit("UNKNOWN"))
)

result_df = valid_facts.join(products, on="product_id", how="left")`,
    expectedOutputTable: {
      columns: ["fact_id", "product_id", "product_name", "amount"],
      rows: [
        [1, "P-100", "Phone", 500.0],
        [2, "P-101", "Laptop Bag", 300.0]
      ]
    }
  },
  "pyspark-explode-row-count-blowup": {
    studentTask:
      "Create the order-item grain safely from the seeded nested orders DataFrame and assign it to result_df.",
    starterCode: `from pyspark.sql import functions as F

# orders is already available in the runner.

result_df = orders \
    .withColumn("item", F.explode("items")) \
    .withColumn("promotion", F.explode("promotions"))`,
    solutionCode: `from pyspark.sql import functions as F

result_df = orders.select(
    "order_id",
    F.explode_outer("items").alias("item")
).select(
    "order_id",
    F.col("item.sku").alias("sku"),
    F.col("item.qty").alias("qty")
)

order_promotions = orders.select(
    "order_id",
    F.explode_outer("promotions").alias("promotion")
).select(
    "order_id",
    F.col("promotion.promo_id").alias("promo_id"),
    F.col("promotion.amount").alias("promo_amount")
)`,
    expectedOutputTable: {
      columns: ["order_id", "sku", "qty"],
      rows: [
        [501, "SKU-1", 1],
        [501, "SKU-2", 2],
        [502, "SKU-9", 1]
      ]
    }
  },
  "pyspark-timezone-business-date": {
    studentTask:
      "Convert event_ts_utc to the business timezone, aggregate daily revenue, and assign the final DataFrame to result_df.",
    starterCode: `from pyspark.sql import functions as F

# events is already available in the runner.

result_df = events.withColumn("report_date", F.to_date("event_ts_utc")) \
    .groupBy("report_date") \
    .agg(F.sum("amount").alias("revenue"))`,
    solutionCode: `from pyspark.sql import functions as F

result_df = events \
    .withColumn("event_ts_local", F.from_utc_timestamp("event_ts_utc", "Asia/Kolkata")) \
    .withColumn("report_date", F.to_date("event_ts_local")) \
    .groupBy("report_date") \
    .agg(F.sum("amount").alias("revenue"))`,
    expectedOutputTable: {
      columns: ["report_date", "revenue"],
      rows: [
        ["2026-05-31", 1500.0]
      ]
    }
  },
  "pyspark-schema-drift-json": {
    studentTask:
      "Handle the seeded raw_events payload safely, include payment_mode in the silver output, and assign the final DataFrame to result_df.",
    starterCode: `# raw_events is already available in the runner.

result_df = raw_events.select("event_id", "customer_id", "amount")`,
    solutionCode: `# In production, enforce an explicit schema contract on the raw read.
# For this practice runner, keep the new field in the curated output.

result_df = raw_events.select(
    "event_id",
    "customer_id",
    "amount",
    "payment_mode"
)`,
    expectedOutputTable: {
      columns: ["event_id", "customer_id", "amount", "payment_mode"],
      rows: [
        ["e1", "c1", 100.0, null],
        ["e2", "c2", 250.0, "UPI"],
        ["e3", "c3", 90.0, "CARD"]
      ]
    }
  },
  "pyspark-broadcast-wrong-side": {
    studentTask:
      "Fix the join hint safely and assign the enriched order-product dataset to result_df.",
    starterCode: `from pyspark.sql.functions import broadcast

# orders and products are already available in the runner.

result_df = broadcast(orders).join(products, "product_id", "left")`,
    solutionCode: `from pyspark.sql.functions import broadcast

result_df = orders.join(
    broadcast(products),
    on="product_id",
    how="left"
)`,
    expectedOutputTable: {
      columns: ["order_id", "product_id", "product_name", "amount"],
      rows: [
        [1, "P-100", "Phone", 500.0],
        [2, "P-101", "Bag", 120.0]
      ]
    }
  },
  "pyspark-repartition-by-user-id": {
    studentTask:
      "Prepare the seeded events DataFrame for a healthier lake layout. Assign the output DataFrame to result_df and include the intended write layout in code comments.",
    starterCode: `# events is already available in the runner.

result_df = events`,
    solutionCode: `result_df = events.repartition("event_date")

# Production write plan:
# .partitionBy("event_date")
# .option("maxRecordsPerFile", 500000)
# cluster or sort by user_id inside files if the table format supports it`,
  },
  "pyspark-late-arriving-partition-overwrite": {
    studentTask:
      "Recompute the affected business dates from the seeded raw_orders DataFrame and assign the repaired aggregate to result_df.",
    starterCode: `from pyspark.sql import functions as F

# raw_orders and run_date are already available in the runner.

today_orders = raw_orders.filter(F.col("ingest_date") == F.lit(run_date))

result_df = today_orders.groupBy("order_date").agg(F.sum("amount").alias("revenue"))`,
    solutionCode: `from pyspark.sql import functions as F

affected_dates = [r.order_date for r in raw_orders
    .filter(F.col("ingest_date") == F.lit(run_date))
    .select("order_date")
    .distinct()
    .collect()]

window_orders = raw_orders.filter(F.col("order_date").isin(affected_dates))

result_df = window_orders.groupBy("order_date").agg(
    F.sum("amount").alias("revenue")
)`,
    expectedOutputTable: {
      columns: ["order_date", "revenue"],
      rows: [
        ["2026-05-29", 300.0],
        ["2026-05-30", 200.0],
        ["2026-05-31", 700.0]
      ]
    }
  },
  "pyspark-watermark-too-tight": {
    studentTask:
      "Use a safer watermark, aggregate the seeded streaming-style events, flatten the output, and assign the final DataFrame to result_df.",
    starterCode: `from pyspark.sql import functions as F

# events is already available in the runner.

agg = events.withWatermark("event_time", "10 minutes") \
    .groupBy(F.window("event_time", "1 hour"), "country") \
    .agg(F.sum("amount").alias("revenue"))

result_df = agg.select(
    F.col("window.start").cast("string").alias("window_start"),
    F.col("window.end").cast("string").alias("window_end"),
    "country",
    "revenue"
)`,
    solutionCode: `from pyspark.sql import functions as F

agg = events.withWatermark("event_time", "2 hours") \
    .groupBy(F.window("event_time", "1 hour"), "country") \
    .agg(F.sum("amount").alias("revenue"))

result_df = agg.select(
    F.col("window.start").cast("string").alias("window_start"),
    F.col("window.end").cast("string").alias("window_end"),
    "country",
    "revenue"
)`,
    expectedOutputTable: {
      columns: ["window_start", "window_end", "country", "revenue"],
      rows: [
        ["2026-05-30 10:00:00", "2026-05-30 11:00:00", "IN", 220.0],
        ["2026-05-30 11:00:00", "2026-05-30 12:00:00", "IN", 80.0]
      ]
    }
  },
  "pyspark-count-distinct-expensive": {
    studentTask:
      "Meet the SLA by rewriting the distinct visitor metric and assign the daily output DataFrame to result_df.",
    starterCode: `from pyspark.sql import functions as F

# events is already available in the runner.

result_df = events.groupBy("event_date").agg(
    F.countDistinct("visitor_id").alias("unique_visitors")
)`,
    solutionCode: `from pyspark.sql import functions as F

result_df = events.groupBy("event_date").agg(
    F.approx_count_distinct("visitor_id", rsd=0.02).alias("unique_visitors")
)`,
    expectedOutputTable: {
      columns: ["event_date", "unique_visitors"],
      rows: [
        ["2026-05-30", 3]
      ]
    }
  },
  "pyspark-case-sensitive-status": {
    studentTask:
      "Normalize payment_status safely, keep only accepted paid rows, and assign the final DataFrame to result_df.",
    starterCode: `from pyspark.sql import functions as F

# orders is already available in the runner.

result_df = orders.filter(F.col("payment_status") == "SUCCESS")`,
    solutionCode: `from pyspark.sql import functions as F

normalized = orders.withColumn("status_norm", F.upper(F.trim("payment_status")))

result_df = normalized.filter(
    F.col("status_norm").isin("SUCCESS", "SUCCESSFUL", "PAID")
)`,
    expectedOutputTable: {
      columns: ["order_id", "payment_status", "amount"],
      rows: [
        [1, "SUCCESS", 1000.0],
        [2, "SUCCESSFUL", 500.0],
        [3, " success ", 250.0]
      ]
    }
  },
  "pyspark-missing-corrupt-records": {
    studentTask:
      "Separate valid and corrupt seeded transaction rows safely, and assign the valid curated dataset to result_df.",
    starterCode: `from pyspark.sql import functions as F

# txns_raw is already available in the runner.

result_df = txns_raw.filter(F.col("transaction_id").isNotNull())`,
    solutionCode: `from pyspark.sql import functions as F

valid_txns = txns_raw.filter(F.col("_corrupt_record").isNull())
bad_txns = txns_raw.filter(F.col("_corrupt_record").isNotNull())

result_df = valid_txns.select("transaction_id", "customer_id", "amount", "txn_date")`,
    expectedOutputTable: {
      columns: ["transaction_id", "customer_id", "amount", "txn_date"],
      rows: [
        ["t1", "c1", 100.0, "2026-05-30"],
        ["t2", "c2", 250.0, "2026-05-30"]
      ]
    }
  },
  "pyspark-writing-single-file": {
    studentTask:
      "Keep the export scalable. Assign the distributed export DataFrame to result_df and include the file-handoff strategy in code comments.",
    starterCode: `# daily_export is already available in the runner.

result_df = daily_export.coalesce(1)`,
    solutionCode: `result_df = daily_export.repartition(24)

# Production write plan:
# .option("maxRecordsPerFile", 500000)
# publish a manifest for downstream consumers instead of forcing one giant file`,
  }
};

export type { ExpectedOutputTable as PysparkExpectedOutputTable };
