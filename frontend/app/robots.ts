import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "../lib/discovery";

export default function robots(): MetadataRoute.Robots {
  const disallow = ["/api/", "/admin", "/auth/", "/dashboard", "/profile", "/onboarding"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Search eligibility is separate from GPTBot's training-use control.
      // Keep the existing general policy for GPTBot; do not infer training consent.
      { userAgent: "OAI-SearchBot", allow: "/", disallow }
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`
  };
}
