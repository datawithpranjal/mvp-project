import type { SystemDesignCase } from "../lib/system-design";

// Editorial review of the original catalog. Preserve IDs and saved decision IDs.
const reviews: Record<string, { workload: string; drill: string; verify: string; processing?: string; storage?: string; requirement?: string }> = {
  "ecommerce-orders-data-platform": {
    workload: "100,000 orders/day; two years of history; two engineers; an existing warehouse and object store. Publish by 8 AM IST. For this exercise revenue means captured payments minus successful refunds, attributed to original order business date; corrections restate affected dates.",
    drill: "A successful load loses its acknowledgement and retries; a refund arrives for an order seven days old.",
    verify: "Replay the same input twice and compare unique keys and exact totals. Add a late refund and verify its original order date changes once. Interrupt publication and ensure readers retain the last complete certified report.",
    processing: "Incrementally extract updated_at with overlap and durable checkpoints, deduplicate stable IDs by source version, and aggregate payments/refunds separately before joining. Identify changed original order dates and rebuild their totals. SQL in the existing warehouse is sufficient unless measured limits justify distributed processing.",
    requirement: "Reconcile captured-payment and refund controls at matched cutoffs; bridge fees, timing and adjustments separately when comparing settlements. Do not subtract order discounts again from already discounted captured payments."
  },
  "clickstream-analytics-platform": {
    workload: "50 million events/day with fivefold peaks; event_id and schema_version supplied by SDK; mobile devices can upload 48 hours late. Five-minute provisional reporting and a separately finalized daily report are required. Use UTC day boundaries for this exercise.",
    drill: "A mobile SDK replays yesterday's events and sends an unknown event version during a traffic spike.",
    verify: "Replay duplicate event IDs and compare DAU/funnel counts. Test an event on each side of a day boundary and one beyond the online lateness window. Verify malformed/late events remain accounted for in quarantine or correction flows.",
    requirement: "Document session gap, identity and late-finalization policy; a watermark bounds state, not proof that older events cannot arrive. Deduplication state must cover online lateness, with a separate durable replay strategy."
  },
  "postgres-cdc-to-warehouse": {
    workload: "A 500 GB source database with 2,000 changes/second peak and a 15-minute freshness target. Source keys are stable; transactions may change several rows. Plan a six-hour connector outage, bounded retained WAL and a consistent initial snapshot.",
    drill: "A transaction updates two rows, one delete is replayed, and an older update arrives after that delete.",
    verify: "Verify both changes from the same transaction survive deduplication. Replay delete/older-update sequences and ensure a deleted row does not resurrect. Reconcile keys at equivalent source/sink cutoffs and test snapshot-to-stream boundaries.",
    processing: "Use connector-documented event identity and ordering: source position plus transaction event order/table/key as needed. LSN alone need not uniquely identify each changed row. Establish a consistent snapshot/change-stream handoff, apply only newer per-key versions, and retain delete ordering metadata so an old replay cannot resurrect records.",
    storage: "Store operation, table, primary key, connector position, transaction/event ordering metadata and before/after data with access controls. Current state retains last-applied sequence and deletion metadata, including when deleted rows are excluded from consumer views.",
    requirement: "Monitor replication-slot retained WAL and source disk risk. If required WAL is lost, use a controlled resnapshot and reconciliation rather than claiming an offset retry can recover missing history."
  },
  "lakehouse-product-analytics": {
    workload: "2 TB/day of events; one year of history; 20 concurrent analysts; hourly curated refreshes and yesterday-only dashboards targeting p95 under ten seconds. An object store and distributed query engine already exist.",
    drill: "A backfill and compaction job update the same date while a consumer reads a published table version.",
    verify: "Compare counts/totals before and after compaction, verify snapshot-consistent reads during concurrent writes, and measure scanned bytes for yesterday's query. Test schema compatibility and recovery from commit conflicts.",
    requirement: "Choose a table format supported by the actual engines/catalog. Define retention, snapshot expiry and orphan cleanup so time travel, active readers and backfill recovery remain safe; compaction is not a substitute for correctness."
  },
  "daily-revenue-mart": {
    workload: "5 million order lines/month; orders may have multiple payments, refunds and product tags. Publish by 8 AM IST with a versioned month-close snapshot. Finance defines this exercise's net collections as captured payments less successful refunds; fees are a separate measure, not accounting revenue recognition.",
    drill: "One order has two lines, two payments and two partial refunds; a correction arrives after month close.",
    verify: "Use a fixture with captured payments 600 and 400, and refunds 100 and 50: net collections must be 850 in the same currency, irrespective of line/tag joins. Verify product allocations sum back to the order and closed reports remain reproducible.",
    processing: "Keep payment/refund transaction facts separate and aggregate before joins. Allocate order-level payment/refund amounts to products only under a Finance-approved allocation rule; joining order totals to every line is invalid. Keep taxes, discounts and fees separately defined and avoid subtracting discounts twice.",
    requirement: "Reconcile gross captures/refunds to provider controls, then bridge fees, adjustments and settlement timing to deposits. Settlement net is not necessarily daily sales revenue. Publish current corrected and closed-as-reported versions explicitly."
  },
  "customer-360-platform": {
    workload: "10 million source profiles across four systems; 200,000 changes/day; four-hour refresh target. Shared household emails exist. Only verified source links may automatically merge identities; ambiguous matches require review.",
    drill: "Two unrelated customers sharing an email are falsely merged, and one later changes consent.",
    verify: "Seed shared/missing/changed-email examples and assert no unsupported merge. Undo a mistaken link and rebuild affected profiles with source lineage. Verify consent revocation reaches downstream activation outputs.",
    requirement: "Version identity links and survivorship rules, support reversible splits, and preserve consent by purpose/source. Treat match confidence as uncertainty, not an authorization rule; restrict raw PII and deletion propagation."
  },
  "data-quality-monitoring-system": {
    workload: "200 datasets, 20 critical marts and 100 daily pipelines; three owning teams. Critical freshness violations should notify an owner within ten minutes. Baselines must distinguish weekday/weekend and known seasonal patterns.",
    drill: "An upstream table stops arriving; 30 downstream checks fail while a healthy seasonal sales spike also occurs.",
    verify: "Inject a stale partition and confirm one routed incident links affected descendants rather than 30 duplicate pages. Validate missing/failed checks are not green, and a known seasonal spike does not automatically block certification.",
    requirement: "Version checks and thresholds, record check coverage and execution failures, sanitize diagnostic samples, and define owner acknowledgement, suppression expiry and re-certification. Use exact business invariants for critical totals rather than anomaly scores alone."
  },
  "backfill-safe-pipeline": {
    workload: "Repair 90 daily partitions totaling 5 TB while the normal 8 AM daily report continues. Correction logic is pinned to a reviewed version; inputs must remain reproducible. Budget allows a maximum of four concurrent repair partitions.",
    drill: "A late normal update races with repaired publication, and a worker crashes after its output commit.",
    verify: "Replay a repaired partition twice, compare exact keys/totals, then inject a concurrent newer write. Verify an optimistic version check or coordination policy prevents the backfill from erasing it. Rehearse restoring the prior certified version.",
    requirement: "Pin source and transformation versions, track partition publication state and coordinate concurrent writers. A staging table alone does not guarantee an atomic multi-partition cutover; document the storage engine's actual transaction boundary."
  },
  "real-time-fraud-feature-platform": {
    workload: "5,000 authorization requests/second peak; feature updates within two seconds and p99 feature reads under 50 ms. The current transaction is supplied by the scoring request; historical velocity uses prior accepted events. Risk owners define missing-feature fallback policy.",
    drill: "Feature-store writes time out after committing; duplicates arrive, and a historical event is too late for the online window.",
    verify: "Replay one payment and verify velocity changes once. Test stale/missing feature behavior under the approved policy, record the exact feature version used per decision and verify old updates cannot overwrite newer store values.",
    processing: "Deduplicate source events, compute bounded event-time windows and perform version-guarded writes to the online store. Define whether the current request belongs in each feature. Stream checkpoint guarantees do not automatically cover external writes or payment decisions; retain decision-time snapshots for faithful offline training.",
    requirement: "Distinguish feature freshness from feature read latency. Do not revise a past authorization silently when late data arrives; preserve its as-known evidence and apply corrections to appropriate historical analysis."
  },
  "airflow-data-platform-orchestration": {
    workload: "100 pipelines over three source systems with 20 critical marts due at 8 AM IST. Sources arrive between 1 and 5 AM; there are 16 worker slots and a separate four-slot backfill pool. Each partition has an explicit manifest and owner.",
    drill: "Yesterday's dataset-ready event arrives again while today's partition is missing; a task retries after committing output.",
    verify: "Confirm downstream publication checks the requested partition's manifest and quality, not just a recent success signal. Replay a committed task and compare output; run backfills alongside daily jobs and verify the daily resource budget remains available.",
    requirement: "Bind readiness to logical partition and required upstream versions, with timeout/escalation. Separate transient retries from permanent data failures and reserve capacity; event-based scheduling alone does not prove all required inputs are complete."
  }
};

