import type { SystemDesignCase } from "../lib/system-design";

// Original interview-style exercises, not attributed company interview questions.
// All numerical workloads are fictional exercise assumptions.
type Brief = {
  slug: string; title: string; domain: SystemDesignCase["domain"]; difficulty: SystemDesignCase["difficulty"];
  context: string; requirements: string[]; constraints: string[]; stages: string[];
  broken: string; task: string; hints: string[]; followUps: string[];
  answer: SystemDesignCase["modelAnswer"];
  choice: [string, string, string, string, string];
};

const briefs: Brief[] = [
  {
    slug: "rate-limited-api-ingestion", title: "Design Reliable Ingestion from a Rate-Limited API", domain: "batch", difficulty: "beginner",
    context: "A support platform has 2 million tickets and 50,000 updates/day. Its API permits 100 requests/minute and 500 rows/page. It offers snapshot-consistent pagination, cursors expiring after 24 hours, second-resolution updated_at filtering and a separate daily deletion feed. Confirm these guarantees with a real vendor rather than assuming every API provides them.",
    requirements: ["Load history and then refresh current ticket state hourly.", "Capture updates and deletions without losing same-timestamp changes.", "Audit accepted pages without exposing private ticket message bodies in BI."],
    constraints: ["Incremental refresh completes within 30 minutes; initial history has a separate window.", "Reserve quota for other consumers and bound retry storms.", "One worker restart must not skip records or duplicate current-state rows."],
    stages: ["Quota-aware API worker", "Raw pages", "Checkpoint manifest", "Versioned staging", "Current ticket table", "Reconciliation"],
    broken: "Advance the watermark to now before all pages are stored, append responses blindly, and infer deletions from absence in an incremental response.",
    task: "Define fetched, landed and applied checkpoints. Estimate initial-load duration and walk through a crash after storing a page but before checkpointing it. Explain expired cursors, timestamp ties and deletions.",
    choice: ["When may the landed checkpoint advance?", "After durable page storage, with idempotent downstream replay.", "The payload remains recoverable if acknowledgement fails; checkpoint and output need not share a transaction if replay is safe.", "Before fetching/storing the page to avoid duplicate requests.", "A subsequent failure leaves a permanent hole behind the checkpoint; duplicate delivery is safer than an unrecorded skip."],
    hints: ["Divide total rows by page size, then by the request budget.", "An overlap window covers second-resolution timestamp ties; a source version resolves conflicting updates.", "Treat missing deletion manifests as incomplete input, not proof there were no deletions."],
    answer: {
      overview: "A quota-aware scheduled worker and warehouse MERGE meet the workload without a streaming platform.",
      dataFlow: "Fetch under a shared rate budget, persist pages plus cursor metadata, acknowledge landing, normalize and apply records, then advance the applied watermark.",
      storageModel: "Keep page manifests, versioned records and one current row per ticket_id. Retain tombstones from the deletion feed and restrict raw access.",
      processing: "Initial history requires at least 4,000 requests: 40 minutes at the entire quota before overhead. Use a lower operational budget. Reread an overlap and reject older source versions in current state; periodically reconcile source controls.",
      reliability: "Crash between page storage and checkpointing, replay and compare keys/state. Back off with jitter and Retry-After for 429s. Alert on missing manifests, cursor expiry and lag. Restart an expired cursor from a safe bounded overlap, not from now.",
      tradeoffs: "Overlap consumes quota for completeness. Snapshot exports can simplify history if consistency is documented. Timestamp-only updates cannot resolve same-timestamp conflicts without an additional source contract.",
      interviewFraming: "Explain the source guarantees and checkpoint boundaries before naming an orchestrator; demonstrate one failed page and its recovery."
    },
    followUps: ["What changes if pagination is not snapshot-consistent?", "Volume grows tenfold with the same quota: what do you negotiate?", "No version exists for conflicting timestamp ties. What cannot be guaranteed?"]
  },
  {
    slug: "historical-sales-territory-model", title: "Design Historical Sales Reporting with Changing Dimensions", domain: "modeling", difficulty: "intermediate",
    context: "A retailer processes 20 million order lines/month and 3 million customers. Finance needs territory at sale time; Sales separately wants today's territory. CRM supplies effective_at and source version, but changes arrive up to 14 days late.",
    requirements: ["Define order-line fact grain and effective-dated territory history.", "Expose historical and current attribution as explicitly different views.", "Repair affected facts after backdated changes with an audit trail."],
    constraints: ["Publish by 7 AM UTC with five years of history.", "Each fact joins to at most one effective territory version.", "Bound repair by affected customer and interval; restrict personal identifiers."],
    stages: ["Orders and CRM", "Raw changes", "Dimension intervals", "Temporal fact join", "Named reporting views", "Cardinality checks"],
    broken: "Overwrite territory in place, then join all historical facts to today's customer. Use inclusive end timestamps on adjacent versions.",
    task: "Draw keys and effective intervals. Handle a backdated change, a fact arriving before its dimension and a sale exactly at a boundary. Explain corrected history versus what was originally reported.",
    choice: ["How should adjacent historical versions be represented?", "Non-overlapping [valid_from, valid_to) intervals per customer.", "A sale at the boundary belongs to exactly one version. Validate overlaps and any prohibited gaps.", "Inclusive start and end on both adjacent intervals.", "The shared boundary matches twice and can multiply facts even when source order IDs are unique."],
    hints: ["A surrogate key identifies a dimension version, not just a customer.", "Separate business effective time from ingestion time.", "Unknown members need a repair queue rather than silently dropped facts."],
    answer: {
      overview: "Use a line-grain fact with effective-dated territory history and explicit current/historical reporting semantics.",
      dataFlow: "Land changes, rebuild impacted intervals, validate cardinality, resolve fact versions using sale time, and reprocess unresolved customer keys.",
      storageModel: "Fact key (order_id,line_id); dimension version key, customer_id, valid_from, valid_to and source_version. Keep received_at and correction lineage separately.",
      processing: "Split the affected interval for a backdated change and repair intersecting facts. Current-territory reporting instead joins the customer business key to its current version.",
      reliability: "Test sales immediately before, at and after a boundary. Assert no overlap/fan-out and unchanged total revenue between attribution views. Monitor unresolved keys and correction backlog.",
      tradeoffs: "Load-time surrogate resolution speeds reads but requires repair; query-time temporal joins are valid if performance is tested. Reproducing originally published history additionally needs reporting snapshots or bitemporal records.",
      interviewFraming: "Define whose historical truth is needed, then demonstrate an interval split and the exact facts it changes."
    },
    followUps: ["How do you reproduce a report published before a correction?", "What happens when customer identities merge?", "How do you scope a correction effective two years ago?"]
  },
  {
    slug: "inventory-event-analytics", title: "Design Near-Real-Time Inventory Analytics", domain: "streaming", difficulty: "intermediate",
    context: "500 stores emit 5,000 stock movements/second at peak. Each has event_id, store_id, sku_id, signed delta, event_time and per-key sequence. Devices may be offline six hours. A separate operational system owns checkout and reservations; this platform supplies analytics, not oversell prevention.",
    requirements: ["Refresh online-device inventory analytics within two minutes.", "Handle duplicate/out-of-order movements and nightly authoritative snapshots.", "Show provisional status when source data is incomplete."],
    constraints: ["Keep seven days of replay input and one year of compact history.", "Bound deduplication state without making unsafe replay claims.", "Define recovery capacity for a one-hour outage and hot keys."],
    stages: ["Store producers", "Partitioned log", "Deduplication and gaps", "Versioned stock", "Serving", "Snapshot reconciliation"],
    broken: "Sum every delivery and overwrite stock whenever a snapshot arrives, regardless of the sequence it covers.",
    task: "Choose partition keys and reconciliation boundaries. Starting with snapshot stock 100 at sequence 50, apply a duplicate +5 at 51 and delayed -2 at 52. Explain provisional data and deduplication beyond its TTL.",
    choice: ["How do you merge a snapshot with movements?", "Apply only unique movements after the snapshot's covered sequence.", "A defined coverage boundary prevents applying the same movement both inside the snapshot and as a delta.", "Overwrite with the latest-arriving snapshot, then apply every stored movement.", "Arrival order is not coverage order; this can erase recent changes and double-count historical ones."],
    hints: ["Ordering is per key/partition, not global.", "A watermark does not prove offline events will never arrive.", "Replay beyond an in-memory TTL needs durable identities or an isolated rebuild."],
    answer: {
      overview: "Keep a replayable movement ledger and versioned aggregates with an explicit completeness signal.",
      dataFlow: "Partition by store/SKU, validate event identities and sequence gaps, deduplicate before deltas, then reconcile with snapshots carrying coverage metadata.",
      storageModel: "Ledger keyed by event_id; aggregate keyed by store/SKU with snapshot boundary, as_of and source completeness. Use a device epoch if counters reset.",
      processing: "Snapshot 100 at 50 plus unique +5 at 51 and -2 at 52 yields 103, regardless of duplicate delivery. Events covered by the snapshot do not apply again.",
      reliability: "Replay twice, inject gaps and an old snapshot, and compare state. Monitor device age, sequence gaps, reconciliation deltas and lag. Rebuild beyond dedup TTL from a clean snapshot boundary.",
      tradeoffs: "Fast analytics stays provisional during outages. Preventing overselling requires an operational reservation/consistency design, not simply adding a stream.",
      interviewFraming: "State the consistency boundary, then walk through the numerical replay example and explain what consumers see when data is stale."
    },
    followUps: ["A single SKU produces 30% of events. How can its aggregation scale?", "A device resets its counter: what identifies its new epoch?", "Why does adding checkout reservation change the system's guarantees?"]
  },
  {
    slug: "subscription-billing-reconciliation", title: "Design Subscription Billing Reconciliation", domain: "batch", difficulty: "intermediate",
    context: "A SaaS business generates 200,000 invoices/month. Webhooks repeat or arrive out of order; settlement files arrive daily and deposits can lag two business days. Fees, partial refunds and chargebacks arrive separately. Finance needs an exception report, not automated movement of money.",
    requirements: ["Separate invoice, payment, refund, settlement and deposit identities.", "Distinguish expected timing differences from aged exceptions.", "Preserve correction history and reconcile each currency independently."],
    constraints: ["Report by 9 AM local business time with its cutoff disclosed.", "Use exact decimals or integer minor units with explicit currency scale.", "Exclude card details and minimize private customer data."],
    stages: ["Events and settlement files", "Immutable landing", "Normalized ledger", "Matching rules", "Exception queue", "Finance report"],
    broken: "Join by customer email/date, sum repeated webhooks and label every unmatched same-day payment as lost money.",
    task: "Model a payment of 1,000 minor units, fee of 30 and settlement of 970. Handle partial refunds, duplicate events, multi-payment settlement batches and a correction after month close.",
    choice: ["What should match a payment to its settlement?", "Provider transaction references and an explicit settlement membership relation.", "Many payments can belong to one settlement. Stable references preserve lineage without guessing from private fields.", "Email plus calendar date.", "A customer can pay multiple invoices on one day; this creates ambiguous or multiplied matches."],
    hints: ["Paid, invoiced, recognized and settled are distinct concepts.", "Aggregate fees/refunds at their own grain before combining.", "A settlement window is a policy input, not a reason to hide aged discrepancies."],
    answer: {
      overview: "Build an auditable ledger and deterministic exception workflow with Finance-approved definitions.",
      dataFlow: "Land source events/files, normalize lifecycle versions, deduplicate identities, aggregate settlement membership and match deposits at equivalent cutoffs.",
      storageModel: "Separate transaction facts, invoice allocations, settlement membership and exception history. Keep gross/refund/fee/net, currency, business dates and source references.",
      processing: "For one currency, 1,000 gross minus 30 fee equals 970 net before other adjustments. Compare provider net to bank deposits, with explicit pending windows. Never sum currencies without an agreed FX policy.",
      reliability: "Replay a webhook and verify totals are unchanged; add a partial refund and trace its adjustment. Reconcile provider controls and alert on aged unmatched amounts rather than only failed jobs.",
      tradeoffs: "Deterministic matching is explainable; ambiguous allocations require review. Accounting recognition and closed-period policy belong to Finance, not inferred payment timing.",
      interviewFraming: "Define the quantity and cutoff being reconciled, demonstrate the arithmetic, and explain the lifecycle of one exception."
    },
    followUps: ["One deposit covers multiple batches: how does matching change?", "How is a post-close chargeback represented?", "How do you handle currencies with different decimal scales?"]
  },
  {
    slug: "experiment-metrics-platform", title: "Design an A/B Experiment Metrics Pipeline", domain: "modeling", difficulty: "intermediate",
    context: "100 experiments serve 5 million daily users and 50 million events/day. Assignment is stable per experiment/user; exposure is logged separately. Conversions can arrive 48 hours late. Product needs hourly provisional metrics and finalized seven-day post-exposure conversion cohorts.",
    requirements: ["Define eligible cohort, numerator, denominator and attribution window.", "Keep assignment, exposure and conversion events at explicit grains.", "Version metrics so a changed definition does not silently rewrite published results."],
    constraints: ["Hourly refresh completes within 20 minutes.", "Repeated exposures or duplicate purchases cannot multiply converted users.", "Restrict identifiers and distinguish data quality from statistical inference."],
    stages: ["Assignments and events", "Validation", "Exposure cohort", "Conversion attribution", "Versioned aggregates", "Quality dashboard"],
    broken: "Join every exposure to every purchase by user, divide by all active users and finalize two days after exposure.",
    task: "Specify a seven-day binary conversion metric. Handle three exposures and two deliveries of one purchase. Explain finalization, pre-exposure conversions, missing exposure and metric-version replay.",
    choice: ["When can this seven-day cohort be finalized?", "After the outcome window plus its allowed arrival delay closes.", "A user needs the full conversion opportunity before lateness allowance is applied; disclose any later correction policy.", "48 hours after exposure.", "That prematurely ends the seven-day opportunity and biases recent cohorts toward lower conversion."],
    hints: ["Assignment is not proof of exposure.", "Deduplicate conversions before joining a unique experiment/unit cohort.", "Exposed-unit analysis and intention-to-treat analysis have different denominators."],
    answer: {
      overview: "Publish reproducible cohort metrics while leaving causal interpretation and statistical decisions to the analysis methodology.",
      dataFlow: "Validate assignments, deduplicate events, build first eligible exposure, attribute conversions within the policy window and publish versioned cohort results.",
      storageModel: "Exposure key experiment/unit; events keyed by event_id; metrics keyed by experiment, variant, cohort date and definition version with recorded eligibility rules.",
      processing: "For binary conversion count an eligible unit once, not one row per exposure/purchase. Recompute open cohorts hourly and finalize after the seven-day window plus 48-hour arrival allowance.",
      reliability: "Test duplicate exposures, pre-exposure purchases and boundary timestamps. Compare assignment and cohort counts; monitor missing exposure, variant switches and imbalance without declaring a treatment effect from those signals.",
      tradeoffs: "Fresh provisional cohorts are incomplete. Choosing assigned versus exposed populations changes the question and requires explicit analysis approval.",
      interviewFraming: "Define the unit and denominator before architecture, then explain the many-to-many join failure and late-cohort policy."
    },
    followUps: ["Anonymous device exposure later maps to a user. Should history change?", "Can overlapping experiments share conversions?", "The treatment SDK drops exposures: what should consumers be told?"]
  },
  {
    slug: "point-in-time-training-data", title: "Design Point-in-Time Correct ML Training Data", domain: "lakehouse", difficulty: "advanced",
    context: "A churn model trains weekly on 20 million customer-day observations. Predictions happen at midnight UTC, features look back 90 days, and labels cover the following 30 days. Activity may arrive three days late and feature definitions change monthly. Scope is offline training data, not online feature serving.",
    requirements: ["Use information available at each historical prediction time.", "Attach labels only when their future outcome window is observable.", "Reproduce datasets from source snapshots, code and split manifests."],
    constraints: ["Weekly build completes within four hours on an existing batch platform.", "Prevent temporal leakage and overlapping outcome windows across evaluation splits.", "Minimize identifiers and respect source retention/deletion policies."],
    stages: ["Versioned source history", "Temporal features", "Observation-time joins", "Mature labels", "Time splits", "Dataset manifest"],
    broken: "Join historical observations to today's customer totals, treat immature labels as negative and randomly split overlapping customer-day outcomes.",
    task: "Define event_time, available_at and prediction_time. Explain why an earlier event arriving after prediction must be excluded from faithful replay. Specify label maturity, split boundaries and one leakage test.",
    choice: ["Which source rows are eligible for historical features?", "Rows satisfying both occurrence and availability cutoffs.", "An old event timestamp alone does not mean the production model could access the record when predicting.", "Every event dated before prediction, even if backfilled later.", "This leaks information unavailable at decision time and can inflate offline performance."],
    hints: ["Availability time is different from occurrence time.", "Feature lookback and future label horizon point in opposite directions.", "Adjacent observations may share future outcomes across train/test boundaries."],
    answer: {
      overview: "Build versioned temporal joins and mature labels with an explicit production-faithful replay contract.",
      dataFlow: "Freeze source snapshots, compute historical features at observation cutoffs, attach mature labels, apply approved time/entity split rules and publish immutable manifests.",
      storageModel: "Observation key customer/prediction_time; events with available_at; feature version; label interval; manifest with snapshots, code version and split cutoffs.",
      processing: "Filter occurrence and availability before the 90-day aggregation. Require a complete 30-day label window plus label-source delay. Purge overlapping outcome windows near split boundaries where applicable.",
      reliability: "Inject a late backfill and assert it cannot change an earlier as-known feature. Rebuild the same manifest and compare hashes/counts; test boundary timestamps and immature labels. Compare sampled production feature semantics.",
      tradeoffs: "Availability history costs storage; without it faithful historical replay cannot be claimed. Corrected-history research datasets are valid but must be labelled as a different contract.",
      interviewFraming: "Walk through a midnight prediction, list information actually available, and prove future events cannot enter features."
    },
    followUps: ["What guarantee is impossible if arrival time was never recorded?", "How do deletion requirements affect reproducible snapshots?", "What checks are added when features move online?"]
  },
  {
    slug: "fleet-telemetry-platform", title: "Design a Fleet Telemetry Analytics Platform", domain: "streaming", difficulty: "advanced",
    context: "100,000 vehicles emit a 500-byte reading every ten seconds and buffer 24 hours offline. Reconnect bursts reach five times normal traffic; clocks can drift. Operations wants temperature alerts within 30 seconds for connected devices plus hourly historical summaries. This is monitoring, not safety-critical vehicle control.",
    requirements: ["Separate fresh alerting from old buffered uploads.", "Deduplicate by device/boot/sequence and preserve event/receive times.", "Support recent per-vehicle queries and hourly fleet aggregates."],
    constraints: ["Plan for 10,000 normal events/second and fivefold bursts.", "Keep raw readings 30 days and downsampled aggregates one year.", "Authenticate producers, restrict location access and bound serving cardinality."],
    stages: ["Authenticated gateway", "Durable buffer", "Identity/time validation", "Fresh alerts", "Historical aggregation", "Tiered storage"],
    broken: "Index every arbitrary sensor field and fire live alerts from a day's buffered readings using receive time as event time.",
    task: "Estimate daily payload before replicas/indexes, choose keys/storage and explain stale uploads, clock skew, device reboot and a one-hour consumer outage. State how fresh traffic is protected during reconnect.",
    choice: ["What should a 12-hour-old high-temperature reading trigger?", "Historical recording and an explicit age-aware investigation policy.", "Old observations must not be represented as current conditions; their history may still need review.", "The same unlabelled live alert as a fresh reading.", "Reconnecting devices then produce misleading alert storms and hide genuinely current issues."],
    hints: ["Divide devices by reporting interval, then multiply bytes by seconds/day.", "Boot identity prevents reused sequence numbers after restart.", "High-cardinality indexed labels can dominate storage cost."],
    answer: {
      overview: "Decouple authenticated ingestion from two freshness-aware consumers and serve data from query-appropriate tiers.",
      dataFlow: "Buffer accepted readings, validate time/identity, route fresh measurements to alert evaluation and persist accepted history for event-time aggregates and replay.",
      storageModel: "Coarse date/hour raw partitions, recent time-series serving keyed by vehicle, compact fleet aggregates and an alert identity record. Avoid one raw directory per device.",
      processing: "Normal payload is 5 MB/second or 432 GB/day decimal before overhead; burst payload is 25 MB/second. Provision catch-up headroom, bound late updates and flag unreasonable clocks rather than silently shifting timestamps.",
      reliability: "Replay an offline batch twice and verify stable totals and no duplicate live alerts. Test boot resets, time drift and queue recovery; monitor device silence, rejected readings and oldest queued event.",
      tradeoffs: "Downsampling cuts cost but removes diagnostic detail. Separate ingestion quotas/backfill lanes can protect fresh alerts; storage selection depends on measured query patterns.",
      interviewFraming: "Do the capacity arithmetic and freshness contract first, then trace an offline device reconnect through both paths."
    },
    followUps: ["All devices reconnect simultaneously: which traffic gets priority?", "Where should arbitrary historical filters run?", "What becomes provisional when device timestamps are wrong?"]
  },
  {
    slug: "multi-tenant-analytics-isolation", title: "Design Secure Multi-Tenant Customer Analytics", domain: "platform", difficulty: "advanced",
    context: "A SaaS platform has 2,000 tenants, 2 TB/day and 300 concurrent dashboard requests. Three tenants generate half the load. Customers need 15-minute freshness and strict data separation. A small team already operates a warehouse.",
    requirements: ["Propagate verified tenant identity through ingestion, models, serving and exports.", "Support scoped dashboards, roles, deletion and audited support access.", "Expose tenant-level cost/freshness without unnecessary customer record access."],
    constraints: ["Enforce authorization server-side and in the data-access layer.", "Target p95 under three seconds for bounded dashboard queries.", "Contain noisy neighbors with concurrency/scan limits and protect caches."],
    stages: ["Tenant-authenticated input", "Validated tenant keys", "Warehouse policies", "Serving aggregates", "Authorized API", "Audit/quotas"],
    broken: "Trust tenant_id from the browser, accept arbitrary SQL and cache results by dashboard name alone.",
    task: "Trace identity through queries, cache hits and asynchronous exports. Explain tenant tampering, revoked access before export delivery and a large tenant exhausting shared compute. Compare shared versus dedicated isolation.",
    choice: ["Where does trusted tenant scope come from?", "Verified membership checked by the server and reinforced by data policies.", "A requested tenant must be authorized; user-controlled filters cannot establish identity or permissions.", "The tenant_id parameter supplied by the browser.", "Changing a request parameter would expose another tenant unless the server independently checks membership."],
    hints: ["Background tasks and cached results need the same isolation as interactive queries.", "Physical separation trades operational cost for a stronger boundary.", "Bound queries and concurrency before simply adding compute."],
    answer: {
      overview: "Use layered tenant enforcement and bounded serving workloads, with dedicated resources where risk/load justifies them.",
      dataFlow: "Validate ownership on ingest, preserve tenant keys in transforms, authorize requests against verified membership and execute constrained query templates under enforced policies.",
      storageModel: "Shared tables with enforced tenant policies for small customers; dedicated schemas/compute for exceptional tenants. Cache keys include tenant, permission scope, parameters and data version.",
      processing: "Refresh common aggregates every 15 minutes, parameterize queries and apply per-tenant budgets. Recheck permission before delivering queued exports and issue scoped expiring download access.",
      reliability: "Test cross-tenant parameter tampering, cache reuse and export delivery after revocation. Load-test a heavy tenant alongside small ones; monitor denied access, per-tenant p95, lag and scan cost.",
      tradeoffs: "Shared resources need rigorous policy tests; dedicated resources increase operations/cost. Neither removes the need for server-side authorization and safe export handling.",
      interviewFraming: "Trace one identity across every response boundary, including cached and background paths, then justify the isolation/cost choice."
    },
    followUps: ["How is temporary support access approved and audited?", "How do you migrate one tenant to dedicated compute?", "What does deletion cover in backups and exported files?"]
  },
  {
    slug: "schema-contract-evolution", title: "Design Safe Schema Evolution Across Data Producers", domain: "platform", difficulty: "intermediate",
    context: "30 services publish 200 event types and 1 TB/day with independent deployments. Consumers expect integer minor-unit amounts; one producer proposes decimal major units. Critical reports have a two-hour freshness target and five event types cannot be silently omitted.",
    requirements: ["Version structural and semantic contracts with owners and dependencies.", "Support additive and breaking changes through a migration window.", "Quarantine invalid input with repair/replay ownership and visible completeness."],
    constraints: ["Check compatibility before producer release where possible.", "Bound quarantine growth and restrict sensitive invalid payloads.", "Critical missing data must block certification or mark reports incomplete."],
    stages: ["Producer contract CI", "Versioned envelope", "Validation", "Accepted/quarantine storage", "Version adapters", "Certified models"],
    broken: "Infer each batch's schema, cast unknown amounts to numbers, drop parse errors and publish green reports from remaining rows.",
    task: "Migrate amount_minor to amount_major without a 100x revenue error. Explain two consumer versions, unknown schemas, rollback, idempotent quarantine replay and who owns completeness decisions.",
    choice: ["Does an unchanged parseable type prove compatibility?", "No: units, enums and business meaning are contract terms too.", "A producer can keep a numeric type while changing units; semantic fixtures must catch the resulting incorrect totals.", "Yes: successful parsing means consumers can safely continue.", "A structurally valid event can still change business meaning and silently corrupt certified metrics."],
    hints: ["Unknown versions differ from optional unknown fields.", "Quarantine needs an owner and recovery deadline, not just storage.", "Dual publication must preserve event identity to avoid two business events."],
    answer: {
      overview: "Treat contracts as producer-consumer agreements with semantic tests, explicit versions and accountable migration.",
      dataFlow: "CI checks known consumer compatibility, ingress validates versioned envelopes, adapters normalize accepted versions and protected quarantine stores rejected payload references/reasons.",
      storageModel: "Event identity, producer, schema_version, event time and raw lineage; registry with units/owners/lifecycle; quarantine resolution and replay manifests.",
      processing: "Normalize old minor-unit/new major-unit values to exact canonical amounts using currency scale. Dual-read or dual-publish during a bounded coexistence period and deduplicate shared identities.",
      reliability: "Test missing required fields, unknown enums, additive fields and a 100x unit mismatch. Compare normalized controls, replay repaired events once and keep reports incomplete until coverage is reconciled.",
      tradeoffs: "Strict rejection protects meaning but hurts freshness. Tolerant handling is safe only for explicitly compatible changes; critical sources require stronger publication gates.",
      interviewFraming: "Explain how a parser can succeed while money is wrong, then demonstrate a reversible producer/consumer migration."
    },
    followUps: ["An external producer cannot run your CI: where do checks move?", "How do old events replay after a field becomes required?", "Quarantine outgrows the resolution team: what gets prioritized?"]
  },
  {
    slug: "warehouse-migration-cutover", title: "Design a Warehouse Migration with a Safe Cutover", domain: "reliability", difficulty: "advanced",
    context: "Migrate 50 TB, 300 models and 80 dashboards while 200 GB/day of changes continue. Budget allows four weeks of dual-running and a 30-minute final catch-up pause. Certified reporting must stay available; keep a usable old path for seven days after cutover.",
    requirements: ["Inventory dependencies and join snapshot/change capture at a known boundary.", "Validate data meaning, permissions and performance before switching consumers.", "Rollback without losing post-cutover changes."],
    constraints: ["Benchmark effective throughput and fit the four-week overlap budget.", "Reconcile financial totals exactly under agreed decimal/currency policies.", "Maintain access controls and retention across both systems."],
    stages: ["Dependency inventory", "Consistent snapshot", "Incremental catch-up", "Dual validation", "Consumer cutover", "Rollback window"],
    broken: "Copy tables, compare total row counts, switch every dashboard and delete the old warehouse immediately.",
    task: "Define cutoffs, acceptance gates and rollback ownership. Explain matching counts with wrong timezone revenue, a failed high-traffic dashboard and ongoing source writes. Estimate transfer time at measured 100 MB/second.",
    choice: ["When is rollback actually available?", "When the old path can serve a reconciled current boundary and routing can reverse.", "Retaining storage alone is insufficient; keep old ingestion current or replay its missing interval before serving it.", "Whenever the old database still exists.", "It may be stale, inaccessible or incompatible with new consumers, so its existence is not a recovery guarantee."],
    hints: ["Snapshot and CDC must meet without a gap or unhandled overlap.", "Test decimal, timestamp, NULL and collation semantics.", "A stable consumer-facing routing boundary makes cutover reversible."],
    answer: {
      overview: "Migrate in dependency-aware waves with matched-cutoff reconciliation and a rehearsed fallback.",
      dataFlow: "Inventory consumers, export a consistent snapshot, apply subsequent changes, rebuild models, shadow outputs and switch bounded consumer groups after gates pass.",
      storageModel: "Manifest snapshot position, applied watermark, model version and reconciliation results. Map permissions and source ownership explicitly; retain rollback snapshots and delta history.",
      processing: "50 TB decimal at effective 100 MB/second takes about 5.8 days before extra transformation overhead. Sustained throughput must exceed incoming changes to converge. Synchronize a final boundary inside the allowed pause.",
      reliability: "Test key uniqueness, partition counts, exact financial totals, record samples and query performance at matched cutoffs. Inject a timezone mismatch and failed dashboard; rehearse routing rollback with a current old path.",
      tradeoffs: "Dual-running costs money but buys comparability and reversibility. Phased migration limits blast radius where dependencies permit; irreversible downstream exports constrain rollback.",
      interviewFraming: "Define evidence for go/no-go before tools and show a mismatch row counts alone would never detect."
    },
    followUps: ["Only three dual-run budget days remain and catch-up lags: what changes?", "New decimal rounding differs: what is an acceptable comparison?", "How does an irreversible downstream export constrain cutover?"]
  }
];

