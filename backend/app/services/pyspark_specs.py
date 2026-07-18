from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

PysparkMode = Literal["sample", "hidden"]


@dataclass(frozen=True)
class PysparkCodeCheck:
    name: str
    needle: str
    message: str
    should_contain: bool = True
    modes: tuple[PysparkMode, ...] = ("sample", "hidden")


@dataclass(frozen=True)
class PysparkInputTable:
    name: str
    rows: list[dict[str, Any]]
    timestamp_columns: tuple[str, ...] = ()


@dataclass(frozen=True)
class PysparkCase:
    name: str
    inputs: tuple[PysparkInputTable, ...] = ()
    context: dict[str, Any] = field(default_factory=dict)
    expected_rows: list[list[Any]] | None = None


@dataclass(frozen=True)
class PysparkSpec:
    slug: str
    output_columns: tuple[str, ...] = ()
    output_variable_names: tuple[str, ...] = ("result_df",)
    sample_cases: tuple[PysparkCase, ...] = ()
    hidden_cases: tuple[PysparkCase, ...] = ()
    code_checks: tuple[PysparkCodeCheck, ...] = ()


def code_check(
    name: str,
    needle: str,
    message: str,
    *,
    should_contain: bool = True,
    modes: tuple[PysparkMode, ...] = ("sample", "hidden"),
) -> PysparkCodeCheck:
    return PysparkCodeCheck(
        name=name,
        needle="".join(needle.lower().split()),
        message=message,
        should_contain=should_contain,
        modes=modes,
    )


def input_table(
    name: str,
    rows: list[dict[str, Any]],
    *,
    timestamp_columns: tuple[str, ...] = (),
) -> PysparkInputTable:
    return PysparkInputTable(name=name, rows=rows, timestamp_columns=timestamp_columns)


