WITH attributed_clicks AS (
  SELECT
    o.order_id,
    o.customer_id,
    o.order_amount,
    o.order_ts,
    c.campaign_id,
    ROW_NUMBER() OVER (
      PARTITION BY o.order_id
      ORDER BY c.clicked_at DESC NULLS LAST, c.click_id DESC NULLS LAST
    ) AS click_rank
  FROM orders o
  LEFT JOIN email_clicks c
    ON o.customer_id = c.customer_id
   AND c.clicked_at <= o.order_ts
)
SELECT
  order_id,
  customer_id,
  order_amount,
  campaign_id,
  order_ts
FROM attributed_clicks
WHERE click_rank = 1

