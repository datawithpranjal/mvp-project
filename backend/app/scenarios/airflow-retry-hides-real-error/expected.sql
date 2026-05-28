WITH missing_files AS (
  SELECT
    expected.partition_date,
    expected.file_name
  FROM expected_partner_files AS expected
  LEFT JOIN loaded_partner_files AS loaded
    ON expected.partition_date = loaded.partition_date
   AND expected.file_name = loaded.file_name
  WHERE loaded.file_name IS NULL
),
latest_partition_error AS (
  SELECT
    partition_date,
    error_message,
    ROW_NUMBER() OVER (
      PARTITION BY partition_date
      ORDER BY try_number DESC
    ) AS error_rank
  FROM airflow_task_attempts
  WHERE error_message IS NOT NULL
)
SELECT
  missing.partition_date,
  missing.file_name,
  partition_error.error_message AS latest_error_message
FROM missing_files AS missing
LEFT JOIN latest_partition_error AS partition_error
  ON missing.partition_date = partition_error.partition_date
 AND partition_error.error_rank = 1

