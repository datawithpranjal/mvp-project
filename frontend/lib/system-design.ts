export type SystemDesignDifficulty = "beginner" | "intermediate" | "advanced";
export type SystemDesignDomain =
  | "batch"
  | "streaming"
  | "lakehouse"
  | "modeling"
  | "reliability"
  | "platform";

export interface SystemDesignDecisionOption {
  id: string;
  label: string;
  isBest: boolean;
  feedback: string;
}

export interface SystemDesignDecision {
  id: string;
  question: string;
  options: SystemDesignDecisionOption[];
}

export interface SystemDesignRubric {
  requirements: number;
  architecture: number;
  tradeoffs: number;
  reliability: number;
  communication: number;
}

export interface SystemDesignCase {
  id: string;
  slug: string;
  title: string;
  difficulty: SystemDesignDifficulty;
  domain: SystemDesignDomain;
  isFree: boolean;
  estimatedMinutes: number;
  tags: string[];
  shortDescription: string;
  businessContext: string;
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  architectureStages: string[];
  badArchitecture: string;
  learnerTask: string;
  decisions: SystemDesignDecision[];
  hints: string[];
  modelAnswer: {
    overview: string;
    dataFlow: string;
    storageModel: string;
    processing: string;
    reliability: string;
    tradeoffs: string;
    interviewFraming: string;
  };
  evaluationKeywords: string[];
  rubric: SystemDesignRubric;
  followUps: string[];
}

export interface SystemDesignProgress {
  completed?: boolean;
  completedAt?: string;
  score?: number;
  draft?: string;
  selectedOptions?: Record<string, string>;
  lastPracticedAt?: string;
}

export interface SystemDesignEvaluation {
  score: number;
  verdict: "weak" | "partial" | "good" | "strong";
  strengths: string[];
  gaps: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  rubricBreakdown: SystemDesignRubric;
}

