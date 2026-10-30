import type { Metadata } from "next";

export const SITE_ORIGIN = "https://datawithpranjal.com";

// Existing public hubs only. Query-selected exercises are not separate search pages.
export const PUBLIC_HUBS = [
  { path: "/", title: "Data Engineering Practice", description: "Practise SQL, Python, PySpark and production debugging with Data Engineering scenarios, visible examples and guided feedback." },
  { path: "/labs", title: "Data Engineering Practice Labs", description: "Choose SQL, Python, PySpark, Airflow or AWS practice. Explore free exercises and clearly labelled Premium labs." },
  { path: "/labs/sql", title: "SQL Practice for Data Engineers", description: "Practise SQL joins, aggregation grain, window functions and data-quality checks using visible datasets and output comparisons." },
  { path: "/labs/python", title: "Python Practice for Data Engineers", description: "Practise Python data transformations, deduplication, validation and pipeline logic with function-based coding exercises." },
  { path: "/labs/pyspark", title: "PySpark Practice for Data Engineers", description: "Explore PySpark exercises on DataFrames, joins, deduplication, business dates and production performance." },
  { path: "/labs/airflow", title: "Airflow Troubleshooting Practice", description: "Work through Airflow scheduling, retries, backfills and dependency incidents. Explain safe recovery and operational trade-offs." },
  { path: "/labs/aws", title: "AWS Data Engineering Practice", description: "Practise AWS data-platform decisions involving storage, processing, permissions, reliability and cost trade-offs." },
  { path: "/scenarios", title: "Data Engineering Debugging Scenarios", description: "Investigate broken pipelines, SQL output mismatches and production incidents. Inspect evidence, propose a fix and explain your reasoning." },
  { path: "/system-design", title: "Data Engineering System Design Practice", description: "Explore data-platform architecture cases, requirements, constraints and design decisions with guided interview practice." },
  { path: "/roadmap", title: "Data Engineering Practice Roadmap", description: "Follow a structured practice path through SQL correctness, Python pipelines, PySpark, operations and system design." }
] as const;

// Bounded existing free scenario inventory, not the proposed 30-page editorial rollout.
export const DISCOVERY_SCENARIO_SLUGS = [
  "wrong-group-by-grain-customer-revenue",
  "left-join-where-filter-inner-join",
  "duplicate-revenue-payments-refunds-join",
  "pyspark-append-mode-duplicate-daily-loads",
  "yesterdays-sales-missing-late-source-arrival"
] as const;

export function publicPageMetadata(path: string, title: string, description: string): Metadata {
  const url = new URL(path, SITE_ORIGIN).href;
  const fullTitle = `${title} | The Data Foundry`;
  const images = [{ url: `${SITE_ORIGIN}/opengraph-image`, width: 1200, height: 630, alt: "The Data Foundry — Data Engineering practice" }];
  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { type: "website", locale: "en_US", siteName: "The Data Foundry", title: fullTitle, description, url, images },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: images.map((image) => image.url) }
  };
}

export function hubMetadata(path: string): Metadata {
  const hub = PUBLIC_HUBS.find((item) => item.path === path);
  if (!hub) throw new Error(`Unknown discovery hub: ${path}`);
  return publicPageMetadata(hub.path, hub.title, hub.description);
}
