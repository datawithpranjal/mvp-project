CREATE TABLE source_orders (
  order_id INTEGER,
  customer_id INTEGER,
  amount DECIMAL(10, 2),
  status VARCHAR,
  updated_at TIMESTAMP
);

INSERT INTO source_orders (order_id, customer_id, amount, status, updated_at) VALUES
  (100, 1000, 125.50, 'delivered',  '2026-05-01 10:00:00'),
  (101, 1001,  86.25, 'delivered',  '2026-05-01 10:03:00'),
  (102, 1002, 200.00, 'shipped',    '2026-05-01 10:05:00'),
  (103, 1003, 150.00, 'processing', '2026-05-01 10:05:00'),
  (104, 1004,  91.75, 'cancelled',  '2026-05-01 10:06:00'),
  (105, 1005, 210.10, 'shipped',    '2026-05-01 10:07:00');

CREATE TABLE warehouse_orders (
  order_id INTEGER,
  customer_id INTEGER,
  amount DECIMAL(10, 2),
  status VARCHAR,
  updated_at TIMESTAMP
);

INSERT INTO warehouse_orders (order_id, customer_id, amount, status, updated_at) VALUES
  (100, 1000, 125.50, 'delivered', '2026-05-01 10:00:00'),
  (101, 1001,  86.25, 'delivered', '2026-05-01 10:03:00'),
  (102, 1002, 200.00, 'shipped',   '2026-05-01 10:05:00');

CREATE TABLE pipeline_run_metadata (
  pipeline_name VARCHAR,
  last_max_updated_at TIMESTAMP,
  last_max_order_id INTEGER
);

INSERT INTO pipeline_run_metadata (pipeline_name, last_max_updated_at, last_max_order_id) VALUES
  ('orders_incremental_load', '2026-05-01 10:05:00', 102);