export const SYSTEM_DESIGN_CASES: SystemDesignCase[] = [
  {
    id: "system-design-001",
    slug: "ecommerce-orders-data-platform",
    title: "Design an E-commerce Orders Data Platform",
    difficulty: "beginner",
    domain: "batch",
    isFree: true,
    estimatedMinutes: 35,
    tags: ["Batch", "Warehouse", "Revenue Mart", "Monitoring"],
    shortDescription:
      "Design a daily orders pipeline from source API to warehouse revenue dashboard.",
    businessContext:
      "A growing e-commerce company wants reliable order, payment, and refund reporting. Finance needs daily revenue by 8 AM, operations needs order status visibility, and analysts need two years of history.",
    functionalRequirements: [
      "Ingest orders, payments, refunds, and customers from source systems.",
      "Build a certified daily revenue mart for Finance.",
      "Support backfills for corrected payment and refund records.",
      "Expose tables for BI dashboards and analyst SQL."
    ],
    nonFunctionalRequirements: [
      "Daily dashboard ready by 8 AM local time.",
      "Revenue should reconcile with payment provider totals.",
      "Pipeline should be idempotent for retries and reruns.",
      "Keep raw history for audit and reprocessing."
    ],
    architectureStages: [
      "Source APIs",
      "Raw/Bronze S3",
      "PySpark Silver",
      "Data Quality",
      "Gold Revenue Mart",
      "Warehouse",
      "BI + Alerts"
    ],
    badArchitecture:
      "A single Python cron job pulls only today's orders, overwrites one CSV, and the dashboard reads that CSV directly. No raw history, no reconciliation, no retry safety.",
    learnerTask:
      "Design a production-ready batch architecture and explain how you would handle retries, corrections, and revenue reconciliation.",
    decisions: [
      {
        id: "ingestion",
        question: "What should be the first durable landing zone?",
        options: [
          {
            id: "bronze",
            label: "Write immutable raw API responses to Bronze storage before transforming.",
            isBest: true,
            feedback:
              "Correct. Raw history gives replay, audit, and debugging safety when business logic changes."
          },
          {
            id: "dashboard",
            label: "Write API results directly into the BI dashboard table.",
            isBest: false,
            feedback:
              "Risky. You lose replayability and mix ingestion concerns with business reporting logic."
          },
          {
            id: "notebook",
            label: "Let analysts refresh a notebook manually every morning.",
            isBest: false,
            feedback:
              "This is not production design. Manual refreshes create hidden ownership and SLA risk."
          }
        ]
      },
      {
        id: "write_mode",
        question: "How should daily Gold partitions be updated?",
        options: [
          {
            id: "append",
            label: "Always append the latest daily result.",
            isBest: false,
            feedback:
              "Append can duplicate revenue after retries unless the table format has a safe merge key."
          },
          {
            id: "overwrite_window",
            label: "Overwrite or merge only affected business-date partitions.",
            isBest: true,
            feedback:
              "Correct. This keeps reruns idempotent while avoiding full-table rewrites."
          },
          {
            id: "delete_all",
            label: "Delete and rebuild the entire warehouse every run.",
            isBest: false,
            feedback:
              "Simple but expensive and risky as data grows. Use targeted partition repair instead."
          }
        ]
      }
    ],
    hints: [
      "Separate raw ingestion, cleaned data, and business marts.",
      "Finance reporting needs reconciliation, not only transformation.",
      "Retries should produce the same final table as the first successful run."
    ],
    modelAnswer: {
      overview:
        "Use a layered batch platform: source APIs land immutable raw files, Spark transforms to clean silver tables, data quality gates validate totals, and a gold revenue mart feeds BI.",
      dataFlow:
        "API extracts write raw JSON/Parquet by ingestion date. Silver jobs standardize order/payment/refund records. Gold jobs aggregate by business order_date and publish certified revenue tables.",
      storageModel:
        "Keep Bronze immutable, Silver normalized by entity, and Gold modeled as fact_orders, fact_payments, fact_refunds, and daily_revenue_mart. Partition large facts by business date.",
      processing:
        "Use orchestrated batch jobs with idempotent writes. For late refunds or corrections, identify affected business dates and overwrite or merge only those partitions.",
      reliability:
        "Add row-count, duplicate-key, accepted-status, and payment-provider reconciliation checks. Alert on freshness misses and revenue variance beyond threshold.",
      tradeoffs:
        "Batch is simpler and sufficient for daily Finance SLA. Streaming can be added later for operations freshness, but certified finance numbers should remain controlled and reconciled.",
      interviewFraming:
        "I would start with requirements and SLA, design layered storage for replayability, make writes idempotent, then add reconciliation and monitoring so the dashboard is trusted."
    },
    evaluationKeywords: [
      "bronze",
      "silver",
      "gold",
      "idempotent",
      "reconciliation",
      "partition",
      "backfill",
      "monitoring"
    ],
    rubric: { requirements: 20, architecture: 30, tradeoffs: 15, reliability: 25, communication: 10 },
    followUps: [
      "How would the design change if Finance wanted revenue every 15 minutes?",
      "How would you handle refunds arriving after the month is closed?"
    ]
  },
  {
    id: "system-design-002",
    slug: "clickstream-analytics-platform",
    title: "Design a Clickstream Analytics Platform",
    difficulty: "intermediate",
    domain: "streaming",
    isFree: true,
    estimatedMinutes: 40,
    tags: ["Kafka", "Streaming", "Events", "Sessionization"],
    shortDescription:
      "Design event ingestion and analytics for web/app clickstream with late events.",
    businessContext:
      "Product wants near-real-time funnels, marketing attribution, and daily active users across web and mobile events.",
    functionalRequirements: [
      "Ingest page_view, add_to_cart, purchase, and app_open events.",
      "Support event-level replay and downstream feature creation.",
      "Build daily and hourly product analytics aggregates.",
      "Handle duplicate events and late mobile events."
    ],
    nonFunctionalRequirements: [
      "Events visible in analytics within 5 minutes.",
      "No silent drops for malformed payloads.",
      "Scale to seasonal traffic spikes.",
      "Protect PII and keep schema evolution controlled."
    ],
    architectureStages: [
      "SDK Events",
      "Kafka",
      "Schema Registry",
      "Raw Event Lake",
      "Streaming Silver",
      "Feature/Aggregate Tables",
      "Product Dashboards"
    ],
    badArchitecture:
      "The frontend calls a database insert endpoint directly. Events have no schema version, no durable log, and malformed payloads fail the whole endpoint.",
    learnerTask:
      "Design a clickstream platform that supports real-time analytics, replay, late data, and schema evolution.",
    decisions: [
      {
        id: "buffer",
        question: "Why use Kafka or a durable event log?",
        options: [
          {
            id: "decouple",
            label: "To decouple producers/consumers and support replay.",
            isBest: true,
            feedback:
              "Correct. Durable logs absorb spikes, decouple systems, and let consumers replay."
          },
          {
            id: "cheaper_sql",
            label: "Because SQL queries are cheaper on Kafka than S3.",
            isBest: false,
            feedback:
              "Kafka is not a general analytical store. It is a streaming log and buffer."
          },
          {
            id: "no_schema",
            label: "Because Kafka removes the need for event schemas.",
            isBest: false,
            feedback:
              "Kafka does not replace schema contracts. Schema registry is still important."
          }
        ]
      },
      {
        id: "time",
        question: "Which time should drive funnel reporting?",
        options: [
          {
            id: "ingest",
            label: "ingestion_time only, because it is when the pipeline saw the event.",
            isBest: false,
            feedback:
              "Ingestion time is useful for operations, but funnels should use event_time."
          },
          {
            id: "event_time",
            label: "event_time with watermarking and late-event handling.",
            isBest: true,
            feedback:
              "Correct. Product behavior happened at event_time; watermarking manages lateness."
          },
          {
            id: "load_date",
            label: "load_date from the warehouse partition.",
            isBest: false,
            feedback:
              "Load date is a storage/ops concept, not the user's action time."
          }
        ]
      }
    ],
    hints: [
      "Clickstream systems need schema contracts because apps change often.",
      "Separate event_time analytics from ingestion_time operations.",
      "Bad events should go to a dead-letter/quarantine path, not disappear."
    ],
    modelAnswer: {
      overview:
        "Use SDK producers writing to Kafka topics with schema validation, persist raw events to the lake, process streaming silver tables, and publish aggregates for product dashboards.",
      dataFlow:
        "Web/mobile SDKs emit versioned events to Kafka. A raw sink writes events unchanged to object storage. Streaming jobs validate, deduplicate, and standardize events before building hourly aggregates.",
      storageModel:
        "Raw events are partitioned by ingestion date for replay. Clean events are partitioned by event_date and include event_id, event_time, user_id, session_id, event_name, and schema_version.",
      processing:
        "Use event-time windows, watermarks, deduplication by event_id, and sessionization logic. Keep late events visible through correction tables or replay jobs.",
      reliability:
        "Monitor Kafka lag, event counts by type/version, schema failures, duplicate rate, late-event rate, and dashboard freshness.",
      tradeoffs:
        "Streaming gives low latency but increases operational complexity. For some metrics, near-real-time estimates and daily certified aggregates can coexist.",
      interviewFraming:
        "I would defend the design by explaining the event log, schema control, replay path, and the difference between fast operational metrics and certified analytics."
    },
    evaluationKeywords: [
      "kafka",
      "schema",
      "event_time",
      "watermark",
      "deduplication",
      "dead-letter",
      "replay",
      "lag"
    ],
    rubric: { requirements: 20, architecture: 30, tradeoffs: 20, reliability: 20, communication: 10 },
    followUps: [
      "How would you support GDPR deletion requests?",
      "How would you prevent one bad mobile app release from corrupting analytics?"
    ]
  },
  {
    id: "system-design-003",
    slug: "postgres-cdc-to-warehouse",
    title: "Design Postgres CDC to Warehouse",
    difficulty: "intermediate",
    domain: "reliability",
    isFree: true,
    estimatedMinutes: 38,
    tags: ["CDC", "Warehouse", "Deletes", "Ordering"],
    shortDescription:
      "Design a CDC pipeline that captures inserts, updates, deletes, and ordering safely.",
    businessContext:
      "A SaaS company wants analytics tables updated from production Postgres without running heavy full extracts every hour.",
    functionalRequirements: [
      "Capture inserts, updates, and deletes from orders and customers.",
      "Build current-state warehouse tables and history where needed.",
      "Support replay after connector failure.",
      "Avoid heavy load on production Postgres."
    ],
    nonFunctionalRequirements: [
      "Data freshness under 15 minutes.",
      "Correct ordering by commit sequence.",
      "Deletes must not be silently ignored.",
      "Recovery should not create duplicate current rows."
    ],
    architectureStages: [
      "Postgres WAL",
      "CDC Connector",
      "Kafka/Raw Log",
      "Bronze CDC Events",
      "Silver Current State",
      "Gold Marts",
      "Reconciliation"
    ],
    badArchitecture:
      "An hourly job selects rows where updated_at > last_max_updated_at. It misses deletes, same-timestamp updates, and changes from tables without updated_at.",
    learnerTask:
      "Design a CDC pipeline and explain how current-state tables should handle update ordering and deletes.",
    decisions: [
      {
        id: "delete",
        question: "How should DELETE events be modeled?",
        options: [
          {
            id: "ignore",
            label: "Ignore deletes because analytics usually wants history.",
            isBest: false,
            feedback:
              "Ignoring deletes creates wrong current-state tables and hides business semantics."
          },
          {
            id: "tombstone",
            label: "Preserve tombstone/delete events and apply them to current state.",
            isBest: true,
            feedback:
              "Correct. The warehouse can choose soft delete or exclusion, but the delete signal must be captured."
          },
          {
            id: "truncate",
            label: "Truncate and reload the table whenever a delete happens.",
            isBest: false,
            feedback:
              "This is operationally expensive and not realistic for frequent changes."
          }
        ]
      },
      {
        id: "ordering",
        question: "What should decide the latest record?",
        options: [
          {
            id: "sequence",
            label: "Commit LSN/sequence plus operation timestamp.",
            isBest: true,
            feedback:
              "Correct. CDC ordering should follow source commit order, not only wall-clock timestamps."
          },
          {
            id: "amount",
            label: "The highest order amount.",
            isBest: false,
            feedback:
              "Business values do not define record recency."
          },
          {
            id: "arrival",
            label: "Warehouse file arrival order only.",
            isBest: false,
            feedback:
              "Arrival order can change during retries and replays."
          }
        ]
      }
    ],
    hints: [
      "CDC is about change events, not only changed rows.",
      "Deletes and ordering are the interview traps.",
      "Reconciliation should compare source counts/checksums where safe."
    ],
    modelAnswer: {
      overview:
        "Use WAL-based CDC into a durable log, store all raw change events, then materialize current-state and history tables with sequence-aware merge logic.",
      dataFlow:
        "Debezium or a managed CDC connector reads Postgres WAL, publishes events to topics, raw sinks persist them, and Spark/dbt jobs apply changes into warehouse tables.",
      storageModel:
        "Bronze stores immutable CDC events with op, key, before/after, source timestamp, and LSN. Silver current tables keep one latest row per key plus is_deleted if soft-delete semantics are needed.",
      processing:
        "Deduplicate by event id/LSN, order by source sequence, apply inserts/updates/deletes, and make replay idempotent.",
      reliability:
        "Monitor connector lag, schema changes, delete volume, duplicate event rate, and current-state row counts versus source snapshots.",
      tradeoffs:
        "CDC reduces source load and improves freshness but adds connector operations, schema evolution handling, and careful delete semantics.",
      interviewFraming:
        "I would emphasize that CDC is not just incremental updated_at. The design must preserve operation type, ordering, replay, and reconciliation."
    },
    evaluationKeywords: [
      "cdc",
      "wal",
      "delete",
      "tombstone",
      "lsn",
      "sequence",
      "idempotent",
      "reconciliation"
    ],
    rubric: { requirements: 20, architecture: 30, tradeoffs: 15, reliability: 25, communication: 10 },
    followUps: [
      "How would you handle a schema change adding a new nullable column?",
      "How would you recover after the connector was down for six hours?"
    ]
  },
  {
    id: "system-design-004",
    slug: "lakehouse-product-analytics",
    title: "Design a Lakehouse for Product Analytics",
    difficulty: "intermediate",
    domain: "lakehouse",
    isFree: true,
    estimatedMinutes: 36,
    tags: ["Lakehouse", "S3", "Delta/Iceberg", "Compaction"],
    shortDescription:
      "Design bronze/silver/gold storage and table layout for scalable analytics.",
    businessContext:
      "A product team stores raw events in S3 but queries are slow, schema changes are painful, and analysts do not know which tables are trusted.",
    functionalRequirements: [
      "Store raw events and curated analytics tables.",
      "Support replay and backfills.",
      "Expose trusted product metrics to BI.",
      "Handle schema changes without breaking every query."
    ],
    nonFunctionalRequirements: [
      "Queries for yesterday should finish quickly.",
      "Avoid small-files and high-cardinality partition problems.",
      "Keep clear ownership of certified tables.",
      "Support time travel or table versioning if possible."
    ],
    architectureStages: [
      "Raw Events",
      "Bronze Tables",
      "Silver Standardization",
      "Gold Metrics",
      "Catalog",
      "BI/Ad-hoc SQL",
      "Optimization"
    ],
    badArchitecture:
      "All teams write random CSV files into S3 folders. Some folders are partitioned by user_id, some by date, and no one knows which data is certified.",
    learnerTask:
      "Design a lakehouse layout that is queryable, governed, and maintainable as event volume grows.",
    decisions: [
      {
        id: "format",
        question: "Which table format choice is strongest for curated lakehouse tables?",
        options: [
          {
            id: "csv",
            label: "CSV files because everyone can open them.",
            isBest: false,
            feedback:
              "CSV is poor for typed analytics and table operations at scale."
          },
          {
            id: "open_table",
            label: "Parquet with Delta/Iceberg/Hudi table metadata.",
            isBest: true,
            feedback:
              "Correct. Open table formats add schema evolution, ACID-like operations, and metadata management."
          },
          {
            id: "json_all",
            label: "Nested JSON only, queried directly by BI.",
            isBest: false,
            feedback:
              "Raw JSON is useful for Bronze, but curated analytics needs typed, optimized tables."
          }
        ]
      },
      {
        id: "partition",
        question: "What is a safer first partition strategy for event tables?",
        options: [
          {
            id: "event_date",
            label: "event_date, with compaction and clustering as needed.",
            isBest: true,
            feedback:
              "Correct. Date partitions align with common pruning and keep folder counts manageable."
          },
          {
            id: "user_id",
            label: "user_id because analysts filter by users.",
            isBest: false,
            feedback:
              "High-cardinality user partitions create huge metadata overhead."
          },
          {
            id: "none",
            label: "No partitions ever.",
            isBest: false,
            feedback:
              "No partitioning can be acceptable early, but large event tables need pruning strategy."
          }
        ]
      }
    ],
    hints: [
      "Separate raw durability from curated trust.",
      "Partition columns should be low/manageable cardinality and useful for pruning.",
      "Compaction and table optimization are part of the design."
    ],
    modelAnswer: {
      overview:
        "Use Bronze/Silver/Gold lakehouse layers with Parquet and an open table format for curated tables, plus a catalog that tells users which tables are certified.",
      dataFlow:
        "Raw events land in Bronze unchanged. Silver validates schema, standardizes event names, and deduplicates. Gold aggregates metrics such as DAU, funnel steps, and conversion.",
      storageModel:
        "Partition large event tables by event_date, not user_id. Use table metadata for schema evolution, optimize/compact small files, and optionally cluster by high-use keys.",
      processing:
        "Spark jobs convert raw events into typed tables, apply DQ checks, and publish gold metrics. Backfills read Bronze and rewrite affected partitions.",
      reliability:
        "Monitor file counts, average file size, schema drift, row counts by event type, and freshness of gold tables.",
      tradeoffs:
        "Lakehouse gives cheap storage and flexible processing, but requires governance, compaction, and clear certification. A warehouse may still be better for highly curated BI serving.",
      interviewFraming:
        "I would explain the layers, the reason for table format choice, partitioning trade-offs, and how I prevent the lake from becoming a messy data swamp."
    },
    evaluationKeywords: [
      "bronze",
      "silver",
      "gold",
      "parquet",
      "delta",
      "iceberg",
      "partition",
      "compaction"
    ],
    rubric: { requirements: 20, architecture: 30, tradeoffs: 20, reliability: 20, communication: 10 },
    followUps: [
      "How would you decide between Delta and Iceberg?",
      "What metric would tell you small files are becoming a problem?"
    ]
  },
  {
    id: "system-design-005",
    slug: "daily-revenue-mart",
    title: "Design a Certified Daily Revenue Mart",
    difficulty: "beginner",
    domain: "modeling",
    isFree: false,
    estimatedMinutes: 32,
    tags: ["Data Modeling", "Finance", "Star Schema"],
    shortDescription:
      "Design facts, dimensions, and checks for a finance-grade revenue table.",
    businessContext:
      "The CFO wants one trusted daily revenue number. Product dashboards and finance exports currently disagree.",
    functionalRequirements: [
      "Calculate gross revenue, refunds, discounts, tax, and net revenue.",
      "Support slicing by product, customer segment, country, and payment method.",
      "Preserve adjustments and restatements.",
      "Provide certified output for BI."
    ],
    nonFunctionalRequirements: [
      "Finance must understand the definition.",
      "Numbers must reconcile to payment provider settlement reports.",
      "Closed periods require controlled restatement.",
      "The mart must have one clear grain."
    ],
    architectureStages: [
      "Orders",
      "Payments",
      "Refunds",
      "Dimensions",
      "Fact Tables",
      "Daily Mart",
      "Finance Dashboard"
    ],
    badArchitecture:
      "A dashboard query joins orders, payments, refunds, and product tags directly. Multiple payments/refunds multiply rows and inflate revenue.",
    learnerTask:
      "Design the warehouse model and explain grain, reconciliation, and late adjustments.",
    decisions: [
      {
        id: "grain",
        question: "What should be defined first?",
        options: [
          {
            id: "grain",
            label: "The table grain and business metric definitions.",
            isBest: true,
            feedback:
              "Correct. Finance-grade marts start with grain and definitions."
          },
          {
            id: "chart",
            label: "The dashboard color palette.",
            isBest: false,
            feedback:
              "Presentation matters later. Metric trust comes from modeling."
          },
          {
            id: "join_all",
            label: "A single join of all raw tables.",
            isBest: false,
            feedback:
              "Joining all raw tables often creates row multiplication."
          }
        ]
      }
    ],
    hints: [
      "Revenue marts fail when grain is unclear.",
      "Payments and refunds often have one-to-many relationships with orders.",
      "Certified numbers need reconciliation and restatement policy."
    ],
    modelAnswer: {
      overview:
        "Model revenue using clear fact tables and conformed dimensions, then publish a daily mart at the agreed grain.",
      dataFlow:
        "Ingest orders, payments, refunds, and adjustments. Standardize them into separate facts, reconcile to provider totals, then aggregate into daily certified output.",
      storageModel:
        "Use fact_orders, fact_payments, fact_refunds, dim_customer, dim_product, dim_date, and a daily_revenue_mart keyed by revenue_date and chosen dimensions.",
      processing:
        "Aggregate each one-to-many source to the order/day grain before joining, then calculate gross, refunds, discounts, tax, and net revenue.",
      reliability:
        "Add tests for unique grain, accepted statuses, non-negative constraints where applicable, and reconciliation to settlement files.",
      tradeoffs:
        "A wide mart is easy for BI but less flexible. A star schema is more maintainable and reduces metric duplication.",
      interviewFraming:
        "I would lead with the grain, explain why I avoid raw many-to-many joins, and describe reconciliation as part of the pipeline, not an afterthought."
    },
    evaluationKeywords: ["grain", "fact", "dimension", "refund", "payment", "reconciliation", "star", "restatement"],
    rubric: { requirements: 25, architecture: 25, tradeoffs: 15, reliability: 25, communication: 10 },
    followUps: [
      "How would you model partial refunds?",
      "How would you handle a correction after Finance has closed the month?"
    ]
  },
  {
    id: "system-design-006",
    slug: "customer-360-platform",
    title: "Design a Customer 360 Platform",
    difficulty: "intermediate",
    domain: "modeling",
    isFree: false,
    estimatedMinutes: 38,
    tags: ["Customer 360", "Identity", "SCD", "Governance"],
    shortDescription:
      "Design a unified customer profile across orders, support, app, and marketing systems.",
    businessContext:
      "Marketing, support, and product teams each have a different customer identifier. Leadership wants one customer 360 view.",
    functionalRequirements: [
      "Unify customer identifiers from multiple systems.",
      "Expose current profile and historical attribute changes.",
      "Support segmentation and support analytics.",
      "Respect consent and PII access rules."
    ],
    nonFunctionalRequirements: [
      "Identity rules must be explainable.",
      "PII access should be governed.",
      "Profile updates should be traceable.",
      "Downstream teams should know confidence level."
    ],
    architectureStages: [
      "Source Systems",
      "Identity Mapping",
      "Profile Standardization",
      "SCD Dimension",
      "Feature Tables",
      "Access Control",
      "Activation"
    ],
    badArchitecture:
      "The team joins every table on email address only. Shared emails, changed emails, and null emails cause false merges and lost customers.",
    learnerTask:
      "Design customer identity resolution and profile history for analytics and activation use cases.",
    decisions: [
      {
        id: "identity",
        question: "How should identity matching be represented?",
        options: [
          {
            id: "mapping",
            label: "A governed identity map with source ids, match rules, and confidence.",
            isBest: true,
            feedback:
              "Correct. Identity needs rules and auditability, not only a convenient join key."
          },
          {
            id: "email",
            label: "Always join by email because users remember email.",
            isBest: false,
            feedback:
              "Email changes, can be shared, and may be missing. It is not enough alone."
          },
          {
            id: "random",
            label: "Assign a new random id every load.",
            isBest: false,
            feedback:
              "That prevents stable history and breaks downstream analytics."
          }
        ]
      }
    ],
    hints: [
      "Customer 360 is mostly an identity and governance problem.",
      "Profile attributes can change, so history matters.",
      "PII rules should be part of the architecture."
    ],
    modelAnswer: {
      overview:
        "Build an identity map that links source identifiers to a canonical customer id, then maintain current and historical customer profile tables.",
      dataFlow:
        "Sources land raw data. Matching rules create identity links. Profile jobs standardize attributes, apply survivorship rules, and publish current and SCD history tables.",
      storageModel:
        "Use customer_identity_map, dim_customer_current, dim_customer_history, and feature tables for segmentation. Store source lineage and confidence score.",
      processing:
        "Use deterministic rules first, then optional probabilistic matching with review. Apply SCD Type 2 for important profile changes.",
      reliability:
        "Monitor merge/split rates, null identifier spikes, duplicate canonical ids, PII access, and profile freshness.",
      tradeoffs:
        "More aggressive matching improves coverage but risks false merges. Conservative matching protects trust but can leave duplicates.",
      interviewFraming:
        "I would explain identity rules, survivorship, SCD history, privacy controls, and how I would monitor false merges."
    },
    evaluationKeywords: ["identity", "canonical", "mapping", "scd", "history", "pii", "confidence", "governance"],
    rubric: { requirements: 20, architecture: 30, tradeoffs: 20, reliability: 20, communication: 10 },
    followUps: [
      "How would you fix two customers incorrectly merged into one?",
      "How would you hide PII from analysts while preserving segmentation?"
    ]
  },
  {
    id: "system-design-007",
    slug: "data-quality-monitoring-system",
    title: "Design a Data Quality Monitoring System",
    difficulty: "intermediate",
    domain: "reliability",
    isFree: false,
    estimatedMinutes: 35,
    tags: ["Data Quality", "Observability", "Alerts"],
    shortDescription:
      "Design checks, alerting, ownership, and incident workflow for pipeline quality.",
    businessContext:
      "Dashboards keep breaking silently. Teams discover problems from business users instead of pipeline alerts.",
    functionalRequirements: [
      "Track freshness, volume, schema, nulls, duplicates, and business rules.",
      "Send alerts to owners with context.",
      "Keep quality history for trend analysis.",
      "Support severity levels and incident workflow."
    ],
    nonFunctionalRequirements: [
      "Avoid alert fatigue.",
      "Checks should run near the data they validate.",
      "Critical tables need stronger gates.",
      "Users should see quality status before trusting dashboards."
    ],
    architectureStages: [
      "Data Contracts",
      "Pipeline Checks",
      "Quality Metrics Store",
      "Alert Router",
      "Incident Workflow",
      "Dashboard Status",
      "Trend Analysis"
    ],
    badArchitecture:
      "Every job sends a Slack message on any row-count change. No owner, no severity, no baseline, and no dashboard-level quality status.",
    learnerTask:
      "Design a data quality monitoring system that catches real issues without spamming teams.",
    decisions: [
      {
        id: "alerts",
        question: "What makes alerts useful?",
        options: [
          {
            id: "owner_context",
            label: "Owner, severity, threshold, sample failures, and run context.",
            isBest: true,
            feedback:
              "Correct. Actionable alerts reduce time to diagnose."
          },
          {
            id: "all_slack",
            label: "Send every warning to a single company Slack channel.",
            isBest: false,
            feedback:
              "This creates alert fatigue and unclear ownership."
          },
          {
            id: "silent_logs",
            label: "Only write errors to logs and wait for users to report issues.",
            isBest: false,
            feedback:
              "Logs are not enough for business-critical data products."
          }
        ]
      }
    ],
    hints: [
      "Data quality is not just tests; it is ownership and response.",
      "Separate warning from blocking checks.",
      "Quality metrics should be queryable over time."
    ],
    modelAnswer: {
      overview:
        "Use table-level contracts and pipeline checks that publish quality metrics, route actionable alerts, and expose quality status to data consumers.",
      dataFlow:
        "Each pipeline runs checks after key stages. Results go to a quality metrics store. Alerting uses severity, ownership, and thresholds to notify the right team.",
      storageModel:
        "Store check_results with table, column, check_name, status, observed_value, threshold, run_id, owner, and timestamp.",
      processing:
        "Run freshness, volume, schema, uniqueness, null, referential, and business-rule checks. Block critical outputs only for critical failures.",
      reliability:
        "Track incident trends, false positives, mean time to detect, and check coverage for critical datasets.",
      tradeoffs:
        "Strict gates protect trust but can delay delivery. Use severity and table criticality to decide when to block versus warn.",
      interviewFraming:
        "I would show that quality needs checks, metadata, ownership, alert routing, and consumer visibility, not just a few assertions in code."
    },
    evaluationKeywords: ["freshness", "volume", "schema", "owner", "severity", "alert", "metrics", "contract"],
    rubric: { requirements: 20, architecture: 25, tradeoffs: 20, reliability: 25, communication: 10 },
    followUps: [
      "Which checks would you make blocking for a finance mart?",
      "How would you reduce noisy alerts after launch?"
    ]
  },
  {
    id: "system-design-008",
    slug: "backfill-safe-pipeline",
    title: "Design a Backfill-Safe Pipeline",
    difficulty: "advanced",
    domain: "reliability",
    isFree: false,
    estimatedMinutes: 42,
    tags: ["Backfills", "Idempotency", "Orchestration"],
    shortDescription:
      "Design pipelines that can rerun historical dates without duplicating or corrupting data.",
    businessContext:
      "A pricing bug affected three months of historical orders. The team must backfill revenue without breaking current dashboards.",
    functionalRequirements: [
      "Rerun historical ranges safely.",
      "Repair only affected partitions where possible.",
      "Track backfill runs and compare before/after outputs.",
      "Keep dashboards stable during large repairs."
    ],
    nonFunctionalRequirements: [
      "Backfills should be idempotent.",
      "Production runs should not be starved by backfill compute.",
      "Users should know if certified numbers changed.",
      "Rollback or restatement should be possible."
    ],
    architectureStages: [
      "Impact Analysis",
      "Backfill Plan",
      "Isolated Compute",
      "Partition Repair",
      "Validation",
      "Publish",
      "Restatement Notice"
    ],
    badArchitecture:
      "The engineer manually runs notebooks for random dates, appends outputs to gold tables, and tells analysts to refresh dashboards.",
    learnerTask:
      "Design a controlled backfill process with idempotency, validation, and communication.",
    decisions: [
      {
        id: "publish",
        question: "How should repaired data be published?",
        options: [
          {
            id: "validate_then_swap",
            label: "Write to staging, validate, then overwrite/merge affected partitions.",
            isBest: true,
            feedback:
              "Correct. Staging plus validation reduces the risk of publishing bad backfill data."
          },
          {
            id: "append_gold",
            label: "Append corrected rows to the current gold table.",
            isBest: false,
            feedback:
              "Append commonly duplicates historical metrics unless the table is designed for adjustments."
          },
          {
            id: "manual",
            label: "Let analysts decide which output file to use.",
            isBest: false,
            feedback:
              "That shifts pipeline ownership to consumers and creates inconsistent reporting."
          }
        ]
      }
    ],
    hints: [
      "Backfill is a production release, not a side script.",
      "Separate compute and scheduling from normal daily runs.",
      "Validate before publishing and communicate restatements."
    ],
    modelAnswer: {
      overview:
        "Create a backfill framework that identifies affected dates, runs deterministic jobs in an isolated mode, validates outputs, and publishes repaired partitions safely.",
      dataFlow:
        "Impact analysis produces a date/key range. Backfill jobs read raw/silver truth, write staging outputs, validate against expected totals, then publish to gold.",
      storageModel:
        "Use run_id metadata, staging tables, partitioned gold tables, and audit records that capture before/after metrics and restatement reason.",
      processing:
        "Parameterize jobs by business date range. Use dynamic partition overwrite or merge. Keep backfill resources separate from daily SLA jobs.",
      reliability:
        "Add row-count, checksum, metric delta, duplicate-key, and freshness validations. Require approval for large certified metric changes.",
      tradeoffs:
        "Full recompute is simpler but expensive. Targeted repair is faster but requires careful dependency and impact analysis.",
      interviewFraming:
        "I would describe backfill as a controlled operational workflow: plan, isolate, run, validate, publish, and communicate."
    },
    evaluationKeywords: ["backfill", "idempotent", "staging", "validate", "partition", "overwrite", "run_id", "restatement"],
    rubric: { requirements: 20, architecture: 25, tradeoffs: 20, reliability: 25, communication: 10 },
    followUps: [
      "How would you prevent backfill jobs from delaying daily jobs?",
      "How would you explain a restated revenue number to Finance?"
    ]
  },
  {
    id: "system-design-009",
    slug: "real-time-fraud-feature-platform",
    title: "Design a Real-time Fraud Feature Platform",
    difficulty: "advanced",
    domain: "streaming",
    isFree: false,
    estimatedMinutes: 45,
    tags: ["Streaming", "Features", "Fraud", "Low Latency"],
    shortDescription:
      "Design streaming features for fraud scoring with correctness and latency trade-offs.",
    businessContext:
      "A fintech team wants fraud scores before authorizing payments. The model needs recent transaction velocity and device risk features.",
    functionalRequirements: [
      "Ingest transaction events in near real time.",
      "Compute rolling features like last 5-minute transaction count.",
      "Serve features to a scoring service.",
      "Preserve events for offline training and audit."
    ],
    nonFunctionalRequirements: [
      "Feature latency under 2 seconds for online scoring.",
      "Handle duplicate and out-of-order events.",
      "Audit feature values used for a decision.",
      "Gracefully degrade when a feature source is late."
    ],
    architectureStages: [
      "Payment Events",
      "Streaming Log",
      "Stream Processor",
      "Online Feature Store",
      "Scoring Service",
      "Offline Store",
      "Monitoring"
    ],
    badArchitecture:
      "The scoring API queries the warehouse for every transaction. During peak traffic, the warehouse is slow and fraud decisions time out.",
    learnerTask:
      "Design real-time feature computation and serving for fraud scoring.",
    decisions: [
      {
        id: "serving",
        question: "Where should online fraud features be served from?",
        options: [
          {
            id: "online_store",
            label: "Low-latency online feature store or key-value serving layer.",
            isBest: true,
            feedback:
              "Correct. Online scoring needs low-latency reads, not ad-hoc warehouse queries."
          },
          {
            id: "warehouse",
            label: "Run a warehouse SQL query for every payment.",
            isBest: false,
            feedback:
              "Warehouses are not designed for per-transaction low-latency serving."
          },
          {
            id: "excel",
            label: "Upload daily CSV risk scores manually.",
            isBest: false,
            feedback:
              "Daily files cannot support real-time payment authorization."
          }
        ]
      }
    ],
    hints: [
      "Online scoring and offline training need different serving patterns.",
      "Fraud features often need rolling windows and auditability.",
      "Design for fallback if a feature is missing."
    ],
    modelAnswer: {
      overview:
        "Use a streaming pipeline to compute rolling fraud features and write them to an online feature store, while also persisting events/features offline for training and audit.",
      dataFlow:
        "Payment events enter Kafka. Stream processing deduplicates, windows by event_time, computes velocity/device features, writes online features, and stores events/features offline.",
      storageModel:
        "Online store keyed by customer_id, card_id, device_id, or account_id with TTL. Offline store keeps historical event and feature snapshots for training and decision audit.",
      processing:
        "Use event-time windows, watermarks, idempotent updates, and exactly-once or effectively-once semantics where supported.",
      reliability:
        "Monitor feature freshness, Kafka lag, scoring latency, missing feature rate, duplicate events, and fallback usage.",
      tradeoffs:
        "Low latency can conflict with full correctness for late events. Use real-time approximate features for decisions and offline corrections for analytics/model training.",
      interviewFraming:
        "I would separate online serving from analytical storage, explain latency/correctness trade-offs, and show how every fraud decision remains auditable."
    },
    evaluationKeywords: ["kafka", "window", "feature store", "online", "latency", "watermark", "audit", "fallback"],
    rubric: { requirements: 20, architecture: 30, tradeoffs: 20, reliability: 20, communication: 10 },
    followUps: [
      "What happens if the feature store is unavailable?",
      "How would you prevent training-serving skew?"
    ]
  },
  {
    id: "system-design-010",
    slug: "airflow-data-platform-orchestration",
    title: "Design Orchestration for a Data Platform",
    difficulty: "intermediate",
    domain: "platform",
    isFree: false,
    estimatedMinutes: 34,
    tags: ["Airflow", "Orchestration", "SLAs", "Dependencies"],
    shortDescription:
      "Design DAGs, dependencies, retries, backfills, and alerts for a platform.",
    businessContext:
      "The team has dozens of cron jobs with hidden dependencies. When one upstream job fails, downstream dashboards sometimes refresh with stale data.",
    functionalRequirements: [
      "Represent dependencies across ingestion, transformation, quality, and publish steps.",
      "Support retries and backfills.",
      "Prevent stale downstream dashboards.",
      "Give owners actionable alerts."
    ],
    nonFunctionalRequirements: [
      "Critical marts have freshness SLAs.",
      "Retries should be idempotent.",
      "DAGs should avoid blocking worker slots unnecessarily.",
      "Backfills should be controlled and observable."
    ],
    architectureStages: [
      "Ingestion DAGs",
      "Transform DAGs",
      "DQ Gates",
      "Publish Tasks",
      "Sensors/Datasets",
      "Alerts",
      "Run Metadata"
    ],
    badArchitecture:
      "Each script runs from cron at a guessed time. Downstream jobs start even if upstream data is missing, and alerts only say 'job failed' without dataset context.",
    learnerTask:
      "Design orchestration that makes dependencies, retries, SLAs, and data freshness visible.",
    decisions: [
      {
        id: "dependency",
        question: "How should downstream jobs wait for upstream data?",
        options: [
          {
            id: "dataset",
            label: "Use explicit dataset dependencies or lightweight sensors with freshness checks.",
            isBest: true,
            feedback:
              "Correct. Data-aware dependencies reduce stale dashboard refreshes."
          },
          {
            id: "sleep",
            label: "Add sleep(3600) and hope upstream has finished.",
            isBest: false,
            feedback:
              "Sleep-based orchestration is brittle and hides data readiness."
          },
          {
            id: "ignore",
            label: "Run all jobs independently and let dashboards handle missing data.",
            isBest: false,
            feedback:
              "This pushes platform reliability problems to consumers."
          }
        ]
      }
    ],
    hints: [
      "Orchestration should model data readiness, not only task order.",
      "Retries need idempotent tasks.",
      "Alerts should mention dataset, owner, SLA, and next action."
    ],
    modelAnswer: {
      overview:
        "Use Airflow or a similar orchestrator to define data-aware DAGs with explicit dependencies, idempotent tasks, quality gates, SLAs, and actionable alerts.",
      dataFlow:
        "Ingestion DAGs publish dataset readiness. Transform DAGs depend on those datasets, run quality gates, publish marts, and update run metadata.",
      storageModel:
        "Keep run metadata with dag_id, task_id, dataset, partition, status, row counts, freshness, and quality check results.",
      processing:
        "Parameterize tasks by partition/date. Use retries only for transient failures. Use reschedule/deferrable sensors for long waits.",
      reliability:
        "Monitor SLA misses, retry storms, stale partitions, failed quality checks, and sensor slot usage.",
      tradeoffs:
        "More granular DAGs improve observability but can create operational complexity. Group tasks by ownership and dataset boundaries.",
      interviewFraming:
        "I would explain that orchestration is not just scheduling. It controls data readiness, retry safety, quality gates, and incident response."
    },
    evaluationKeywords: ["airflow", "dependency", "dataset", "sensor", "idempotent", "sla", "freshness", "quality"],
    rubric: { requirements: 20, architecture: 25, tradeoffs: 20, reliability: 25, communication: 10 },
    followUps: [
      "How would you handle a retry that reprocesses the same file?",
      "When would you use deferrable sensors?"
    ]
  }
];

