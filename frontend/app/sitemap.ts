import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  // Explicit allowlist of public landing pages and reviewed explanations.
  return ["/", "/scenarios", "/labs", "/roadmap", "/pricing", "/learn/sql/top-3-salaries-per-department"].map((path) => ({
    url: `https://datawithpranjal.com${path}`
  }));
}