PYSPARK_LAB_SPECS: dict[str, PysparkSpec] = {
    "pyspark-append-rerun-duplicates": PysparkSpec(
        slug="pyspark-append-rerun-duplicates",
        output_columns=("order_id", "order_date", "amount"),
        sample_cases=(
            PysparkCase(
                name="visible duplicate rerun rows",
                inputs=(
                    input_table(
                        "orders",
                        [
                            {"order_id": 101, "order_date": "2026-05-30", "amount": 599.0, "ingest_run_id": "run_17"},
                            {"order_id": 102, "order_date": "2026-05-30", "amount": 1299.0, "ingest_run_id": "run_17"},
                            {"order_id": 101, "order_date": "2026-05-30", "amount": 599.0, "ingest_run_id": "run_retry_17"},
                        ],
                    ),
                ),
                expected_rows=[
                    [101, "2026-05-30", 599.0],
                    [102, "2026-05-30", 1299.0],
                ],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden multiple retries still keep one row per order",
                inputs=(
                    input_table(
                        "orders",
                        [
                            {"order_id": 201, "order_date": "2026-06-01", "amount": 50.0, "ingest_run_id": "run_a"},
                            {"order_id": 201, "order_date": "2026-06-01", "amount": 50.0, "ingest_run_id": "run_b"},
                            {"order_id": 201, "order_date": "2026-06-01", "amount": 50.0, "ingest_run_id": "run_c"},
                            {"order_id": 202, "order_date": "2026-06-01", "amount": 75.0, "ingest_run_id": "run_c"},
                        ],
                    ),
                ),
                expected_rows=[
                    [201, "2026-06-01", 50.0],
                    [202, "2026-06-01", 75.0],
                ],
            ),
        ),
        code_checks=(
            code_check("deduplicate business key", "dropDuplicates(", "Use dropDuplicates so reruns do not keep repeated order rows."),
        ),
    ),
    "pyspark-python-udf-slow-normalization": PysparkSpec(
        slug="pyspark-python-udf-slow-normalization",
        output_columns=("customer_id", "email_clean"),
        sample_cases=(
            PysparkCase(
                name="visible sample cleanup",
                inputs=(
                    input_table(
                        "customers",
                        [
                            {"customer_id": 1, "email": " Asha@Example.COM "},
                            {"customer_id": 2, "email": "ben kumar@example.com"},
                            {"customer_id": 3, "email": None},
                        ],
                    ),
                ),
                expected_rows=[[1, "asha@example.com"], [2, "benkumar@example.com"], [3, None]],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden lowercase whitespace normalization",
                inputs=(
                    input_table(
                        "customers",
                        [
                            {"customer_id": 11, "email": "   DATA.Team@Example.com "},
                            {"customer_id": 12, "email": "ops team@example.com"},
                        ],
                    ),
                ),
                expected_rows=[[11, "data.team@example.com"], [12, "opsteam@example.com"]],
            ),
        ),
        code_checks=(
            code_check("use built-ins", "regexp_replace(", "Use Spark built-ins instead of a row-wise Python UDF."),
            code_check("lowercase normalization", "lower(", "Normalize email with lower for a JVM-side transformation."),
            code_check("trim whitespace", "trim(", "Trim leading and trailing spaces before final cleanup."),
        ),
    ),
    "pyspark-skewed-customer-join": PysparkSpec(
        slug="pyspark-skewed-customer-join",
        output_columns=("order_id", "customer_id", "segment", "amount"),
        sample_cases=(
            PysparkCase(
                name="visible join output",
                inputs=(
                    input_table(
                        "orders",
                        [
                            {"order_id": 501, "customer_id": 1001, "amount": 120.0},
                            {"order_id": 502, "customer_id": 1002, "amount": 240.0},
                            {"order_id": 503, "customer_id": 9999, "amount": 90.0},
                        ],
                    ),
                    input_table(
                        "customers",
                        [
                            {"customer_id": 1001, "segment": "mid_market"},
                            {"customer_id": 1002, "segment": "enterprise"},
                            {"customer_id": 9999, "segment": "marketplace"},
                        ],
                    ),
                ),
                expected_rows=[
                    [501, 1001, "mid_market", 120.0],
                    [502, 1002, "enterprise", 240.0],
                    [503, 9999, "marketplace", 90.0],
                ],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden join still returns full enriched dataset",
                inputs=(
                    input_table(
                        "orders",
                        [
                            {"order_id": 801, "customer_id": 12, "amount": 20.0},
                            {"order_id": 802, "customer_id": 12, "amount": 40.0},
                            {"order_id": 803, "customer_id": 77, "amount": 70.0},
                        ],
                    ),
                    input_table(
                        "customers",
                        [
                            {"customer_id": 12, "segment": "retail"},
                            {"customer_id": 77, "segment": "vip"},
                        ],
                    ),
                ),
                expected_rows=[
                    [801, 12, "retail", 20.0],
                    [802, 12, "retail", 40.0],
                    [803, 77, "vip", 70.0],
                ],
            ),
        ),
        code_checks=(
            code_check("broadcast smaller side", "broadcast(", "Use broadcast on the small dimension side or an equivalent skew-safe strategy."),
        ),
    ),
    "pyspark-small-files-hourly-writes": PysparkSpec(
        slug="pyspark-small-files-hourly-writes",
        code_checks=(
            code_check("repartition by date", "repartition(\"order_date\")", "Repartition around order_date before the write."),
            code_check("partition by business date", "partitionby(\"order_date\")", "Write by order_date instead of keeping hour-level file explosion."),
            code_check("control file size", "maxrecordsperfile", "Set maxRecordsPerFile or an equivalent file-sizing strategy."),
        ),
    ),
    "pyspark-cache-everything-memory-pressure": PysparkSpec(
        slug="pyspark-cache-everything-memory-pressure",
        output_columns=("customer_id", "customer_name", "order_date", "amount"),
        sample_cases=(
            PysparkCase(
                name="visible reusable enriched dataframe",
                inputs=(
                    input_table(
                        "raw",
                        [
                            {"customer_id": 101, "order_date": "2026-05-30", "amount": 400.0, "status": "SUCCESS"},
                            {"customer_id": 102, "order_date": "2026-05-30", "amount": 250.0, "status": "SUCCESS"},
                            {"customer_id": 103, "order_date": "2026-05-30", "amount": 999.0, "status": "FAILED"},
                        ],
                    ),
                    input_table(
                        "dim_customers",
                        [
                            {"customer_id": 101, "customer_name": "Asha"},
                            {"customer_id": 102, "customer_name": "Ben"},
                            {"customer_id": 103, "customer_name": "Chen"},
                        ],
                    ),
                ),
                expected_rows=[
                    [101, "Asha", "2026-05-30", 400.0],
                    [102, "Ben", "2026-05-30", 250.0],
                ],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden only successful rows survive enrichment",
                inputs=(
                    input_table(
                        "raw",
                        [
                            {"customer_id": 201, "order_date": "2026-06-01", "amount": 40.0, "status": "SUCCESS"},
                            {"customer_id": 202, "order_date": "2026-06-01", "amount": 60.0, "status": "SUCCESS"},
                            {"customer_id": 202, "order_date": "2026-06-01", "amount": 10.0, "status": "FAILED"},
                        ],
                    ),
                    input_table(
                        "dim_customers",
                        [
                            {"customer_id": 201, "customer_name": "Diya"},
                            {"customer_id": 202, "customer_name": "Evan"},
                        ],
                    ),
                ),
                expected_rows=[
                    [201, "Diya", "2026-06-01", 40.0],
                    [202, "Evan", "2026-06-01", 60.0],
                ],
            ),
        ),
        code_checks=(
            code_check("cache reusable dataframe", ".cache()", "Cache only the expensive reused DataFrame."),
            code_check("release cached dataframe", ".unpersist()", "Unpersist the cached DataFrame after the final use."),
        ),
    ),
    "pyspark-driver-collect-oom": PysparkSpec(
        slug="pyspark-driver-collect-oom",
        output_columns=("order_id", "customer_id", "amount"),
        sample_cases=(
            PysparkCase(
                name="visible distributed VIP filter",
                inputs=(
                    input_table(
                        "orders",
                        [
                            {"order_id": 7001, "customer_id": 101, "amount": 900.0},
                            {"order_id": 7002, "customer_id": 102, "amount": 120.0},
                            {"order_id": 7003, "customer_id": 103, "amount": 250.0},
                        ],
                    ),
                    input_table(
                        "vip_customers",
                        [
                            {"customer_id": 101, "tier": "gold"},
                            {"customer_id": 103, "tier": "platinum"},
                        ],
                    ),
                ),
                expected_rows=[[7001, 101, 900.0], [7003, 103, 250.0]],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden join avoids driver-side key list",
                inputs=(
                    input_table(
                        "orders",
                        [
                            {"order_id": 8101, "customer_id": 1, "amount": 50.0},
                            {"order_id": 8102, "customer_id": 2, "amount": 75.0},
                        ],
                    ),
                    input_table(
                        "vip_customers",
                        [
                            {"customer_id": 2, "tier": "gold"},
                        ],
                    ),
                ),
                expected_rows=[[8102, 2, 75.0]],
            ),
        ),
        code_checks=(
            code_check("use join instead of collect", "join(", "Keep the VIP filter distributed with a Spark join."),
            code_check("forbid collect", ".collect()", "Do not bring the full key list to the driver with collect.", should_contain=False),
        ),
    ),
    "pyspark-window-dedup-latest-record": PysparkSpec(
        slug="pyspark-window-dedup-latest-record",
        output_columns=("customer_id", "status", "updated_at", "ingest_sequence"),
        sample_cases=(
            PysparkCase(
                name="visible latest record per customer",
                inputs=(
                    input_table(
                        "customer_updates",
                        [
                            {"customer_id": 11, "status": "silver", "updated_at": "2026-05-30 10:00:00", "ingest_sequence": 41},
                            {"customer_id": 11, "status": "gold", "updated_at": "2026-05-30 11:00:00", "ingest_sequence": 42},
                            {"customer_id": 12, "status": "active", "updated_at": "2026-05-30 09:00:00", "ingest_sequence": 43},
                        ],
                    ),
                ),
                expected_rows=[
                    [11, "gold", "2026-05-30 11:00:00", 42],
                    [12, "active", "2026-05-30 09:00:00", 43],
                ],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden tie breaks by ingest sequence",
                inputs=(
                    input_table(
                        "customer_updates",
                        [
                            {"customer_id": 77, "status": "bronze", "updated_at": "2026-06-01 12:00:00", "ingest_sequence": 1},
                            {"customer_id": 77, "status": "silver", "updated_at": "2026-06-01 12:00:00", "ingest_sequence": 2},
                        ],
                    ),
                ),
                expected_rows=[[77, "silver", "2026-06-01 12:00:00", 2]],
            ),
        ),
        code_checks=(
            code_check("window row_number", "row_number()", "Use row_number over a window to make the latest record deterministic."),
        ),
    ),
    "pyspark-union-column-order-corruption": PysparkSpec(
        slug="pyspark-union-column-order-corruption",
        output_columns=("event_id", "amount", "device_type"),
        sample_cases=(
            PysparkCase(
                name="visible union by name",
                inputs=(
                    input_table(
                        "web_events",
                        [
                            {"event_id": "w1", "amount": 120.0, "device_type": "web"},
                            {"event_id": "w2", "amount": 80.0, "device_type": "web"},
                        ],
                    ),
                    input_table(
                        "app_events",
                        [
                            {"event_id": "a1", "device_type": "ios", "amount": 200.0},
                            {"event_id": "a2", "device_type": "android", "amount": 60.0},
                        ],
                    ),
                ),
                expected_rows=[
                    ["a1", 200.0, "ios"],
                    ["a2", 60.0, "android"],
                    ["w1", 120.0, "web"],
                    ["w2", 80.0, "web"],
                ],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden missing columns stay aligned by name",
                inputs=(
                    input_table(
                        "web_events",
                        [
                            {"event_id": "w9", "amount": 10.0, "device_type": "web"},
                        ],
                    ),
                    input_table(
                        "app_events",
                        [
                            {"event_id": "a9", "device_type": "ios", "amount": 30.0},
                        ],
                    ),
                ),
                expected_rows=[
                    ["a9", 30.0, "ios"],
                    ["w9", 10.0, "web"],
                ],
            ),
        ),
        code_checks=(
            code_check("use unionByName", "unionbyname(", "Use unionByName so columns align by name instead of position."),
        ),
    ),
    "pyspark-null-join-key-skew": PysparkSpec(
        slug="pyspark-null-join-key-skew",
        output_columns=("fact_id", "product_id", "product_name", "amount"),
        sample_cases=(
            PysparkCase(
                name="visible valid-key enrichment",
                inputs=(
                    input_table(
                        "facts",
                        [
                            {"fact_id": 1, "product_id": "P-100", "amount": 500.0},
                            {"fact_id": 2, "product_id": "P-101", "amount": 300.0},
                            {"fact_id": 3, "product_id": None, "amount": 100.0},
                            {"fact_id": 4, "product_id": "UNKNOWN", "amount": 50.0},
                        ],
                    ),
                    input_table(
                        "products",
                        [
                            {"product_id": "P-100", "product_name": "Phone"},
                            {"product_id": "P-101", "product_name": "Laptop Bag"},
                        ],
                    ),
                ),
                expected_rows=[
                    [1, "P-100", "Phone", 500.0],
                    [2, "P-101", "Laptop Bag", 300.0],
                ],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden invalid keys stay out of main join",
                inputs=(
                    input_table(
                        "facts",
                        [
                            {"fact_id": 10, "product_id": "P-900", "amount": 40.0},
                            {"fact_id": 11, "product_id": None, "amount": 55.0},
                        ],
                    ),
                    input_table(
                        "products",
                        [
                            {"product_id": "P-900", "product_name": "Mouse"},
                        ],
                    ),
                ),
                expected_rows=[[10, "P-900", "Mouse", 40.0]],
            ),
        ),
        code_checks=(
            code_check("filter invalid keys", "isnotnull()", "Filter or route NULL keys before the normal join."),
            code_check("handle UNKNOWN bucket", "unknown", "Treat the UNKNOWN/default key as a separate quality path."),
        ),
    ),
    "pyspark-explode-row-count-blowup": PysparkSpec(
        slug="pyspark-explode-row-count-blowup",
        code_checks=(
            code_check("explode items safely", "explode_outer(\"items\")", "Explode only the needed child array for the current output grain."),
            code_check("separate promotions output", "order_promotions", "Keep promotions as a separate child dataset instead of multiplying rows."),
        ),
    ),
    "pyspark-timezone-business-date": PysparkSpec(
        slug="pyspark-timezone-business-date",
        output_columns=("report_date", "revenue"),
        sample_cases=(
            PysparkCase(
                name="visible timezone-safe daily revenue",
                inputs=(
                    input_table(
                        "events",
                        [
                            {"event_id": 1, "event_ts_utc": "2026-05-30 19:10:00", "amount": 500.0},
                            {"event_id": 2, "event_ts_utc": "2026-05-30 23:50:00", "amount": 700.0},
                            {"event_id": 3, "event_ts_utc": "2026-05-31 03:00:00", "amount": 300.0},
                        ],
                        timestamp_columns=("event_ts_utc",),
                    ),
                ),
                expected_rows=[["2026-05-31", 1500.0]],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden boundary still lands on local business date",
                inputs=(
                    input_table(
                        "events",
                        [
                            {"event_id": 11, "event_ts_utc": "2026-06-01 18:40:00", "amount": 50.0},
                            {"event_id": 12, "event_ts_utc": "2026-06-01 19:00:00", "amount": 25.0},
                        ],
                        timestamp_columns=("event_ts_utc",),
                    ),
                ),
                expected_rows=[["2026-06-02", 75.0]],
            ),
        ),
        code_checks=(
            code_check("convert timezone first", "from_utc_timestamp(", "Convert UTC timestamps into the business timezone before taking the date."),
        ),
    ),
    "pyspark-schema-drift-json": PysparkSpec(
        slug="pyspark-schema-drift-json",
        output_columns=("event_id", "customer_id", "amount", "payment_mode"),
        sample_cases=(
            PysparkCase(
                name="visible new field survives silver projection",
                inputs=(
                    input_table(
                        "raw_events",
                        [
                            {"event_id": "e1", "customer_id": "c1", "amount": 100.0, "payment_mode": None},
                            {"event_id": "e2", "customer_id": "c2", "amount": 250.0, "payment_mode": "UPI"},
                            {"event_id": "e3", "customer_id": "c3", "amount": 90.0, "payment_mode": "CARD"},
                        ],
                    ),
                ),
                expected_rows=[
                    ["e1", "c1", 100.0, None],
                    ["e2", "c2", 250.0, "UPI"],
                    ["e3", "c3", 90.0, "CARD"],
                ],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden payment_mode remains nullable but present",
                inputs=(
                    input_table(
                        "raw_events",
                        [
                            {"event_id": "e9", "customer_id": "c9", "amount": 10.0, "payment_mode": "NETBANKING"},
                        ],
                    ),
                ),
                expected_rows=[["e9", "c9", 10.0, "NETBANKING"]],
            ),
        ),
        code_checks=(
            code_check("keep new field", "payment_mode", "Include the new payment_mode field in the curated silver output."),
        ),
    ),
    "pyspark-broadcast-wrong-side": PysparkSpec(
        slug="pyspark-broadcast-wrong-side",
        output_columns=("order_id", "product_id", "product_name", "amount"),
        sample_cases=(
            PysparkCase(
                name="visible safe broadcast join",
                inputs=(
                    input_table(
                        "orders",
                        [
                            {"order_id": 1, "product_id": "P-100", "amount": 500.0},
                            {"order_id": 2, "product_id": "P-101", "amount": 120.0},
                        ],
                    ),
                    input_table(
                        "products",
                        [
                            {"product_id": "P-100", "product_name": "Phone"},
                            {"product_id": "P-101", "product_name": "Bag"},
                        ],
                    ),
                ),
                expected_rows=[
                    [1, "P-100", "Phone", 500.0],
                    [2, "P-101", "Bag", 120.0],
                ],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden enrichment still preserves all fact rows",
                inputs=(
                    input_table(
                        "orders",
                        [
                            {"order_id": 8, "product_id": "P-2", "amount": 80.0},
                        ],
                    ),
                    input_table(
                        "products",
                        [
                            {"product_id": "P-2", "product_name": "Keyboard"},
                        ],
                    ),
                ),
                expected_rows=[[8, "P-2", "Keyboard", 80.0]],
            ),
        ),
        code_checks=(
            code_check("broadcast dimension table", "broadcast(products)", "Broadcast the small dimension table, not the large fact table."),
            code_check("do not broadcast fact table", "broadcast(orders)", "Do not broadcast the large fact table.", should_contain=False),
        ),
    ),
    "pyspark-repartition-by-user-id": PysparkSpec(
        slug="pyspark-repartition-by-user-id",
        code_checks=(
            code_check("repartition by event date", "repartition(\"event_date\")", "Prepare the data around event_date before writing."),
            code_check("partition by event date", "partitionby(\"event_date\")", "Use event_date as the physical partition column."),
            code_check("limit file size", "maxrecordsperfile", "Control file count with a file sizing option."),
        ),
    ),
    "pyspark-late-arriving-partition-overwrite": PysparkSpec(
        slug="pyspark-late-arriving-partition-overwrite",
        output_columns=("order_date", "revenue"),
        sample_cases=(
            PysparkCase(
                name="visible recompute affected partitions",
                context={"run_date": "2026-05-31"},
                inputs=(
                    input_table(
                        "raw_orders",
                        [
                            {"order_id": 901, "order_date": "2026-05-29", "ingest_date": "2026-05-31", "amount": 300.0},
                            {"order_id": 902, "order_date": "2026-05-31", "ingest_date": "2026-05-31", "amount": 700.0},
                            {"order_id": 903, "order_date": "2026-05-30", "ingest_date": "2026-05-31", "amount": 200.0},
                        ],
                    ),
                ),
                expected_rows=[
                    ["2026-05-29", 300.0],
                    ["2026-05-30", 200.0],
                    ["2026-05-31", 700.0],
                ],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden one ingest day repairs multiple business dates",
                context={"run_date": "2026-06-02"},
                inputs=(
                    input_table(
                        "raw_orders",
                        [
                            {"order_id": 1, "order_date": "2026-06-01", "ingest_date": "2026-06-02", "amount": 100.0},
                            {"order_id": 2, "order_date": "2026-05-31", "ingest_date": "2026-06-02", "amount": 90.0},
                            {"order_id": 3, "order_date": "2026-06-02", "ingest_date": "2026-06-02", "amount": 40.0},
                        ],
                    ),
                ),
                expected_rows=[
                    ["2026-05-31", 90.0],
                    ["2026-06-01", 100.0],
                    ["2026-06-02", 40.0],
                ],
            ),
        ),
    ),
    "pyspark-watermark-too-tight": PysparkSpec(
        slug="pyspark-watermark-too-tight",
        code_checks=(
            code_check("keep watermark operator", "withwatermark(", "Keep watermarking in the streaming plan."),
            code_check("avoid too-tight 10 minute watermark", "10minutes", "Increase the watermark beyond the current too-tight threshold.", should_contain=False),
        ),
    ),
    "pyspark-count-distinct-expensive": PysparkSpec(
        slug="pyspark-count-distinct-expensive",
        output_columns=("event_date", "unique_visitors"),
        sample_cases=(
            PysparkCase(
                name="visible daily unique visitors",
                inputs=(
                    input_table(
                        "events",
                        [
                            {"event_date": "2026-05-30", "visitor_id": "u1"},
                            {"event_date": "2026-05-30", "visitor_id": "u2"},
                            {"event_date": "2026-05-30", "visitor_id": "u2"},
                            {"event_date": "2026-05-30", "visitor_id": "u3"},
                        ],
                    ),
                ),
                expected_rows=[["2026-05-30", 3]],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden approximate count still respects uniqueness",
                inputs=(
                    input_table(
                        "events",
                        [
                            {"event_date": "2026-06-01", "visitor_id": "a"},
                            {"event_date": "2026-06-01", "visitor_id": "a"},
                            {"event_date": "2026-06-01", "visitor_id": "b"},
                        ],
                    ),
                ),
                expected_rows=[["2026-06-01", 2]],
            ),
        ),
        code_checks=(
            code_check("use approximate distinct", "approx_count_distinct(", "Use approx_count_distinct for this SLA-focused metric."),
        ),
    ),
    "pyspark-case-sensitive-status": PysparkSpec(
        slug="pyspark-case-sensitive-status",
        output_columns=("order_id", "payment_status", "amount"),
        sample_cases=(
            PysparkCase(
                name="visible accepted payment statuses",
                inputs=(
                    input_table(
                        "orders",
                        [
                            {"order_id": 1, "payment_status": "SUCCESS", "amount": 1000.0},
                            {"order_id": 2, "payment_status": "SUCCESSFUL", "amount": 500.0},
                            {"order_id": 3, "payment_status": " success ", "amount": 250.0},
                            {"order_id": 4, "payment_status": "FAILED", "amount": 700.0},
                        ],
                    ),
                ),
                expected_rows=[
                    [1, "SUCCESS", 1000.0],
                    [2, "SUCCESSFUL", 500.0],
                    [3, " success ", 250.0],
                ],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden PAID variant also survives normalization",
                inputs=(
                    input_table(
                        "orders",
                        [
                            {"order_id": 9, "payment_status": "paid", "amount": 80.0},
                            {"order_id": 10, "payment_status": "cancelled", "amount": 10.0},
                        ],
                    ),
                ),
                expected_rows=[[9, "paid", 80.0]],
            ),
        ),
        code_checks=(
            code_check("normalize case", "upper(", "Normalize payment_status case before comparison."),
            code_check("trim input", "trim(", "Trim whitespace before checking accepted statuses."),
            code_check("controlled accepted set", ".isin(", "Use a controlled accepted status mapping."),
        ),
    ),
    "pyspark-missing-corrupt-records": PysparkSpec(
        slug="pyspark-missing-corrupt-records",
        output_columns=("transaction_id", "customer_id", "amount", "txn_date"),
        sample_cases=(
            PysparkCase(
                name="visible valid rows are preserved",
                inputs=(
                    input_table(
                        "txns_raw",
                        [
                            {"transaction_id": "t1", "customer_id": "c1", "amount": 100.0, "txn_date": "2026-05-30", "_corrupt_record": None},
                            {"transaction_id": "t2", "customer_id": "c2", "amount": 250.0, "txn_date": "2026-05-30", "_corrupt_record": None},
                            {"transaction_id": None, "customer_id": None, "amount": None, "txn_date": None, "_corrupt_record": "bad,row,shape"},
                        ],
                    ),
                ),
                expected_rows=[
                    ["t1", "c1", 100.0, "2026-05-30"],
                    ["t2", "c2", 250.0, "2026-05-30"],
                ],
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden corrupt rows stay out of valid dataset",
                inputs=(
                    input_table(
                        "txns_raw",
                        [
                            {"transaction_id": "x1", "customer_id": "cx", "amount": 10.0, "txn_date": "2026-06-01", "_corrupt_record": None},
                            {"transaction_id": None, "customer_id": None, "amount": None, "txn_date": None, "_corrupt_record": "too,few,fields"},
                        ],
                    ),
                ),
                expected_rows=[["x1", "cx", 10.0, "2026-06-01"]],
            ),
        ),
        code_checks=(
            code_check("check corrupt record column", "_corrupt_record", "Handle corrupt input rows explicitly instead of dropping them silently."),
        ),
    ),
    "pyspark-writing-single-file": PysparkSpec(
        slug="pyspark-writing-single-file",
        code_checks=(
            code_check("avoid coalesce(1)", "coalesce(1)", "Do not force the entire export through one writer task.", should_contain=False),
            code_check("keep export distributed", "repartition(", "Keep the export distributed instead of writing one file."),
            code_check("size files deliberately", "maxrecordsperfile", "Control output file size instead of forcing a single file."),
        ),
    ),
}


