import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { getScenarios, type Scenario, type ScenarioDomain, type ScenarioType } from "../frontend/lib/scenarios";

interface ParsedScenario {
  number: number;
  title: string;
  section: string;
  coreConcept: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  question: string;
  testing: string;
  understanding: string;
  rootCauses: string[];
  solution: string[];
  tradeoffs: string[];
  monitoring: string[];
  strongAnswer: string;
  followUps: string[];
}

interface ImportReport {
  source: string;
  previousGeneratedCount: number;
  parsedCount: number;
  addedCount: number;
  skippedCount: number;
  finalGeneratedCount: number;
  visibleScenarioCount: number;
  skipped: Array<{
    number: number;
    title: string;
    existingSlug: string;
    reason: string;
  }>;
  added: Array<{
    number: number;
    title: string;
    slug: string;
    domain: ScenarioDomain;
    scenarioType: ScenarioType;
  }>;
}

const requireFromFrontend = createRequire(path.resolve("frontend/package.json"));
const INPUT_PDF = path.resolve(
  process.argv[2] ??
    "docs/Data_with_Pranjal_Scenario_Based_Data_Engineering_Interview_Handbook_Volume_2_120_More_Questions.pdf"
);
const DATA_OUTPUT = path.resolve("data/scenarios.generated.json");
const FRONTEND_OUTPUT = path.resolve("frontend/data/scenarios.generated.json");
const REPORT_OUTPUT = path.resolve("data/scenarios-volume-2-import-report.json");

const FREE_SCENARIO_NUMBERS = new Set([121, 139, 157, 176, 193, 211, 229]);

const CONCEPT_OVERLAPS = new Map<
  number,
  { existingSlug: string; reason: string }
>([
  [
    122,
    {
      existingSlug: "the-pagination-retry-loop",
      reason: "Stable pagination, retries, checkpoints, and changing API slices are already practiced."
    }
  ],
  [
    137,
    {
      existingSlug: "the-timezone-boundary-bug",
      reason: "UTC versus local-time ingestion boundaries are already covered."
    }
  ],
  [
    148,
    {
      existingSlug: "the-delete-semantics-problem",
      reason: "Delete precedence, tombstones, and event ordering are already covered."
    }
  ],
  [
    151,
    {
      existingSlug: "the-decimal-precision-shock",
      reason: "Cross-system decimal precision and downstream numeric drift are already covered."
    }
  ],
  [
    153,
    {
      existingSlug: "the-snapshot-consistency-debate",
      reason: "Consistent extraction from mutable transactional sources is already covered."
    }
  ],
  [
    154,
    {
      existingSlug: "the-incremental-load-gone-wrong",
      reason: "Technical watermarks missing backdated business updates are already covered."
    }
  ],
  [
    175,
    {
      existingSlug: "wrong-group-by-grain-customer-revenue",
      reason: "Undefined fact grain and downstream double counting are already covered."
    }
  ],
  [
    180,
    {
      existingSlug: "the-late-dimension-problem",
      reason: "Unknown members and late-arriving dimension handling are already covered."
    }
  ],
  [
    188,
    {
      existingSlug: "the-restatement-vs-close-debate",
      reason: "Late facts changing closed reporting periods are already covered."
    }
  ],
  [
    200,
    {
      existingSlug: "the-backfill-hell",
      reason: "Backfill validation, idempotency, and reconciliation are already covered."
    }
  ],
  [
    205,
    {
      existingSlug: "the-schema-evolution-shock",
      reason: "Compatible additive schema evolution and downstream contract behavior are already covered."
    }
  ],
  [
    238,
    {
      existingSlug: "the-platform-disaster-recovery-plan",
      reason: "RPO, RTO, recovery scope, and disaster-recovery validation are already covered."
    }
  ]
]);

function compact(value: string): string {
  return value
    .replace(/Data with Pranjal \| Scenario-Based Data Engineering Interview Handbook - Volume 2/gi, "")
    .replace(/Page \d+/gi, "")
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function extractSection(chunk: string, start: RegExp, end: RegExp): string {
  const startMatch = start.exec(chunk);
  if (!startMatch || startMatch.index === undefined) return "";
  const remainder = chunk.slice(startMatch.index + startMatch[0].length);
  const endMatch = end.exec(remainder);
  return compact(endMatch ? remainder.slice(0, endMatch.index) : remainder);
}

function extractBullets(value: string): string[] {
  const pieces = value
    .split(/[•]/)
    .map(compact)
    .filter((item) => item.length > 10);

  if (pieces.length > 1) return pieces.slice(0, 8);
  return compact(value)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 10)
    .slice(0, 8);
}

function splitScenarios(text: string): string[] {
  return [...text.matchAll(/Scenario\s+(\d{3}):[\s\S]*?(?=\nScenario\s+\d{3}:|\s*$)/g)]
    .map((match) => match[0].trim())
    .filter((chunk) => /^Scenario\s+(?:12[1-9]|1[3-9]\d|2[0-3]\d|240):/.test(chunk));
}

