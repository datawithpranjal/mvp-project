CREATE TABLE source_invoice_items (
  invoice_id INTEGER,
  customer_id INTEGER,
  amount DECIMAL(10, 2),
  invoice_date DATE
);

INSERT INTO source_invoice_items (invoice_id, customer_id, amount, invoice_date) VALUES
  (501, 8801, 120.00, '2026-05-02'),
  (502, 8802, 75.50, '2026-05-02'),
  (503, 8803, 210.25, '2026-05-02');

CREATE TABLE warehouse_invoice_facts (
  warehouse_row_id INTEGER,
  invoice_id INTEGER,
  customer_id INTEGER,
  amount DECIMAL(10, 2),
  invoice_date DATE,
  loaded_batch_id VARCHAR,
  loaded_at TIMESTAMP
);

INSERT INTO warehouse_invoice_facts (
  warehouse_row_id,
  invoice_id,
  customer_id,
  amount,
  invoice_date,
  loaded_batch_id,
  loaded_at
) VALUES
  (1, 501, 8801, 120.00, '2026-05-02', 'batch_2026_05_02_initial', '2026-05-02 01:02:00'),
  (2, 502, 8802, 75.50, '2026-05-02', 'batch_2026_05_02_initial', '2026-05-02 01:02:03'),
  (3, 503, 8803, 210.25, '2026-05-02', 'batch_2026_05_02_initial', '2026-05-02 01:02:08'),
  (4, 501, 8801, 120.00, '2026-05-02', 'batch_2026_05_02_rerun', '2026-05-02 02:10:02'),
  (5, 502, 8802, 75.50, '2026-05-02', 'batch_2026_05_02_rerun', '2026-05-02 02:10:04'),
  (6, 503, 8803, 210.25, '2026-05-02', 'batch_2026_05_02_rerun', '2026-05-02 02:10:05');

CREATE TABLE pipeline_runs (
  pipeline_name VARCHAR,
  batch_id VARCHAR,
  rerun_of_batch_id VARCHAR,
  status VARCHAR,
  started_at TIMESTAMP
);

INSERT INTO pipeline_runs (pipeline_name, batch_id, rerun_of_batch_id, status, started_at) VALUES
  ('invoice_fact_load', 'batch_2026_05_02_initial', NULL, 'failed', '2026-05-02 01:00:00'),
  ('invoice_fact_load', 'batch_2026_05_02_rerun', 'batch_2026_05_02_initial', 'success', '2026-05-02 02:09:50');

