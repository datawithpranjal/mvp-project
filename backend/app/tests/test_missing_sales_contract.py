"""CURRICULUM-01: contract, actual generated comparator and optional Spark checks."""
import ast
import dataclasses
import datetime
from decimal import Decimal
import json
import math
import os
from pathlib import Path

import pytest

from app.services.missing_sales_fixtures import CASES, PACKET_VERSION
from app.services.pyspark_specs import PYSPARK_SPECS, YESTERDAYS_SALES_SPEC
from app.services.pyspark_validation_service import PysparkValidationConfigurationError, PysparkValidationService

SLUG = YESTERDAYS_SALES_SPEC.slug
SOURCE = (Path(__file__).parent / "fixtures/missing_sales_reference.py").read_text()


def service():
    instance = PysparkValidationService()
    instance.settings = instance.settings.model_copy(update={
        "pyspark_runner_url": None, "pyspark_execution_enabled": True, "pyspark_timeout_seconds": 25.0,
    })
    return instance


def generated_helpers(tolerances=None):
    spec = YESTERDAYS_SALES_SPEC
    if tolerances is not None:
        spec = dataclasses.replace(spec, numeric_tolerances=tolerances)
    source = service()._runner_script(spec, list(spec.sample_cases), Path("unused.py"))
    functions = [node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef)]
    scope = {"PAYLOAD": {"numeric_tolerances": spec.numeric_tolerances, "output_columns": list(spec.output_columns)},
             "Decimal": Decimal, "math": math, "json": json, "_dt": datetime}
    exec(compile(ast.Module(body=functions, type_ignores=[]), "generated-comparator", "exec"), scope)
    return scope


def test_seven_fixture_contract_preserves_existing_oracles_and_identical_replays():
    spec = YESTERDAYS_SALES_SPEC
    assert PACKET_VERSION == "curriculum-01-v1.1"
    assert len(spec.sample_cases) == 1 and len(spec.hidden_cases) == 6
    assert [case["expected"] for case in CASES[:3]] == [
        [["2026-05-07", 2, 420.0]], [["2026-05-07", 2, 420.0]], [["2026-05-07", 2, 220.0]],
    ]
    for case in (*spec.sample_cases, *spec.hidden_cases):
        assert case.session_timezone == "UTC"
        table = case.inputs[0]
        assert table.input_schema and "order_id long" in table.input_schema
        assert table.timestamp_columns == ("sale_ts_utc", "ingested_at")
        seen = {}
        totals = {}
        for row in table.rows:
            payload = {key: value for key, value in row.items() if key != "ingested_at"}
            if row["order_id"] in seen:
                assert seen[row["order_id"]] == payload
            seen[row["order_id"]] = payload
        for row in seen.values():
            if row["status"] == "PAID" and row["sale_ts_utc"][:10] == case.context["run_date"]:
                totals[row["order_id"]] = Decimal(str(row["amount"]))
        expected = [[case.context["run_date"], len(totals), float(sum(totals.values()))]] if totals else []
        assert case.expected_rows == expected


@pytest.mark.parametrize("count,amount,passed", [
    (2, 420, True), (2.0, Decimal("420.00"), True),
    (2, 420.0000000001, True), (2, 420.004, False),
    (2, Decimal("420.004"), False), (2, 420.01, False),
    (2.0004, 420, False), (True, 420, False),
    (2, "420", False), (2, float("nan"), False), (2, float("inf"), False),
])
def test_generated_numeric_policy(count, amount, passed):
    compare = generated_helpers()["rows_match"]
    assert compare([[datetime.date(2026, 5, 7), count, amount]], [["2026-05-07", 2, 420.0]]) is passed