function parseScenario(chunk: string): ParsedScenario {
  const heading = chunk.match(/^Scenario\s+(\d{3}):\s*([^\n]+)/);
  const metadata = chunk.match(
    /Section:\s*([^|]+)\|\s*Core concept:\s*([^|]+)\|\s*Level:\s*(Beginner|Intermediate|Advanced)/i
  );
  if (!heading || !metadata) {
    throw new Error(`Unable to parse scenario heading or metadata: ${chunk.slice(0, 180)}`);
  }

  return {
    number: Number(heading[1]),
    title: compact(heading[2]),
    section: compact(metadata[1]),
    coreConcept: compact(metadata[2]),
    difficulty: metadata[3].toLowerCase() as ParsedScenario["difficulty"],
    question: extractSection(
      chunk,
      /Scenario question\s*/i,
      /What the interviewer is really testing/i
    ),
    testing: extractSection(
      chunk,
      /What the interviewer is really testing\s*/i,
      /1\)\s*Understand the problem/i
    ),
    understanding: extractSection(
      chunk,
      /1\)\s*Understand the problem\s*/i,
      /2\)\s*Possible root causes/i
    ),
    rootCauses: extractBullets(
      extractSection(chunk, /2\)\s*Possible root causes\s*/i, /3\)\s*Solution design/i)
    ),
    solution: extractBullets(
      extractSection(chunk, /3\)\s*Solution design\s*/i, /4\)\s*Trade-offs/i)
    ),
    tradeoffs: extractBullets(
      extractSection(chunk, /4\)\s*Trade-offs\s*/i, /5\)\s*Monitoring and testing/i)
    ),
    monitoring: extractBullets(
      extractSection(
        chunk,
        /5\)\s*Monitoring and testing\s*/i,
        /6\)\s*Strong interview answer/i
      )
    ),
    strongAnswer: extractSection(
      chunk,
      /6\)\s*Strong interview answer\s*/i,
      /Interviewer follow-up questions/i
    ),
    followUps: extractBullets(
      extractSection(chunk, /Interviewer follow-up questions\s*/i, /$/i)
    )
  };
}

function classifyScenario(scenario: ParsedScenario): {
  domain: ScenarioDomain;
  scenarioType: ScenarioType;
  sectionTag: string;
} {
  if (scenario.section.startsWith("Python")) {
    return { domain: "mixed", scenarioType: "mixed_lab", sectionTag: "Python Ingestion" };
  }
  if (scenario.section.startsWith("CDC")) {
    return { domain: "data_modeling", scenarioType: "log_analysis", sectionTag: "CDC" };
  }
  if (scenario.section.startsWith("Cloud")) {
    return { domain: "aws", scenarioType: "log_analysis", sectionTag: "Cloud Platform" };
  }
  if (scenario.section.startsWith("Data Modeling")) {
    return {
      domain: "data_modeling",
      scenarioType: "mixed_lab",
      sectionTag: "Data Modeling"
    };
  }
  if (scenario.section.startsWith("Testing")) {
    return {
      domain: "data_quality",
      scenarioType: "log_analysis",
      sectionTag: "Data Reliability"
    };
  }
  if (scenario.section.startsWith("Security")) {
    return {
      domain: "system_design",
      scenarioType: "log_analysis",
      sectionTag: "Security & Privacy"
    };
  }
  return {
    domain: "system_design",
    scenarioType: "interview_explanation",
    sectionTag: "Architecture & Leadership"
  };
}

function pythonEvidence(concept: string): string {
  const lower = concept.toLowerCase();
  if (lower.includes("memory") || lower.includes("streaming parsing")) {
    return [
      "import pandas as pd",
      "",
      "# Broken: materializes the complete 40 GB file in one process.",
      "orders = pd.read_csv(input_path)",
      "orders = orders.drop_duplicates(subset=['order_id'])",
      "orders.to_parquet(output_path)"
    ].join("\n");
  }
  if (lower.includes("credential refresh")) {
    return [
      "# Broken: every worker refreshes the same token independently.",
      "if token.expires_at <= time.time():",
      "    token = oauth_client.refresh(refresh_token)",
      "response = requests.get(url, headers={'Authorization': f'Bearer {token.value}'})"
    ].join("\n");
  }
  if (lower.includes("backoff") || lower.includes("throttling")) {
    return [
      "# Broken: immediate retries amplify a 429 response into a traffic spike.",
      "while True:",
      "    response = requests.get(url, timeout=30)",
      "    if response.status_code != 429:",
      "        break"
    ].join("\n");
  }
  if (lower.includes("encoding")) {
    return [
      "# Broken: invalid bytes are silently discarded, changing customer names and keys.",
      "text = payload.decode('utf-8', errors='ignore')",
      "records = csv.DictReader(io.StringIO(text))"
    ].join("\n");
  }
  if (lower.includes("canonical")) {
    return [
      "# Broken: dictionary iteration order becomes part of the generated checksum.",
      "payload_hash = hashlib.sha256(str(record).encode()).hexdigest()",
      "publish({'id': payload_hash, 'record': record})"
    ].join("\n");
  }
  if (lower.includes("concurrency model")) {
    return [
      "# Broken: CPU-heavy parsing is placed behind threads and expected to scale linearly.",
      "with ThreadPoolExecutor(max_workers=32) as pool:",
      "    parsed = list(pool.map(parse_and_validate, payloads))"
    ].join("\n");
  }
  if (lower.includes("multiprocessing")) {
    return [
      "# Broken: the full DataFrame is copied or serialized to every worker process.",
      "frame = pandas.read_parquet(input_path)",
      "with multiprocessing.Pool(16) as pool:",
      "    outputs = pool.map(transform_partition, [frame] * 16)"
    ].join("\n");
  }
  if (lower.includes("connection pool")) {
    return [
      "# Broken: exceptions skip connection return and eventually exhaust the pool.",
      "connection = pool.getconn()",
      "rows = connection.execute(query).fetchall()",
      "pool.putconn(connection)"
    ].join("\n");
  }
  if (lower.includes("atomic") || lower.includes("publication")) {
    return [
      "# Broken: readers can observe a partially written final file.",
      "with open(final_path, 'wb') as output:",
      "    for chunk in extract_chunks():",
      "        output.write(chunk)"
    ].join("\n");
  }
  if (lower.includes("webhook")) {
    return [
      "# Broken: provider retries create another warehouse row every time.",
      "def receive_webhook(event):",
      "    warehouse.insert('events', event)",
      "    return {'status': 'accepted'}"
    ].join("\n");
  }
  if (lower.includes("defensive parsing")) {
    return [
      "# Broken: accepts unbounded depth and payload size from an external source.",
      "payload = request.get_data()",
      "record = json.loads(payload)",
      "flatten(record)"
    ].join("\n");
  }
  if (lower.includes("compressed")) {
    return [
      "# Broken: one corrupt archive fails the complete delivery batch.",
      "for file_path in delivery_files:",
      "    with gzip.open(file_path, 'rt') as source:",
      "        load_rows(source)"
    ].join("\n");
  }
  if (lower.includes("snapshot") || lower.includes("reproducibility")) {
    return [
      "# Broken: transformed output is stored, but the mutable API response is discarded.",
      "response = requests.get(endpoint, params={'date': run_date}).json()",
      "transform(response).to_parquet(curated_path)"
    ].join("\n");
  }
  if (lower.includes("dependency") || lower.includes("sdk")) {
    return [
      "# requirements.txt",
      "partner-sdk>=2",
      "",
      "# Broken: an unbounded SDK upgrade changes response fields in production.",
      "client = PartnerClient()",
      "records = client.list_orders(run_date)"
    ].join("\n");
  }
  if (lower.includes("timeout")) {
    return [
      "# Broken: no connect/read timeout or total retry budget.",
      "response = requests.get(endpoint)",
      "while response.status_code >= 500:",
      "    response = requests.get(endpoint)"
    ].join("\n");
  }
  return [
    "# Current ingestion path",
    "for item in source_items:",
    "    transformed = transform(item)",
    "    publish(transformed)",
    "",
    "# Missing: stable identity, checkpoint, bounded retries, quarantine, and atomic publish."
  ].join("\n");
}