export const INTERVIEW_SYSTEM_DESIGN_CASES: SystemDesignCase[] = briefs.map((b, index) => {
  const [question, good, whyGood, bad, whyBad] = b.choice;
  const options = [
    { id: "bounded", label: good, feedback: whyGood, isBest: true },
    { id: "shortcut", label: bad, feedback: whyBad, isBest: false }
  ];
  return {
    id: `system-design-${String(index + 11).padStart(3, "0")}`, slug: b.slug, title: b.title,
    difficulty: b.difficulty, domain: b.domain, isFree: false, estimatedMinutes: b.difficulty === "advanced" ? 50 : 40,
    tags: [b.domain, "Interview practice", "Failure recovery"], shortDescription: b.task,
    businessContext: `Exercise assumptions (fictional workload): ${b.context}`,
    functionalRequirements: b.requirements, nonFunctionalRequirements: b.constraints,
    architectureStages: b.stages, badArchitecture: b.broken, learnerTask: b.task,
    decisions: [{ id: "design-boundary", question, options: index % 2 ? options.reverse() : options }],
    hints: b.hints, modelAnswer: b.answer, followUps: b.followUps,
    evaluationKeywords: [b.domain, "requirements", "identity", "replay", "verification", "tradeoffs"],
    // Legacy response compatibility only. UI does not present a numerical grade.
    rubric: { requirements: 20, architecture: 25, tradeoffs: 20, reliability: 25, communication: 10 }
  };
});
