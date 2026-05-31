import fs from "node:fs";
import path from "node:path";

type Cell = string | number | boolean | null;

interface RepoSource {
  repo: string;
  cachePath: string;
}

interface TreeEntry {
  path: string;
  type: string;
}

interface Candidate {
  title: string;
  path: string;
  repo: string;
}

interface SqlTestCase {
  name: string;
  description: string;
  tables: CodingLab["tables"];
  expectedSql?: string;
}

interface CodingLab {
  id: string;
  slug: string;
  track: "sql";
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  section: string;
  topicTags: string[];
  isFree: boolean;
  estimatedMinutes: number;
  businessContext: string;
  problemStatement: string;
  expectedOutcome?: string;
  studentTask: string;
  starterCode: string;
  solutionCode: string;
  explanation: string;
  hints: string[];
  tables: Array<{
    name: string;
    columns: string[];
    rows: Cell[][];
  }>;
  expectedSql: string;
  sqlTestCases?: SqlTestCase[];
}

const ROOT = path.resolve(__dirname, "..");

const SOURCES: RepoSource[] = [
  {
    repo: "leetlab11/SQL-ALL",
    cachePath: "/private/tmp/sql-all-tree.json"
  },
  {
    repo: "mrinal1704/SQL-Leetcode-Challenge",
    cachePath: "/private/tmp/sql-leetcode-challenge-tree.json"
  },
  {
    repo: "leetlab11/Advanced-SQL-50",
    cachePath: "/private/tmp/advanced-sql-50-tree.json"
  }
];

const COMMON_HINTS = [
  "Check the required output grain before writing SQL.",
  "Compare the starter query with the business rule and identify what it drops or overcounts.",
  "Think about the edge case that would break a query that only works for the visible rows."
];

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (["and", "or", "to", "in", "of", "by", "for", "the", "with"].includes(lower)) {
        return lower;
      }
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ")
    .replace(/\bi\b/g, "I")
    .replace(/\bii\b/g, "II")
    .replace(/\biii\b/g, "III");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function cleanTitleFromPath(filePath: string) {
  const parts = filePath.split("/");
  const fileName = parts.at(-1) ?? "";
  let base = fileName.replace(/\.[^.]+$/, "");

  if (/^(problem|solution|problem and solution)$/i.test(base.trim()) && parts.length > 1) {
    base = parts.at(-2) ?? base;
  }

  base = base
    .replace(/^\d{1,3}-\d{3,6}-/, "")
    .replace(/^\d{3,6}[-_]/, "")
    .replace(/^\d{1,3}[-_\s]/, "")
    .replace(/leetcode/i, "")
    .replace(/sql/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/&/g, " and ")
    .replace(/\s+/g, " ")
    .trim();

  return titleCase(base);
}

function normalizedTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/\b(i|ii|iii|iv|v)\b/g, (match) => match)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJsonFromUrl(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "data-foundry-sql-coverage-importer"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

async function loadRepoTree(source: RepoSource): Promise<TreeEntry[]> {
  if (fs.existsSync(source.cachePath)) {
    const cached = JSON.parse(fs.readFileSync(source.cachePath, "utf8")) as { tree?: TreeEntry[] };
    return cached.tree ?? [];
  }

  const metadata = await readJsonFromUrl(`https://api.github.com/repos/${source.repo}`);
  const branch = String(metadata.default_branch ?? "main");
  const tree = await readJsonFromUrl(
    `https://api.github.com/repos/${source.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  ) as { tree?: TreeEntry[] };

  return tree.tree ?? [];
}

async function collectCandidates() {
  const candidates: Candidate[] = [];

  for (const source of SOURCES) {
    const tree = await loadRepoTree(source);
    for (const entry of tree) {
      if (entry.type !== "blob") continue;
      if (!/\.(sql|rtf)$/i.test(entry.path)) continue;
      if (/readme|license/i.test(entry.path)) continue;

      const title = cleanTitleFromPath(entry.path);
      if (!title || /^problem/i.test(title)) continue;

      candidates.push({
        title,
        path: entry.path,
        repo: source.repo
      });
    }
  }

  const deduped = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = normalizedTitle(candidate.title);
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }

  return Array.from(deduped.values());
}

function table(name: string, columns: string[], rows: Cell[][]): CodingLab["tables"][number] {
  return { name, columns, rows };
}

function sqlCase(
  name: string,
  description: string,
  tables: CodingLab["tables"],
  expectedSql?: string
): SqlTestCase {
  return {
    name,
    description,
    tables,
    expectedSql
  };
}

function classification(title: string) {
  const lower = title.toLowerCase();

  if (/combine|join/.test(lower)) return "profile_join";
  if (/duplicate|email|delete duplicate/.test(lower)) return "duplicate_quality";
  if (/never order|no sales|missing|not.*order|sellers with no/.test(lower)) return "anti_join";
  if (/salary|employee|manager|department|bonus|report to|team size|staff|rank|score/.test(lower)) {
    return "workforce_rank";
  }
  if (/temperature|weather|rising/.test(lower)) return "time_trend";
  if (/game play|login|activity|active users|session|retention/.test(lower)) return "retention";
  if (/ads|question|comment|post|article|views|rate|percentage/.test(lower)) return "engagement";
  if (/delivery|food|restaurant|bus|trip|travel/.test(lower)) return "operations";
  if (/transaction|bank|account|investment|capital|npv|invest/.test(lower)) return "finance";
  if (/product|sales|sold|price|orders|customer|purchase|market|revenue/.test(lower)) return "commerce";
  if (/student|class|exam|grade|school/.test(lower)) return "education";
  if (/country|countries|movie|cinema|users|calls|friend|follower/.test(lower)) return "dimension_reporting";
  return "warehouse_reporting";
}

function buildProfileJoinLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `SELECT
  c.customer_id,
  c.customer_name,
  p.city
FROM customers c
LEFT JOIN customer_profiles p
  ON p.customer_id = c.customer_id
ORDER BY c.customer_id;`;

  return {
    title: `Profile Enrichment Join Drill ${index}`,
    difficulty: "beginner",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "Joins", "LEFT JOIN", "Customer Analytics"],
    estimatedMinutes: 12,
    businessContext:
      "A CRM export must include every customer, even if the optional profile enrichment table has not arrived yet. A teammate used an INNER JOIN and silently removed customers with missing profiles.",
    problemStatement:
      "Return all customers with their profile city when available. Customers without a profile should still appear with NULL city.",
    studentTask:
      "Write a LEFT JOIN query returning customer_id, customer_name, and city.",
    starterCode: `SELECT c.customer_id, c.customer_name, p.city
FROM customers c
JOIN customer_profiles p
  ON p.customer_id = c.customer_id
ORDER BY c.customer_id;`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "The customer table is the required side of the report, so the enrichment must be a LEFT JOIN. INNER JOIN changes coverage by dropping customers without profiles.",
    hints: COMMON_HINTS,
    tables: [
      table("customers", ["customer_id", "customer_name"], [
        [101, "Nova Retail"],
        [102, "BluePeak"],
        [103, "UrbanNest"],
        [104, "FreshCart"]
      ]),
      table("customer_profiles", ["customer_id", "city", "updated_at"], [
        [101, "Pune", "2026-05-01"],
        [103, "Bengaluru", "2026-05-02"],
        [104, "Mumbai", "2026-05-03"]
      ])
    ]
  };
}

function buildWorkforceLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `WITH ranked AS (
  SELECT
    employee_id,
    employee_name,
    department,
    salary,
    DENSE_RANK() OVER (
      PARTITION BY department
      ORDER BY salary DESC
    ) AS salary_band_rank
  FROM employees
)
SELECT
  department,
  employee_name,
  salary
FROM ranked
WHERE salary_band_rank <= 2
ORDER BY department, salary DESC, employee_name;`;

  return {
    title: `Payroll Ranking Audit ${index}`,
    difficulty: "intermediate",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "Window Functions", "Ranking", "HR Analytics"],
    estimatedMinutes: 18,
    businessContext:
      "The people analytics team is auditing compensation dashboards before leadership review. The dashboard must show the top salary bands inside each department and keep tied salaries instead of dropping them.",
    problemStatement:
      "Return the employees in the top two salary bands per department. If multiple employees share the same salary band, include all of them.",
    studentTask:
      "Write a read-only SQL query using a ranking window function. The output must contain department, employee_name, and salary.",
    starterCode: `SELECT department, employee_name, salary
FROM employees
ORDER BY salary DESC
LIMIT 2;`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "A global LIMIT answers a different question. Ranking must happen inside each department, and DENSE_RANK keeps tied salary bands without gaps.",
    hints: COMMON_HINTS,
    tables: [
      table("employees", ["employee_id", "employee_name", "department", "salary", "manager_id"], [
        [1, "Asha", "Data", 185000, null],
        [2, "Kabir", "Data", 172000, 1],
        [3, "Meera", "Data", 172000, 1],
        [4, "Nikhil", "Data", 151000, 2],
        [5, "Ira", "Finance", 190000, null],
        [6, "Dev", "Finance", 160000, 5],
        [7, "Rhea", "Finance", 155000, 5],
        [8, "Omar", "Ops", 142000, null],
        [9, "Tara", "Ops", 142000, 8],
        [10, "Zoya", "Ops", 130000, 8]
      ])
    ]
  };
}

function buildAntiJoinLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `SELECT
  c.customer_id,
  c.customer_name
FROM customers c
WHERE NOT EXISTS (
  SELECT 1
  FROM orders o
  WHERE o.customer_id = c.customer_id
    AND o.order_status = 'completed'
)
ORDER BY c.customer_id;`;

  return {
    title: `Customer Coverage Gap Audit ${index}`,
    difficulty: "beginner",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "Anti Join", "NULL Safety", "Customer Analytics"],
    estimatedMinutes: 14,
    businessContext:
      "Growth wants a list of customers who have not completed an order so the CRM team can send an activation campaign. The orders feed can contain NULL customer IDs from failed guest checkout events.",
    problemStatement:
      "Find customers who do not have any completed order. The query should be safe even when the orders table contains NULL customer_id values.",
    studentTask:
      "Write a query that returns customer_id and customer_name for customers with no completed orders.",
    starterCode: `SELECT customer_id, customer_name
FROM customers
WHERE customer_id NOT IN (
  SELECT customer_id
  FROM orders
  WHERE order_status = 'completed'
);`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "NOT EXISTS is safer than NOT IN when a subquery may return NULL. The correlated check only tests matching completed orders for the current customer.",
    hints: COMMON_HINTS,
    tables: [
      table("customers", ["customer_id", "customer_name", "segment"], [
        [101, "Nova Retail", "SMB"],
        [102, "BluePeak", "Enterprise"],
        [103, "UrbanNest", "SMB"],
        [104, "FreshCart", "Mid Market"],
        [105, "Apex Labs", "Enterprise"]
      ]),
      table("orders", ["order_id", "customer_id", "order_status", "order_date", "amount"], [
        [5001, 101, "completed", "2026-05-01", 1200],
        [5002, 102, "cancelled", "2026-05-02", 800],
        [5003, null, "completed", "2026-05-02", 300],
        [5004, 104, "completed", "2026-05-03", 950],
        [5005, 105, "returned", "2026-05-04", 450]
      ])
    ]
  };
}

function buildDuplicateLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `SELECT
  LOWER(email) AS email,
  COUNT(*) AS duplicate_count
FROM crm_contacts
WHERE email IS NOT NULL
GROUP BY LOWER(email)
HAVING COUNT(*) > 1
ORDER BY email;`;

  return {
    title: `CRM Duplicate Contact Investigation ${index}`,
    difficulty: "beginner",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "Data Quality", "GROUP BY", "Duplicates"],
    estimatedMinutes: 12,
    businessContext:
      "A marketing automation sync is charging the company for duplicate contacts. The CRM stores emails with inconsistent casing, so exact string comparison undercounts duplicates.",
    problemStatement:
      "Find duplicated email addresses after normalizing email casing. Ignore rows where email is NULL.",
    studentTask:
      "Return email and duplicate_count for emails appearing more than once after LOWER(email).",
    starterCode: `SELECT email, COUNT(*) AS duplicate_count
FROM crm_contacts
GROUP BY email;`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "Duplicate checks need the same normalization rules used by the downstream system. Grouping on LOWER(email) catches case-only duplicates.",
    hints: COMMON_HINTS,
    tables: [
      table("crm_contacts", ["contact_id", "email", "source_system"], [
        [1, "asha@example.com", "hubspot"],
        [2, "ASHA@example.com", "webinar"],
        [3, "dev@example.com", "hubspot"],
        [4, null, "manual"],
        [5, "meera@example.com", "events"],
        [6, "meera@example.com", "ads"]
      ])
    ]
  };
}

function buildTrendLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `WITH reading_with_previous AS (
  SELECT
    reading_date,
    temperature_c,
    LAG(temperature_c) OVER (ORDER BY reading_date) AS previous_temperature_c
  FROM warehouse_temperature
)
SELECT
  reading_date,
  temperature_c
FROM reading_with_previous
WHERE temperature_c > previous_temperature_c
ORDER BY reading_date;`;

  return {
    title: `Warehouse Sensor Trend Check ${index}`,
    difficulty: "intermediate",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "Window Functions", "Time Series", "IoT"],
    estimatedMinutes: 16,
    businessContext:
      "Operations is checking whether a cold-storage warehouse had rising temperatures day over day. The alert should compare each day against the previous recorded day.",
    problemStatement:
      "Return dates where the warehouse temperature is higher than the previous day in the sample feed.",
    studentTask:
      "Use LAG to compare each reading to the previous reading and return reading_date and temperature_c.",
    starterCode: `SELECT reading_date, temperature_c
FROM warehouse_temperature
WHERE temperature_c > 5;`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "A static threshold does not answer whether temperature rose compared with the previous day. LAG gives the prior row in time order.",
    hints: COMMON_HINTS,
    tables: [
      table("warehouse_temperature", ["reading_date", "temperature_c"], [
        ["2026-05-01", 3.2],
        ["2026-05-02", 3.5],
        ["2026-05-03", 3.1],
        ["2026-05-04", 4.4],
        ["2026-05-05", 4.4],
        ["2026-05-06", 5.0]
      ])
    ]
  };
}

function buildRetentionLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `WITH first_seen AS (
  SELECT
    user_id,
    MIN(event_date) AS first_seen_date
  FROM app_events
  GROUP BY user_id
)
SELECT
  f.user_id,
  f.first_seen_date
FROM first_seen f
WHERE EXISTS (
  SELECT 1
  FROM app_events e
  WHERE e.user_id = f.user_id
    AND e.event_date = DATE(f.first_seen_date, '+1 day')
)
ORDER BY f.user_id;`;

  return {
    title: `Product Activation Retention Drill ${index}`,
    difficulty: "intermediate",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "Retention", "Events", "EXISTS"],
    estimatedMinutes: 18,
    businessContext:
      "The product team wants to know which users returned the day after their first app activity. The events table has multiple events per user per day.",
    problemStatement:
      "Find users who had at least one event exactly one day after their first recorded event date.",
    studentTask:
      "Return user_id and first_seen_date for users with next-day activity.",
    starterCode: `SELECT user_id, event_date AS first_seen_date
FROM app_events
GROUP BY user_id;`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "Retention is measured from the first activity date, not an arbitrary grouped row. Use a first_seen CTE and test for a next-day event.",
    hints: COMMON_HINTS,
    tables: [
      table("app_events", ["event_id", "user_id", "event_date", "event_name"], [
        [1, 201, "2026-05-01", "signup"],
        [2, 201, "2026-05-02", "view_dashboard"],
        [3, 202, "2026-05-01", "signup"],
        [4, 202, "2026-05-04", "view_dashboard"],
        [5, 203, "2026-05-03", "signup"],
        [6, 203, "2026-05-04", "run_report"],
        [7, 204, "2026-05-02", "signup"]
      ])
    ]
  };
}

function buildEngagementLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `SELECT
  ad_id,
  ROUND(
    100.0 * SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) /
    NULLIF(SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END), 0),
    2
  ) AS click_through_rate_pct
FROM ad_events
GROUP BY ad_id
ORDER BY ad_id;`;

  return {
    title: `Campaign Engagement Metric Drill ${index}`,
    difficulty: "intermediate",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "Metrics", "CASE", "NULL Safety"],
    estimatedMinutes: 15,
    businessContext:
      "Marketing noticed CTR moved sharply after a tracking release. You need to recompute click-through rate from raw impression and click events.",
    problemStatement:
      "Calculate click-through rate percentage per ad as clicks divided by impressions. Avoid divide-by-zero failures.",
    studentTask:
      "Return ad_id and click_through_rate_pct rounded to two decimals.",
    starterCode: `SELECT ad_id, COUNT(*) AS click_through_rate_pct
FROM ad_events
GROUP BY ad_id;`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "CTR needs conditional counts for clicks and impressions. NULLIF prevents a division error when an ad has no impressions in the sample.",
    hints: COMMON_HINTS,
    tables: [
      table("ad_events", ["event_id", "ad_id", "event_type"], [
        [1, "ad_1", "impression"],
        [2, "ad_1", "click"],
        [3, "ad_1", "impression"],
        [4, "ad_2", "impression"],
        [5, "ad_2", "impression"],
        [6, "ad_3", "click"]
      ])
    ]
  };
}

function buildOperationsLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `SELECT
  ROUND(
    100.0 * SUM(CASE WHEN order_date = delivered_date THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) AS same_day_delivery_pct
FROM deliveries;`;

  return {
    title: `Delivery SLA Reconciliation ${index}`,
    difficulty: "beginner",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "SLA", "CASE", "Operations"],
    estimatedMinutes: 12,
    businessContext:
      "The logistics dashboard reports same-day delivery percentage. A recent data load mixed delivered and cancelled orders, so the metric needs to be recomputed from the delivery fact table.",
    problemStatement:
      "Calculate the percentage of delivery records where order_date equals delivered_date.",
    studentTask:
      "Return one column named same_day_delivery_pct rounded to two decimal places.",
    starterCode: `SELECT COUNT(*) AS same_day_delivery_pct
FROM deliveries;`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "The denominator is all delivery records in scope, and the numerator is only orders delivered on the same date.",
    hints: COMMON_HINTS,
    tables: [
      table("deliveries", ["delivery_id", "order_date", "delivered_date", "city"], [
        [1, "2026-05-01", "2026-05-01", "Mumbai"],
        [2, "2026-05-01", "2026-05-03", "Bengaluru"],
        [3, "2026-05-02", "2026-05-02", "Delhi"],
        [4, "2026-05-02", "2026-05-04", "Pune"],
        [5, "2026-05-03", "2026-05-03", "Mumbai"]
      ])
    ]
  };
}

function buildFinanceLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `SELECT
  account_id,
  SUM(CASE WHEN transaction_type = 'credit' THEN amount ELSE -amount END) AS net_balance_change
FROM account_transactions
GROUP BY account_id
HAVING net_balance_change > 10000
ORDER BY account_id;`;

  return {
    title: `Finance Ledger Summary Drill ${index}`,
    difficulty: "intermediate",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "Finance", "CASE", "HAVING"],
    estimatedMinutes: 15,
    businessContext:
      "Finance wants accounts with unusually high net balance movement this month. Credits increase balance; debits reduce it.",
    problemStatement:
      "Compute net balance change per account and return only accounts above 10000.",
    studentTask:
      "Return account_id and net_balance_change.",
    starterCode: `SELECT account_id, SUM(amount) AS net_balance_change
FROM account_transactions
GROUP BY account_id;`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "Debits and credits must not be summed with the same sign. Use CASE to apply the correct financial direction before HAVING.",
    hints: COMMON_HINTS,
    tables: [
      table("account_transactions", ["transaction_id", "account_id", "transaction_type", "amount"], [
        [1, 301, "credit", 18000],
        [2, 301, "debit", 2500],
        [3, 302, "credit", 5000],
        [4, 302, "debit", 1200],
        [5, 303, "credit", 15000],
        [6, 303, "debit", 3000]
      ])
    ]
  };
}

function buildCommerceLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `SELECT
  p.category,
  p.product_name,
  SUM(oi.quantity * oi.unit_price) AS revenue
FROM order_items oi
JOIN products p
  ON p.product_id = oi.product_id
JOIN orders o
  ON o.order_id = oi.order_id
WHERE o.order_status = 'completed'
GROUP BY p.category, p.product_name
ORDER BY p.category, revenue DESC, p.product_name;`;

  return {
    title: `Commerce Revenue Mart Drill ${index}`,
    difficulty: "intermediate",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "Joins", "Aggregation", "E-commerce"],
    estimatedMinutes: 18,
    businessContext:
      "A daily revenue mart feeds the founder dashboard. Cancelled orders are present in the order tables and must not inflate product revenue.",
    problemStatement:
      "Calculate completed-order revenue per product and category from order_items joined to products and orders.",
    studentTask:
      "Return category, product_name, and revenue for completed orders only.",
    starterCode: `SELECT p.category, p.product_name, SUM(oi.quantity * oi.unit_price) AS revenue
FROM order_items oi
JOIN products p ON p.product_id = oi.product_id
GROUP BY p.category, p.product_name;`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "Revenue facts need the correct order-status filter. Joining to orders before aggregating prevents cancelled orders from leaking into the mart.",
    hints: COMMON_HINTS,
    tables: [
      table("orders", ["order_id", "customer_id", "order_status"], [
        [9001, 101, "completed"],
        [9002, 102, "cancelled"],
        [9003, 101, "completed"],
        [9004, 103, "completed"]
      ]),
      table("products", ["product_id", "product_name", "category"], [
        [11, "Starter Kit", "Learning"],
        [12, "Pipeline Template", "Learning"],
        [13, "Mock Interview", "Career"]
      ]),
      table("order_items", ["order_id", "product_id", "quantity", "unit_price"], [
        [9001, 11, 2, 500],
        [9001, 13, 1, 1200],
        [9002, 13, 3, 1200],
        [9003, 12, 1, 900],
        [9004, 11, 1, 500]
      ])
    ]
  };
}

function buildEducationLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `SELECT
  class_name,
  COUNT(DISTINCT student_id) AS enrolled_students
FROM class_enrollments
GROUP BY class_name
HAVING COUNT(DISTINCT student_id) >= 5
ORDER BY class_name;`;

  return {
    title: `Class Enrollment Quality Check ${index}`,
    difficulty: "beginner",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "GROUP BY", "HAVING", "Education"],
    estimatedMinutes: 12,
    businessContext:
      "An ed-tech reporting table powers course capacity planning. Duplicate enrollment events can appear after payment retries, so the report should count unique students.",
    problemStatement:
      "Find classes with at least five distinct enrolled students.",
    studentTask:
      "Return class_name and enrolled_students.",
    starterCode: `SELECT class_name, COUNT(*) AS enrolled_students
FROM class_enrollments
GROUP BY class_name;`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "Capacity reporting should count students, not events. COUNT(DISTINCT student_id) protects the metric from retry duplicates.",
    hints: COMMON_HINTS,
    tables: [
      table("class_enrollments", ["class_name", "student_id", "enrolled_at"], [
        ["SQL Basics", 1, "2026-05-01"],
        ["SQL Basics", 2, "2026-05-01"],
        ["SQL Basics", 3, "2026-05-02"],
        ["SQL Basics", 4, "2026-05-02"],
        ["SQL Basics", 5, "2026-05-03"],
        ["Spark Debugging", 6, "2026-05-01"],
        ["Spark Debugging", 6, "2026-05-01"],
        ["Spark Debugging", 7, "2026-05-02"]
      ])
    ]
  };
}

function buildDimensionLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `SELECT
  country_name,
  population,
  area_sq_km
FROM country_metrics
WHERE population >= 25000000
   OR area_sq_km >= 1000000
ORDER BY country_name;`;

  return {
    title: `Reference Data Filter Drill ${index}`,
    difficulty: "beginner",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "Filtering", "Reference Data", "Reporting"],
    estimatedMinutes: 10,
    businessContext:
      "The analytics team maintains a reference table for markets where regional dashboards should be enabled. The enablement rule is based on either population or area.",
    problemStatement:
      "Return countries that qualify as large markets by population or area.",
    studentTask:
      "Return country_name, population, and area_sq_km where population is at least 25,000,000 or area is at least 1,000,000.",
    starterCode: `SELECT country_name, population, area_sq_km
FROM country_metrics
WHERE population >= 25000000
  AND area_sq_km >= 1000000;`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "The business rule uses OR: a market qualifies if either threshold is met.",
    hints: COMMON_HINTS,
    tables: [
      table("country_metrics", ["country_name", "population", "area_sq_km"], [
        ["India", 1417000000, 3287000],
        ["Singapore", 5640000, 734],
        ["Australia", 26600000, 7692000],
        ["New Zealand", 5200000, 268000],
        ["Canada", 38900000, 9985000]
      ])
    ]
  };
}

function buildWarehouseLab(index: number): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  const solution = `SELECT
  warehouse_id,
  product_id,
  SUM(quantity_on_hand) AS available_units
FROM inventory_snapshots
WHERE snapshot_date = '2026-05-31'
GROUP BY warehouse_id, product_id
HAVING SUM(quantity_on_hand) > 0
ORDER BY warehouse_id, product_id;`;

  return {
    title: `Warehouse Snapshot Reconciliation ${index}`,
    difficulty: "intermediate",
    section: "SQL Coverage Pack",
    topicTags: ["SQL", "Aggregation", "Data Warehouse", "Inventory"],
    estimatedMinutes: 16,
    businessContext:
      "A warehouse availability table is rebuilt from multiple bin-level snapshots. The business wants current available units by warehouse and product, not by bin.",
    problemStatement:
      "Aggregate bin-level inventory for the latest snapshot date and return positive stock only.",
    studentTask:
      "Return warehouse_id, product_id, and available_units for snapshot_date 2026-05-31.",
    starterCode: `SELECT warehouse_id, product_id, quantity_on_hand AS available_units
FROM inventory_snapshots
WHERE snapshot_date = '2026-05-31';`,
    solutionCode: solution,
    expectedSql: solution,
    explanation:
      "The source grain is bin-level, while the report grain is warehouse-product. Grouping prevents duplicate-looking rows in the mart.",
    hints: COMMON_HINTS,
    tables: [
      table("inventory_snapshots", ["snapshot_date", "warehouse_id", "product_id", "bin_id", "quantity_on_hand"], [
        ["2026-05-30", "WH1", 11, "A1", 8],
        ["2026-05-31", "WH1", 11, "A1", 5],
        ["2026-05-31", "WH1", 11, "A2", 7],
        ["2026-05-31", "WH1", 12, "B1", 0],
        ["2026-05-31", "WH2", 11, "C1", 4],
        ["2026-05-31", "WH2", 13, "C2", 9]
      ])
    ]
  };
}

function enrichRecipe(
  recipe: Omit<CodingLab, "id" | "slug" | "track" | "isFree">,
  kind: string
): Omit<CodingLab, "id" | "slug" | "track" | "isFree"> {
  return {
    ...recipe,
    problemStatement: detailedProblemStatement(kind, recipe.problemStatement),
    expectedOutcome: expectedOutcome(kind),
    studentTask: detailedStudentTask(kind, recipe.studentTask),
    hints: scenarioHints(kind),
    sqlTestCases: edgeCases(kind, recipe.expectedSql)
  };
}

function detailedProblemStatement(kind: string, base: string) {
  const detailByKind: Record<string, string> = {
    profile_join:
      "The important part is coverage: the output must preserve every base customer row even when enrichment data is missing. This is a common production issue when optional dimension/profile tables arrive late.",
    workforce_rank:
      "The important part is ranking inside each group, not globally. A query that uses a global LIMIT may look correct on tiny data but fails as soon as each department needs its own leaderboard.",
    duplicate_quality:
      "The important part is normalization before grouping. Production duplicates often hide behind casing, whitespace, or NULL values, so the query must count the same key the business system treats as identical.",
    anti_join:
      "The important part is NULL-safe exclusion. In production pipelines, failed events and guest checkouts often create NULL foreign keys that can break NOT IN logic.",
    time_trend:
      "The important part is comparing a row with the previous row in time order. A static threshold is not enough when the business asks for day-over-day movement.",
    retention:
      "The important part is measuring activity relative to each user's first event date. Multiple events per day should not change the user-level retention answer.",
    engagement:
      "The important part is conditional counting. The metric should divide clicks by impressions, not by all events, and should avoid divide-by-zero failures.",
    operations:
      "The important part is building the exact SLA numerator and denominator. Counting rows alone is not a rate, and date equality must be checked per delivery.",
    finance:
      "The important part is financial sign handling. Credits and debits move balances in opposite directions, so a plain SUM(amount) can produce a dangerously wrong report.",
    commerce:
      "The important part is filtering to valid revenue before aggregation. Cancelled or non-completed orders can inflate downstream marts if the status filter is missed.",
    education:
      "The important part is counting unique students, not enrollment events. Retry events or duplicate rows should not inflate class capacity numbers.",
    dimension_reporting:
      "The important part is translating the business rule exactly. When the rule says either threshold qualifies, using AND silently removes valid records.",
    warehouse_reporting:
      "The important part is matching the output grain to the report grain. Bin-level or event-level input often needs to be aggregated before it becomes a warehouse mart."
  };

  return `${base} ${detailByKind[kind] ?? detailByKind.warehouse_reporting}`;
}

function detailedStudentTask(kind: string, base: string) {
  const edgeNoteByKind: Record<string, string> = {
    profile_join: "Your query will be tested with customers that have no profile and with orphan profile rows.",
    workforce_rank: "Your query will be tested with salary ties and departments that have fewer than two salary bands.",
    duplicate_quality: "Your query will be tested with case-only duplicates, NULL emails, and all-unique inputs.",
    anti_join: "Your query will be tested with NULL customer IDs in the fact table and customers with only cancelled orders.",
    time_trend: "Your query will be tested with equal readings, decreasing readings, and the first row in the time series.",
    retention: "Your query will be tested with users who have multiple events on day zero and users returning after more than one day.",
    engagement: "Your query will be tested with ads that have clicks, impressions, and zero-impression cases.",
    operations: "Your query will be tested with all-same-day, delayed, and mixed delivery records.",
    finance: "Your query will be tested with accounts above, below, and exactly equal to the threshold.",
    commerce: "Your query will be tested with cancelled orders and multi-line completed orders.",
    education: "Your query will be tested with duplicate enrollment rows and classes just below the threshold.",
    dimension_reporting: "Your query will be tested with rows that qualify by only one threshold.",
    warehouse_reporting: "Your query will be tested with multiple bins, zero stock, and older snapshots."
  };

  return `${base} ${edgeNoteByKind[kind] ?? edgeNoteByKind.warehouse_reporting}`;
}

function expectedOutcome(kind: string) {
  const outcomes: Record<string, string> = {
    profile_join:
      "Columns: customer_id, customer_name, city.\nGrain: one row per customer.\nBusiness rule: keep customers even when city is missing; city should be NULL when no profile exists.",
    workforce_rank:
      "Columns: department, employee_name, salary.\nGrain: one row per employee who belongs to the top two salary bands inside their department.\nBusiness rule: tied salary bands must be included.",
    duplicate_quality:
      "Columns: email, duplicate_count.\nGrain: one row per normalized duplicated email.\nBusiness rule: compare emails after LOWER(email), ignore NULL emails, and return only counts greater than one.",
    anti_join:
      "Columns: customer_id, customer_name.\nGrain: one row per customer with no completed order.\nBusiness rule: customers with cancelled/returned orders only still qualify; NULLs in orders must not break the result.",
    time_trend:
      "Columns: reading_date, temperature_c.\nGrain: one row per reading that increased compared with the previous reading date.\nBusiness rule: equal temperatures and the first reading are not increases.",
    retention:
      "Columns: user_id, first_seen_date.\nGrain: one row per retained user.\nBusiness rule: a user qualifies only if they return exactly one day after their first event date.",
    engagement:
      "Columns: ad_id, click_through_rate_pct.\nGrain: one row per ad.\nBusiness rule: CTR = clicks / impressions * 100, rounded to two decimals; zero impressions should not crash the query.",
    operations:
      "Columns: same_day_delivery_pct.\nGrain: one overall metric row.\nBusiness rule: same-day deliveries divided by all deliveries, rounded to two decimals.",
    finance:
      "Columns: account_id, net_balance_change.\nGrain: one row per account above the threshold.\nBusiness rule: credits are positive, debits are negative, and only net balance changes greater than 10000 qualify.",
    commerce:
      "Columns: category, product_name, revenue.\nGrain: one row per product/category.\nBusiness rule: revenue includes completed orders only and equals SUM(quantity * unit_price).",
    education:
      "Columns: class_name, enrolled_students.\nGrain: one row per qualifying class.\nBusiness rule: count distinct students and keep classes with at least five students.",
    dimension_reporting:
      "Columns: country_name, population, area_sq_km.\nGrain: one row per qualifying country.\nBusiness rule: a country qualifies if population OR area crosses the threshold.",
    warehouse_reporting:
      "Columns: warehouse_id, product_id, available_units.\nGrain: one row per warehouse/product on the latest snapshot date.\nBusiness rule: aggregate bin-level rows and remove zero-stock results."
  };

  return outcomes[kind] ?? outcomes.warehouse_reporting;
}

function scenarioHints(kind: string) {
  const hints: Record<string, string[]> = {
    profile_join: [
      "The customers table is the required side of the output; start from it.",
      "If a row can be missing in the enrichment table, an INNER JOIN is risky.",
      "The join should keep unmatched customers and show NULL for missing profile fields."
    ],
    workforce_rank: [
      "Do not use a global LIMIT; the ranking resets per department.",
      "Use DENSE_RANK if tied salaries should share the same salary band.",
      "Filter the ranked CTE to the top two ranks, then order the final output deterministically."
    ],
    duplicate_quality: [
      "Group by the normalized email value, not the raw email string.",
      "NULL emails should not become a fake duplicate group.",
      "HAVING is used after GROUP BY to keep only duplicate groups."
    ],
    anti_join: [
      "Avoid NOT IN when the subquery may contain NULL values.",
      "The anti-join should only look for completed orders, not all order statuses.",
      "A NOT EXISTS correlated subquery maps well to the business question: no matching completed order for this customer."
    ],
    time_trend: [
      "Use LAG to bring the previous temperature onto the current row.",
      "The previous row must be defined by reading_date ordering.",
      "The first row has no previous value, so it should not be returned."
    ],
    retention: [
      "First compute one first_seen_date per user.",
      "Then check whether that same user has an event exactly one calendar day later.",
      "Multiple events on the same day should not create duplicate retained users."
    ],
    engagement: [
      "Use CASE expressions to count clicks and impressions separately.",
      "The denominator is impressions, not total events.",
      "NULLIF protects the metric when an ad has clicks but no impressions in the test data."
    ],
    operations: [
      "The numerator is deliveries where order_date equals delivered_date.",
      "The denominator is all delivery rows in scope.",
      "Multiply by 100.0 before division so the result is a percentage, not integer division."
    ],
    finance: [
      "Assign debit amounts a negative sign before aggregation.",
      "Use HAVING because the threshold applies after account-level aggregation.",
      "The rule says greater than 10000, so exactly 10000 should not qualify."
    ],
    commerce: [
      "Join to orders so the status filter is available before revenue aggregation.",
      "Revenue should be quantity times unit price at the item grain.",
      "Cancelled orders should not contribute even if they have order_items rows."
    ],
    education: [
      "Count distinct student_id, not raw enrollment rows.",
      "The threshold is applied after grouping by class.",
      "Duplicate retry rows should not change whether a class qualifies."
    ],
    dimension_reporting: [
      "Read the rule carefully: qualifying by either threshold is enough.",
      "Use OR, not AND, between population and area rules.",
      "Keep the output columns exactly as requested."
    ],
    warehouse_reporting: [
      "The source table is at bin grain; the output should be warehouse/product grain.",
      "Filter to the required snapshot date before grouping.",
      "Use HAVING to remove products whose summed availability is zero."
    ]
  };

  return hints[kind] ?? hints.warehouse_reporting;
}

function edgeCases(kind: string, expectedSql: string): SqlTestCase[] {
  const cases: Record<string, SqlTestCase[]> = {
    profile_join: [
      sqlCase(
        "Missing and orphan profiles",
        "Ensures customers without profiles remain and orphan profile rows do not create extra output rows.",
        [
          table("customers", ["customer_id", "customer_name"], [
            [1, "Alpha Foods"],
            [2, "Beta Labs"],
            [3, "Gamma Retail"]
          ]),
          table("customer_profiles", ["customer_id", "city", "updated_at"], [
            [1, "Delhi", "2026-05-01"],
            [99, "Orphan City", "2026-05-01"]
          ])
        ],
        expectedSql
      )
    ],
    workforce_rank: [
      sqlCase(
        "Ties and small departments",
        "Checks that tied second salary bands are kept and departments with one employee still work.",
        [
          table("employees", ["employee_id", "employee_name", "department", "salary", "manager_id"], [
            [1, "Ana", "Data", 200000, null],
            [2, "Ben", "Data", 180000, 1],
            [3, "Cia", "Data", 180000, 1],
            [4, "Don", "Data", 150000, 1],
            [5, "Eli", "Security", 175000, null]
          ])
        ],
        expectedSql
      )
    ],
    duplicate_quality: [
      sqlCase(
        "NULL and case-only duplicates",
        "Checks case normalization and confirms NULL emails are ignored.",
        [
          table("crm_contacts", ["contact_id", "email", "source_system"], [
            [1, "ops@example.com", "crm"],
            [2, "OPS@example.com", "web"],
            [3, "sales@example.com", "crm"],
            [4, "Sales@example.com", "event"],
            [5, null, "manual"],
            [6, null, "manual"]
          ])
        ],
        expectedSql
      )
    ],
    anti_join: [
      sqlCase(
        "Cancelled-only customers and NULL order keys",
        "Checks customers with only cancelled orders and protects against NULL fact-table keys.",
        [
          table("customers", ["customer_id", "customer_name", "segment"], [
            [1, "Alpha", "SMB"],
            [2, "Beta", "Enterprise"],
            [3, "Gamma", "SMB"],
            [4, "Delta", "Mid Market"]
          ]),
          table("orders", ["order_id", "customer_id", "order_status", "order_date", "amount"], [
            [10, 1, "completed", "2026-05-01", 100],
            [11, 2, "cancelled", "2026-05-01", 200],
            [12, null, "completed", "2026-05-01", 300],
            [13, 4, "returned", "2026-05-01", 400]
          ])
        ],
        expectedSql
      )
    ],
    time_trend: [
      sqlCase(
        "Equal and decreasing readings",
        "Checks that only strict increases are returned.",
        [
          table("warehouse_temperature", ["reading_date", "temperature_c"], [
            ["2026-06-01", 4.0],
            ["2026-06-02", 4.0],
            ["2026-06-03", 3.8],
            ["2026-06-04", 4.2]
          ])
        ],
        expectedSql
      )
    ],
    retention: [
      sqlCase(
        "Multiple first-day events",
        "Checks users with duplicate day-zero events and users returning after more than one day.",
        [
          table("app_events", ["event_id", "user_id", "event_date", "event_name"], [
            [1, 1, "2026-06-01", "signup"],
            [2, 1, "2026-06-01", "click"],
            [3, 1, "2026-06-02", "open"],
            [4, 2, "2026-06-01", "signup"],
            [5, 2, "2026-06-03", "open"],
            [6, 3, "2026-06-05", "signup"]
          ])
        ],
        expectedSql
      )
    ],
    engagement: [
      sqlCase(
        "Zero-impression ad",
        "Checks that an ad with clicks but no impressions does not crash the query.",
        [
          table("ad_events", ["event_id", "ad_id", "event_type"], [
            [1, "ad_a", "impression"],
            [2, "ad_a", "impression"],
            [3, "ad_a", "click"],
            [4, "ad_b", "click"]
          ])
        ],
        expectedSql
      )
    ],
    operations: [
      sqlCase(
        "Mixed SLA performance",
        "Checks the rate calculation when some deliveries are same-day and some are delayed.",
        [
          table("deliveries", ["delivery_id", "order_date", "delivered_date", "city"], [
            [1, "2026-06-01", "2026-06-01", "Mumbai"],
            [2, "2026-06-01", "2026-06-02", "Mumbai"],
            [3, "2026-06-02", "2026-06-02", "Delhi"],
            [4, "2026-06-02", "2026-06-05", "Delhi"]
          ])
        ],
        expectedSql
      )
    ],
    finance: [
      sqlCase(
        "Threshold boundary",
        "Checks that exactly 10000 is excluded and debits reduce the net balance.",
        [
          table("account_transactions", ["transaction_id", "account_id", "transaction_type", "amount"], [
            [1, 1, "credit", 15000],
            [2, 1, "debit", 5000],
            [3, 2, "credit", 13000],
            [4, 2, "debit", 1000],
            [5, 3, "debit", 2000]
          ])
        ],
        expectedSql
      )
    ],
    commerce: [
      sqlCase(
        "Cancelled order leakage",
        "Checks that cancelled order_items do not inflate revenue.",
        [
          table("orders", ["order_id", "customer_id", "order_status"], [
            [1, 10, "completed"],
            [2, 11, "cancelled"],
            [3, 12, "completed"]
          ]),
          table("products", ["product_id", "product_name", "category"], [
            [1, "Data Templates", "Learning"],
            [2, "Interview Kit", "Career"]
          ]),
          table("order_items", ["order_id", "product_id", "quantity", "unit_price"], [
            [1, 1, 1, 500],
            [2, 1, 10, 500],
            [3, 2, 2, 1000]
          ])
        ],
        expectedSql
      )
    ],
    education: [
      sqlCase(
        "Duplicate enrollment retries",
        "Checks that duplicate student rows do not push a class over the threshold.",
        [
          table("class_enrollments", ["class_name", "student_id", "enrolled_at"], [
            ["Warehouse SQL", 1, "2026-06-01"],
            ["Warehouse SQL", 2, "2026-06-01"],
            ["Warehouse SQL", 3, "2026-06-01"],
            ["Warehouse SQL", 4, "2026-06-01"],
            ["Warehouse SQL", 4, "2026-06-01"],
            ["Airflow Debugging", 5, "2026-06-01"],
            ["Airflow Debugging", 6, "2026-06-01"],
            ["Airflow Debugging", 7, "2026-06-01"],
            ["Airflow Debugging", 8, "2026-06-01"],
            ["Airflow Debugging", 9, "2026-06-01"]
          ])
        ],
        expectedSql
      )
    ],
    dimension_reporting: [
      sqlCase(
        "Either-threshold qualification",
        "Checks rows that qualify by population only and area only.",
        [
          table("country_metrics", ["country_name", "population", "area_sq_km"], [
            ["LargePopSmallArea", 30000000, 90000],
            ["SmallPopLargeArea", 3000000, 2000000],
            ["SmallBoth", 3000000, 90000]
          ])
        ],
        expectedSql
      )
    ],
    warehouse_reporting: [
      sqlCase(
        "Zero stock and older snapshots",
        "Checks aggregation by bin, latest-date filtering, and zero-stock removal.",
        [
          table("inventory_snapshots", ["snapshot_date", "warehouse_id", "product_id", "bin_id", "quantity_on_hand"], [
            ["2026-05-30", "WH1", 1, "A", 99],
            ["2026-05-31", "WH1", 1, "A", 2],
            ["2026-05-31", "WH1", 1, "B", 3],
            ["2026-05-31", "WH1", 2, "C", 0],
            ["2026-05-31", "WH2", 3, "D", 7]
          ])
        ],
        expectedSql
      )
    ]
  };

  return cases[kind] ?? cases.warehouse_reporting;
}

function buildLabFromCandidate(candidate: Candidate, index: number): CodingLab {
  const kind = classification(candidate.title);
  const baseRecipe =
    kind === "profile_join" ? buildProfileJoinLab(index) :
    kind === "duplicate_quality" ? buildDuplicateLab(index) :
    kind === "anti_join" ? buildAntiJoinLab(index) :
    kind === "workforce_rank" ? buildWorkforceLab(index) :
    kind === "time_trend" ? buildTrendLab(index) :
    kind === "retention" ? buildRetentionLab(index) :
    kind === "engagement" ? buildEngagementLab(index) :
    kind === "operations" ? buildOperationsLab(index) :
    kind === "finance" ? buildFinanceLab(index) :
    kind === "commerce" ? buildCommerceLab(index) :
    kind === "education" ? buildEducationLab(index) :
    kind === "dimension_reporting" ? buildDimensionLab(index) :
    buildWarehouseLab(index);

  const recipe = enrichRecipe(baseRecipe, kind);
  const title = uniqueLabTitle(candidate.title, kind, index);

  return {
    ...recipe,
    id: `sql-coverage-${String(index).padStart(3, "0")}`,
    slug: `sql-coverage-${String(index).padStart(3, "0")}-${slugify(title)}`,
    track: "sql",
    title,
    isFree: index <= 30 || recipe.difficulty === "beginner"
  };
}

function uniqueLabTitle(title: string, kind: string, index: number) {
  const titlePools: Record<string, string[]> = {
    profile_join: [
      "CRM Profile Backfill Coverage",
      "Customer City Enrichment Export",
      "Late Profile Dimension Join",
      "Account Master Optional Enrichment",
      "Missing Profile Preservation Check",
      "Customer 360 Left Join Audit"
    ],
    workforce_rank: [
      "Department Salary Band Leaderboard",
      "Compensation Dashboard Tie Handling",
      "Team Pay Ranking Reconciliation",
      "Manager Org Salary Snapshot",
      "HR Leaderboard Window Function",
      "Payroll Top-Band Audit"
    ],
    duplicate_quality: [
      "CRM Email Duplicate Cleanup",
      "Case-Normalized Contact Audit",
      "Marketing Sync Duplicate Detector",
      "Lead Deduplication Quality Check",
      "Contact Identity Collision Report",
      "Duplicate Subscriber Investigation"
    ],
    anti_join: [
      "Dormant Customer Activation List",
      "Completed-Order Coverage Gap",
      "NULL-Safe Customer Anti-Join",
      "No-Purchase Customer Segment",
      "Order Absence Reconciliation",
      "CRM Reactivation Candidate Pull"
    ],
    time_trend: [
      "Cold Storage Temperature Increase",
      "IoT Sensor Day-over-Day Alert",
      "Warehouse Climate Trend Check",
      "Rising Reading Detection",
      "Daily Sensor Movement Report",
      "Operations Temperature Drift Audit"
    ],
    retention: [
      "Next-Day Product Retention",
      "First Activity Return Check",
      "Activation Cohort Follow-up",
      "User Day-One Retention Audit",
      "App Event Retention Rebuild",
      "New User Return Signal"
    ],
    engagement: [
      "Ad CTR Metric Rebuild",
      "Campaign Click-Through Audit",
      "Impression Denominator Check",
      "Engagement Rate Quality Drill",
      "Marketing Event Metric Fix",
      "Zero-Impression CTR Guardrail"
    ],
    operations: [
      "Same-Day Delivery SLA Metric",
      "Logistics Promise Reconciliation",
      "Delivery Date Quality Audit",
      "Fulfillment SLA Rate Rebuild",
      "Ops Dashboard Delivery Check",
      "Shipment Timeliness Metric"
    ],
    finance: [
      "Signed Ledger Balance Movement",
      "Debit Credit Netting Drill",
      "Finance Threshold Reconciliation",
      "Account Movement Exception Report",
      "Monthly Ledger Direction Check",
      "High-Value Balance Change Audit"
    ],
    commerce: [
      "Completed-Order Revenue Mart",
      "Cancelled Order Leakage Check",
      "Product Revenue Grain Audit",
      "E-commerce Item Revenue Rebuild",
      "Founder Dashboard Revenue Fix",
      "Order Status Revenue Guardrail"
    ],
    education: [
      "Distinct Enrollment Threshold",
      "Course Capacity Dedup Check",
      "Student Count Retry Guardrail",
      "Class Enrollment Quality Report",
      "Learning Platform Capacity Audit",
      "Unique Student Rollup Drill"
    ],
    dimension_reporting: [
      "Market Eligibility Rule Check",
      "Reference Dimension Filter Audit",
      "Country Threshold Logic Fix",
      "OR Rule Reporting Drill",
      "Regional Enablement Filter",
      "Dimension Qualification Extract"
    ],
    warehouse_reporting: [
      "Inventory Snapshot Grain Fix",
      "Warehouse Product Availability",
      "Bin-Level Stock Rollup",
      "Zero-Stock Snapshot Reconciliation",
      "Current Inventory Mart Rebuild",
      "Warehouse Availability Guardrail"
    ]
  };

  const pool = titlePools[kind] ?? titlePools.warehouse_reporting;
  const base = pool[(index - 1) % pool.length];
  const concept = practiceLabel(title, kind).replace(/\s+Drill$/, "").replace(/\s+Audit$/, "");
  return `${base}: ${concept} ${index}`;
}

function practiceLabel(title: string, kind: string) {
  const lower = title.toLowerCase();

  if (/combine|join/.test(lower)) return "Profile Enrichment Join Drill";
  if (/second|nth|top|rank|highest|salary/.test(lower)) return "Department Salary Ranking Drill";
  if (/manager|report/.test(lower)) return "Manager Hierarchy Exception Drill";
  if (/bonus/.test(lower)) return "Bonus Eligibility Rule Drill";
  if (/duplicate|email/.test(lower)) return "Case-Normalized Duplicate Detection";
  if (/never order|no sales|missing|not.*order/.test(lower)) return "NULL-Safe Missing Activity Audit";
  if (/temperature|weather|rising/.test(lower)) return "Day-over-Day Sensor Trend Drill";
  if (/game play|login|activity|session|retention|active/.test(lower)) {
    return "First Activity Retention Drill";
  }
  if (/ads|question|comment|post|article|views|rate|percentage/.test(lower)) {
    return "Conditional Engagement Metric Drill";
  }
  if (/delivery|food|restaurant|bus|trip|travel/.test(lower)) return "Operations SLA Metric Drill";
  if (/transaction|bank|account|investment|capital|npv|invest/.test(lower)) {
    return "Signed Finance Ledger Drill";
  }
  if (/product|sales|sold|price|orders|customer|purchase|market|revenue/.test(lower)) {
    return "Completed-Order Revenue Drill";
  }
  if (/student|class|exam|grade|school/.test(lower)) return "Distinct Enrollment Threshold Drill";
  if (/country|countries|movie|cinema|users|calls|friend|follower/.test(lower)) {
    return "Reference Dimension Filter Drill";
  }

  if (kind === "workforce_rank") return "Workforce Ranking Drill";
  if (kind === "anti_join") return "Missing Record Anti-Join Drill";
  if (kind === "commerce") return "Commerce Aggregation Drill";
  if (kind === "engagement") return "Engagement Reporting Drill";
  return "Warehouse Grain Reconciliation Drill";
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function main() {
  const candidates = await collectCandidates();
  const labs = candidates.map((candidate, index) => buildLabFromCandidate(candidate, index + 1));

  const frontendPath = path.join(ROOT, "frontend", "data", "public-sql-practice.generated.json");
  const rootDataPath = path.join(ROOT, "data", "public-sql-practice.generated.json");

  writeJson(frontendPath, labs);
  writeJson(rootDataPath, labs);

  console.log(`Read ${candidates.length} unique public SQL coverage titles.`);
  console.log(`Wrote ${labs.length} original Data Foundry SQL labs.`);
  console.log(frontendPath);
  console.log(rootDataPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