PYSPARK_LAB_SPECS.update(
    {
        "pyspark-small-files-hourly-writes": PysparkSpec(
            slug="pyspark-small-files-hourly-writes",
            output_columns=("order_id", "order_date", "amount", "source_hour"),
            sample_cases=(
                PysparkCase(
                    name="visible hourly rows are preserved for daily layout",
                    inputs=(
                        input_table(
                            "hourly_orders",
                            [
                                {"order_id": 1, "order_date": "2026-05-30", "amount": 100.0, "source_hour": "00"},
                                {"order_id": 2, "order_date": "2026-05-30", "amount": 150.0, "source_hour": "01"},
                                {"order_id": 3, "order_date": "2026-05-31", "amount": 90.0, "source_hour": "00"},
                            ],
                        ),
                    ),
                    expected_rows=[
                        [1, "2026-05-30", 100.0, "00"],
                        [2, "2026-05-30", 150.0, "01"],
                        [3, "2026-05-31", 90.0, "00"],
                    ],
                ),
            ),
            hidden_cases=(
                PysparkCase(
                    name="hidden multiple hours keep the same business rows",
                    inputs=(
                        input_table(
                            "hourly_orders",
                            [
                                {"order_id": 11, "order_date": "2026-06-01", "amount": 40.0, "source_hour": "02"},
                                {"order_id": 12, "order_date": "2026-06-01", "amount": 70.0, "source_hour": "03"},
                                {"order_id": 13, "order_date": "2026-06-02", "amount": 55.0, "source_hour": "00"},
                            ],
                        ),
                    ),
                    expected_rows=[
                        [11, "2026-06-01", 40.0, "02"],
                        [12, "2026-06-01", 70.0, "03"],
                        [13, "2026-06-02", 55.0, "00"],
                    ],
                ),
            ),
            code_checks=(
                code_check("repartition by date", "repartition(\"order_date\")", "Repartition around order_date before the write."),
                code_check("partition by business date", "partitionby(\"order_date\")", "Write by order_date instead of keeping hour-level file explosion."),
                code_check("control file size", "maxrecordsperfile", "Set maxRecordsPerFile or an equivalent file-sizing strategy."),
            ),
        ),
        "pyspark-explode-row-count-blowup": PysparkSpec(
            slug="pyspark-explode-row-count-blowup",
            output_columns=("order_id", "sku", "qty"),
            sample_cases=(
                PysparkCase(
                    name="visible one row per order item",
                    inputs=(
                        input_table(
                            "orders",
                            [
                                {
                                    "order_id": 1,
                                    "items": [{"sku": "A", "qty": 2}, {"sku": "B", "qty": 1}],
                                    "promotions": [{"promo_id": "P10", "amount": 10.0}, {"promo_id": "SHIP", "amount": 5.0}],
                                },
                                {
                                    "order_id": 2,
                                    "items": [{"sku": "C", "qty": 3}],
                                    "promotions": [],
                                },
                            ],
                        ),
                    ),
                    expected_rows=[
                        [1, "A", 2],
                        [1, "B", 1],
                        [2, "C", 3],
                    ],
                ),
            ),
            hidden_cases=(
                PysparkCase(
                    name="hidden promotions do not multiply item grain",
                    inputs=(
                        input_table(
                            "orders",
                            [
                                {
                                    "order_id": 10,
                                    "items": [{"sku": "X", "qty": 1}, {"sku": "Y", "qty": 4}],
                                    "promotions": [{"promo_id": "P1", "amount": 1.0}, {"promo_id": "P2", "amount": 2.0}],
                                },
                                {
                                    "order_id": 11,
                                    "items": [{"sku": "Z", "qty": 2}],
                                    "promotions": [{"promo_id": "P3", "amount": 3.0}],
                                },
                            ],
                        ),
                    ),
                    expected_rows=[
                        [10, "X", 1],
                        [10, "Y", 4],
                        [11, "Z", 2],
                    ],
                ),
            ),
            code_checks=(
                code_check("explode items safely", "explode_outer(\"items\")", "Explode only the needed child array for the current output grain."),
                code_check("avoid promotion cascade", "explode_outer(\"promotions\")", "Do not explode promotions in the item-grain output.", should_contain=False),
            ),
        ),
        "pyspark-repartition-by-user-id": PysparkSpec(
            slug="pyspark-repartition-by-user-id",
            output_columns=("event_id", "event_date", "user_id", "event_type"),
            sample_cases=(
                PysparkCase(
                    name="visible event rows preserved after healthier layout",
                    inputs=(
                        input_table(
                            "events",
                            [
                                {"event_id": "e1", "event_date": "2026-05-30", "user_id": "u1", "event_type": "view"},
                                {"event_id": "e2", "event_date": "2026-05-30", "user_id": "u2", "event_type": "click"},
                                {"event_id": "e3", "event_date": "2026-05-31", "user_id": "u1", "event_type": "purchase"},
                            ],
                        ),
                    ),
                    expected_rows=[
                        ["e1", "2026-05-30", "u1", "view"],
                        ["e2", "2026-05-30", "u2", "click"],
                        ["e3", "2026-05-31", "u1", "purchase"],
                    ],
                ),
            ),
            hidden_cases=(
                PysparkCase(
                    name="hidden high-cardinality user ids remain normal rows",
                    inputs=(
                        input_table(
                            "events",
                            [
                                {"event_id": "h1", "event_date": "2026-06-01", "user_id": "user_90001", "event_type": "view"},
                                {"event_id": "h2", "event_date": "2026-06-01", "user_id": "user_90002", "event_type": "click"},
                            ],
                        ),
                    ),
                    expected_rows=[
                        ["h1", "2026-06-01", "user_90001", "view"],
                        ["h2", "2026-06-01", "user_90002", "click"],
                    ],
                ),
            ),
            code_checks=(
                code_check("repartition by event date", "repartition(\"event_date\")", "Prepare the data around event_date before writing."),
                code_check("partition by event date", "partitionby(\"event_date\")", "Use event_date as the physical partition column."),
                code_check("limit file size", "maxrecordsperfile", "Control file count with a file sizing option."),
            ),
        ),
        "pyspark-watermark-too-tight": PysparkSpec(
            slug="pyspark-watermark-too-tight",
            output_columns=("event_hour", "country", "revenue"),
            sample_cases=(
                PysparkCase(
                    name="visible delayed but valid events are retained",
                    inputs=(
                        input_table(
                            "events",
                            [
                                {"event_id": 1, "event_hour": "2026-05-30 10:00:00", "country": "IN", "amount": 100.0, "arrival_delay_minutes": 5},
                                {"event_id": 2, "event_hour": "2026-05-30 10:00:00", "country": "IN", "amount": 80.0, "arrival_delay_minutes": 45},
                                {"event_id": 3, "event_hour": "2026-05-30 11:00:00", "country": "US", "amount": 70.0, "arrival_delay_minutes": 180},
                            ],
                        ),
                    ),
                    expected_rows=[
                        ["2026-05-30 10:00:00", "IN", 180.0],
                    ],
                ),
            ),
            hidden_cases=(
                PysparkCase(
                    name="hidden two-hour tolerance still drops extreme lag",
                    inputs=(
                        input_table(
                            "events",
                            [
                                {"event_id": 10, "event_hour": "2026-06-01 09:00:00", "country": "IN", "amount": 20.0, "arrival_delay_minutes": 10},
                                {"event_id": 11, "event_hour": "2026-06-01 09:00:00", "country": "IN", "amount": 30.0, "arrival_delay_minutes": 120},
                                {"event_id": 12, "event_hour": "2026-06-01 09:00:00", "country": "IN", "amount": 999.0, "arrival_delay_minutes": 121},
                            ],
                        ),
                    ),
                    expected_rows=[
                        ["2026-06-01 09:00:00", "IN", 50.0],
                    ],
                ),
            ),
            code_checks=(
                code_check("avoid too-tight 10 minute threshold", "<=10", "Increase the lateness tolerance beyond the current too-tight threshold.", should_contain=False),
            ),
        ),
        "pyspark-writing-single-file": PysparkSpec(
            slug="pyspark-writing-single-file",
            output_columns=("order_id", "order_date", "amount"),
            sample_cases=(
                PysparkCase(
                    name="visible export rows stay distributed and complete",
                    inputs=(
                        input_table(
                            "daily_export",
                            [
                                {"order_id": 1, "order_date": "2026-05-30", "amount": 100.0},
                                {"order_id": 2, "order_date": "2026-05-30", "amount": 220.0},
                            ],
                        ),
                    ),
                    expected_rows=[
                        [1, "2026-05-30", 100.0],
                        [2, "2026-05-30", 220.0],
                    ],
                ),
            ),
            hidden_cases=(
                PysparkCase(
                    name="hidden larger export remains distributed without dropping rows",
                    inputs=(
                        input_table(
                            "daily_export",
                            [
                                {"order_id": 10, "order_date": "2026-06-01", "amount": 50.0},
                                {"order_id": 11, "order_date": "2026-06-01", "amount": 60.0},
                                {"order_id": 12, "order_date": "2026-06-01", "amount": 70.0},
                            ],
                        ),
                    ),
                    expected_rows=[
                        [10, "2026-06-01", 50.0],
                        [11, "2026-06-01", 60.0],
                        [12, "2026-06-01", 70.0],
                    ],
                ),
            ),
            code_checks=(
                code_check("avoid coalesce(1)", "coalesce(1)", "Do not force the entire export through one writer task.", should_contain=False),
                code_check("keep export distributed", "repartition(", "Keep the export distributed instead of writing one file."),
                code_check("size files deliberately", "maxrecordsperfile", "Control output file size instead of forcing a single file."),
            ),
        ),
    }
)


