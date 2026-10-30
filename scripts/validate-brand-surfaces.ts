import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND } from "../frontend/lib/product";

const root = join(dirname(fileURLToPath(import.meta.url)), "../frontend");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const home = read("app/page.tsx");
const header = read("components/site-header.tsx");
const footer = read("components/site-footer.tsx");

assert.equal(BRAND.name, "The Data Foundry");
assert.equal(BRAND.trustLine, "Built by Pranjal from Data with Pranjal");
assert.equal(home.match(/BRAND\.trustLine/g)?.length, 1, "Homepage must have one endorsement");
assert.match(header, /The Data Foundry/);
assert.match(footer, /Contact The Data Foundry support\./);
assert.match(footer, /const SUPPORT_EMAIL = "datawithpranjal@gmail\.com";/);
assert.ok(footer.includes('href={`mailto:${SUPPORT_EMAIL}?subject=The%20Data%20Foundry%20Support`}'), "Preserve the support destination and subject");

// Enforce the surface boundary, including auth/OTP, Premium, results and progress:
// new pages or shared components must not duplicate the homepage endorsement.
function inspect(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) inspect(path);
    else if (/\.[jt]sx?$/.test(entry.name)) {
      const source = readFileSync(path, "utf8");
      const name = relative(root, path);
      assert.doesNotMatch(source, /Data with Pranjal|Built by|\bDWP\b/, `${name}: unexpected founder branding`);
      if (name !== "app/page.tsx") {
        assert.doesNotMatch(source, /BRAND\.trustLine/, `${name}: endorsement belongs only on the homepage`);
      }
    }
  }
}
inspect(join(root, "app"));
inspect(join(root, "components"));
assert.match(read("components/auth-dialog.tsx"), /aria-label="Access The Data Foundry"/);
console.log("Brand surfaces passed: one homepage endorsement, TDF shared identity, preserved support destination.");
