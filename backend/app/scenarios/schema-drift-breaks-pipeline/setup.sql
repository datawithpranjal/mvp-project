CREATE TABLE raw_checkout_orders (
  order_id INTEGER,
  customer_id INTEGER,
  total_amount DECIMAL(10, 2),
  order_status VARCHAR,
  updated_at TIMESTAMP
);

INSERT INTO raw_checkout_orders (
  order_id,
  customer_id,
  total_amount,
  order_status,
  updated_at
) VALUES
  (7001, 9201, 45.00, 'paid', '2026-06-01 08:55:00'),
  (7002, 9202, 89.99, 'shipped', '2026-06-01 09:10:00'),
  (7003, 9203, 15.50, 'cancelled', '2026-06-01 09:18:00');

CREATE TABLE curated_orders (
  order_id INTEGER,
  customer_id INTEGER,
  amount DECIMAL(10, 2),
  status VARCHAR,
  updated_at TIMESTAMP
);

INSERT INTO curated_orders (order_id, customer_id, amount, status, updated_at) VALUES
  (7001, 9201, 45.00, 'paid', '2026-06-01 08:55:00');

CREATE TABLE pipeline_run_metadata (
  pipeline_name VARCHAR,
  last_loaded_at TIMESTAMP
);

INSERT INTO pipeline_run_metadata (pipeline_name, last_loaded_at) VALUES
  ('checkout_orders_curated', '2026-06-01 09:00:00');

