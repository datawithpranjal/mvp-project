CREATE TABLE expected_partner_files (
  partition_date DATE,
  file_name VARCHAR
);

INSERT INTO expected_partner_files (partition_date, file_name) VALUES
  ('2026-05-03', 'partner_orders_2026-05-03_001.csv.gz'),
  ('2026-05-03', 'partner_orders_2026-05-03_002.csv.gz'),
  ('2026-05-03', 'partner_orders_2026-05-03_003.csv.gz'),
  ('2026-05-04', 'partner_orders_2026-05-04_001.csv.gz');

CREATE TABLE loaded_partner_files (
  partition_date DATE,
  file_name VARCHAR,
  loaded_at TIMESTAMP
);

INSERT INTO loaded_partner_files (partition_date, file_name, loaded_at) VALUES
  ('2026-05-03', 'partner_orders_2026-05-03_001.csv.gz', '2026-05-03 01:05:00'),
  ('2026-05-03', 'partner_orders_2026-05-03_003.csv.gz', '2026-05-03 01:05:01'),
  ('2026-05-04', 'partner_orders_2026-05-04_001.csv.gz', '2026-05-04 01:02:00');

CREATE TABLE airflow_task_attempts (
  dag_id VARCHAR,
  task_id VARCHAR,
  run_id VARCHAR,
  try_number INTEGER,
  partition_date DATE,
  status VARCHAR,
  error_message VARCHAR
);

INSERT INTO airflow_task_attempts (
  dag_id,
  task_id,
  run_id,
  try_number,
  partition_date,
  status,
  error_message
) VALUES
  ('partner_file_ingestion', 'load_partner_files', 'scheduled__2026-05-03T01:00:00', 1, '2026-05-03', 'failed', 'gzip EOF while reading partner_orders_2026-05-03_002.csv.gz'),
  ('partner_file_ingestion', 'load_partner_files', 'scheduled__2026-05-03T01:00:00', 2, '2026-05-03', 'success', NULL),
  ('partner_file_ingestion', 'load_partner_files', 'scheduled__2026-05-04T01:00:00', 1, '2026-05-04', 'success', NULL);

