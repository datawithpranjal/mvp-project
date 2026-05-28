CREATE TABLE orders (
  order_id INTEGER,
  customer_id INTEGER,
  order_amount DECIMAL(10, 2),
  order_ts TIMESTAMP
);

INSERT INTO orders (order_id, customer_id, order_amount, order_ts) VALUES
  (9001, 3001, 120.00, '2026-05-12 10:00:00'),
  (9002, 3002, 80.00, '2026-05-12 11:30:00'),
  (9003, 3003, 200.00, '2026-05-12 12:00:00');

CREATE TABLE email_clicks (
  click_id INTEGER,
  customer_id INTEGER,
  campaign_id VARCHAR,
  clicked_at TIMESTAMP
);

INSERT INTO email_clicks (click_id, customer_id, campaign_id, clicked_at) VALUES
  (1, 3001, 'CAMP_A', '2026-05-12 08:50:00'),
  (2, 3001, 'CAMP_B', '2026-05-12 09:55:00'),
  (3, 3001, 'CAMP_C', '2026-05-12 10:05:00'),
  (4, 3002, 'CAMP_D', '2026-05-12 11:00:00');