function cdcEvidence(concept: string): string {
  const lower = concept.toLowerCase();
  if (lower.includes("retention")) {
    return [
      "connector_offset = 'LSN/0A12F880'",
      "oldest_available_wal = 'LSN/0B980010'",
      "connector_status = 'FAILED: requested WAL segment removed'",
      "",
      "# Recovery procedure is undefined."
    ].join("\n");
  }
  if (lower.includes("snapshot")) {
    return [
      "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;",
      "SELECT * FROM production_orders;",
      "-- Snapshot runs for 4 hours and blocks application writes.",
      "COMMIT;"
    ].join("\n");
  }
  if (lower.includes("primary-key") || lower.includes("key mutation")) {
    return [
      "-- Broken target logic treats a primary-key update as an unrelated insert.",
      "MERGE INTO customer_state t",
      "USING cdc_events s ON t.customer_id = s.customer_id",
      "WHEN NOT MATCHED THEN INSERT *;"
    ].join("\n");
  }
  if (lower.includes("ddl") || lower.includes("schema")) {
    return [
      "snapshot_schema_version=17",
      "cdc_schema_version=18",
      "event='ALTER TABLE orders ADD COLUMN channel STRING'",
      "target_error='column count mismatch during bootstrap merge'"
    ].join("\n");
  }
  if (lower.includes("replica")) {
    return [
      "primary_commit_lsn=98211405",
      "replica_replay_lsn=98177210",
      "extract_source='read_replica'",
      "extract_status='SUCCESS with stale rows'"
    ].join("\n");
  }
  if (lower.includes("transaction")) {
    return [
      "tx_id=84711 event=order_insert sequence=1",
      "tx_id=84711 event=payment_insert sequence=3",
      "tx_id=84711 event=order_status_update sequence=2",
      "# Target applies arrival order rather than transaction sequence."
    ].join("\n");
  }
  if (lower.includes("no-primary") || lower.includes("without keys")) {
    return [
      "source_table=legacy_contacts",
      "primary_key=NONE",
      "capture_mode=full_row_compare",
      "duplicate_rows=present",
      "delete_detection=undefined"
    ].join("\n");
  }
  if (lower.includes("loop")) {
    return [
      "source_db -> cdc_topic -> warehouse -> reverse_etl -> source_db",
      "event.origin='warehouse_sync'",
      "# Connector captures the reverse-ETL write and emits it again."
    ].join("\n");
  }
  return [
    "source_position=checkpoint_18492",
    "snapshot_state=IN_PROGRESS",
    "cdc_state=RUNNING",
    "duplicates_detected=184",
    "out_of_order_events=27",
    "# Bootstrap, ordering, and replay contracts are not explicit."
  ].join("\n");
}

