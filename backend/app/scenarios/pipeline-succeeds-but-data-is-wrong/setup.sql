CREATE TABLE payment_events (
  payment_id INTEGER,
  merchant_id INTEGER,
  event_type VARCHAR,
  status VARCHAR,
  amount DECIMAL(10, 2),
  event_at TIMESTAMP
);

INSERT INTO payment_events (
  payment_id,
  merchant_id,
  event_type,
  status,
  amount,
  event_at
) VALUES
  (10001, 501, 'charge', 'posted', 100.00, '2026-04-10 09:00:00'),
  (10002, 501, 'refund', 'posted', 25.00, '2026-04-10 10:15:00'),
  (10003, 501, 'charge', 'failed', 60.00, '2026-04-10 11:00:00'),
  (10004, 502, 'charge', 'posted', 200.00, '2026-04-10 12:00:00'),
  (10005, 502, 'refund', 'posted', 40.00, '2026-04-10 12:30:00'),
  (10006, 502, 'charge', 'posted', 50.00, '2026-04-11 08:00:00');