PDF_PYSPARK_PROBLEMS: tuple[dict[str, Any], ...] = (
    {
        "number": 1,
        "title": "The Endless Final Stage",
        "section": "Execution and Parallelism",
        "symptom": "One reduce task keeps running after the rest of the stage finishes.",
        "diagnosis": "A hot key is creating shuffle skew and one reducer is processing far more data than the others.",
        "recommended_fix": "Identify the hot key, pre-aggregate where possible, salt the skewed key, or use skew-aware join handling.",
    },
    {
        "number": 2,
        "title": "Shuffle Storm After a Big Join",
        "section": "Execution and Parallelism",
        "symptom": "A join stage spills heavily and shuffle bytes are much larger than the input tables.",
        "diagnosis": "The job joins wide data before filtering or projecting, creating unnecessary shuffle volume.",
        "recommended_fix": "Filter early, select only required columns, pre-aggregate when safe, and validate the join key grain.",
    },
    {
        "number": 3,
        "title": "One Core Busy, Cluster Idle",
        "section": "Execution and Parallelism",
        "symptom": "The Spark UI shows only a handful of tasks while most executors sit idle.",
        "diagnosis": "The input has too few partitions, so the cluster cannot parallelize the work.",
        "recommended_fix": "Increase partitions before expensive transformations and size partitions around data volume and cluster capacity.",
    },
    {
        "number": 4,
        "title": "Thousands of Tiny Tasks",
        "section": "Execution and Parallelism",
        "symptom": "The job launches thousands of tiny tasks and spends more time scheduling than processing.",
        "diagnosis": "The pipeline is over-partitioned for the data size, creating scheduler overhead and tiny output files.",
        "recommended_fix": "Coalesce or repartition to a sensible partition count and target healthy output file sizes.",
    },
    {
        "number": 5,
        "title": "The groupByKey Memory Trap",
        "section": "Execution and Parallelism",
        "symptom": "Executors spill or fail when grouping all values for a customer or product key.",
        "diagnosis": "groupByKey materializes all values per key and creates memory pressure for high-cardinality groups.",
        "recommended_fix": "Use aggregations such as reduceByKey, aggregateByKey, or DataFrame groupBy aggregations instead of materializing full groups.",
    },
    {
        "number": 6,
        "title": "Window Functions on Unbounded Partitions",
        "section": "Execution and Parallelism",
        "symptom": "A window calculation over customer history becomes the slowest stage as data grows.",
        "diagnosis": "The window partition is too large or unbounded, forcing expensive sorts and state per key.",
        "recommended_fix": "Bound the window, reduce data before the window, and partition by the correct business grain.",
    },
    {
        "number": 7,
        "title": "The Python UDF Tax",
        "section": "Execution and Parallelism",
        "symptom": "A simple column cleanup stage became slow after a Python UDF was introduced.",
        "diagnosis": "Rows are crossing between the JVM and Python workers, blocking Spark SQL optimizations.",
        "recommended_fix": "Replace row-wise Python UDF logic with built-in Spark SQL functions whenever possible.",
    },
    {
        "number": 8,
        "title": "Broadcast Join Backfires",
        "section": "Execution and Parallelism",
        "symptom": "Executors fail after a table that used to be small is broadcast to every worker.",
        "diagnosis": "The broadcast side grew beyond safe memory limits and the plan still forces a broadcast join.",
        "recommended_fix": "Remove the unsafe broadcast hint, refresh table statistics, and only broadcast genuinely small dimensions.",
    },
    {
        "number": 9,
        "title": "Static Shuffle Settings on a Moving Workload",
        "section": "Execution and Parallelism",
        "symptom": "The same shuffle partition setting works for small days but fails on month-end volume.",
        "diagnosis": "The job uses static partition settings even though data volume changes significantly.",
        "recommended_fix": "Enable adaptive query execution and tune shuffle partitions based on observed workload size.",
    },
    {
        "number": 10,
        "title": "The Recompute Loop",
        "section": "Execution and Parallelism",
        "symptom": "The same expensive upstream transformations are recomputed across multiple downstream actions.",
        "diagnosis": "A long lineage is being reused without checkpointing or caching the right intermediate result.",
        "recommended_fix": "Persist only reused expensive DataFrames or checkpoint long lineage at a reliable boundary.",
    },
    {
        "number": 11,
        "title": "Executor OutOfMemoryError on Wide Rows",
        "section": "Memory and Stability",
        "symptom": "Executor memory errors appear after adding nested payload columns to the transformation.",
        "diagnosis": "Wide rows are being carried through shuffle stages even when only a few columns are needed.",
        "recommended_fix": "Project required columns early, avoid shuffling wide payloads, and store heavy payloads separately when possible.",
    },
    {
        "number": 12,
        "title": "Driver Out of Memory",
        "section": "Memory and Stability",
        "symptom": "The driver crashes when the job calls collect or converts a large DataFrame to pandas.",
        "diagnosis": "Distributed data is being pulled into driver memory instead of being processed on executors.",
        "recommended_fix": "Keep processing distributed, collect only bounded samples, and write large results to storage.",
    },
    {
        "number": 13,
        "title": "Cache Ate the Cluster",
        "section": "Memory and Stability",
        "symptom": "A job becomes slower after several DataFrames are cached during debugging.",
        "diagnosis": "The cluster memory is filled with cached data that is not reused enough to justify the storage cost.",
        "recommended_fix": "Cache only expensive DataFrames reused multiple times and unpersist them after the final use.",
    },
    {
        "number": 14,
        "title": "Spill Everywhere",
        "section": "Memory and Stability",
        "symptom": "Spark UI shows disk spill across many tasks during aggregations.",
        "diagnosis": "Shuffle partitions are too large or the aggregation carries unnecessary columns.",
        "recommended_fix": "Reduce row width, tune partition counts, pre-aggregate earlier, and inspect skewed keys.",
    },
    {
        "number": 15,
        "title": "Broadcast Timeout",
        "section": "Memory and Stability",
        "symptom": "The query fails while trying to broadcast a dimension table during a join.",
        "diagnosis": "The broadcast table is too large or the cluster cannot distribute it within the configured timeout.",
        "recommended_fix": "Avoid broadcasting large dimensions, refresh stats, increase timeout only after validating size, and use a shuffle join when safer.",
    },
    {
        "number": 16,
        "title": "Serialization Pain",
        "section": "Memory and Stability",
        "symptom": "Tasks spend high time serializing custom Python objects or nested records.",
        "diagnosis": "The job uses complex Python-side objects instead of Spark-native columnar transformations.",
        "recommended_fix": "Use DataFrame APIs and Spark SQL types, reduce Python object movement, and avoid custom serializers in hot paths.",
    },
    {
        "number": 17,
        "title": "Dynamic Allocation Thrash",
        "section": "Memory and Stability",
        "symptom": "Executors churn during the job and stages keep waiting for resources.",
        "diagnosis": "Dynamic allocation settings do not match workload shape, causing executor churn and unstable parallelism.",
        "recommended_fix": "Tune min/max executors, idle timeout, and shuffle tracking for the workload pattern.",
    },
    {
        "number": 18,
        "title": "Preempted or Lost Executors Kill the Stage",
        "section": "Memory and Stability",
        "symptom": "Stages fail repeatedly after spot/preemptible executors disappear.",
        "diagnosis": "The job is not resilient to executor loss and may be running with fragile retry or shuffle settings.",
        "recommended_fix": "Increase resilience with appropriate retries, external shuffle or shuffle tracking, and avoid relying on volatile capacity for critical runs.",
    },
    {
        "number": 19,
        "title": "GC Hell",
        "section": "Memory and Stability",
        "symptom": "Executor CPU is busy but progress is slow and GC time is high.",
        "diagnosis": "Tasks create too many objects or hold large in-memory structures during transformations.",
        "recommended_fix": "Reduce object churn, avoid Python row loops, shrink cached data, and tune memory only after reducing data pressure.",
    },
    {
        "number": 20,
        "title": "Pandas UDF or Arrow Batch Blowups",
        "section": "Memory and Stability",
        "symptom": "Pandas UDF stages fail when converting large batches to Arrow or pandas.",
        "diagnosis": "Arrow batch size and pandas memory use are too large for executor memory.",
        "recommended_fix": "Reduce Arrow batch size, avoid pandas UDFs for simple expressions, and keep transformations Spark-native.",
    },
    {
        "number": 21,
        "title": "Reading Millions of Small Files",
        "section": "Files and Lake Layout",
        "symptom": "A scan takes minutes before any real transformation starts.",
        "diagnosis": "The job is paying metadata and task overhead for millions of tiny input files.",
        "recommended_fix": "Compact small files, use healthier target file sizes, and avoid creating high-cardinality partitions.",
    },
    {
        "number": 22,
        "title": "Writing a Forest of Tiny Files",
        "section": "Files and Lake Layout",
        "symptom": "Downstream queries slow down because each run writes thousands of tiny files.",
        "diagnosis": "The write path has too many partitions for the output volume.",
        "recommended_fix": "Coalesce or repartition intentionally and set maxRecordsPerFile or table compaction policies.",
    },
    {
        "number": 23,
        "title": "Partitioned by User ID, Dying by User ID",
        "section": "Files and Lake Layout",
        "symptom": "The lake has millions of user_id partitions and listing partitions is slow.",
        "diagnosis": "The table is physically partitioned by a high-cardinality key instead of query-friendly low-cardinality columns.",
        "recommended_fix": "Partition by date or another bounded access pattern and cluster/sort by user_id inside files if needed.",
    },
    {
        "number": 24,
        "title": "Some Tasks Read Gigabytes, Others Read Almost Nothing",
        "section": "Files and Lake Layout",
        "symptom": "A few tasks read huge files while many tasks finish immediately.",
        "diagnosis": "The table has uneven file sizes, causing poor parallelism and straggler tasks.",
        "recommended_fix": "Compact into balanced files and monitor file-size distribution by partition.",
    },
    {
        "number": 25,
        "title": "CSV and Gzip at Terabyte Scale",
        "section": "Files and Lake Layout",
        "symptom": "Reading compressed CSV data is slow and cannot parallelize well.",
        "diagnosis": "Gzip CSV is expensive to parse and often unsplittable, limiting parallel reads.",
        "recommended_fix": "Convert raw files to columnar formats such as Parquet and use splittable compression.",
    },
    {
        "number": 26,
        "title": "Schema Inference Surprises",
        "section": "Files and Lake Layout",
        "symptom": "A column is sometimes read as string and sometimes as numeric across daily files.",
        "diagnosis": "Schema inference is guessing types from each input instead of enforcing a contract.",
        "recommended_fix": "Provide an explicit schema and quarantine rows that do not match the contract.",
    },
    {
        "number": 27,
        "title": "Listing the Lake Takes Longer Than Reading It",
        "section": "Files and Lake Layout",
        "symptom": "The job spends a long time listing paths before Spark starts processing.",
        "diagnosis": "The table layout forces expensive object-store listing across too many directories.",
        "recommended_fix": "Use table metadata, partition pruning, manifests, and healthier partition design.",
    },
    {
        "number": 28,
        "title": "Overwrite Wiped More Than Intended",
        "section": "Files and Lake Layout",
        "symptom": "A backfill overwrites partitions outside the intended business date range.",
        "diagnosis": "The write uses broad overwrite behavior instead of limiting the affected partitions.",
        "recommended_fix": "Use dynamic partition overwrite, replaceWhere, or merge semantics scoped to affected partitions.",
    },
    {
        "number": 29,
        "title": "Table Gets Slower Every Month",
        "section": "Files and Lake Layout",
        "symptom": "Queries against the same table slow down steadily as more data lands.",
        "diagnosis": "The table is accumulating small files, stale stats, and suboptimal clustering.",
        "recommended_fix": "Schedule compaction, statistics refresh, and layout optimization as part of table maintenance.",
    },
    {
        "number": 30,
        "title": "MERGE Jobs Get Slower Every Day",
        "section": "Files and Lake Layout",
        "symptom": "Daily merge jobs scan more target data every day even when the update set is small.",
        "diagnosis": "The merge predicate does not prune target partitions or source duplicates before matching.",
        "recommended_fix": "Deduplicate the source, partition-prune the target, and merge only the affected business dates or keys.",
    },
    {
        "number": 31,
        "title": "The Duplicate Explosion After Rerun",
        "section": "Correctness and Data Quality",
        "symptom": "A retried batch doubles rows in the warehouse.",
        "diagnosis": "The write path appends retry data without deduplicating or replacing the affected slice.",
        "recommended_fix": "Make reruns idempotent with business-key deduplication and partition-scoped overwrite or merge.",
    },
    {
        "number": 32,
        "title": "Late Data Changes Yesterday",
        "section": "Correctness and Data Quality",
        "symptom": "Yesterday's numbers change after a delayed source file arrives.",
        "diagnosis": "The pipeline only processes today's ingest date and ignores business dates affected by late data.",
        "recommended_fix": "Track affected business dates and recompute or merge those partitions safely.",
    },
    {
        "number": 33,
        "title": "Incremental Load Missed a Slice of Data",
        "section": "Correctness and Data Quality",
        "symptom": "Rows updated at the exact watermark timestamp are missing after an incremental run.",
        "diagnosis": "The pipeline uses timestamp-only watermarking and misses tie rows with the same updated_at.",
        "recommended_fix": "Use a compound watermark such as updated_at plus primary key and reconcile loaded counts.",
    },
    {
        "number": 34,
        "title": "Timezone Drift Broke the Metric",
        "section": "Correctness and Data Quality",
        "symptom": "Revenue appears on the wrong dashboard date after a timezone boundary.",
        "diagnosis": "The job groups by UTC date instead of the local business date expected by reporting.",
        "recommended_fix": "Convert timestamps to the business timezone before deriving dates and filtering windows.",
    },
    {
        "number": 35,
        "title": "Silent Casts Turned Data Into Nulls",
        "section": "Correctness and Data Quality",
        "symptom": "A numeric column suddenly contains many nulls after a vendor schema change.",
        "diagnosis": "The job casts malformed strings without validating or quarantining invalid rows.",
        "recommended_fix": "Validate before casting, quarantine invalid rows, and alert on cast-null spikes.",
    },
    {
        "number": 36,
        "title": "Join Produced Fewer Rows Than Expected",
        "section": "Correctness and Data Quality",
        "symptom": "A left join unexpectedly drops facts without matching dimension rows.",
        "diagnosis": "A downstream filter on right-table columns turns the left join into inner join behavior.",
        "recommended_fix": "Keep right-side filters in the join condition or explicitly handle missing dimension rows.",
    },
    {
        "number": 37,
        "title": "dropDuplicates Kept the Wrong Row",
        "section": "Correctness and Data Quality",
        "symptom": "The deduplicated table keeps an older version for some business keys.",
        "diagnosis": "dropDuplicates without ordering does not guarantee the latest record survives.",
        "recommended_fix": "Use row_number over a deterministic ordering such as updated_at and sequence number.",
    },
    {
        "number": 38,
        "title": "Schema Drift Broke Downstream Selects",
        "section": "Correctness and Data Quality",
        "symptom": "A downstream select fails after the source removes or renames a column.",
        "diagnosis": "The pipeline assumes the source schema is stable and lacks compatibility handling.",
        "recommended_fix": "Enforce schema contracts, add defaults for optional fields, and alert on incompatible drift.",
    },
    {
        "number": 39,
        "title": "Surrogate Keys Changed After Backfill",
        "section": "Correctness and Data Quality",
        "symptom": "Dimension surrogate keys change after a backfill and break fact joins.",
        "diagnosis": "The job generates surrogate keys from non-deterministic row order.",
        "recommended_fix": "Use stable key assignment based on business keys or maintain keys in a persisted dimension table.",
    },
    {
        "number": 40,
        "title": "Joined Table Has Two Status Columns",
        "section": "Correctness and Data Quality",
        "symptom": "A downstream step reads the wrong status column after joining two datasets.",
        "diagnosis": "The join keeps ambiguous duplicate column names and later logic references the wrong field.",
        "recommended_fix": "Alias columns before joins and project a clean schema with explicit business names.",
    },
    {
        "number": 41,
        "title": "The Stream Cannot Catch Up",
        "section": "Structured Streaming",
        "symptom": "Streaming backlog grows even though the job remains alive.",
        "diagnosis": "Each micro-batch takes longer than the trigger interval, so processing cannot catch up.",
        "recommended_fix": "Measure source, transform, and sink time separately; scale or reduce work per trigger.",
    },
    {
        "number": 42,
        "title": "State Store Keeps Growing Forever",
        "section": "Structured Streaming",
        "symptom": "State store size grows every day and checkpoint storage keeps increasing.",
        "diagnosis": "The query keeps state without a bounded watermark or cleanup condition.",
        "recommended_fix": "Use event-time watermarks, bounded windows, and state TTL aligned to business requirements.",
    },
    {
        "number": 43,
        "title": "Valid Events Are Being Dropped as Late",
        "section": "Structured Streaming",
        "symptom": "Legitimate delayed events are dropped and business totals are low.",
        "diagnosis": "The watermark threshold is shorter than the real source delay distribution.",
        "recommended_fix": "Set the watermark from observed lateness percentiles and monitor dropped-late event counts.",
    },
    {
        "number": 44,
        "title": "Streaming Join State Explosion",
        "section": "Structured Streaming",
        "symptom": "A stream-stream join consumes growing memory and checkpoint storage.",
        "diagnosis": "The join lacks tight event-time bounds and watermarks on both sides.",
        "recommended_fix": "Add watermarks and time-range join conditions, or redesign the join through a compact dimension/state table.",
    },
    {
        "number": 45,
        "title": "One Kafka Partition Burns While Others Coast",
        "section": "Structured Streaming",
        "symptom": "One Kafka partition has most of the lag while other partitions are healthy.",
        "diagnosis": "The Kafka key distribution is skewed and one partition receives too much traffic.",
        "recommended_fix": "Fix key design, split hot keys, or repartition downstream after preserving ordering guarantees where required.",
    },
    {
        "number": 46,
        "title": "Checkpoint Trouble After a Restart",
        "section": "Structured Streaming",
        "symptom": "A streaming deployment fails or behaves strangely after a code change.",
        "diagnosis": "The query changed in a way that is incompatible with the existing checkpoint state.",
        "recommended_fix": "Plan stateful changes carefully, version checkpoint paths when needed, and backfill/replay safely.",
    },
    {
        "number": 47,
        "title": "Exactly Once Until the Sink Retries",
        "section": "Structured Streaming",
        "symptom": "A sink retry creates duplicate records even though the stream checkpoint is healthy.",
        "diagnosis": "The sink write is not idempotent, so retried micro-batches are committed more than once.",
        "recommended_fix": "Use deterministic batch IDs, merge/upsert semantics, and sink-side deduplication.",
    },
    {
        "number": 48,
        "title": "foreachBatch Became the Bottleneck",
        "section": "Structured Streaming",
        "symptom": "Input rate is fine, but each micro-batch spends too long inside custom sink logic.",
        "diagnosis": "foreachBatch is doing expensive, poorly pruned merge or external write work.",
        "recommended_fix": "Deduplicate each batch, prune the target slice, batch external calls, and monitor sink time separately.",
    },
    {
        "number": 49,
        "title": "Restart Read the Wrong Offsets",
        "section": "Structured Streaming",
        "symptom": "After restart, the stream reprocesses old events or skips events unexpectedly.",
        "diagnosis": "Checkpoint path, query identity, or source offset options changed unintentionally.",
        "recommended_fix": "Protect checkpoint identity, audit offsets before publishing, and make replays deliberate and idempotent.",
    },
    {
        "number": 50,
        "title": "Debugging Blind in Production",
        "section": "Structured Streaming",
        "symptom": "The job fails or slows down but engineers cannot quickly tell whether compute, data, or sink behavior caused it.",
        "diagnosis": "The pipeline lacks persistent Spark history, targeted metrics, and output quality checks.",
        "recommended_fix": "Enable Spark event logs, add data-quality metrics, and create incident dashboards for critical outputs.",
    },
)