function cloudEvidence(concept: string): string {
  const lower = concept.toLowerCase();
  if (lower.includes("iam") || lower.includes("authorization")) {
    return [
      "{",
      "  \"Effect\": \"Allow\",",
      "  \"Action\": \"*\",",
      "  \"Resource\": \"*\"",
      "}"
    ].join("\n");
  }
  if (lower.includes("kms")) {
    return [
      "encrypt_requests_per_second=11800",
      "kms_throttled_requests=2840",
      "pipeline_retries=6",
      "key_strategy='one KMS call per record'"
    ].join("\n");
  }
  if (lower.includes("terraform")) {
    return [
      "terraform_backend='shared-state.tfstate'",
      "state_locking=false",
      "deployment_a='apply RUNNING'",
      "deployment_b='apply RUNNING'",
      "result='lost infrastructure updates'"
    ].join("\n");
  }
  if (lower.includes("private") || lower.includes("dns")) {
    return [
      "client_subnet=private-a",
      "service_endpoint=vpce-analytics.internal",
      "dns_resolution=PUBLIC_IP",
      "route_to_public_ip=NONE",
      "connection=TIMEOUT"
    ].join("\n");
  }
  if (lower.includes("nat")) {
    return [
      "daily_nat_bytes=18.4 TB",
      "largest_flow='private compute -> object storage public endpoint'",
      "gateway_endpoints=[]",
      "monthly_network_cost_change=+340%"
    ].join("\n");
  }
  if (lower.includes("tagging") || lower.includes("cost attribution")) {
    return [
      "resource_tags={\"environment\":\"prod\"}",
      "missing_tags=[\"team\",\"product\",\"cost_center\",\"data_domain\"]",
      "unallocated_monthly_cost=42%"
    ].join("\n");
  }
  if (lower.includes("secret")) {
    return [
      "# Broken bootstrap configuration",
      "spark-submit --conf db.password=PlainTextPassword job.py",
      "# Secret is visible in process history, logs, and instance metadata."
    ].join("\n");
  }
  if (lower.includes("region") || lower.includes("recovery")) {
    return [
      "primary_region=ACTIVE",
      "secondary_region=EMPTY",
      "data_replication=ENABLED",
      "iam_roles=NOT_CREATED",
      "networking=NOT_CREATED",
      "recovery_test=NEVER"
    ].join("\n");
  }
  return [
    "workload_region=ap-south-1",
    "storage_region=us-east-1",
    "autoscaling_signal=cpu_average",
    "quota_headroom=3%",
    "cost_owner=UNKNOWN",
    "# Reliability, locality, quota, and cost contracts were not reviewed together."
  ].join("\n");
}

function modelingEvidence(concept: string): string {
  const lower = concept.toLowerCase();
  if (lower.includes("many-to-many") || lower.includes("bridge")) {
    return [
      "-- Broken: direct join multiplies revenue across every campaign relationship.",
      "SELECT c.campaign_name, SUM(f.revenue)",
      "FROM fact_orders f",
      "JOIN customer_campaign c USING (customer_id)",
      "GROUP BY c.campaign_name;"
    ].join("\n");
  }
  if (lower.includes("role-playing date")) {
    return [
      "-- One date key is reused ambiguously for order, ship, and delivery analysis.",
      "fact_orders(order_date_key, ship_date_key, delivery_date_key)",
      "JOIN dim_date d ON f.order_date_key = d.date_key",
      "-- Dashboard labels every metric as 'Date'."
    ].join("\n");
  }
  if (lower.includes("slowly changing") || lower.includes("temporal")) {
    return [
      "-- Broken: current hierarchy is joined to historical facts.",
      "SELECT f.month, d.current_region, SUM(f.revenue)",
      "FROM fact_sales f JOIN dim_account d USING (account_id)",
      "GROUP BY f.month, d.current_region;"
    ].join("\n");
  }
  if (lower.includes("metric")) {
    return [
      "finance_revenue = SUM(payments.amount) WHERE status = 'CAPTURED'",
      "growth_revenue  = SUM(orders.amount) WHERE status != 'CANCELLED'",
      "executive_revenue = dashboard.cached_total",
      "# No versioned governed definition or reconciliation owner."
    ].join("\n");
  }
  if (lower.includes("cohort")) {
    return [
      "team_a_cohort_date = MIN(account_created_at)",
      "team_b_cohort_date = MIN(first_paid_order_at)",
      "team_c_cohort_date = MIN(first_app_open_at)",
      "# All three dashboards are labeled 'monthly retention'."
    ].join("\n");
  }
  if (lower.includes("natural key")) {
    return [
      "customer_number='C-1042'",
      "original_customer_id=881",
      "reused_customer_id=1944",
      "# Historical facts join by the reused natural key."
    ].join("\n");
  }
  return [
    "-- Current model review",
    "fact_table(grain = 'not documented')",
    "dimension_relationship = 'flattened'",
    "effective_time_rule = 'current row only'",
    "metric_definition = 'copied into each dashboard'"
  ].join("\n");
}

function reliabilityEvidence(concept: string): string {
  const lower = concept.toLowerCase();
  if (lower.includes("unit test")) {
    return [
      "tests: 284 passed",
      "pipeline_result: revenue_total differs by 18%",
      "coverage: transformation functions only",
      "missing: contract, integration, reconciliation, and production checks"
    ].join("\n");
  }
  if (lower.includes("flaky")) {
    return [
      "test_recent_orders: PASS, FAIL, PASS, FAIL",
      "fixture_clock=system_now()",
      "fixture_source=shared_staging_table",
      "parallel_test_runs=true"
    ].join("\n");
  }
  if (lower.includes("fresh") || lower.includes("complete")) {
    return [
      "partition_updated_at=07:58",
      "freshness_sla=08:00",
      "expected_regions=28",
      "loaded_regions=19",
      "status='FRESH but INCOMPLETE'"
    ].join("\n");
  }
  if (lower.includes("row count")) {
    return [
      "baseline_rows=10,200,000",
      "today_rows=14,600,000",
      "alert_threshold=+20%",
      "campaign_launch_today=true",
      "semantic_checks=NONE"
    ].join("\n");
  }
  if (lower.includes("alert")) {
    return [
      "root_incident='upstream orders unavailable'",
      "alerts_fired=347",
      "unique_dependencies=1",
      "deduplication_key=NONE",
      "on_call_ack_time=28m"
    ].join("\n");
  }
  if (lower.includes("cardinality")) {
    return [
      "metric='pipeline_rows_processed'",
      "labels=[pipeline, task, customer_id, file_name, request_id]",
      "active_time_series=18,400,000",
      "monitoring_backend_status='DEGRADED'"
    ].join("\n");
  }
  return [
    "pipeline_status=SUCCESS",
    "freshness=PASS",
    "row_count=PASS",
    "business_reconciliation=FAIL",
    "lineage_owner=UNKNOWN",
    "runbook=NOT_FOUND"
  ].join("\n");
}

