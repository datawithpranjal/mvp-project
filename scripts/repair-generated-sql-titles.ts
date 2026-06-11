import fs from "node:fs";
import path from "node:path";

interface GeneratedLab {
  id: string;
  title: string;
  topicTags?: string[];
  businessContext?: string;
}

const ROOT = path.resolve(__dirname, "..");
const FILES = [
  path.join(ROOT, "frontend", "data", "public-sql-practice.generated.json"),
  path.join(ROOT, "data", "public-sql-practice.generated.json")
];

function conceptFor(lab: GeneratedLab): string {
  const text = `${lab.topicTags?.join(" ") ?? ""} ${lab.businessContext ?? ""}`.toLowerCase();
  if (/finance|ledger|debit|credit|account/.test(text)) return "Signed Finance Ledger";
  if (/commerce|revenue|order item|product sales/.test(text)) return "Completed-Order Revenue";
  if (/workforce|salary|payroll|employee/.test(text)) return "Workforce Ranking";
  if (/retention|activity cohort|activation/.test(text)) return "First Activity Retention";
  if (/engagement|click-through|impression/.test(text)) return "Conditional Engagement Metric";
  if (/operations|delivery|shipment|logistics/.test(text)) return "Operations SLA Metric";
  if (/education|enrollment|student/.test(text)) return "Distinct Enrollment Threshold";
  if (/dimension|country|reference/.test(text)) return "Reference Dimension Filter";
  if (/duplicate|email quality/.test(text)) return "Case-Normalized Duplicate Detection";
  if (/anti-join|missing activity|null-safe/.test(text)) return "Missing Record Anti-Join";
  if (/join|profile enrichment/.test(text)) return "Profile Enrichment Join";
  if (/trend|temperature|sensor/.test(text)) return "Day-over-Day Sensor Trend";
  return "Warehouse Grain Reconciliation";
}

for (const file of FILES) {
  const labs = JSON.parse(fs.readFileSync(file, "utf8")) as GeneratedLab[];
  let changed = 0;

  for (const lab of labs) {
    const baseTitle = lab.title.split(":")[0].trim();
    const index = lab.id.match(/(\d+)$/)?.[1] ?? "";
    const nextTitle = `${baseTitle}: ${conceptFor(lab)} ${index}`.trim();
    if (nextTitle !== lab.title) {
      lab.title = nextTitle;
      changed += 1;
    }
  }

  fs.writeFileSync(file, `${JSON.stringify(labs, null, 2)}\n`);
  console.log(`Repaired ${changed} generated SQL titles in ${file}`);
}
