import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  // Keep discovery limited to verified public landing pages.
  return ["/", "/scenarios", "/labs", "/roadmap", "/pricing"].map((path) => ({
    url: `https://datawithpranjal.com${path}`
  }));
}
