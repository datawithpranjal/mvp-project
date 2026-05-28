WITH ranked_rows AS (
  SELECT
    warehouse_row_id,
    invoice_id,
    customer_id,
    amount,
    invoice_date,
    loaded_batch_id,
    loaded_at,
    ROW_NUMBER() OVER (
      PARTITION BY invoice_id, invoice_date
      ORDER BY loaded_at, warehouse_row_id
    ) AS row_rank
  FROM warehouse_invoice_facts
  WHERE invoice_date = DATE '2026-05-02'
)
SELECT
  warehouse_row_id,
  invoice_id,
  customer_id,
  amount,
  invoice_date,
  loaded_batch_id,
  loaded_at
FROM ranked_rows
WHERE row_rank > 1

