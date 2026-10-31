import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { ScenarioChooser } from "../components/scenarios/ScenarioChooser";
import { chooserCatalog, groupChooserItems, scenarioChooserHref, selectChooserScenario, type ScenarioChooserItem } from "../lib/scenario-chooser";
import { getScenarios, getScenarioBySlug } from "../lib/scenarios";

const catalog: ScenarioChooserItem[] = [
  { slug: "airflow-two", title: "Shared title", domain: "airflow", difficulty: "advanced", isFree: false },
  { slug: "sql-first", title: "Query incident", domain: "sql", difficulty: "beginner", isFree: true },
  { slug: "airflow-one", title: "Late data", domain: "airflow", difficulty: "intermediate", isFree: true },
  { slug: "spark-one", title: "Shared title", domain: "pyspark", difficulty: "advanced", isFree: false },
  { slug: "quality-one", title: "Missing partition", domain: "data_quality", difficulty: "intermediate", isFree: false },
];
const items = chooserCatalog(catalog);
assert.deepEqual(groupChooserItems(items, "  SHARED title  ").flatMap(g => g.items.map(i => i.slug)), ["spark-one", "airflow-two"]);
assert.deepEqual(groupChooserItems(items, " AIRFLOW ").flatMap(g => g.items.map(i => i.slug)), ["airflow-two", "airflow-one"]);
assert.deepEqual(groupChooserItems(items, "data quality").map(g => g.domain), ["data_quality"]);
assert.deepEqual(groupChooserItems(items, "   ").map(g => g.domain), ["sql", "pyspark", "airflow", "data_quality"]);
assert.deepEqual(groupChooserItems(items, "airflow")[0].items.map(i => i.slug), ["airflow-two", "airflow-one"], "Keep catalog ordering within domain");
assert.equal(groupChooserItems(items, "no such incident").length, 0);
assert.deepEqual(chooserCatalog(undefined), []);
assert.deepEqual(chooserCatalog(null), []);
assert.deepEqual(chooserCatalog([]), []);
assert.equal(chooserCatalog([...catalog, catalog[0]]).length, catalog.length, "Deduplicate slug keys, not titles");
assert.equal(chooserCatalog([{ ...catalog[0], slug: "../payment" }]).length, 0);
const withPrivateFields = { ...catalog[0], modelSolution: "PRIVATE ANSWER SENTINEL", hints: ["PRIVATE HINT"], account: "PRIVATE IDENTITY" };
assert.deepEqual(Object.keys(chooserCatalog([withPrivateFields])[0]).sort(), ["difficulty", "domain", "isFree", "slug", "title"]);

const html = renderToStaticMarkup(<ScenarioChooser current={catalog[0]} catalog={[withPrivateFields, ...catalog.slice(1)]} onSelect={() => {}} />);
for (const text of ["Change scenario", "Search scenarios", "Shared title", "Airflow", "Advanced", "Free", "Premium", "Current"]) assert(html.includes(text));
assert(!html.includes("PRIVATE"));
assert(html.includes('aria-current="page"'));
assert(html.includes('aria-live="polite"'));
assert(html.includes('href="/scenarios/airflow-two"'), "Premium stays selectable to the existing scenario route");
assert(!html.includes("Recommended next practice"), "Chooser is not a second recommendation");
assert(!html.includes("/pricing"), "Chooser never redirects directly to payment");
const unavailable = renderToStaticMarkup(<ScenarioChooser current={catalog[0]} onSelect={() => {}} />);
assert(unavailable.includes("Scenarios unavailable"));
assert(unavailable.includes("Back to current scenario"));

let draft = "unsaved synthetic draft";
const calls: string[] = [];
const flush = () => { calls.push("flush:" + draft); };
const navigate = (href: string) => { calls.push(href); };
selectChooserScenario("sql-first", "sql-first", flush, navigate);
assert.deepEqual(calls, [], "Current selection must not save, navigate or reset");
assert.equal(draft, "unsaved synthetic draft");
for (const identity of ["guest", "signed-in-free", "premium", "unknown-entitlement"]) {
  calls.length = 0;
  selectChooserScenario("sql-first", "airflow-two", flush, navigate);
  assert.deepEqual(calls, ["flush:" + draft, "/scenarios/airflow-two"], identity + ": flush before existing locked destination");
  assert.equal(draft, "unsaved synthetic draft");
}
let navigated = false;
assert.throws(() => selectChooserScenario("sql-first", "airflow-two", () => { throw new Error("save failed"); }, () => { navigated = true; }));
assert(!navigated, "Failed flush must not navigate away");
for (const item of getScenarios()) assert.equal(scenarioChooserHref(item.slug), `/scenarios/${item.slug}`);
assert(chooserCatalog(getScenarios()).length > 0);

// Exercise the actual unchanged page guard with synthetic hook results. No
// credentials, real account, entitlement grant or network request is involved.
let routeSlug = "airflow-green-dashboard-wrong";
let entitlement = { hasPremiumAccess: false, status: "inactive" };
const Locked = () => null, Workspace = () => null;
const routeModule = { exports: {} as { default: () => React.ReactElement<Record<string, unknown>> } };
const page = ts.transpileModule(readFileSync(new URL("../app/scenarios/[slug]/page.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
vm.runInNewContext(page, {
  exports: routeModule.exports,
  require: (name: string) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next/link") return { default: () => null };
    if (name === "next/navigation") return { useParams: () => ({ slug: routeSlug }) };
    if (name.endsWith("/PremiumLockedCard")) return { PremiumLockedCard: Locked };
    if (name.endsWith("/ScenarioWorkspace")) return { ScenarioWorkspace: Workspace };
    if (name.endsWith("/scenarios")) return { getScenarioBySlug };
    if (name.endsWith("/use-premium-entitlement")) return { usePremiumEntitlement: () => entitlement };
    throw new Error("Unexpected route import: " + name);
  }
});
for (const [identity, active, status] of [
  ["guest", false, "inactive"], ["signed-in-free", false, "inactive"],
  ["premium", true, "active"], ["unknown-entitlement", false, "unavailable"]
] as const) {
  entitlement = { hasPremiumAccess: active, status };
  routeSlug = "airflow-green-dashboard-wrong";
  const premiumPage = routeModule.exports.default();
  assert.equal(premiumPage.type, active ? Workspace : Locked, identity + ": actual Premium route guard");
  if (!active) assert.equal(premiumPage.props.accessUnavailable, status === "unavailable");
  routeSlug = "yesterdays-sales-missing-late-source-arrival";
  assert.equal(routeModule.exports.default().type, Workspace, identity + ": actual free route guard");
}
console.log("Scenario chooser passed: normalized title/domain search, stable groups/duplicate titles, public projection, missing catalog, current/other selection, draft-first navigation and unchanged tier destinations. Actual entitlement guard stays in the existing route; browser checks cover focus and locks.");
