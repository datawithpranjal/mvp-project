SELECT
  CAST(event_at AS DATE) AS revenue_date,
  merchant_id,
  SUM(
    CASE
      WHEN event_type = 'refund' THEN -amount
      ELSE amount
    END
  ) AS net_revenue
FROM payment_events
WHERE status = 'posted'
GROUP BY 1, 2
