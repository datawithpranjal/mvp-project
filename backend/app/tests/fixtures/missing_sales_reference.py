from pyspark.sql import functions as F


def transform(raw_sales, run_date):
    # Runner precondition: session timezone UTC; replayed orders have identical
    # business payloads. Conflicting order revisions need another contract.
    return (
        raw_sales.withColumn("business_date", F.to_date("sale_ts_utc"))
        .filter(F.col("business_date") == F.to_date(F.lit(run_date)))
        .filter(F.col("status") == "PAID")
        .dropDuplicates(["order_id"])
        .groupBy("business_date")
        .agg(
            F.countDistinct("order_id").alias("order_count"),
            F.sum(F.col("amount").cast("decimal(18,2)"))
            .cast("decimal(20,2)").alias("gross_sales"),
        )
    )


def alternative(raw_sales, run_date):
    # Full business-payload DISTINCT is valid under the same replay contract.
    unique_paid = (
        raw_sales.withColumn("business_date", F.to_date("sale_ts_utc"))
        .filter(F.col("business_date") == F.to_date(F.lit(run_date)))
        .filter(F.col("status") == "PAID")
        .select("order_id", "business_date", F.col("amount").cast("decimal(18,2)").alias("amount"))
        .distinct()
    )
    return unique_paid.groupBy("business_date").agg(
        F.count("order_id").alias("order_count"),
        F.sum("amount").cast("decimal(20,2)").alias("gross_sales"),
    )
