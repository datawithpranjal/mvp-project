SELECT
  order_id,
  customer_id,
  total_amount AS amount,
  order_status AS status,
  updated_at
FROM raw_checkout_orders
WHERE updated_at > (
  SELECT last_loaded_at
  FROM pipeline_run_metadata
  WHERE pipeline_name = 'checkout_orders_curated'
)