def _pdf_problem_slug(problem: dict[str, Any]) -> str:
    title_slug = re.sub(r"[^a-z0-9]+", "-", str(problem["title"]).lower()).strip("-")
    return f"pyspark-pdf-{int(problem['number']):02d}-{title_slug}"


def _pdf_signal_rows(problem: dict[str, Any], *, hidden: bool = False) -> list[dict[str, Any]]:
    prefix = f"pyspark-{int(problem['number']):02d}"
    if hidden:
        return [
            {
                "signal_id": f"{prefix}-hidden-boundary",
                "pipeline_area": problem["section"],
                "symptom": f"Hidden boundary signal for {problem['title']}.",
                "risk_score": 8,
                "action_threshold": 8,
                "diagnosis": problem["diagnosis"],
                "recommended_fix": problem["recommended_fix"],
            },
            {
                "signal_id": f"{prefix}-hidden-hot",
                "pipeline_area": problem["section"],
                "symptom": problem["symptom"],
                "risk_score": 10,
                "action_threshold": 8,
                "diagnosis": problem["diagnosis"],
                "recommended_fix": problem["recommended_fix"],
            },
            {
                "signal_id": f"{prefix}-hidden-healthy",
                "pipeline_area": problem["section"],
                "symptom": f"Healthy comparison signal for {problem['title']}.",
                "risk_score": 2,
                "action_threshold": 8,
                "diagnosis": "No production action needed for this comparison signal.",
                "recommended_fix": "Keep monitoring normal variation and do not change the pipeline based on this row.",
            },
        ]

    return [
        {
            "signal_id": f"{prefix}-hot",
            "pipeline_area": problem["section"],
            "symptom": problem["symptom"],
            "risk_score": 9,
            "action_threshold": 7,
            "diagnosis": problem["diagnosis"],
            "recommended_fix": problem["recommended_fix"],
        },
        {
            "signal_id": f"{prefix}-healthy",
            "pipeline_area": problem["section"],
            "symptom": f"Healthy comparison signal for {problem['title']}.",
            "risk_score": 3,
            "action_threshold": 7,
            "diagnosis": "No production action needed for this comparison signal.",
            "recommended_fix": "Keep monitoring normal variation and do not change the pipeline based on this row.",
        },
        {
            "signal_id": f"{prefix}-boundary",
            "pipeline_area": problem["section"],
            "symptom": f"Boundary signal for {problem['title']}.",
            "risk_score": 7,
            "action_threshold": 7,
            "diagnosis": problem["diagnosis"],
            "recommended_fix": problem["recommended_fix"],
        },
    ]


