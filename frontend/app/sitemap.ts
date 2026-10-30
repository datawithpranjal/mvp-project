import type { MetadataRoute } from "next";
import { DISCOVERY_SCENARIO_SLUGS, PUBLIC_HUBS, SITE_ORIGIN } from "../lib/discovery";
import { getScenarioBySlug } from "../lib/scenarios";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths: string[] = PUBLIC_HUBS.map((hub) => hub.path);
  for (const slug of DISCOVERY_SCENARIO_SLUGS) {
    const scenario = getScenarioBySlug(slug);
    if (!scenario?.isFree) throw new Error(`Discovery scenario is missing or no longer free: ${slug}`);
    paths.push(`/scenarios/${slug}`);
  }
  // Omit lastModified until an authoritative per-page edit date exists.
  return paths.map((path) => ({ url: new URL(path, SITE_ORIGIN).href }));
}