function securityEvidence(concept: string): string {
  const lower = concept.toLowerCase();
  if (lower.includes("masking") || lower.includes("policy inheritance")) {
    return [
      "raw_table.ssn -> MASKED",
      "derived_view.ssn -> UNMASKED",
      "export_cache.ssn -> UNMASKED",
      "policy_propagation='manual'"
    ].join("\n");
  }
  if (lower.includes("service account") || lower.includes("identity")) {
    return [
      "principal=svc-data-admin",
      "credential_age_days=812",
      "permissions='admin:*'",
      "owner=UNKNOWN",
      "last_access_review=NEVER"
    ].join("\n");
  }
  if (lower.includes("forgotten") || lower.includes("deletion")) {
    return [
      "customer_delete_request=COMPLETED",
      "warehouse_rows=DELETED",
      "raw_lake=RETAINED",
      "backups=RETAINED",
      "feature_store=RETAINED"
    ].join("\n");
  }
  if (lower.includes("tokenization")) {
    return [
      "orders.customer_token = token_v1(email)",
      "support.customer_token = token_v2(email)",
      "join_match_rate=61%",
      "token_key_rotation=UNCOORDINATED"
    ].join("\n");
  }
  if (lower.includes("break-glass")) {
    return [
      "account=break-glass-admin",
      "mfa=DISABLED",
      "approval=NOT_REQUIRED",
      "session_recording=OFF",
      "credential_rotation=MANUAL"
    ].join("\n");
  }
  if (lower.includes("secret")) {
    return [
      "notebook_cell='AWS_SECRET_ACCESS_KEY=...'",
      "workspace_visibility='all analysts'",
      "git_sync=enabled",
      "secret_scan=disabled"
    ].join("\n");
  }
  return [
    "classification=PII",
    "lineage_propagation=PARTIAL",
    "least_privilege=NOT_VERIFIED",
    "audit_attribution=SERVICE_ACCOUNT_ONLY",
    "exception_expiry=NONE"
  ].join("\n");
}

function architectureEvidence(concept: string): string {
  const lower = concept.toLowerCase();
  if (lower.includes("parallel-run")) {
    return [
      "legacy_pipeline -> legacy_output",
      "new_pipeline    -> new_output",
      "row_count_delta=0.3%",
      "revenue_delta=2.8%",
      "cutover_threshold=UNDEFINED",
      "rollback_owner=UNASSIGNED"
    ].join("\n");
  }
  if (lower.includes("strangler")) {
    return [
      "monolith_domains=[orders,payments,customers,inventory]",
      "migration_plan='replace everything in one release'",
      "contract_boundaries=NONE",
      "rollback_scope='entire platform'"
    ].join("\n");
  }
  if (lower.includes("batch-to-streaming") || lower.includes("latency-value")) {
    return [
      "current_latency=4 hours",
      "requested_latency=5 seconds",
      "business_decision_window=next_business_day",
      "streaming_operating_model=NOT_DEFINED"
    ].join("\n");
  }
  if (lower.includes("ownership")) {
    return [
      "service_owner=team-that-no-longer-exists",
      "on_call_route=DELETED",
      "runbook_last_updated=19 months ago",
      "critical_incidents_open=4"
    ].join("\n");
  }
  if (lower.includes("consumer")) {
    return [
      "data_product_status=PRODUCTION",
      "monthly_compute_cost=$18,400",
      "active_consumers=0",
      "documented_decisions_supported=NONE"
    ].join("\n");
  }
  return [
    "requirements=AMBIGUOUS",
    "migration_boundary=BIG_BANG",
    "ownership=SHARED",
    "cutover_exit_criteria=NONE",
    "rollback_plan=NONE",
    "consumer_value_metric=NONE"
  ].join("\n");
}

function buildEvidence(scenario: ParsedScenario): string {
  if (scenario.section.startsWith("Python")) return pythonEvidence(scenario.coreConcept);
  if (scenario.section.startsWith("CDC")) return cdcEvidence(scenario.coreConcept);
  if (scenario.section.startsWith("Cloud")) return cloudEvidence(scenario.coreConcept);
  if (scenario.section.startsWith("Data Modeling")) return modelingEvidence(scenario.coreConcept);
  if (scenario.section.startsWith("Testing")) return reliabilityEvidence(scenario.coreConcept);
  if (scenario.section.startsWith("Security")) return securityEvidence(scenario.coreConcept);
  return architectureEvidence(scenario.coreConcept);
}

