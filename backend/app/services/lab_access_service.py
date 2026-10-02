from __future__ import annotations


FREE_PYTHON_LAB_SLUGS = frozenset(
    {
        "python-foundry-01-normalize-payment-statuses",
        "python-foundry-02-extract-failed-job-ids",
        "python-foundry-03-deduplicate-event-ids",
        "python-foundry-04-find-missing-required-fields",
        "python-foundry-05-summarize-inventory-by-sku",
        "python-foundry-06-parse-partition-dates",
        "python-foundry-07-mask-customer-emails",
        "python-foundry-08-calculate-success-rate",
    }
)

FREE_PYSPARK_LAB_SLUGS = frozenset(
    {
        "pyspark-append-rerun-duplicates",
        "pyspark-python-udf-slow-normalization",
        "pyspark-skewed-customer-join",
        "pyspark-small-files-hourly-writes",
        "pyspark-cache-everything-memory-pressure",
        "pyspark-pdf-01-the-endless-final-stage",
        "pyspark-pdf-02-shuffle-storm-after-a-big-join",
        "pyspark-pdf-03-one-core-busy-cluster-idle",
        "pyspark-pdf-04-thousands-of-tiny-tasks",
        "pyspark-pdf-05-the-groupbykey-memory-trap",
    }
)


def python_lab_requires_premium(slug: str) -> bool:
    return slug not in FREE_PYTHON_LAB_SLUGS


def pyspark_lab_requires_premium(slug: str) -> bool:
    return slug not in FREE_PYSPARK_LAB_SLUGS