export const SYSTEM_DESIGN_DOMAINS: Array<"All" | SystemDesignDomain> = [
  "All",
  "batch",
  "streaming",
  "lakehouse",
  "modeling",
  "reliability",
  "platform"
];

export const SYSTEM_DESIGN_DIFFICULTIES: Array<"All" | SystemDesignDifficulty> = [
  "All",
  "beginner",
  "intermediate",
  "advanced"
];

export function formatSystemDesignDomain(domain: SystemDesignDomain): string {
  return domain
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getSystemDesignCaseBySlug(slug: string): SystemDesignCase | undefined {
  return SYSTEM_DESIGN_CASES.find((item) => item.slug === slug);
}

export function evaluateSystemDesignAnswer(
  item: SystemDesignCase,
  answer: string,
  selectedOptions: Record<string, string>
): SystemDesignEvaluation {
  const normalizedAnswer = answer.toLowerCase();
  const matchedKeywords = item.evaluationKeywords.filter((keyword) =>
    normalizedAnswer.includes(keyword.toLowerCase())
  );
  const missingKeywords = item.evaluationKeywords.filter(
    (keyword) => !matchedKeywords.includes(keyword)
  );

  const totalDecisions = item.decisions.length;
  const correctDecisions = item.decisions.filter((decision) => {
    const selected = selectedOptions[decision.id];
    return decision.options.some((option) => option.id === selected && option.isBest);
  }).length;

  const keywordScore =
    item.evaluationKeywords.length > 0
      ? (matchedKeywords.length / item.evaluationKeywords.length) * 55
      : 0;
  const decisionScore = totalDecisions > 0 ? (correctDecisions / totalDecisions) * 25 : 0;
  const depthScore = Math.min(20, Math.floor(answer.trim().length / 45));
  const score = Math.min(100, Math.round(keywordScore + decisionScore + depthScore));

  const rubricBreakdown = {
    requirements: Math.min(item.rubric.requirements, Math.round(score * (item.rubric.requirements / 100))),
    architecture: Math.min(item.rubric.architecture, Math.round(score * (item.rubric.architecture / 100))),
    tradeoffs: Math.min(item.rubric.tradeoffs, Math.round(score * (item.rubric.tradeoffs / 100))),
    reliability: Math.min(item.rubric.reliability, Math.round(score * (item.rubric.reliability / 100))),
    communication: Math.min(item.rubric.communication, Math.round(score * (item.rubric.communication / 100)))
  };

  return {
    score,
    verdict: score >= 85 ? "strong" : score >= 70 ? "good" : score >= 45 ? "partial" : "weak",
    strengths: [
      correctDecisions === totalDecisions
        ? "Your design choices match the strongest production defaults."
        : "You attempted the key architecture decisions.",
      matchedKeywords.length > 0
        ? `You covered ${matchedKeywords.length} important design concepts.`
        : "You started framing the answer."
    ],
    gaps: [
      ...(missingKeywords.length ? [`Add missing concepts: ${missingKeywords.slice(0, 5).join(", ")}.`] : []),
      ...(answer.trim().length < 500
        ? ["Expand the answer with data flow, trade-offs, monitoring, and failure handling."]
        : [])
    ],
    matchedKeywords,
    missingKeywords,
    rubricBreakdown
  };
}