function conceptSpecificAdvice(scenario: ParsedScenario): string {
  const concept = scenario.coreConcept.toLowerCase();

  if (concept.includes("bounded-memory")) {
    return "Stream or chunk the file with an explicit schema, process bounded batches, and write checkpointed output instead of materializing the full CSV in pandas.";
  }
  if (concept.includes("credential refresh")) {
    return "Use a single-flight refresh lock, refresh before expiry, and let concurrent workers reuse the newly cached token.";
  }
  if (concept.includes("backoff") || concept.includes("throttling")) {
    return "Honor Retry-After, use exponential backoff with jitter, cap the total retry budget, and checkpoint successful pages.";
  }
  if (concept.includes("encoding")) {
    return "Declare or detect the source encoding, decode strictly, quarantine invalid records, and reconcile rejected-byte and record counts.";
  }
  if (concept.includes("canonical")) {
    return "Canonicalize records with sorted keys and normalized values before hashing, comparing, or publishing them.";
  }
  if (concept.includes("concurrency model")) {
    return "Use async or threads for I/O-bound calls and processes, vectorized libraries, or distributed compute for CPU-bound parsing.";
  }
  if (concept.includes("copy-on-write")) {
    return "Partition work before process creation, pass references or bounded chunks rather than full DataFrames, and cap worker concurrency by memory.";
  }
  if (concept.includes("connection pool")) {
    return "Acquire connections through a context manager or finally block, enforce pool timeouts, and monitor checked-out versus returned connections.";
  }
  if (concept.includes("atomic publication")) {
    return "Write to a temporary immutable object, validate it, then publish an atomic manifest or rename so readers never observe partial data.";
  }
  if (concept.includes("idempotent event")) {
    return "Persist the provider event ID behind a unique constraint and make the business write and idempotency record one atomic operation.";
  }
  if (concept.includes("defensive parsing")) {
    return "Reject or quarantine payloads beyond byte, nesting-depth, array-size, and processing-time limits before recursive parsing.";
  }
  if (concept.includes("compressed inputs")) {
    return "Process each archive independently, verify compression integrity and expansion ratio, and quarantine only the failed object.";
  }
  if (concept.includes("reproducibility")) {
    return "Persist the raw response, request parameters, retrieval timestamp, pagination token, and source version before transforming mutable API data.";
  }
  if (concept.includes("dependency pinning")) {
    return "Pin the SDK version, run contract tests against recorded provider responses, and roll out upgrades through a canary environment.";
  }
  if (concept.includes("timeout")) {
    return "Set connect, read, and total deadlines separately; retry only transient failures within a bounded budget and checkpoint progress.";
  }
  if (concept.includes("fingerprinting")) {
    return "Identify deliveries with content checksum plus source metadata rather than filename alone, then record every accepted version in a manifest.";
  }
  if (concept.includes("cdc retention")) {
    return "If the saved log position is gone, take a new consistent snapshot at a known cut line, restart CDC from that position, and reconcile overlap by key.";
  }
  if (concept.includes("snapshot strategies")) {
    return "Use a replica or database-native consistent snapshot, read in bounded key ranges, throttle source load, and coordinate the CDC cut line.";
  }
  if (concept.includes("transactional ordering")) {
    return "Preserve transaction ID and commit sequence, buffer incomplete transactions, and apply each transaction atomically at the target.";
  }
  if (concept.includes("key mutation")) {
    return "Model a primary-key update as an identity change with explicit before/after keys, delete the old key safely, and preserve durable entity identity.";
  }
  if (concept.includes("schema changes")) {
    return "Freeze or version the bootstrap schema, capture DDL events, and reconcile snapshot and CDC records under an explicit compatibility policy.";
  }
  if (concept.includes("replica consistency")) {
    return "Gate extracts on replica replay position or lag, record the consistency point, and fall back or pause when the replica exceeds tolerance.";
  }
  if (concept.includes("surrogate-key collision")) {
    return "Use a globally safe key strategy or reseed ranges deliberately, then detect collisions before loading facts that reference the dimension.";
  }
  if (concept.includes("feedback-loop")) {
    return "Stamp event origin and lineage, exclude reverse-ETL writes from capture, and add loop-rate monitoring before enabling bidirectional movement.";
  }
  if (concept.includes("egress")) {
    return "Co-locate compute and storage, add private service endpoints where appropriate, and validate the cost and latency impact before moving data.";
  }
  if (concept.includes("preemptible")) {
    return "Write through idempotent task attempts and atomic commits so interrupted workers can be replaced without exposing partial output.";
  }
  if (concept.includes("autoscaling")) {
    return "Scale on backlog and service time with cooldown, hysteresis, and minimum capacity instead of reacting directly to noisy CPU averages.";
  }
  if (concept.includes("cold start")) {
    return "Measure cold-start contribution against the SLA, keep warm capacity only where justified, or move steady workloads to longer-lived compute.";
  }
  if (concept.includes("authorization")) {
    return "Replace wildcard permissions with task-specific roles, scoped resources, short-lived credentials, and automated least-privilege review.";
  }
  if (concept.includes("encryption-service scaling")) {
    return "Reduce per-record KMS calls with envelope encryption and data-key reuse within safe boundaries, then monitor throttle and retry rates.";
  }
  if (concept.includes("state locking")) {
    return "Use a remote backend with locking, serialize applies per state, and require reviewed plans in CI before infrastructure changes.";
  }
  if (concept.includes("configuration drift")) {
    return "Treat infrastructure as code as authoritative, detect console drift continuously, and import or revert emergency changes after review.";
  }
  if (concept.includes("private connectivity")) {
    return "Validate DNS resolution, route tables, endpoint policies, security groups, and network ACLs from the actual workload subnet.";
  }
  if (concept.includes("cost attribution")) {
    return "Enforce owner, product, environment, and cost-center tags at provisioning time and route unallocated spend to an accountable queue.";
  }
  if (concept.includes("fact-table grain")) {
    return "Write the fact grain in one sentence, enforce its natural uniqueness, and test downstream joins for fanout before publishing metrics.";
  }
  if (concept.includes("semi-additive")) {
    return "Classify the measure explicitly and aggregate balances across entities but use period-end or average logic across time.";
  }
  if (concept.includes("many-to-many")) {
    return "Introduce a bridge table with effective dates and an agreed allocation rule so facts are not multiplied across relationships.";
  }
  if (concept.includes("role-playing")) {
    return "Expose separate semantic roles for order, ship, and delivery dates while reusing the same conformed date dimension physically.";
  }
  if (concept.includes("metric definition")) {
    return "Version one governed metric definition, reconcile it to approved examples, and measure usage that bypasses the semantic layer.";
  }
  if (concept.includes("temporal hierarch")) {
    return "Model hierarchy membership with effective dates and join facts using event time rather than the current organizational structure.";
  }
  if (concept.includes("cohort")) {
    return "Define cohort entry, eligibility, timezone, and return behavior once, version changes, and test with named business examples.";
  }
  if (concept.includes("test pyramid")) {
    return "Keep unit tests, then add contract, integration, distribution, reconciliation, and production canary checks using representative peak data.";
  }
  if (concept.includes("deterministic test")) {
    return "Freeze clocks, isolate fixtures, remove shared mutable dependencies, and make every test input and expected result reproducible.";
  }
  if (concept.includes("completeness versus freshness")) {
    return "Track expected partitions or source slices separately from last-updated time and publish only when both freshness and completeness pass.";
  }
  if (concept.includes("anomaly detection")) {
    return "Use seasonal and business-aware baselines with severity bands, then combine volume anomalies with semantic invariants.";
  }
  if (concept.includes("alert deduplication")) {
    return "Group alerts by root dependency and incident window, suppress child symptoms, and retain the affected consumer and SLA context.";
  }
  if (concept.includes("metric cardinality")) {
    return "Remove unbounded identifiers from metric labels, keep them in logs or traces, and enforce cardinality budgets during review.";
  }
  if (concept.includes("policy inheritance")) {
    return "Attach policy to classified data and propagate it through views, exports, caches, backups, and derived products using lineage-aware controls.";
  }
  if (concept.includes("machine identity")) {
    return "Assign an owner and expiry, replace static credentials with short-lived workload identity, and continuously review effective permissions.";
  }
  if (concept.includes("privacy deletion")) {
    return "Maintain a deletion inventory across raw, curated, serving, feature, cache, and backup layers with auditable completion and legal-hold exceptions.";
  }
  if (concept.includes("tokenization")) {
    return "Use a governed deterministic token domain for approved joins, rotate keys with versioning, and restrict linkage access to minimize re-identification risk.";
  }
  if (concept.includes("privileged-access")) {
    return "Require time-bound approval, MFA, session recording, automatic expiry, and post-use review for break-glass access.";
  }
  if (concept.includes("parallel-run")) {
    return "Define record- and metric-level reconciliation thresholds, classify accepted differences, and cut over only after a stable comparison window.";
  }
  if (concept.includes("strangler")) {
    return "Migrate one bounded data product at a time behind explicit contracts, compare outputs, and retain a rollback path for every slice.";
  }
  if (concept.includes("latency-value")) {
    return "Tie the requested latency to a real decision window and adopt streaming only when the business value exceeds its correctness and operational cost.";
  }
  if (concept.includes("operational ownership")) {
    return "Transfer ownership as a verifiable deliverable: on-call route, runbook, dashboards, permissions, SLOs, and an acknowledged receiving team.";
  }
  if (concept.includes("product discovery")) {
    return "Validate named consumers and decisions before building, define adoption and value measures, and stop or reshape products with no demonstrated use.";
  }

  return `Make ${scenario.coreConcept} an explicit contract, implement the smallest reversible change, and validate it with production-like failure evidence.`;
}