def _pdf_expected_rows(problem: dict[str, Any], *, hidden: bool = False) -> list[list[Any]]:
    return [
        [row["signal_id"], row["diagnosis"], row["recommended_fix"]]
        for row in _pdf_signal_rows(problem, hidden=hidden)
        if row["risk_score"] >= row["action_threshold"]
    ]


def _pdf_problem_spec(problem: dict[str, Any]) -> PysparkSpec:
    return PysparkSpec(
        slug=_pdf_problem_slug(problem),
        output_columns=("signal_id", "diagnosis", "recommended_fix"),
        sample_cases=(
            PysparkCase(
                name="visible production telemetry boundary case",
                inputs=(input_table("incident_signals", _pdf_signal_rows(problem)),),
                expected_rows=_pdf_expected_rows(problem),
            ),
        ),
        hidden_cases=(
            PysparkCase(
                name="hidden production telemetry catches hardcoding and strict comparisons",
                inputs=(input_table("incident_signals", _pdf_signal_rows(problem, hidden=True)),),
                expected_rows=_pdf_expected_rows(problem, hidden=True),
            ),
        ),
    )


PYSPARK_PDF_LAB_SPECS: dict[str, PysparkSpec] = {
    _pdf_problem_slug(problem): _pdf_problem_spec(problem)
    for problem in PDF_PYSPARK_PROBLEMS
}


