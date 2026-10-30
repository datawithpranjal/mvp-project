import assert from "node:assert/strict";
import sitemap from "../frontend/app/sitemap";
import robots from "../frontend/app/robots";
import { generateMetadata } from "../frontend/app/scenarios/[slug]/layout";
import { DISCOVERY_SCENARIO_SLUGS, PUBLIC_HUBS, SITE_ORIGIN, hubMetadata } from "../frontend/lib/discovery";
import { getScenarioBySlug } from "../frontend/lib/scenarios";

async function main() {
  const entries = sitemap();
  const expected = [
    ...PUBLIC_HUBS.map((hub) => ({ path: hub.path, metadata: hubMetadata(hub.path) })),
    ...await Promise.all(DISCOVERY_SCENARIO_SLUGS.map(async (slug) => {
      assert.equal(getScenarioBySlug(slug)?.isFree, true);
      return { path: `/scenarios/${slug}`, metadata: await generateMetadata({ params: Promise.resolve({ slug }) }) };
    }))
  ];
  assert.equal(entries.length, expected.length);
  assert.equal(new Set(entries.map((entry) => entry.url)).size, entries.length);
  assert.equal(new Set(expected.map(({ metadata }) => metadata.title)).size, expected.length, "Titles must distinguish public routes");
  for (const { path, metadata } of expected) {
    const canonical = new URL(path, SITE_ORIGIN).href;
    assert.ok(entries.some((entry) => entry.url === canonical));
    assert.equal(metadata.alternates?.canonical, canonical);
    assert.ok(metadata.description && metadata.description.length <= 180);
    assert.deepEqual(metadata.robots, { index: true, follow: true });
    assert.equal(metadata.openGraph?.url, canonical);
    assert.equal(metadata.openGraph?.title, metadata.title);
    assert.equal(metadata.twitter?.card, "summary_large_image");
  }
  for (const entry of entries) {
    const url = new URL(entry.url);
    assert.equal(url.origin, SITE_ORIGIN);
    assert.equal(url.search, "", "Do not publish filter/selection/tracking variants");
    assert.equal(url.hash, "");
    assert.equal(entry.lastModified, undefined, "Do not fabricate freshness dates");
    assert.doesNotMatch(url.pathname, /^\/(api|admin|auth|profile|dashboard|onboarding|pricing)(\/|$)/);
  }
  const policy = robots();
  const rules = policy.rules as Array<{ userAgent: string; allow: string; disallow: string[] }>;
  for (const agent of ["*", "OAI-SearchBot"]) {
    const rule = rules.find((item) => item.userAgent === agent);
    assert.equal(rule?.allow, "/");
    assert.ok(rule?.disallow.includes("/api/"));
    assert.ok(rule?.disallow.includes("/admin"));
    assert.ok(!rule?.disallow.includes("/_next/"), "Crawlers need rendering assets");
  }
  assert.ok(!rules.some((rule) => rule.userAgent === "GPTBot"), "Training policy is not a search-eligibility change");
  assert.equal(policy.sitemap, `${SITE_ORIGIN}/sitemap.xml`);
  assert.deepEqual((await generateMetadata({ params: Promise.resolve({ slug: "not-a-real-scenario" }) })).robots, { index: false, follow: false });
  assert.deepEqual(await generateMetadata({ params: Promise.resolve({ slug: "revenue-drop-new-successful-status" }) }), {}, "Do not expand Premium discovery in this patch");

  const preview = process.env.DISCOVERY_PREVIEW_URL;
  if (preview) {
    // Request actual rendered metadata, as a crawler, rather than testing helpers alone.
    const fetchText = async (path: string) => {
      const response = await fetch(new URL(path, preview), { headers: { "User-Agent": "Googlebot" } });
      assert.equal(response.status, 200, path);
      return response.text();
    };
    const xml = await fetchText("/sitemap.xml");
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.deepEqual(locations, entries.map((entry) => entry.url));
    const txt = await fetchText("/robots.txt");
    assert.match(txt, /User-Agent: OAI-SearchBot\nAllow: \/\nDisallow: \/api\//i);
    assert.ok(txt.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));
    const renderedTitles = new Set<string>();
    for (const { path } of expected) {
      const html = await fetchText(`${path}?utm_source=qa`);
      const canonical = new URL(path, SITE_ORIGIN).href;
      assert.equal(html.match(/rel="canonical"/g)?.length, 1, `${path}: canonical count`);
      // Next normalizes a root URL's trailing slash when serializing metadata.
      assert.equal(new URL(html.match(/rel="canonical" href="([^"]+)"/)?.[1] ?? "").href, canonical, `${path}: canonical URL`);
      assert.equal(new URL(html.match(/property="og:url" content="([^"]+)"/)?.[1] ?? "").href, canonical, `${path}: social URL`);
      renderedTitles.add(html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "");
      const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? "";
      const entities: Record<string, string> = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " " };
      const visibleText = main.replace(/<script\b[\s\S]*?<\/script>/g, "").replace(/<[^>]*>/g, " ")
        .replace(/&(#x[\da-f]+|#\d+|amp|apos|quot|lt|gt|nbsp);/gi, (_, entity: string) => entity.startsWith("#")
          ? String.fromCodePoint(parseInt(entity.slice(entity[1] === "x" ? 2 : 1), entity[1] === "x" ? 16 : 10))
          : entities[entity])
        .replace(/\s+/g, " ").trim();
      assert.ok(visibleText.length > 150, `${path}: useful server-rendered main text`);
      assert.match(html, /<a\b[^>]*href="\/labs"/, `${path}: crawlable practice link`);
      if (path.startsWith("/scenarios/")) {
        const scenario = getScenarioBySlug(path.split("/").at(-1)!);
        assert.ok(visibleText.includes(scenario!.problemStatement.slice(0, 60)), `${path}: public incident visible without JavaScript`);
      }
      assert.match(html, /name="twitter:card" content="summary_large_image"/);
      assert.match(html, /property="og:image"/);
      assert.match(html, /name="robots" content="index, follow"/);
    }
    assert.equal(renderedTitles.size, expected.length, "Rendered titles must distinguish public routes");
    const image = await fetch(new URL("/opengraph-image", preview));
    assert.equal(image.status, 200);
    assert.match(image.headers.get("content-type") ?? "", /image\/png/);
    const png = new DataView(await image.arrayBuffer());
    assert.equal(png.getUint32(16), 1200);
    assert.equal(png.getUint32(20), 630);
    console.log(`Rendered discovery checks passed: robots, sitemap, ${expected.length} canonical routes and 1200×630 social image.`);
  }
  console.log(`Discovery contract passed: ${entries.length} public URLs; independent search crawl policy; no query variants or fabricated dates.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