function buildLogs(scenario: ParsedScenario): string {
  const signals = scenario.monitoring.slice(0, 3);
  return [
    `[Production review] Scenario ${scenario.number}: ${scenario.title}`,
    `Observed symptom: ${scenario.question}`,
    `Core contract at risk: ${scenario.coreConcept}.`,
    signals.length > 0 ? `Evidence to collect: ${signals.join(" ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function toScenario(parsed: ParsedScenario): Scenario {
  const classification = classifyScenario(parsed);
  const specificAdvice = conceptSpecificAdvice(parsed);
  const rootCauseSummary = parsed.rootCauses.slice(0, 3).join(" ");
  const solutionSummary = parsed.solution.slice(0, 4).join(" ");
  const tradeoffSummary = parsed.tradeoffs.slice(0, 3).join(" ");
  const monitoringSummary = parsed.monitoring.slice(0, 4).join(" ");

  return {
    id: `pdf-v2-scenario-${parsed.number}`,
    title: parsed.title,
    slug: slugify(parsed.title),
    domain: classification.domain,
    difficulty: parsed.difficulty,
    scenarioType: classification.scenarioType,
    isFree: FREE_SCENARIO_NUMBERS.has(parsed.number),
    estimatedMinutes:
      parsed.difficulty === "beginner" ? 18 : parsed.difficulty === "advanced" ? 28 : 23,
    tags: [
      classification.sectionTag,
      titleCase(parsed.coreConcept),
      "Production Scenario",
      "Interview Practice"
    ],
    businessContext: `You are the data engineer on call for this production path. ${parsed.question}`,
    problemStatement: `The incident centers on ${parsed.coreConcept}. The current implementation or operating process does not make that contract explicit, so the team needs a diagnosis supported by evidence rather than a tool or configuration guess.`,
    requirement:
      "Identify the most likely failure mechanism, propose a reversible production-safe fix, and explain validation, trade-offs, monitoring, and recovery.",
    schema: `${classification.sectionTag} evidence is shown below. Treat it as a production review artifact rather than a toy exercise.`,
    sampleInput: "",
    brokenCode: buildEvidence(parsed),
    actualOutput: parsed.question,
    expectedOutput:
      "A strong response should define the contract, rank likely causes, propose a safe fix, and prove correctness with monitoring and reconciliation.",
    logs: buildLogs(parsed),
    hints: [
      parsed.testing,
      parsed.rootCauses[0] ?? "Start by proving where the contract is breaking.",
      specificAdvice
    ].filter(Boolean),
    tasks: [
      "State the affected correctness, latency, security, cost, or ownership contract.",
      "Use the evidence to rank the two most likely causes.",
      "Design the fix and explain how you would test, monitor, recover, and communicate it."
    ],
    modelSolution: [
      `Root-cause direction: ${rootCauseSummary}`,
      `Scenario-specific fix: ${specificAdvice}`,
      `Production-safe design: ${solutionSummary}`,
      `Interview framing: ${parsed.strongAnswer}`
    ]
      .filter(Boolean)
      .join("\n\n"),
    productionExplanation: [
      parsed.understanding,
      `Trade-offs: ${tradeoffSummary}`,
      `Monitoring and testing: ${monitoringSummary}`
    ]
      .filter(Boolean)
      .join("\n\n"),
    commonMistakes: [
      "Jumping directly to a service or configuration change before proving the failure mechanism.",
      "Describing only the happy-path fix without replay, rollback, or failure isolation.",
      parsed.rootCauses[0] ?? "Leaving the source and consumer contract implicit."
    ],
    evaluationRubric: {
      rootCause: 25,
      correctness: 25,
      productionThinking: 20,
      tradeoffs: 15,
      communication: 15
    },
    followUps:
      parsed.followUps.length > 0
        ? parsed.followUps
        : [
            "How would you prove the fix under a production-like failure?",
            "What would make you roll back or quarantine the data?"
          ]
  };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = await import("pdf-parse").catch(() => {
    try {
      return requireFromFrontend("pdf-parse");
    } catch {
      return null;
    }
  });
  if (!pdfParse) {
    throw new Error("Missing pdf-parse. Run `cd frontend && npm install --save-dev pdf-parse`.");
  }

  const legacyParser = (pdfParse as { default?: unknown }).default ?? pdfParse;
  if (typeof legacyParser === "function") {
    const result = await legacyParser(buffer);
    return String(result.text ?? "");
  }

  const modernParser = pdfParse as {
    PDFParse?: new (options: { data: Buffer }) => {
      getText: () => Promise<{ text?: string }>;
      destroy?: () => Promise<void>;
    };
  };
  if (modernParser.PDFParse) {
    const parser = new modernParser.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return String(result.text ?? "");
    } finally {
      await parser.destroy?.();
    }
  }

  throw new Error("Unable to load a compatible pdf-parse API.");
}

async function main() {
  const existingGenerated = JSON.parse(
    await readFile(FRONTEND_OUTPUT, "utf8")
  ) as Scenario[];
  const baseGenerated = existingGenerated.filter(
    (scenario) => !scenario.id.startsWith("pdf-v2-scenario-")
  );
  const allExisting = getScenarios().filter(
    (scenario) => !scenario.id.startsWith("pdf-v2-scenario-")
  );
  const staticScenarioCount = allExisting.length - baseGenerated.length;
  const existingSlugs = new Set(allExisting.map((scenario) => scenario.slug));
  const pdfText = await extractPdfText(await readFile(INPUT_PDF));
  const parsed = splitScenarios(pdfText).map(parseScenario);

  if (parsed.length !== 120) {
    throw new Error(`Expected 120 scenarios in Volume 2, but parsed ${parsed.length}.`);
  }

  const skipped: ImportReport["skipped"] = [];
  const additions: Scenario[] = [];

  for (const parsedScenario of parsed) {
    const overlap = CONCEPT_OVERLAPS.get(parsedScenario.number);
    if (overlap) {
      skipped.push({
        number: parsedScenario.number,
        title: parsedScenario.title,
        existingSlug: overlap.existingSlug,
        reason: overlap.reason
      });
      continue;
    }

    const scenario = toScenario(parsedScenario);
    if (existingSlugs.has(scenario.slug)) {
      skipped.push({
        number: parsedScenario.number,
        title: parsedScenario.title,
        existingSlug: scenario.slug,
        reason: "An existing scenario already uses the same normalized title and route slug."
      });
      continue;
    }

    additions.push(scenario);
    existingSlugs.add(scenario.slug);
  }

  const merged = [...baseGenerated, ...additions];
  const report: ImportReport = {
    source: path.basename(INPUT_PDF),
    previousGeneratedCount: baseGenerated.length,
    parsedCount: parsed.length,
    addedCount: additions.length,
    skippedCount: skipped.length,
    finalGeneratedCount: merged.length,
    visibleScenarioCount: staticScenarioCount + merged.length,
    skipped,
    added: additions.map((scenario) => ({
      number: Number(scenario.id.replace("pdf-v2-scenario-", "")),
      title: scenario.title,
      slug: scenario.slug,
      domain: scenario.domain,
      scenarioType: scenario.scenarioType
    }))
  };

  await mkdir(path.dirname(DATA_OUTPUT), { recursive: true });
  const json = `${JSON.stringify(merged, null, 2)}\n`;
  await writeFile(DATA_OUTPUT, json);
  await writeFile(FRONTEND_OUTPUT, json);
  await writeFile(REPORT_OUTPUT, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Parsed ${parsed.length} Volume 2 scenarios.`);
  console.log(`Added ${additions.length}; skipped ${skipped.length} conceptual duplicates.`);
  console.log(`Visible scenario library now contains ${report.visibleScenarioCount} scenarios.`);
  console.log(`Import report: ${REPORT_OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
