import pytest

from app.services.validation_service import ValidationService


@pytest.mark.parametrize(
    ("slug", "answer", "expected_rows"),
    [
        (
            "null-trap",
            """
            SELECT c.customer_id, c.customer_name
            FROM customers AS c
            WHERE NOT EXISTS (
              SELECT 1
              FROM orders AS o
              WHERE o.customer_id = c.customer_id
            )
            """,
            [[3, "Cleo"], [4, "Dev"]],
        ),
        (
            "top-n-tie-trap",
            """
            WITH ranked_products AS (
              SELECT
                category,
                product_id,
                revenue,
                ROW_NUMBER() OVER (
                  PARTITION BY category
                  ORDER BY revenue DESC, product_id ASC
                ) AS rank_in_category
              FROM product_revenue
            )
            SELECT category, product_id, revenue, rank_in_category
            FROM ranked_products
            WHERE rank_in_category <= 3
            """,
            [
                ["Accessories", "A10", 300.0, 1],
                ["Accessories", "A20", 250.0, 2],
                ["Accessories", "A30", 250.0, 3],
                ["Shoes", "S10", 500.0, 1],
                ["Shoes", "S20", 450.0, 2],
                ["Shoes", "S30", 450.0, 3],
            ],
        ),
        (
            "merge-with-duplicate-matches",
            """
            WITH ranked_updates AS (
              SELECT
                customer_id,
                status,
                updated_at,
                ROW_NUMBER() OVER (
                  PARTITION BY customer_id
                  ORDER BY updated_at DESC, source_row_id DESC
                ) AS update_rank
              FROM source_customer_updates
            )
            SELECT customer_id, status, updated_at
            FROM ranked_updates
            WHERE update_rank = 1
            """,
            [
                [2001, "active", "2026-06-09 02:59:00"],
                [2002, "active", "2026-06-09 02:58:00"],
                [2003, "active", "2026-06-09 02:57:00"],
            ],
        ),
        (
            "timezone-boundary-bug",
            """
            SELECT
              CAST(event_ts_utc + (utc_offset_hours * INTERVAL '1 hour') AS DATE) AS business_date,
              purchase_events.store_id,
              SUM(amount) AS total_amount
            FROM purchase_events
            JOIN store_timezones
              ON purchase_events.store_id = store_timezones.store_id
            GROUP BY 1, 2
            """,
            [
                ["2026-07-01", 10, 140.0],
                ["2026-07-02", 10, 60.0],
            ],
        ),
        (
            "delete-semantics-problem",
            """
            WITH latest_events AS (
              SELECT
                customer_id,
                customer_name,
                op_type,
                event_sequence,
                ROW_NUMBER() OVER (
                  PARTITION BY customer_id
                  ORDER BY event_sequence DESC
                ) AS event_rank
              FROM cdc_customer_events
            )
            SELECT
              customer_id,
              customer_name,
              event_sequence AS last_event_sequence
            FROM latest_events
            WHERE event_rank = 1
              AND op_type <> 'DELETE'
            """,
            [
                [3001, "Ava Stone", 2],
                [3003, "Cleo", 1],
            ],
        ),
    ],
)
def test_validation_passes_for_priority_sql_scenarios(
    slug: str, answer: str, expected_rows: list[list[object]]
) -> None:
    service = ValidationService()

    response = service.validate_submission(slug=slug, answer=answer)

    assert response.validation_type == "SQL_OUTPUT_MATCH"
    assert response.passed is True
    assert response.actual_output is not None
    assert response.actual_output.rows == expected_rows


def test_validation_fails_for_null_trap_not_in_query() -> None:
    service = ValidationService()

    response = service.validate_submission(
        slug="null-trap",
        answer="""
        SELECT customer_id, customer_name
        FROM customers
        WHERE customer_id NOT IN (
          SELECT customer_id
          FROM orders
        )
        """,
    )

    assert response.passed is False
    assert response.actual_output is not None
    assert response.actual_output.rows == []
    assert "does not match" in response.message


def test_validation_rejects_non_read_only_sql() -> None:
    service = ValidationService()

    response = service.validate_submission(
        slug="null-trap",
        answer="DROP TABLE customers",
    )

    assert response.passed is False
    assert response.actual_output is None
    assert response.message == "Only read-only SELECT or WITH queries are allowed in this playground."


def test_rubric_validation_returns_model_answer() -> None:
    service = ValidationService()

    response = service.validate_submission(
        slug="silent-udf-tax",
        answer="The Python UDF crosses the Python boundary and should use Spark built-ins.",
    )

    assert response.validation_type == "CODE_REVIEW_RUBRIC"
    assert response.passed is None
    assert response.actual_output is None
    assert "built-ins" in response.solution_answer
    assert len(response.rubric) >= 3
