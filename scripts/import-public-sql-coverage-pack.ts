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
  "Start by identifying the grain of the output: one row per customer, day, product, employee, or group.",
  "Write the smallest correct query first, then add ordering, tie handling, and NULL handling.",
  "Check whether a JOIN, GROUP BY, or window function changes the row count in a way the business would notice."
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

function buildLabFromCandidate(candidate: Candidate, index: number): CodingLab {
  const kind = classification(candidate.title);
  const recipe =
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

  const title = `${practiceLabel(candidate.title, kind)} ${index}`;

  return {
    ...recipe,
    id: `sql-coverage-${String(index).padStart(3, "0")}`,
    slug: `sql-coverage-${String(index).padStart(3, "0")}-${slugify(title)}`,
    track: "sql",
    title,
    isFree: index <= 30 || recipe.difficulty === "beginner"
  };
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
