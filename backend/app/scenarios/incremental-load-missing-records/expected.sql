SELECT order_id, customer_id, amount, status, updated_at
FROM source_orders
WHERE updated_at > (
  SELECT last_max_updated_at
  FROM pipeline_run_metadata
  WHERE pipeline_name = 'orders_incremental_load'
)
OR (
  updated_at = (
    SELECT last_max_updated_at
    FROM pipeline_run_metadata
    WHERE pipeline_name = 'orders_incremental_load'
  )
  AND order_id > (
    SELECT last_max_order_id
    FROM pipeline_run_metadata
    WHERE pipeline_name = 'orders_incremental_load'
  )
)

