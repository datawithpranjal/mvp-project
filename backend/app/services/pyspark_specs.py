from __future__ import annotations

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
}

