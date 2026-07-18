type OriginalPythonLab = {
  id: string;
  slug: string;
  track: "python";
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  section: string;
  topicTags: string[];
  isFree: boolean;
  estimatedMinutes: number;
  businessContext: string;
  problemStatement: string;
  expectedOutcome: string;
  studentTask: string;
  starterCode: string;
  solutionCode: string;
  explanation: string;
  hints: string[];
  tables: [];
  functionName: string;
  testCases: Array<{
    name: string;
    args: unknown[];
    expected: unknown;
  }>;
  commonMistakes: string[];
  validationMode: "python";
  serverValidation: "python";
};

function lab(
  input: Omit<
    OriginalPythonLab,
    "track" | "solutionCode" | "tables" | "validationMode" | "serverValidation" | "starterCode"
  >
): OriginalPythonLab {
  return {
    ...input,
    track: "python",
    starterCode: `def ${input.functionName}(*args):\n    # Write your solution here\n    raise NotImplementedError`,
    solutionCode: "",
    tables: [],
    validationMode: "python",
    serverValidation: "python"
  };
}

export const originalPythonLabData: OriginalPythonLab[] = [
  lab({
    id: "python-foundry-001",
    slug: "python-foundry-01-normalize-payment-statuses",
    title: "Python 51: Normalize payment statuses for a dashboard",
    difficulty: "beginner",
    section: "Data Cleaning",
    topicTags: ["Python", "Data Quality", "Dictionaries"],
    isFree: true,
    estimatedMinutes: 12,
    businessContext:
      "A payments dashboard is showing separate counts for PAID, successful, captured, and failed variants because upstream systems send inconsistent status labels.",
    problemStatement:
      "Normalize raw payment status strings into success, failed, pending, and unknown buckets, then return the count for every bucket.",
    expectedOutcome:
      "Return a dictionary with keys success, failed, pending, and unknown. Every input event should contribute to exactly one bucket.",
    studentTask:
      "Define normalize_payment_statuses(events). Strip whitespace, ignore case, map common aliases, and keep unexpected values in unknown.",
    functionName: "normalize_payment_statuses",
    testCases: [
      {
        name: "visible mixed payment statuses",
        args: [[
          { payment_id: "p1", status: "PAID" },
          { payment_id: "p2", status: " successful " },
          { payment_id: "p3", status: "DECLINED" },
          { payment_id: "p4", status: "waiting" }
        ]],
        expected: { success: 2, failed: 1, pending: 0, unknown: 1 }
      }
    ],
    explanation:
      "This tests dictionary normalization for messy operational values. Edge cases include whitespace, casing, NULL-like values, and statuses the mapping does not know yet. The safe solution does not drop unknown values because that would hide data quality drift.",
    hints: [
      "Create a mapping from raw aliases to canonical statuses.",
      "Normalize each raw status with strip() and lower() before lookup.",
      "Initialize all four buckets so missing categories still appear in the output."
    ],
    commonMistakes: [
      "Only checking for exact uppercase values and missing lowercase or whitespace variants.",
      "Dropping unknown statuses instead of counting them for data quality visibility."
    ]
  }),
  lab({
    id: "python-foundry-002",
    slug: "python-foundry-02-extract-failed-job-ids",
    title: "Python 52: Extract failed job IDs from pipeline logs",
    difficulty: "beginner",
    section: "Log Parsing",
    topicTags: ["Python", "Logs", "Regex"],
    isFree: true,
    estimatedMinutes: 12,
    businessContext:
      "An on-call engineer receives a mixed scheduler log and needs a quick utility to identify which jobs actually failed without raising duplicate alerts.",
    problemStatement:
      "Read log lines and return unique job IDs from lines containing FAILED or ERROR. Job IDs may appear as job_id=... or job=....",
    expectedOutcome:
      "Return failed job IDs in first-seen order. Ignore failed-looking lines that do not contain a job token.",
    studentTask:
      "Define extract_failed_job_ids(log_lines). Use a robust token search instead of fixed string positions.",
    functionName: "extract_failed_job_ids",
    testCases: [
      {
        name: "visible scheduler log extract",
        args: [[
          "2026-06-01 INFO job_id=orders_daily started",
          "2026-06-01 ERROR job_id=orders_daily FAILED missing partition",
          "2026-06-01 WARN job=inventory_sync retrying",
          "2026-06-01 FAILED job=inventory_sync timeout",
          "2026-06-01 ERROR job_id=orders_daily retry failed"
        ]],
        expected: ["orders_daily", "inventory_sync"]
      }
    ],
    explanation:
      "This tests practical log parsing. Edge cases include repeated failures, lowercase error text, and lines that contain ERROR but no job identifier. A safe parser preserves alert order and deduplicates repeated failure messages.",
    hints: [
      "First filter lines by FAILED or ERROR using a case-insensitive check.",
      "Then extract job_id= or job= with a small regex.",
      "Use a set for dedupe and a list for preserving first-seen order."
    ],
    commonMistakes: [
      "Splitting on spaces and assuming the job token is always in the same position.",
      "Returning duplicate job IDs when retries log the same failure multiple times."
    ]
  }),
  lab({
    id: "python-foundry-003",
    slug: "python-foundry-03-deduplicate-event-ids",
    title: "Python 53: Deduplicate replayed event IDs",
    difficulty: "beginner",
    section: "Idempotency",
    topicTags: ["Python", "Deduplication", "Data Quality"],
    isFree: true,
    estimatedMinutes: 12,
    businessContext:
      "A webhook ingestion job retried after a timeout and sent some events twice. The downstream metric should count each event_id once.",
    problemStatement:
      "Given event dictionaries, keep the first valid occurrence of every event_id and preserve arrival order.",
    expectedOutcome:
      "Return the deduplicated event dictionaries. Skip rows where event_id is missing or None.",
    studentTask:
      "Define deduplicate_event_ids(events). Preserve the first record for each event_id.",
    functionName: "deduplicate_event_ids",
    testCases: [
      {
        name: "visible duplicate events",
        args: [[
          { event_id: "e1", amount: 100 },
          { event_id: "e2", amount: 200 },
          { event_id: "e1", amount: 100 },
          { event_id: null, amount: 999 }
        ]],
        expected: [{ event_id: "e1", amount: 100 }, { event_id: "e2", amount: 200 }]
      }
    ],
    explanation:
      "This tests idempotency basics. Edge cases include missing IDs, duplicate retries, and conflicting duplicate payloads. Keeping the first valid event mirrors common ingestion logic where the first accepted event wins.",
    hints: [
      "Track event_ids you have already emitted.",
      "Only append an event when its event_id exists and has not been seen.",
      "Do not sort the events; arrival order matters."
    ],
    commonMistakes: [
      "Using set(events), which fails because dictionaries are unhashable.",
      "Sorting events and accidentally changing the arrival-order semantics."
    ]
  }),
  lab({
    id: "python-foundry-004",
    slug: "python-foundry-04-find-missing-required-fields",
    title: "Python 54: Build a required-field reject list",
    difficulty: "beginner",
    section: "Data Quality",
    topicTags: ["Python", "Validation", "Data Quality"],
    isFree: true,
    estimatedMinutes: 12,
    businessContext:
      "A batch loader should quarantine bad rows instead of failing the full load when required fields are blank or missing.",
    problemStatement:
      "For each record, identify required fields whose value is None or an empty string.",
    expectedOutcome:
      "Return a list of dictionaries with record_id and missing_fields for invalid records only.",
    studentTask:
      "Define find_missing_required_fields(records, required_fields). Keep missing fields in the same order as required_fields.",
    functionName: "find_missing_required_fields",
    testCases: [
      {
        name: "visible missing required fields",
        args: [[
          { record_id: 1, customer_id: "c1", amount: 100, event_date: "2026-06-01" },
          { record_id: 2, customer_id: "", amount: 200, event_date: "2026-06-01" },
          { record_id: 3, customer_id: "c3", amount: null, event_date: "2026-06-02" }
        ], ["customer_id", "amount", "event_date"]],
        expected: [
          { record_id: 2, missing_fields: ["customer_id"] },
          { record_id: 3, missing_fields: ["amount"] }
        ]
      }
    ],
    explanation:
      "This tests batch validation. Edge cases include present-but-empty values and multiple missing fields. The safe solution returns a structured reject list so the pipeline can load good rows and report bad ones.",
    hints: [
      "Loop over records, then over required_fields.",
      "Treat both None and \"\" as missing.",
      "Append a reject item only when at least one required field is missing."
    ],
    commonMistakes: [
      "Checking only whether the key exists and forgetting blank strings.",
      "Stopping at the first missing field instead of reporting all missing fields."
    ]
  }),
  lab({
    id: "python-foundry-005",
    slug: "python-foundry-05-summarize-inventory-by-sku",
    title: "Python 55: Summarize inventory movements by SKU",
    difficulty: "beginner",
    section: "Aggregation",
    topicTags: ["Python", "Aggregation", "Warehouse"],
    isFree: true,
    estimatedMinutes: 12,
    businessContext:
      "A warehouse operations team wants a quick on-hand count from inbound and outbound stock movement events.",
    problemStatement:
      "Aggregate quantities by sku. Inbound movements add stock; outbound movement types out, sale, and ship subtract stock.",
    expectedOutcome:
      "Return a sorted list of dictionaries with sku and on_hand.",
    studentTask:
      "Define summarize_inventory_by_sku(movements). Ignore rows with missing SKU and make output deterministic.",
    functionName: "summarize_inventory_by_sku",
    testCases: [
      {
        name: "visible stock movements",
        args: [[
          { sku: "A", movement_type: "in", quantity: 10 },
          { sku: "A", movement_type: "sale", quantity: 3 },
          { sku: "B", movement_type: "ship", quantity: 2 },
          { sku: "B", movement_type: "in", quantity: 8 }
        ]],
        expected: [{ sku: "A", on_hand: 7 }, { sku: "B", on_hand: 6 }]
      }
    ],
    explanation:
      "This tests dictionary aggregation with business sign logic. Edge cases include missing SKU, None quantity, and mixed movement case. Sorting output prevents flaky comparison.",
    hints: [
      "Use a dictionary keyed by sku for running totals.",
      "Convert outbound movement types into negative quantities.",
      "Build the final list by iterating over sorted SKU keys."
    ],
    commonMistakes: [
      "Adding all quantities and forgetting outbound movements reduce stock.",
      "Returning a dictionary when the expected output requires a sorted list of records."
    ]
  }),
  lab({
    id: "python-foundry-006",
    slug: "python-foundry-06-parse-partition-dates",
    title: "Python 56: Parse partition dates from lake paths",
    difficulty: "beginner",
    section: "File Metadata",
    topicTags: ["Python", "Data Lake", "Regex"],
    isFree: true,
    estimatedMinutes: 12,
    businessContext:
      "An S3/GCS listing contains many files per partition. You need to know which business dates are present before running reconciliation.",
    problemStatement:
      "Extract unique dates from paths containing dt=YYYY-MM-DD or date=YYYY-MM-DD.",
    expectedOutcome:
      "Return sorted unique partition dates and ignore paths without a valid partition date.",
    studentTask:
      "Define parse_partition_dates(paths). Support both common partition key names.",
    functionName: "parse_partition_dates",
    testCases: [
      {
        name: "visible partition paths",
        args: [[
          "s3://lake/orders/dt=2026-06-01/file1.parquet",
          "s3://lake/orders/dt=2026-06-01/file2.parquet",
          "s3://lake/orders/date=2026-06-02/file.parquet",
          "s3://lake/orders/no-date/file.parquet"
        ]],
        expected: ["2026-06-01", "2026-06-02"]
      }
    ],
    explanation:
      "This tests path parsing and dedupe. Edge cases include duplicate files under the same date and paths that are not partitioned. The safe solution reads metadata from the path rather than from file names.",
    hints: [
      "A regex for either dt= or date= keeps the parser compact.",
      "Use a set to deduplicate many files inside one partition.",
      "Return sorted dates so reconciliation reports are stable."
    ],
    commonMistakes: [
      "Assuming every path has dt= and missing date= partitions.",
      "Returning duplicate dates when a partition has many files."
    ]
  }),
  lab({
    id: "python-foundry-007",
    slug: "python-foundry-07-mask-customer-emails",
    title: "Python 57: Mask customer emails before logging",
    difficulty: "beginner",
    section: "PII Safety",
    topicTags: ["Python", "Security", "Data Quality"],
    isFree: true,
    estimatedMinutes: 12,
    businessContext:
      "A debugging script prints customer emails into logs. Before it can run in production, the email local part must be masked.",
    problemStatement:
      "Mask each valid email as first_letter***@domain. Invalid or missing emails should return None.",
    expectedOutcome:
      "Return a list of masked emails in the same order as input.",
    studentTask:
      "Define mask_customer_emails(emails). Normalize domains to lowercase and avoid throwing on bad values.",
    functionName: "mask_customer_emails",
    testCases: [
      {
        name: "visible email masking",
        args: [["Asha.Kumar@Example.COM", "bad-email", "", null]],
        expected: ["a***@example.com", null, null, null]
      }
    ],
    explanation:
      "This tests safe string handling around PII. Edge cases include invalid strings, blank values, and mixed case. The safe solution masks before logging and returns None for bad inputs.",
    hints: [
      "Check that the value is a string and contains @.",
      "Split once on @ so domains remain intact.",
      "Lowercase the first visible character and the domain."
    ],
    commonMistakes: [
      "Printing or returning the full local part.",
      "Throwing an exception for invalid emails instead of returning None."
    ]
  }),
  lab({
    id: "python-foundry-008",
    slug: "python-foundry-08-calculate-success-rate",
    title: "Python 58: Calculate pipeline success rate",
    difficulty: "beginner",
    section: "Metrics",
    topicTags: ["Python", "Monitoring", "Metrics"],
    isFree: true,
    estimatedMinutes: 12,
    businessContext:
      "A team wants a lightweight status card that shows the percentage of successful job runs for the day.",
    problemStatement:
      "Count success-like statuses and return success percentage rounded to two decimals.",
    expectedOutcome:
      "Return 0.0 for an empty run list and a percentage from 0.0 to 100.0 otherwise.",
    studentTask:
      "Define calculate_success_rate(runs). Treat success, successful, and passed as successful statuses.",
    functionName: "calculate_success_rate",
    testCases: [
      {
        name: "visible run success rate",
        args: [[
          { run_id: "r1", status: "SUCCESS" },
          { run_id: "r2", status: "failed" },
          { run_id: "r3", status: "passed" }
        ]],
        expected: 66.67
      }
    ],
    explanation:
      "This tests defensive metric calculation. Edge cases include empty input and status aliases. Returning 0.0 avoids division-by-zero errors in dashboards.",
    hints: [
      "Handle an empty list before dividing.",
      "Normalize status with strip() and lower().",
      "Use round(value, 2) for stable dashboard output."
    ],
    commonMistakes: [
      "Dividing by zero when no runs are present.",
      "Counting only one exact status spelling."
    ]
  }),
  lab({
    id: "python-foundry-009",
    slug: "python-foundry-09-latest-customer-updates",
    title: "Python 59: Keep latest customer update per key",
    difficulty: "intermediate",
    section: "Deduplication",
    topicTags: ["Python", "Watermarking", "Deduplication"],
    isFree: false,
    estimatedMinutes: 18,
    businessContext:
      "A customer dimension feed can send multiple changes for the same customer in one batch, sometimes with the same updated_at timestamp.",
    problemStatement:
      "Return the latest update for each customer_id using updated_at and sequence as a deterministic tie-breaker.",
    expectedOutcome:
      "Return latest records sorted by customer_id. Ignore updates without a customer_id.",
    studentTask:
      "Define latest_customer_updates(updates). Compare updated_at first and sequence second.",
    functionName: "latest_customer_updates",
    testCases: [
      {
        name: "visible same timestamp tie",
        args: [[
          { customer_id: 10, status: "silver", updated_at: "2026-06-01T10:00:00", sequence: 1 },
          { customer_id: 10, status: "gold", updated_at: "2026-06-01T10:00:00", sequence: 2 },
          { customer_id: 11, status: "active", updated_at: "2026-06-01T09:00:00", sequence: 1 }
        ]],
        expected: [
          { customer_id: 10, status: "gold", updated_at: "2026-06-01T10:00:00", sequence: 2 },
          { customer_id: 11, status: "active", updated_at: "2026-06-01T09:00:00", sequence: 1 }
        ]
      }
    ],
    explanation:
      "This tests deterministic latest-record logic. Edge cases include equal timestamps, late older updates, and missing keys. The safe solution uses a composite ordering key.",
    hints: [
      "Store the best update seen for each customer_id.",
      "Compare a tuple of (updated_at, sequence).",
      "Sort final customer IDs for deterministic output."
    ],
    commonMistakes: [
      "Using only updated_at and choosing randomly when timestamps tie.",
      "Keeping the first row per customer instead of the latest row."
    ]
  }),
  lab({
    id: "python-foundry-010",
    slug: "python-foundry-10-reconcile-snapshot-keys",
    title: "Python 60: Reconcile source and warehouse snapshot keys",
    difficulty: "intermediate",
    section: "Reconciliation",
    topicTags: ["Python", "Reconciliation", "Data Quality"],
    isFree: false,
    estimatedMinutes: 15,
    businessContext:
      "Business users report missing warehouse records. Before debugging transforms, you need a quick key-level reconciliation.",
    problemStatement:
      "Compare source keys and warehouse keys and return missing, extra, and matched keys.",
    expectedOutcome:
      "Return a dictionary with missing_in_warehouse, extra_in_warehouse, and matched sorted lists.",
    studentTask:
      "Define reconcile_snapshot_keys(source_keys, warehouse_keys). Treat duplicates as one key.",
    functionName: "reconcile_snapshot_keys",
    testCases: [
      {
        name: "visible source versus warehouse",
        args: [[1001, 1002, 1003, 1003], [1002, 1003, 1004]],
        expected: { missing_in_warehouse: [1001], extra_in_warehouse: [1004], matched: [1002, 1003] }
      }
    ],
    explanation:
      "This tests reconciliation using sets. Edge cases include duplicate source keys and extra warehouse rows. The safe output is sorted to be readable and stable.",
    hints: [
      "Convert both lists to sets first.",
      "Use set difference for missing and extra keys.",
      "Sort each list before returning it."
    ],
    commonMistakes: [
      "Comparing lists directly and treating duplicate keys as mismatches.",
      "Only checking missing source rows and ignoring extra warehouse rows."
    ]
  }),
  lab({
    id: "python-foundry-011",
    slug: "python-foundry-11-sessionize-clickstream-events",
    title: "Python 61: Sessionize clickstream events by inactivity gap",
    difficulty: "intermediate",
    section: "Clickstream",
    topicTags: ["Python", "Streaming", "Sessions"],
    isFree: false,
    estimatedMinutes: 22,
    businessContext:
      "A product analytics team needs session counts, but raw clickstream events arrive out of order within each user.",
    problemStatement:
      "Group events into user sessions. A new session starts when the gap from the previous event is greater than gap_minutes.",
    expectedOutcome:
      "Return session records sorted by user_id and time with user_id, session_id, event_count, start_ts, and end_ts.",
    studentTask:
      "Define sessionize_clickstream_events(events, gap_minutes). Sort events per user before sessionizing.",
    functionName: "sessionize_clickstream_events",
    testCases: [
      {
        name: "visible thirty minute sessions",
        args: [[
          { user_id: "u1", event_ts: "2026-06-01T10:00:00" },
          { user_id: "u1", event_ts: "2026-06-01T10:20:00" },
          { user_id: "u1", event_ts: "2026-06-01T11:00:01" },
          { user_id: "u2", event_ts: "2026-06-01T09:00:00" }
        ], 30],
        expected: [
          { user_id: "u1", session_id: "u1-1", event_count: 2, start_ts: "2026-06-01T10:00:00", end_ts: "2026-06-01T10:20:00" },
          { user_id: "u1", session_id: "u1-2", event_count: 1, start_ts: "2026-06-01T11:00:01", end_ts: "2026-06-01T11:00:01" },
          { user_id: "u2", session_id: "u2-1", event_count: 1, start_ts: "2026-06-01T09:00:00", end_ts: "2026-06-01T09:00:00" }
        ]
      }
    ],
    explanation:
      "This tests grouping, sorting, and time-gap logic. Edge cases include out-of-order events and exact-threshold gaps. The safe solution sorts within user before calculating sessions.",
    hints: [
      "Group events by user_id first.",
      "Sort each user's events by event_ts.",
      "A gap equal to the threshold stays in the same session; greater than threshold starts a new one."
    ],
    commonMistakes: [
      "Sessionizing in raw arrival order.",
      "Starting a new session when the gap is exactly equal to the threshold."
    ]
  }),
  lab({
    id: "python-foundry-012",
    slug: "python-foundry-12-detect-delayed-jobs",
    title: "Python 62: Detect delayed orchestration jobs",
    difficulty: "intermediate",
    section: "Monitoring",
    topicTags: ["Python", "Airflow", "SLA"],
    isFree: false,
    estimatedMinutes: 16,
    businessContext:
      "An operations dashboard should alert when scheduled jobs miss the SLA or never complete.",
    problemStatement:
      "Given expected and completed timestamps, return job IDs that are late by more than sla_minutes or still incomplete.",
    expectedOutcome:
      "Return delayed job IDs sorted alphabetically.",
    studentTask:
      "Define detect_delayed_jobs(runs, sla_minutes). Treat completed_at=None as delayed.",
    functionName: "detect_delayed_jobs",
    testCases: [
      {
        name: "visible delayed jobs",
        args: [[
          { job_id: "orders", expected_at: "2026-06-01T02:00:00", completed_at: "2026-06-01T02:08:00" },
          { job_id: "payments", expected_at: "2026-06-01T02:00:00", completed_at: "2026-06-01T02:40:00" },
          { job_id: "refunds", expected_at: "2026-06-01T02:00:00", completed_at: null }
        ], 15],
        expected: ["payments", "refunds"]
      }
    ],
    explanation:
      "This tests SLA calculation. Edge cases include incomplete jobs and exactly-on-boundary completion. The safe solution parses timestamps and compares against expected_at plus SLA.",
    hints: [
      "Use datetime.fromisoformat to compare timestamps.",
      "None completed_at should immediately count as delayed.",
      "Use > for late, not >=, if the job completed exactly at the SLA boundary."
    ],
    commonMistakes: [
      "Comparing timestamp strings after adding minutes mentally.",
      "Forgetting that incomplete jobs are also delayed."
    ]
  }),
  lab({
    id: "python-foundry-013",
    slug: "python-foundry-13-build-retry-summary",
    title: "Python 63: Summarize Airflow retry attempts",
    difficulty: "intermediate",
    section: "Airflow",
    topicTags: ["Python", "Airflow", "Retries"],
    isFree: false,
    estimatedMinutes: 18,
    businessContext:
      "A DAG looks green, but several tasks failed before retrying. The support team wants a task-level retry summary.",
    problemStatement:
      "Group attempts by dag_id and task_id, count failed attempts, keep max attempt number, and report the final status from the highest attempt.",
    expectedOutcome:
      "Return summaries sorted by dag_id then task_id.",
    studentTask:
      "Define build_retry_summary(attempts). Do not treat a final success as meaning there were no failures.",
    functionName: "build_retry_summary",
    testCases: [
      {
        name: "visible retry attempts",
        args: [[
          { dag_id: "sales", task_id: "load", attempt: 1, status: "failed" },
          { dag_id: "sales", task_id: "load", attempt: 2, status: "success" },
          { dag_id: "sales", task_id: "quality", attempt: 1, status: "failed" }
        ]],
        expected: [
          { dag_id: "sales", task_id: "load", max_attempt: 2, failed_attempts: 1, final_status: "success" },
          { dag_id: "sales", task_id: "quality", max_attempt: 1, failed_attempts: 1, final_status: "failed" }
        ]
      }
    ],
    explanation:
      "This tests grouping and operational interpretation. Edge cases include multiple failed retries and final success. The safe summary captures both final state and retry pain.",
    hints: [
      "Use a tuple key of dag_id and task_id.",
      "Count status == failed separately from final_status.",
      "The row with the highest attempt number determines final_status."
    ],
    commonMistakes: [
      "Only looking at final status and hiding retry failures.",
      "Grouping by task_id only and mixing different DAGs."
    ]
  }),
  lab({
    id: "python-foundry-014",
    slug: "python-foundry-14-aggregate-daily-net-revenue",
    title: "Python 64: Aggregate daily net revenue from events",
    difficulty: "intermediate",
    section: "Finance",
    topicTags: ["Python", "Revenue", "Aggregation"],
    isFree: false,
    estimatedMinutes: 18,
    businessContext:
      "A finance mart needs daily net revenue from raw payment events that include both sales and refunds.",
    problemStatement:
      "Filter successful financial events, add sales, subtract refunds, and aggregate by event_date.",
    expectedOutcome:
      "Return sorted daily records with event_date and net_revenue.",
    studentTask:
      "Define aggregate_daily_net_revenue(events). Treat SUCCESS, SUCCESSFUL, and PAID as successful statuses.",
    functionName: "aggregate_daily_net_revenue",
    testCases: [
      {
        name: "visible sales and refunds",
        args: [[
          { event_date: "2026-06-01", event_type: "SALE", status: "SUCCESS", amount: 100 },
          { event_date: "2026-06-01", event_type: "REFUND", status: "SUCCESS", amount: 20 },
          { event_date: "2026-06-02", event_type: "SALE", status: "FAILED", amount: 999 },
          { event_date: "2026-06-02", event_type: "SALE", status: "SUCCESSFUL", amount: 50 }
        ]],
        expected: [{ event_date: "2026-06-01", net_revenue: 80 }, { event_date: "2026-06-02", net_revenue: 50 }]
      }
    ],
    explanation:
      "This tests revenue aggregation at the correct grain. Edge cases include refunds, failed payments, and status aliases. The safe solution keeps finance logic explicit.",
    hints: [
      "Skip events whose status is not a successful payment status.",
      "Refunds should subtract from the daily total.",
      "Return sorted dates so dashboards are deterministic."
    ],
    commonMistakes: [
      "Counting failed or cancelled payments as revenue.",
      "Adding refunds instead of subtracting them."
    ]
  }),
  lab({
    id: "python-foundry-015",
    slug: "python-foundry-15-find-missing-partitions",
    title: "Python 65: Find missing daily data lake partitions",
    difficulty: "intermediate",
    section: "Data Lake",
    topicTags: ["Python", "Data Lake", "Reconciliation"],
    isFree: false,
    estimatedMinutes: 16,
    businessContext:
      "Before triggering a warehouse load, a pipeline checks whether every expected daily partition exists in object storage.",
    problemStatement:
      "Compare expected business dates with dates extracted from available partition paths.",
    expectedOutcome:
      "Return expected dates that are missing, preserving the expected_dates order.",
    studentTask:
      "Define find_missing_partitions(expected_dates, available_paths). Support both dt= and date= path conventions.",
    functionName: "find_missing_partitions",
    testCases: [
      {
        name: "visible missing date",
        args: [["2026-06-01", "2026-06-02", "2026-06-03"], [
          "s3://bucket/orders/dt=2026-06-01/part-0",
          "s3://bucket/orders/date=2026-06-03/part-0"
        ]],
        expected: ["2026-06-02"]
      }
    ],
    explanation:
      "This tests partition reconciliation. Edge cases include duplicate files within a partition and mixed partition key names. The safe solution compares dates, not file counts.",
    hints: [
      "Extract available dates into a set.",
      "Do not assume one file equals one partition.",
      "Loop through expected_dates to preserve expected order."
    ],
    commonMistakes: [
      "Comparing full paths directly to dates.",
      "Marking a date present multiple times because it has multiple files."
    ]
  }),
  lab({
    id: "python-foundry-016",
    slug: "python-foundry-16-normalize-schema-drift-records",
    title: "Python 66: Normalize records after schema drift",
    difficulty: "intermediate",
    section: "Schema Drift",
    topicTags: ["Python", "Schema Drift", "Data Quality"],
    isFree: false,
    estimatedMinutes: 17,
    businessContext:
      "A JSON API added a new field and sometimes omits old fields. Your ingestion utility must keep the warehouse contract stable.",
    problemStatement:
      "Project each record to the expected field list, fill missing fields with None, and ignore extras.",
    expectedOutcome:
      "Return normalized dictionaries in the same record order using only expected_fields.",
    studentTask:
      "Define normalize_schema_drift_records(records, expected_fields).",
    functionName: "normalize_schema_drift_records",
    testCases: [
      {
        name: "visible extra and missing fields",
        args: [[
          { order_id: 1, amount: 100, currency: "INR", coupon: "NEW" },
          { order_id: 2, currency: "INR" }
        ], ["order_id", "amount", "currency"]],
        expected: [
          { order_id: 1, amount: 100, currency: "INR" },
          { order_id: 2, amount: null, currency: "INR" }
        ]
      }
    ],
    explanation:
      "This tests schema-contract thinking. Edge cases include missing fields and unexpected new fields. The safe solution makes output stable without crashing on drift.",
    hints: [
      "Build each output row from expected_fields, not record.keys().",
      "Use record.get(field) so missing fields become None.",
      "Ignore fields not present in expected_fields."
    ],
    commonMistakes: [
      "Returning the original record and leaking extra fields downstream.",
      "Using record[field] and crashing on missing fields."
    ]
  }),
  lab({
    id: "python-foundry-017",
    slug: "python-foundry-17-build-compaction-plan",
    title: "Python 67: Build a small-file compaction plan",
    difficulty: "intermediate",
    section: "File Layout",
    topicTags: ["Python", "Data Lake", "Compaction"],
    isFree: false,
    estimatedMinutes: 22,
    businessContext:
      "A lakehouse table has many small files. Operators need a simple plan that groups files by partition without exceeding a target output size.",
    problemStatement:
      "Group files within each partition into deterministic compaction batches whose total size is at most target_mb when possible.",
    expectedOutcome:
      "Return a list of batches with partition, files, and total_mb sorted by partition and file path.",
    studentTask:
      "Define build_compaction_plan(files, target_mb). Never mix files from different partitions.",
    functionName: "build_compaction_plan",
    testCases: [
      {
        name: "visible small file groups",
        args: [[
          { partition: "dt=2026-06-01", path: "b.parquet", size_mb: 40 },
          { partition: "dt=2026-06-01", path: "a.parquet", size_mb: 50 },
          { partition: "dt=2026-06-01", path: "c.parquet", size_mb: 30 },
          { partition: "dt=2026-06-02", path: "d.parquet", size_mb: 20 }
        ], 100],
        expected: [
          { partition: "dt=2026-06-01", files: ["a.parquet", "b.parquet"], total_mb: 90 },
          { partition: "dt=2026-06-01", files: ["c.parquet"], total_mb: 30 },
          { partition: "dt=2026-06-02", files: ["d.parquet"], total_mb: 20 }
        ]
      }
    ],
    explanation:
      "This tests operational planning with deterministic grouping. Edge cases include exact target boundaries and multiple partitions. The safe solution groups by partition first.",
    hints: [
      "Group files by partition.",
      "Sort each partition's files by path for repeatable output.",
      "Start a new batch when adding the next file would exceed target_mb."
    ],
    commonMistakes: [
      "Mixing files from multiple partitions into one compaction output.",
      "Returning batches in input order, making tests flaky."
    ]
  }),
  lab({
    id: "python-foundry-018",
    slug: "python-foundry-18-top-customers-with-ties",
    title: "Python 68: Return top customers including revenue ties",
    difficulty: "intermediate",
    section: "Ranking",
    topicTags: ["Python", "Ranking", "Revenue"],
    isFree: false,
    estimatedMinutes: 18,
    businessContext:
      "A growth team asks for the top customers by revenue, but they do not want tied customers cut off randomly.",
    problemStatement:
      "Aggregate revenue by customer_id and return all customers whose revenue is at least the Nth customer's revenue.",
    expectedOutcome:
      "Return records sorted by revenue descending and customer_id ascending.",
    studentTask:
      "Define top_customers_with_ties(transactions, n). Include ties at the cutoff.",
    functionName: "top_customers_with_ties",
    testCases: [
      {
        name: "visible top two with tie",
        args: [[
          { customer_id: 1, amount: 100 },
          { customer_id: 2, amount: 80 },
          { customer_id: 3, amount: 80 },
          { customer_id: 4, amount: 10 }
        ], 2],
        expected: [
          { customer_id: 1, revenue: 100 },
          { customer_id: 2, revenue: 80 },
          { customer_id: 3, revenue: 80 }
        ]
      }
    ],
    explanation:
      "This tests ranking with ties after aggregation. Edge cases include n <= 0 and multiple transactions per customer. The safe solution calculates a cutoff rather than slicing blindly.",
    hints: [
      "Aggregate first, rank second.",
      "Find the Nth revenue after sorting.",
      "Include everyone whose revenue is greater than or equal to that cutoff."
    ],
    commonMistakes: [
      "Taking the first N rows and excluding tied customers.",
      "Ranking individual transactions instead of customer totals."
    ]
  }),
  lab({
    id: "python-foundry-019",
    slug: "python-foundry-19-apply-cdc-events",
    title: "Python 69: Apply CDC events to current state",
    difficulty: "advanced",
    section: "CDC",
    topicTags: ["Python", "CDC", "Deletes"],
    isFree: false,
    estimatedMinutes: 24,
    businessContext:
      "A current-state customer table is rebuilt from CDC events containing INSERT, UPDATE, and DELETE operations.",
    problemStatement:
      "For each key, keep the latest event by sequence. DELETE events should remove the key from current state.",
    expectedOutcome:
      "Return active rows sorted by key, with key merged into the payload.",
    studentTask:
      "Define apply_cdc_events(events). Handle out-of-order events and tombstones.",
    functionName: "apply_cdc_events",
    testCases: [
      {
        name: "visible update and delete",
        args: [[
          { key: "c1", op: "INSERT", sequence: 1, payload: { status: "new" } },
          { key: "c1", op: "UPDATE", sequence: 2, payload: { status: "active" } },
          { key: "c2", op: "INSERT", sequence: 1, payload: { status: "new" } },
          { key: "c2", op: "DELETE", sequence: 3, payload: null }
        ]],
        expected: [{ key: "c1", status: "active" }]
      }
    ],
    explanation:
      "This tests CDC current-state semantics. Edge cases include out-of-order arrival and delete tombstones. The safe solution uses sequence order, not arrival order.",
    hints: [
      "First choose the latest event per key by sequence.",
      "Skip keys whose latest event is DELETE.",
      "Merge the key with payload fields for active rows."
    ],
    commonMistakes: [
      "Applying events in arrival order and letting old updates overwrite newer ones.",
      "Keeping deleted rows because the payload is None."
    ]
  }),
  lab({
    id: "python-foundry-020",
    slug: "python-foundry-20-build-dependency-run-order",
    title: "Python 70: Build a deterministic DAG run order",
    difficulty: "advanced",
    section: "Orchestration",
    topicTags: ["Python", "Airflow", "DAG"],
    isFree: false,
    estimatedMinutes: 24,
    businessContext:
      "A simple orchestrator needs to decide which tasks can run after their dependencies have completed.",
    problemStatement:
      "Return a valid dependency order. When multiple tasks are ready, choose alphabetical order. If there is a cycle, return [\"CYCLE_DETECTED\"].",
    expectedOutcome:
      "Return task IDs in deterministic execution order.",
    studentTask:
      "Define build_dependency_run_order(tasks). Do not infinite-loop on cyclic dependencies.",
    functionName: "build_dependency_run_order",
    testCases: [
      {
        name: "visible DAG order",
        args: [[
          { task_id: "gold", depends_on: ["silver"] },
          { task_id: "bronze", depends_on: [] },
          { task_id: "silver", depends_on: ["bronze"] }
        ]],
        expected: ["bronze", "silver", "gold"]
      }
    ],
    explanation:
      "This tests topological sorting and cycle handling. Edge cases include parallel ready tasks and dependency cycles. The safe solution makes progress only when at least one task is dependency-free.",
    hints: [
      "Represent dependencies as a mapping from task_id to a set.",
      "Each loop, collect tasks with no remaining dependencies.",
      "If no task is ready while dependencies remain, there is a cycle."
    ],
    commonMistakes: [
      "Returning tasks in input order without checking dependencies.",
      "Looping forever when a cycle exists."
    ]
  }),
  lab({
    id: "python-foundry-021",
    slug: "python-foundry-21-rolling-error-rate",
    title: "Python 71: Calculate rolling pipeline error rate",
    difficulty: "advanced",
    section: "Monitoring",
    topicTags: ["Python", "Monitoring", "Windows"],
    isFree: false,
    estimatedMinutes: 20,
    businessContext:
      "A streaming health monitor needs a rolling error rate so alerts react to recent failures, not only daily totals.",
    problemStatement:
      "For each event, calculate the error rate over the trailing window_size events including the current event.",
    expectedOutcome:
      "Return a list of rounded rates. failed and error statuses count as errors.",
    studentTask:
      "Define rolling_error_rate(events, window_size). Handle the warm-up period before the window is full.",
    functionName: "rolling_error_rate",
    testCases: [
      {
        name: "visible trailing error rate",
        args: [[
          { status: "ok" },
          { status: "error" },
          { status: "failed" },
          { status: "ok" }
        ], 3],
        expected: [0.0, 0.5, 0.67, 0.67]
      }
    ],
    explanation:
      "This tests sliding-window calculations. Edge cases include the first few events and different failure labels. The safe solution bounds the window start at zero.",
    hints: [
      "For index i, slice from max(0, i - window_size + 1) to i + 1.",
      "Count status values error and failed case-insensitively.",
      "Round each rate to two decimals."
    ],
    commonMistakes: [
      "Using the full history instead of the trailing window.",
      "Dropping early events because a full window is not available yet."
    ]
  }),
  lab({
    id: "python-foundry-022",
    slug: "python-foundry-22-deduplicate-exactly-once-events",
    title: "Python 72: Deduplicate exactly-once replayed events",
    difficulty: "advanced",
    section: "Streaming",
    topicTags: ["Python", "Streaming", "Idempotency"],
    isFree: false,
    estimatedMinutes: 22,
    businessContext:
      "A streaming consumer replayed an older batch after a retry. The sink table must keep the latest accepted version per event_id.",
    problemStatement:
      "For each event_id, keep the record with the highest batch_id and then highest offset.",
    expectedOutcome:
      "Return deduplicated events sorted by event_id.",
    studentTask:
      "Define deduplicate_exactly_once_events(events). Use batch_id and offset as the ordering key.",
    functionName: "deduplicate_exactly_once_events",
    testCases: [
      {
        name: "visible replayed events",
        args: [[
          { event_id: "e1", batch_id: 1, offset: 10, amount: 100 },
          { event_id: "e1", batch_id: 2, offset: 3, amount: 100 },
          { event_id: "e2", batch_id: 1, offset: 11, amount: 50 }
        ]],
        expected: [
          { event_id: "e1", batch_id: 2, offset: 3, amount: 100 },
          { event_id: "e2", batch_id: 1, offset: 11, amount: 50 }
        ]
      }
    ],
    explanation:
      "This tests idempotent streaming sink logic. Edge cases include same event_id across batches and same batch with later offsets. The safe solution compares a composite key.",
    hints: [
      "Track the best record per event_id.",
      "Compare (batch_id, offset) tuples.",
      "Sort final event IDs for stable output."
    ],
    commonMistakes: [
      "Keeping the first replayed event instead of the latest committed event.",
      "Comparing only batch_id and ignoring offset ties."
    ]
  }),
  lab({
    id: "python-foundry-023",
    slug: "python-foundry-23-prepare-scd2-changes",
    title: "Python 73: Prepare SCD Type 2 change rows",
    difficulty: "advanced",
    section: "Dimensional Modeling",
    topicTags: ["Python", "SCD2", "Data Modeling"],
    isFree: false,
    estimatedMinutes: 25,
    businessContext:
      "A customer dimension loader receives hashes for the latest customer attributes and must decide which current rows to expire and insert.",
    problemStatement:
      "Compare incoming rows with current dimension rows. Changed existing customers should be expired and reinserted; new customers should only be inserted.",
    expectedOutcome:
      "Return expire_keys and new_rows. New rows should be current and have no effective_end_date.",
    studentTask:
      "Define prepare_scd2_changes(existing_rows, incoming_rows). Compare only current dimension rows.",
    functionName: "prepare_scd2_changes",
    testCases: [
      {
        name: "visible changed and new customer",
        args: [[
          { customer_id: 1, hash: "h_old", current_flag: true },
          { customer_id: 2, hash: "h_same", current_flag: true }
        ], [
          { customer_id: 1, hash: "h_new", effective_date: "2026-06-01" },
          { customer_id: 2, hash: "h_same", effective_date: "2026-06-01" },
          { customer_id: 3, hash: "h3", effective_date: "2026-06-01" }
        ]],
        expected: {
          expire_keys: [1],
          new_rows: [
            { customer_id: 1, hash: "h_new", effective_start_date: "2026-06-01", effective_end_date: null, current_flag: true },
            { customer_id: 3, hash: "h3", effective_start_date: "2026-06-01", effective_end_date: null, current_flag: true }
          ]
        }
      }
    ],
    explanation:
      "This tests SCD2 decision logic. Edge cases include unchanged customers, brand-new customers, and historical non-current rows. The safe solution compares against current rows only.",
    hints: [
      "Create a lookup of current rows by customer_id.",
      "If hashes differ, expire the existing current key and insert a new row.",
      "For a brand-new customer, insert only the new dimension version."
    ],
    commonMistakes: [
      "Expiring unchanged rows.",
      "Comparing incoming rows to historical non-current rows."
    ]
  }),
  lab({
    id: "python-foundry-024",
    slug: "python-foundry-24-detect-metric-drift",
    title: "Python 74: Detect metric drift beyond tolerance",
    difficulty: "advanced",
    section: "Data Observability",
    topicTags: ["Python", "Monitoring", "Data Quality"],
    isFree: false,
    estimatedMinutes: 20,
    businessContext:
      "A data quality monitor compares today's key metrics against baseline values and flags large deviations.",
    problemStatement:
      "Calculate percentage change per metric and return metrics where absolute change is greater than threshold_pct.",
    expectedOutcome:
      "Return drifted metrics sorted alphabetically with baseline, current, and change_pct.",
    studentTask:
      "Define detect_metric_drift(baseline, current, threshold_pct). Handle zero baselines safely.",
    functionName: "detect_metric_drift",
    testCases: [
      {
        name: "visible metric drift",
        args: [{ orders: 1000, revenue: 50000, refunds: 10 }, { orders: 900, revenue: 42000, refunds: 30 }, 15],
        expected: [
          { metric: "refunds", baseline: 10, current: 30, change_pct: 200.0 },
          { metric: "revenue", baseline: 50000, current: 42000, change_pct: -16.0 }
        ]
      }
    ],
    explanation:
      "This tests observability checks. Edge cases include zero baselines, missing metrics, and both increases and drops. The safe solution makes zero handling explicit.",
    hints: [
      "Iterate over the union of metric names from baseline and current.",
      "If baseline is zero, avoid division by zero.",
      "Compare abs(change_pct) with threshold_pct."
    ],
    commonMistakes: [
      "Only flagging drops and ignoring suspicious spikes.",
      "Dividing by zero for new metrics."
    ]
  }),
  lab({
    id: "python-foundry-025",
    slug: "python-foundry-25-allocate-backfill-windows",
    title: "Python 75: Allocate safe backfill windows",
    difficulty: "advanced",
    section: "Backfills",
    topicTags: ["Python", "Backfill", "Orchestration"],
    isFree: false,
    estimatedMinutes: 24,
    businessContext:
      "A warehouse backfill needs to rerun old partitions without hitting blackout dates or creating huge load windows.",
    problemStatement:
      "Split a date range into contiguous windows of at most max_days, skipping blackout_dates.",
    expectedOutcome:
      "Return windows as [start_date, end_date] pairs. Blackout dates should not appear inside any window.",
    studentTask:
      "Define allocate_backfill_windows(start_date, end_date, max_days, blackout_dates).",
    functionName: "allocate_backfill_windows",
    testCases: [
      {
        name: "visible blackout-aware windows",
        args: ["2026-06-01", "2026-06-07", 3, ["2026-06-04"]],
        expected: [["2026-06-01", "2026-06-03"], ["2026-06-05", "2026-06-07"]]
      }
    ],
    explanation:
      "This tests operational date-window planning. Edge cases include blackout gaps and max-day boundaries. The safe solution keeps windows contiguous and bounded.",
    hints: [
      "Walk day by day from start_date to end_date.",
      "Close the current window when you hit a blackout date.",
      "Also close the window when adding the next day would exceed max_days."
    ],
    commonMistakes: [
      "Including blackout dates inside a backfill window.",
      "Creating one huge range and ignoring max_days."
    ]
  })
];