YESTERDAYS_SALES_SPEC = PysparkSpec(
    slug="yesterdays-sales-missing-late-source-arrival",
    output_columns=("business_date", "order_count", "gross_sales"),
    output_variable_names=("daily_sales", "fixed_daily_sales", "result_df"),
    sample_cases=(
        PysparkCase(
            name="visible late-arriving paid sales",
            context={"run_date": "2026-05-07"},
            inputs=(
                input_table(
                    "raw_sales",
                    [
                        {
                            "order_id": 7001,
                            "customer_id": 101,
                            "sale_ts_utc": "2026-05-07 10:15:00",
                            "amount": 250.0,
                            "status": "PAID",
                            "source_file_date": "2026-05-07",
                            "ingested_at": "2026-05-08 03:22:10",
                        },
                        {
                            "order_id": 7002,
                            "customer_id": 102,
                            "sale_ts_utc": "2026-05-07 18:40:00",
                            "amount": 170.0,
                            "status": "PAID",
                            "source_file_date": "2026-05-07",
                            "ingested_at": "2026-05-08 03:25:44",
                        },
                        {
                            "order_id": 7003,
                            "customer_id": 103,
                            "sale_ts_utc": "2026-05-08 01:05:00",
                            "amount": 90.0,
                            "status": "PAID",
                            "source_file_date": "2026-05-08",
                            "ingested_at": "2026-05-08 03:26:01",
                        },
                        {
                            "order_id": 7004,
                            "customer_id": 104,
                            "sale_ts_utc": "2026-05-07 12:30:00",
                            "amount": 75.0,
                            "status": "CANCELLED",
                            "source_file_date": "2026-05-07",
                            "ingested_at": "2026-05-08 03:23:00",
                        },
                    ],
                    timestamp_columns=("sale_ts_utc", "ingested_at"),
                ),
            ),
            expected_rows=[["2026-05-07", 2, 420.0]],
        ),
    ),
    hidden_cases=(
        PysparkCase(
            name="hidden duplicate late file should not double count",
            context={"run_date": "2026-05-07"},
            inputs=(
                input_table(
                    "raw_sales",
                    [
                        {
                            "order_id": 8101,
                            "customer_id": 201,
                            "sale_ts_utc": "2026-05-07 09:00:00",
                            "amount": 300.0,
                            "status": "PAID",
                            "source_file_date": "2026-05-07",
                            "ingested_at": "2026-05-09 01:10:00",
                        },
                        {
                            "order_id": 8101,
                            "customer_id": 201,
                            "sale_ts_utc": "2026-05-07 09:00:00",
                            "amount": 300.0,
                            "status": "PAID",
                            "source_file_date": "2026-05-07",
                            "ingested_at": "2026-05-09 01:12:00",
                        },
                        {
                            "order_id": 8102,
                            "customer_id": 202,
                            "sale_ts_utc": "2026-05-07 22:35:00",
                            "amount": 120.0,
                            "status": "PAID",
                            "source_file_date": "2026-05-07",
                            "ingested_at": "2026-05-09 01:13:00",
                        },
                        {
                            "order_id": 8103,
                            "customer_id": 203,
                            "sale_ts_utc": "2026-05-07 12:00:00",
                            "amount": 70.0,
                            "status": "CANCELLED",
                            "source_file_date": "2026-05-07",
                            "ingested_at": "2026-05-09 01:14:00",
                        },
                        {
                            "order_id": 8104,
                            "customer_id": 204,
                            "sale_ts_utc": "2026-05-08 00:05:00",
                            "amount": 999.0,
                            "status": "PAID",
                            "source_file_date": "2026-05-08",
                            "ingested_at": "2026-05-09 01:15:00",
                        },
                    ],
                    timestamp_columns=("sale_ts_utc", "ingested_at"),
                ),
            ),
            expected_rows=[["2026-05-07", 2, 420.0]],
        ),
        PysparkCase(
            name="hidden same ingestion day includes wrong business dates",
            context={"run_date": "2026-05-07"},
            inputs=(
                input_table(
                    "raw_sales",
                    [
                        {
                            "order_id": 8201,
                            "customer_id": 301,
                            "sale_ts_utc": "2026-05-06 23:50:00",
                            "amount": 500.0,
                            "status": "PAID",
                            "source_file_date": "2026-05-06",
                            "ingested_at": "2026-05-07 01:00:00",
                        },
                        {
                            "order_id": 8202,
                            "customer_id": 302,
                            "sale_ts_utc": "2026-05-07 11:45:00",
                            "amount": 80.0,
                            "status": "PAID",
                            "source_file_date": "2026-05-07",
                            "ingested_at": "2026-05-08 02:00:00",
                        },
                        {
                            "order_id": 8203,
                            "customer_id": 303,
                            "sale_ts_utc": "2026-05-07 19:10:00",
                            "amount": 140.0,
                            "status": "PAID",
                            "source_file_date": "2026-05-07",
                            "ingested_at": "2026-05-08 02:01:00",
                        },
                    ],
                    timestamp_columns=("sale_ts_utc", "ingested_at"),
                ),
            ),
            expected_rows=[["2026-05-07", 2, 220.0]],
        ),
    ),
)


PYSPARK_SPECS: dict[str, PysparkSpec] = {
    YESTERDAYS_SALES_SPEC.slug: YESTERDAYS_SALES_SPEC,
    **PYSPARK_LAB_SPECS,
    **PYSPARK_PDF_LAB_SPECS,
}
