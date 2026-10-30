import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DISCOVERY_SCENARIO_SLUGS, publicPageMetadata } from "../../../lib/discovery";
import { getScenarioBySlug } from "../../../lib/scenarios";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const scenario = getScenarioBySlug(slug);
  if (!scenario) return { title: "Scenario not found | The Data Foundry", robots: { index: false, follow: false } };
  // Expand route discovery only through the bounded free-page inventory.
  if (!scenario.isFree || !(DISCOVERY_SCENARIO_SLUGS as readonly string[]).includes(slug)) return {};
  const description = `Free practice scenario. ${scenario.problemStatement.replace(/\s+/g, " ").trim()}`;
  return publicPageMetadata(`/scenarios/${scenario.slug}`, scenario.title, description.length > 180 ? `${description.slice(0, 177).trimEnd()}…` : description);
}

export default function ScenarioMetadataLayout({ children }: { children: ReactNode }) {
  return children;
}