export function improveOriginalCase(item: SystemDesignCase): SystemDesignCase {
  const review = reviews[item.slug];
  if (!review) return item;
  const result = {
    ...item,
    businessContext: `${item.businessContext} Exercise assumptions (fictional workload): ${review.workload}`,
    learnerTask: `${item.learnerTask} Stress test: ${review.drill} Show a concrete verification and one defensible alternative.`,
    functionalRequirements: [...item.functionalRequirements, ...(review.requirement ? [review.requirement] : [])],
    modelAnswer: {
      ...item.modelAnswer,
      processing: review.processing ?? item.modelAnswer.processing,
      storageModel: review.storage ?? item.modelAnswer.storageModel,
      reliability: `${item.modelAnswer.reliability} Verification drill: ${review.verify}`
    },
    followUps: [...item.followUps, `Walk through this failure: ${review.drill}`]
  };
  if (item.slug === "daily-revenue-mart") {
    result.functionalRequirements[0] = "Define and report gross captures, successful refunds and net collections; keep tax, discount, fee and recognition measures separate.";
    result.nonFunctionalRequirements = item.nonFunctionalRequirements.map(s => s.includes("settlement") ? "Reconcile at matched cutoffs with an explicit settlement timing/fee bridge." : s);
  }
  if (item.slug === "postgres-cdc-to-warehouse") {
    result.decisions = item.decisions.map(d => d.id !== "ordering" ? d : { ...d, options: d.options.map(o => o.id !== "sequence" ? o : { ...o, label: "Connector-defined source position plus within-transaction event order.", feedback: "Use the connector's documented ordering; several row changes can share a transaction/position. Timestamps or LSN alone may not uniquely order every event." }) });
  }
  return result;
}