def test_generated_comparator_preserves_rows_and_reports_unrounded_wrong_total():
    helpers = generated_helpers()
    row = ["2026-05-07", 2, 420.004]
    assert helpers["query_result"](list(YESTERDAYS_SALES_SPEC.output_columns), [row])["rows"] == [row]
    compare = helpers["rows_match"]
    assert compare([], [])
    assert not compare([["2026-05-07", 0, 0]], [])
    assert not compare([row, row], [["2026-05-07", 2, 420]])
    assert compare([["b", 2, 20], ["a", 1, 10]], [["a", 1, 10.0], ["b", 2, 20.0]])
    assert not compare([["a", 1, 10], ["a", 1, 10]], [["a", 1, 10], ["b", 1, 10]])


def test_other_specs_retain_legacy_comparison_policy():
    assert all(not spec.numeric_tolerances for slug, spec in PYSPARK_SPECS.items() if slug != SLUG)
    compare = generated_helpers({})["rows_match"]
    assert compare([["2026-05-07", 2, 420.004]], [["2026-05-07", 2, 420]])


spark_check = pytest.mark.skipif(os.environ.get("RUN_SPARK_TESTS") != "1", reason="requires Java and optional Spark runtime")


@spark_check
@pytest.mark.parametrize("solution", ["transform", "alternative"])
@pytest.mark.parametrize("mode,expected_count", [("sample", 1), ("hidden", 6)])
def test_both_solutions_all_seven_cases_under_non_utc_host(monkeypatch, solution, mode, expected_count):
    monkeypatch.setenv("TZ", "America/Los_Angeles")
    code = SOURCE + f'''\nassert spark.conf.get("spark.sql.session.timeZone") == "UTC"
assert spark.conf.get("spark.sql.timestampType") == "TIMESTAMP_LTZ"
fixed_daily_sales = {solution}(raw_sales, run_date)
'''
    result = service().validate(SLUG, code, mode)
    assert len(result.tests) == expected_count
    assert result.passed, result.model_dump()
    assert all(test.passed for test in result.tests)


@spark_check
@pytest.mark.parametrize("mutation", ["wrong_date", "wrong_timezone", "sub_cent_total", "fractional_count", "zero_filled_empty"])
def test_actual_validator_rejects_wrong_results(mutation):
    code = SOURCE + "\nfixed_daily_sales = transform(raw_sales, run_date)\n"
    if mutation == "wrong_date":
        code = code.replace("F.lit(run_date)", 'F.lit("2026-05-07")')
    elif mutation == "wrong_timezone":
        code = code.replace('F.to_date("sale_ts_utc")', 'F.to_date(F.from_utc_timestamp("sale_ts_utc", "Asia/Kolkata"))')
    elif mutation == "sub_cent_total":
        code += 'fixed_daily_sales = fixed_daily_sales.withColumn("gross_sales", F.col("gross_sales") + F.lit(0.004))\n'
    elif mutation == "fractional_count":
        code += 'fixed_daily_sales = fixed_daily_sales.withColumn("order_count", F.col("order_count") + F.lit(0.004))\n'
    else:
        code += '''if fixed_daily_sales.count() == 0:
    fixed_daily_sales = spark.createDataFrame([(run_date, 0, 0.0)], "business_date string, order_count long, gross_sales double")
'''
    result = service().validate(SLUG, code, "hidden")
    assert not result.passed, (mutation, result.model_dump())
    assert any(not test.passed for test in result.tests)


@spark_check
def test_bad_fixture_setup_is_unavailable_not_learner_incorrect(monkeypatch):
    empty = YESTERDAYS_SALES_SPEC.hidden_cases[-1]
    invalid = dataclasses.replace(empty, inputs=(dataclasses.replace(empty.inputs[0], input_schema=None),))
    monkeypatch.setitem(PYSPARK_SPECS, SLUG, dataclasses.replace(YESTERDAYS_SALES_SPEC, sample_cases=(invalid,)))
    with pytest.raises(PysparkValidationConfigurationError, match="worker could not finish"):
        service().validate(SLUG, SOURCE + "\nfixed_daily_sales = transform(raw_sales, run_date)\n", "sample")
