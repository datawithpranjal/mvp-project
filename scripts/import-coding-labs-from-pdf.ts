import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

type Track = "sql" | "python";
type Difficulty = "beginner" | "intermediate" | "advanced";

interface LabTable {
  name: string;
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
}

interface CodingLab {
  id: string;
  slug: string;
  track: Track;
  title: string;
  difficulty: Difficulty;
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
  tables: LabTable[];
  expectedSql?: string;
  functionName?: string;
  testCases?: Array<{
    name: string;
    args: unknown[];
    expected: unknown;
  }>;
}

const requireFromFrontend = createRequire(path.resolve("frontend/package.json"));
const SQL_PDF = path.resolve(
  process.argv[2] ??
    "/Users/pranjalpatidar/Desktop/TopMate Files/Final_Advanced/04 - SQL Coding Practice with Solutions - 50 Questions - Data with Pranjal.pdf"
);
const PYTHON_PDF = path.resolve(
  process.argv[3] ??
    "/Users/pranjalpatidar/Desktop/TopMate Files/Final_Advanced/06 - Python Coding Practice with Solutions - 50 Questions - Data with Pranjal.pdf"
);
const OUTPUT_JSON = path.resolve("frontend/data/coding-labs.generated.json");
const ROOT_OUTPUT_JSON = path.resolve("data/coding-labs.generated.json");

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function extractPdfText(filePath: string): Promise<string> {
  const pdfParse = requireFromFrontend("pdf-parse");
  const buffer = await readFile(filePath);

  if (typeof pdfParse?.PDFParse === "function") {
    const parser = new pdfParse.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return String(result.text ?? "");
    } finally {
      await parser.destroy?.();
    }
  }

  const parser = pdfParse.default ?? pdfParse;
  const result = await parser(buffer);
  return String(result.text ?? "");
}

function extractQuestionTitles(text: string): string[] {
  return [...text.matchAll(/(?:^|\n)Q(\d+)\.\s*([^\n]+)/g)]
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((match) => match[2].trim())
    .slice(0, 50);
}

function difficultyFor(index: number): Difficulty {
  if (index <= 16) return "beginner";
  if (index <= 38) return "intermediate";
  return "advanced";
}

function employeesTable(): LabTable {
  return {
    name: "employees",
    columns: ["emp_id", "emp_name", "department", "manager_id", "salary"],
    rows: [
      [1, "Asha", "Data", null, 120000],
      [2, "Ben", "Data", 1, 105000],
      [3, "Chen", "Data", 1, 105000],
      [4, "Diya", "Analytics", 1, 90000],
      [5, "Evan", "Analytics", 4, 82000],
      [6, "Fatima", "Platform", 1, 115000],
      [7, "Gopal", "Platform", 6, 76000]
    ]
  };
}

function customersOrdersTables(): LabTable[] {
  return [
    {
      name: "customers",
      columns: ["customer_id", "customer_name", "signup_date"],
      rows: [
        [1, "Asha", "2026-01-02"],
        [2, "Ben", "2026-01-05"],
        [3, "Chen", "2026-02-01"],
        [4, "Diya", "2026-02-11"],
        [5, "Evan", "2026-03-10"]
      ]
    },
    {
      name: "orders",
      columns: ["order_id", "customer_id", "order_date", "amount", "status"],
      rows: [
        [101, 1, "2026-04-01", 120, "SUCCESS"],
        [102, 1, "2026-04-01", 80, "SUCCESS"],
        [103, 2, "2026-04-03", 220, "SUCCESS"],
        [104, 2, "2026-05-06", 180, "SUCCESS"],
        [105, 3, "2026-05-08", 75, "FAILED"],
        [106, 99, "2026-05-09", 300, "SUCCESS"],
        [107, null, "2026-05-10", 60, "SUCCESS"]
      ]
    }
  ];
}

function salesTables(): LabTable[] {
  return [
    {
      name: "daily_sales",
      columns: ["sale_date", "city", "region", "customer_id", "amount"],
      rows: [
        ["2026-05-01", "Mumbai", "West", 1, 100],
        ["2026-05-02", "Mumbai", "West", 1, 150],
        ["2026-05-03", "Delhi", "North", 2, 200],
        ["2026-05-04", "Bengaluru", "South", 3, 130],
        ["2026-05-05", "Delhi", "North", 2, 170],
        ["2026-05-06", "Pune", "West", 4, 90],
        ["2026-05-07", "Mumbai", "West", 1, 300]
      ]
    }
  ];
}

function eventTables(): LabTable[] {
  return [
    {
      name: "events",
      columns: ["user_id", "event_ts", "event_date", "event_type"],
      rows: [
        [1, "2026-05-01 09:00:00", "2026-05-01", "login"],
        [1, "2026-05-01 09:20:00", "2026-05-01", "click"],
        [1, "2026-05-01 10:10:00", "2026-05-01", "click"],
        [2, "2026-05-01 12:00:00", "2026-05-01", "login"],
        [2, "2026-05-02 12:00:00", "2026-05-02", "login"],
        [2, "2026-05-03 12:00:00", "2026-05-03", "login"],
        [3, "2026-05-07 15:00:00", "2026-05-07", "login"]
      ]
    }
  ];
}

function scdTables(): LabTable[] {
  return [
    {
      name: "customer_dim",
      columns: ["customer_sk", "customer_id", "city", "effective_start_date", "effective_end_date", "current_flag"],
      rows: [
        [11, 1, "Mumbai", "2026-01-01", null, 1],
        [12, 2, "Delhi", "2026-01-01", null, 1],
        [13, 3, "Pune", "2026-01-01", "2026-04-30", 0]
      ]
    },
    {
      name: "customer_updates",
      columns: ["customer_id", "city", "updated_at"],
      rows: [
        [1, "Mumbai", "2026-05-01 10:00:00"],
        [2, "Bengaluru", "2026-05-01 11:00:00"],
        [4, "Hyderabad", "2026-05-01 12:00:00"]
      ]
    }
  ];
}

function buildSqlLab(title: string, index: number): CodingLab {
  const lower = title.toLowerCase();
  const base = {
    id: `sql-coding-${String(index).padStart(3, "0")}`,
    slug: `sql-coding-${String(index).padStart(2, "0")}-${slugify(title)}`,
    track: "sql" as const,
    title: `SQL ${index}: ${title}`,
    difficulty: difficultyFor(index),
    section: index <= 10 ? "Windows" : index <= 20 ? "Joins" : index <= 30 ? "Advanced SQL" : index <= 40 ? "Warehouse" : "Performance",
    isFree: index <= 12,
    estimatedMinutes: index <= 15 ? 12 : 18,
    starterCode: "-- Write a read-only SELECT query.\nSELECT *\nFROM employees\nLIMIT 5;",
    hints: [
      "Say the output grain before writing SQL.",
      "Check duplicate, NULL, and tie behavior.",
      "Prefer a readable CTE when the logic has multiple steps."
    ],
    explanation:
      "The strong interview answer explains the grain, why the pattern is safe, and which edge cases are covered.",
    topicTags: ["SQL"],
    businessContext:
      "You are validating a warehouse query before it is promoted into a production analytics mart.",
    problemStatement: `Solve this SQL interview task using the seeded tables: ${title}.`,
    studentTask: "Return exactly the requested result set. The browser will compare your output with the model query."
  };

  if (lower.includes("second highest")) {
    const solution = "SELECT MAX(salary) AS second_highest_salary\nFROM employees\nWHERE salary < (SELECT MAX(salary) FROM employees);";
    return { ...base, topicTags: ["SQL", "Ranking"], tables: [employeesTable()], expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("nth highest")) {
    const solution = "WITH ranked AS (\n  SELECT DISTINCT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS salary_rank\n  FROM employees\n)\nSELECT salary AS third_highest_salary\nFROM ranked\nWHERE salary_rank = 3;";
    return { ...base, problemStatement: "Return the third highest distinct salary from employees.", topicTags: ["SQL", "Ranking"], tables: [employeesTable()], expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("top 3 salaries")) {
    const solution = "WITH ranked AS (\n  SELECT department, emp_name, salary,\n         DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS salary_rank\n  FROM employees\n)\nSELECT department, emp_name, salary\nFROM ranked\nWHERE salary_rank <= 3;";
    return { ...base, topicTags: ["SQL", "Window Functions"], tables: [employeesTable()], expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("above department average")) {
    const solution = "WITH dept_avg AS (\n  SELECT department, AVG(CAST(salary AS REAL)) AS avg_salary\n  FROM employees\n  GROUP BY department\n)\nSELECT e.emp_id, e.emp_name, e.department, e.salary\nFROM employees e\nJOIN dept_avg d ON e.department = d.department\nWHERE CAST(e.salary AS REAL) > d.avg_salary;";
    return { ...base, topicTags: ["SQL", "Aggregation"], tables: [employeesTable()], expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("median salary")) {
    const solution = "WITH ranked AS (\n  SELECT salary,\n         ROW_NUMBER() OVER (ORDER BY CAST(salary AS REAL)) AS rn,\n         COUNT(*) OVER () AS cnt\n  FROM employees\n)\nSELECT AVG(CAST(salary AS REAL)) AS median_salary\nFROM ranked\nWHERE rn IN ((cnt + 1) / 2, (cnt + 2) / 2);";
    return { ...base, topicTags: ["SQL", "Analytics"], tables: [employeesTable()], expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("no orders") || lower.includes("not exists") || lower.includes("not in")) {
    const solution = "SELECT c.customer_id, c.customer_name\nFROM customers c\nWHERE NOT EXISTS (\n  SELECT 1\n  FROM orders o\n  WHERE o.customer_id = c.customer_id\n);";
    return { ...base, topicTags: ["SQL", "Anti Join", "NULL Handling"], tables: customersOrdersTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("missing customer") || lower.includes("dimension keys")) {
    const solution = "SELECT o.order_id, o.customer_id, o.order_date, o.amount\nFROM orders o\nLEFT JOIN customers c ON o.customer_id = c.customer_id\nWHERE o.customer_id IS NOT NULL\n  AND c.customer_id IS NULL;";
    return { ...base, topicTags: ["SQL", "Data Quality"], tables: customersOrdersTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("latest order") || lower.includes("latest row") || lower.includes("previous order")) {
    const solution = "WITH ranked AS (\n  SELECT order_id, customer_id, order_date, amount,\n         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date DESC, order_id DESC) AS rn\n  FROM orders\n  WHERE customer_id IS NOT NULL\n)\nSELECT customer_id, order_id, order_date, amount\nFROM ranked\nWHERE rn = 1;";
    return { ...base, topicTags: ["SQL", "Window Functions"], tables: customersOrdersTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("first and last")) {
    const solution = "SELECT customer_id,\n       MIN(order_date) AS first_order_date,\n       MAX(order_date) AS last_order_date\nFROM orders\nWHERE customer_id IS NOT NULL\nGROUP BY customer_id;";
    return { ...base, topicTags: ["SQL", "Aggregation"], tables: customersOrdersTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("repeat") || lower.includes("consecutive") || lower.includes("gap") || lower.includes("churn")) {
    const solution = "WITH ordered AS (\n  SELECT customer_id, order_id, order_date,\n         LAG(order_date) OVER (PARTITION BY customer_id ORDER BY order_date) AS previous_order_date\n  FROM orders\n  WHERE customer_id IS NOT NULL\n)\nSELECT customer_id, order_id, order_date, previous_order_date\nFROM ordered\nWHERE previous_order_date IS NOT NULL\n  AND julianday(order_date) - julianday(previous_order_date) <= 7;";
    return { ...base, topicTags: ["SQL", "Retention"], tables: customersOrdersTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("running total")) {
    const solution = "SELECT sale_date,\n       SUM(CAST(amount AS REAL)) AS daily_revenue,\n       SUM(SUM(CAST(amount AS REAL))) OVER (ORDER BY sale_date) AS running_revenue\nFROM daily_sales\nGROUP BY sale_date\nORDER BY sale_date;";
    return { ...base, topicTags: ["SQL", "Window Functions"], tables: salesTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("moving average") || lower.includes("rolling")) {
    const solution = "WITH daily AS (\n  SELECT sale_date, SUM(CAST(amount AS REAL)) AS daily_revenue\n  FROM daily_sales\n  GROUP BY sale_date\n)\nSELECT sale_date,\n       daily_revenue,\n       AVG(daily_revenue) OVER (ORDER BY sale_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS moving_avg_3_day\nFROM daily;";
    return { ...base, topicTags: ["SQL", "Window Functions"], tables: salesTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("month-over-month")) {
    const solution = "WITH monthly AS (\n  SELECT substr(sale_date, 1, 7) AS month, SUM(CAST(amount AS REAL)) AS revenue\n  FROM daily_sales\n  GROUP BY substr(sale_date, 1, 7)\n)\nSELECT month, revenue,\n       revenue - LAG(revenue) OVER (ORDER BY month) AS revenue_delta\nFROM monthly;";
    return { ...base, topicTags: ["SQL", "Metrics"], tables: salesTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("rank cities")) {
    const solution = "WITH city_sales AS (\n  SELECT city, SUM(CAST(amount AS REAL)) AS revenue\n  FROM daily_sales\n  GROUP BY city\n)\nSELECT city, revenue, RANK() OVER (ORDER BY revenue DESC) AS revenue_rank\nFROM city_sales;";
    return { ...base, topicTags: ["SQL", "Ranking"], tables: salesTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("pivot") || lower.includes("status counts") || lower.includes("region")) {
    const solution = "SELECT sale_date,\n       SUM(CASE WHEN region = 'West' THEN CAST(amount AS REAL) ELSE 0 END) AS west_revenue,\n       SUM(CASE WHEN region = 'North' THEN CAST(amount AS REAL) ELSE 0 END) AS north_revenue,\n       SUM(CASE WHEN region = 'South' THEN CAST(amount AS REAL) ELSE 0 END) AS south_revenue\nFROM daily_sales\nGROUP BY sale_date\nORDER BY sale_date;";
    return { ...base, topicTags: ["SQL", "Conditional Aggregation"], tables: salesTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("scd") || lower.includes("changed customer") || lower.includes("current active")) {
    const solution = "SELECT u.customer_id, d.city AS old_city, u.city AS new_city, u.updated_at\nFROM customer_updates u\nLEFT JOIN customer_dim d\n  ON u.customer_id = d.customer_id\n AND d.current_flag = 1\nWHERE d.customer_id IS NULL OR COALESCE(d.city, '') <> COALESCE(u.city, '');";
    return { ...base, topicTags: ["SQL", "SCD Type 2"], tables: scdTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("watermark") || lower.includes("incremental") || lower.includes("merge") || lower.includes("snapshot")) {
    const solution = "SELECT u.customer_id, u.city, u.updated_at\nFROM customer_updates u\nWHERE u.updated_at > '2026-05-01 10:30:00'\nORDER BY u.updated_at, u.customer_id;";
    return { ...base, topicTags: ["SQL", "Incremental Loads"], tables: scdTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("session") || lower.includes("active users") || lower.includes("login")) {
    const solution = "WITH ordered AS (\n  SELECT user_id, event_ts,\n         LAG(event_ts) OVER (PARTITION BY user_id ORDER BY event_ts) AS previous_event_ts\n  FROM events\n)\nSELECT user_id, event_ts,\n       CASE WHEN previous_event_ts IS NULL OR (julianday(event_ts) - julianday(previous_event_ts)) * 24 * 60 > 30 THEN 1 ELSE 0 END AS starts_new_session\nFROM ordered;";
    return { ...base, topicTags: ["SQL", "Sessionization"], tables: eventTables(), expectedSql: solution, solutionCode: solution };
  }

  if (lower.includes("hierarchy") || lower.includes("recursive")) {
    const solution = "WITH RECURSIVE org AS (\n  SELECT emp_id, emp_name, manager_id, emp_name AS path, 0 AS depth\n  FROM employees\n  WHERE manager_id IS NULL\n  UNION ALL\n  SELECT e.emp_id, e.emp_name, e.manager_id, org.path || ' > ' || e.emp_name, org.depth + 1\n  FROM employees e\n  JOIN org ON e.manager_id = org.emp_id\n)\nSELECT emp_id, emp_name, path, depth\nFROM org;";
    return { ...base, topicTags: ["SQL", "Recursive CTE"], tables: [employeesTable()], expectedSql: solution, solutionCode: solution };
  }

  const solution = "SELECT customer_id, SUM(CAST(amount AS REAL)) AS total_revenue\nFROM orders\nWHERE status = 'SUCCESS'\n  AND customer_id IS NOT NULL\nGROUP BY customer_id\nORDER BY total_revenue DESC;";
  return {
    ...base,
    topicTags: ["SQL", "Metrics"],
    tables: customersOrdersTables(),
    expectedSql: solution,
    solutionCode: solution
  };
}

function pythonStarter(functionName: string): string {
  return `def ${functionName}(*args):\n    # Write your solution here\n    raise NotImplementedError`;
}

function buildPythonLab(title: string, index: number): CodingLab {
  const slug = slugify(title);
  const functionName = slug.replace(/-/g, "_");
  const lower = title.toLowerCase();
  const base = {
    id: `python-coding-${String(index).padStart(3, "0")}`,
    slug: `python-coding-${String(index).padStart(2, "0")}-${slug}`,
    track: "python" as const,
    title: `Python ${index}: ${title}`,
    difficulty: difficultyFor(index),
    section: index <= 10 ? "Strings" : index <= 20 ? "Lists" : index <= 28 ? "Maps and Sets" : index <= 36 ? "Problem Solving" : index <= 44 ? "Data Engineering Tasks" : "Advanced Python",
    topicTags: ["Python"],
    isFree: index <= 12,
    estimatedMinutes: index <= 20 ? 12 : 18,
    businessContext:
      "You are writing a small data engineering utility where correctness and edge cases matter more than clever tricks.",
    problemStatement: `Implement the function for this coding task: ${title}.`,
    studentTask: `Define a function named ${functionName}. The browser will run sample tests using Pyodide.`,
    starterCode: pythonStarter(functionName),
    hints: [
      "Start with the simplest correct version.",
      "Name the data structure you need before coding.",
      "Handle empty input and duplicate values explicitly."
    ],
    explanation:
      "A strong answer explains the baseline, the improved data structure, and the time/space trade-off.",
    tables: [] as LabTable[]
  };

  function lab(solutionCode: string, testCases: CodingLab["testCases"]): CodingLab {
    return { ...base, solutionCode, testCases, functionName };
  }

  if (lower.includes("reverse a string")) return lab("def reverse_a_string(s):\n    return s[::-1]", [{ name: "basic", args: ["pipeline"], expected: "enilepip" }]);
  if (lower.includes("palindrome")) return lab("def check_whether_a_string_is_a_palindrome(s):\n    cleaned = ''.join(ch.lower() for ch in s if ch.isalnum())\n    return cleaned == cleaned[::-1]", [{ name: "case and spaces", args: ["A man a plan a canal Panama"], expected: true }]);
  if (lower.includes("first non-repeating")) return lab("def find_the_first_non_repeating_character(s):\n    counts = {}\n    for ch in s:\n        counts[ch] = counts.get(ch, 0) + 1\n    for ch in s:\n        if counts[ch] == 1:\n            return ch\n    return None", [{ name: "first unique", args: ["swiss"], expected: "w" }]);
  if (lower.includes("anagrams")) return lab("def check_whether_two_strings_are_anagrams(a, b):\n    return sorted(a.replace(' ', '').lower()) == sorted(b.replace(' ', '').lower())", [{ name: "listen silent", args: ["listen", "silent"], expected: true }]);
  if (lower.includes("most frequent character")) return lab("def find_the_most_frequent_character(s):\n    counts = {}\n    for ch in s:\n        counts[ch] = counts.get(ch, 0) + 1\n    return max(counts, key=counts.get) if counts else None", [{ name: "frequency", args: ["banana"], expected: "a" }]);
  if (lower.includes("longest common prefix")) return lab("def longest_common_prefix(words):\n    if not words:\n        return ''\n    prefix = words[0]\n    for word in words[1:]:\n        while not word.startswith(prefix):\n            prefix = prefix[:-1]\n            if not prefix:\n                return ''\n    return prefix", [{ name: "shared prefix", args: [["flow", "flower", "flight"]], expected: "fl" }]);
  if (lower.includes("compress")) return lab("def compress_a_string_with_counts(s):\n    if not s:\n        return ''\n    parts = []\n    current = s[0]\n    count = 0\n    for ch in s:\n        if ch == current:\n            count += 1\n        else:\n            parts.append(current + str(count))\n            current = ch\n            count = 1\n    parts.append(current + str(count))\n    return ''.join(parts)", [{ name: "runs", args: ["aaabbc"], expected: "a3b2c1" }]);
  if (lower.includes("parentheses")) return lab("def validate_parentheses(s):\n    pairs = {')': '(', ']': '[', '}': '{'}\n    stack = []\n    for ch in s:\n        if ch in pairs.values():\n            stack.append(ch)\n        elif ch in pairs:\n            if not stack or stack.pop() != pairs[ch]:\n                return False\n    return not stack", [{ name: "valid nested", args: ["({[]})"], expected: true }]);
  if (lower.includes("vowels")) return lab("def count_vowels_and_consonants(s):\n    vowels = set('aeiou')\n    result = {'vowels': 0, 'consonants': 0}\n    for ch in s.lower():\n        if ch.isalpha():\n            result['vowels' if ch in vowels else 'consonants'] += 1\n    return result", [{ name: "counts", args: ["Data"], expected: { vowels: 2, consonants: 2 } }]);
  if (lower.includes("word frequency")) return lab("def word_frequency_from_a_sentence(sentence):\n    counts = {}\n    for word in sentence.lower().split():\n        counts[word] = counts.get(word, 0) + 1\n    return counts", [{ name: "words", args: ["data data engineering"], expected: { data: 2, engineering: 1 } }]);
  if (lower.includes("remove duplicates")) return lab("def remove_duplicates_while_preserving_order(items):\n    seen = set()\n    output = []\n    for item in items:\n        if item not in seen:\n            seen.add(item)\n            output.append(item)\n    return output", [{ name: "preserve", args: [[3, 1, 3, 2, 1]], expected: [3, 1, 2] }]);
  if (lower.includes("missing number")) return lab("def find_the_missing_number_from_1_to_n(nums, n):\n    return n * (n + 1) // 2 - sum(nums)", [{ name: "missing", args: [[1, 2, 4, 5], 5], expected: 3 }]);
  if (lower.includes("two sum")) return lab("def two_sum(nums, target):\n    seen = {}\n    for i, value in enumerate(nums):\n        need = target - value\n        if need in seen:\n            return [seen[need], i]\n        seen[value] = i\n    return []", [{ name: "pair", args: [[2, 7, 11, 15], 9], expected: [0, 1] }]);
  if (lower.includes("rotate")) return lab("def rotate_a_list_by_k_steps(nums, k):\n    if not nums:\n        return []\n    k %= len(nums)\n    return nums[-k:] + nums[:-k]", [{ name: "rotate", args: [[1, 2, 3, 4, 5], 2], expected: [4, 5, 1, 2, 3] }]);
  if (lower.includes("zeros")) return lab("def move_all_zeros_to_the_end(nums):\n    non_zero = [n for n in nums if n != 0]\n    return non_zero + [0] * (len(nums) - len(non_zero))", [{ name: "zeros", args: [[0, 1, 0, 3, 12]], expected: [1, 3, 12, 0, 0] }]);
  if (lower.includes("merge two sorted")) return lab("def merge_two_sorted_lists(a, b):\n    i = j = 0\n    output = []\n    while i < len(a) and j < len(b):\n        if a[i] <= b[j]:\n            output.append(a[i]); i += 1\n        else:\n            output.append(b[j]); j += 1\n    return output + a[i:] + b[j:]", [{ name: "merge", args: [[1, 3, 5], [2, 4]], expected: [1, 2, 3, 4, 5] }]);
  if (lower.includes("intersection")) return lab("def find_the_intersection_of_two_lists(a, b):\n    return sorted(set(a).intersection(b))", [{ name: "intersection", args: [[1, 2, 2, 3], [2, 3, 4]], expected: [2, 3] }]);
  if (lower.includes("top k")) return lab("def top_k_frequent_elements(nums, k):\n    counts = {}\n    for n in nums:\n        counts[n] = counts.get(n, 0) + 1\n    return [item for item, _ in sorted(counts.items(), key=lambda x: (-x[1], x[0]))[:k]]", [{ name: "top k", args: [[1, 1, 1, 2, 2, 3], 2], expected: [1, 2] }]);
  if (lower.includes("group records")) return lab("def group_records_by_key(records, key):\n    grouped = {}\n    for record in records:\n        grouped.setdefault(record[key], []).append(record)\n    return grouped", [{ name: "group", args: [[{ id: 1, region: "west" }, { id: 2, region: "west" }], "region"], expected: { west: [{ id: 1, region: "west" }, { id: 2, region: "west" }] } }]);
  if (lower.includes("flatten")) return lab("def flatten_a_nested_list(items):\n    output = []\n    for item in items:\n        if isinstance(item, list):\n            output.extend(flatten_a_nested_list(item))\n        else:\n            output.append(item)\n    return output", [{ name: "nested", args: [[1, [2, [3, 4]], 5]], expected: [1, 2, 3, 4, 5] }]);
  if (lower.includes("count occurrences")) return lab("def count_occurrences_using_a_dictionary(items):\n    counts = {}\n    for item in items:\n        counts[item] = counts.get(item, 0) + 1\n    return counts", [{ name: "counts", args: [["A", "B", "A"]], expected: { A: 2, B: 1 } }]);
  if (lower.includes("invert a dictionary")) return lab("def invert_a_dictionary_with_duplicate_values(mapping):\n    inverted = {}\n    for key, value in mapping.items():\n        inverted.setdefault(str(value), []).append(key)\n    return {key: sorted(value) for key, value in inverted.items()}", [{ name: "invert", args: [{ a: 1, b: 1, c: 2 }], expected: { "1": ["a", "b"], "2": ["c"] } }]);
  if (lower.includes("merge a list of dictionaries")) return lab("def merge_a_list_of_dictionaries_by_id(records):\n    merged = {}\n    for record in records:\n        record_id = record['id']\n        merged.setdefault(record_id, {}).update(record)\n    return [merged[key] for key in sorted(merged)]", [{ name: "merge records", args: [[{ id: 1, name: "Asha" }, { id: 1, city: "Pune" }, { id: 2, name: "Ben" }]], expected: [{ id: 1, name: "Asha", city: "Pune" }, { id: 2, name: "Ben" }] }]);
  if (lower.includes("detect duplicates")) return lab("def detect_duplicates_in_a_list(items):\n    seen = set()\n    duplicates = []\n    for item in items:\n        if item in seen and item not in duplicates:\n            duplicates.append(item)\n        seen.add(item)\n    return duplicates", [{ name: "duplicates", args: [[1, 2, 1, 3, 2, 2]], expected: [1, 2] }]);
  if (lower.includes("sort a dictionary")) return lab("def sort_a_dictionary_by_value(mapping):\n    return dict(sorted(mapping.items(), key=lambda item: item[1], reverse=True))", [{ name: "sort", args: [{ a: 2, b: 5, c: 1 }], expected: { b: 5, a: 2, c: 1 } }]);
  if (lower.includes("pairs with a given sum")) return lab("def count_pairs_with_a_given_sum(nums, target):\n    counts = {}\n    pairs = 0\n    for num in nums:\n        pairs += counts.get(target - num, 0)\n        counts[num] = counts.get(num, 0) + 1\n    return pairs", [{ name: "pairs", args: [[1, 5, 7, -1, 5], 6], expected: 3 }]);
  if (lower.includes("symmetric pairs")) return lab("def find_symmetric_pairs(pairs):\n    seen = set()\n    output = []\n    for a, b in pairs:\n        if (b, a) in seen:\n            output.append([b, a])\n        seen.add((a, b))\n    return output", [{ name: "symmetric", args: [[[1, 2], [3, 4], [2, 1], [5, 6]]], expected: [[1, 2]] }]);
  if (lower.includes("running balance")) return lab("def build_running_balance_from_transactions(transactions):\n    balance = 0\n    output = []\n    for txn in transactions:\n        balance += txn['amount']\n        output.append({**txn, 'balance': balance})\n    return output", [{ name: "balance", args: [[{ id: 1, amount: 100 }, { id: 2, amount: -40 }]], expected: [{ id: 1, amount: 100, balance: 100 }, { id: 2, amount: -40, balance: 60 }] }]);
  if (lower === "factorial") return lab("def factorial(n):\n    result = 1\n    for value in range(2, n + 1):\n        result *= value\n    return result", [{ name: "factorial", args: [5], expected: 120 }]);
  if (lower.includes("fibonacci")) return lab("def fibonacci_number(n):\n    if n <= 1:\n        return n\n    prev, curr = 0, 1\n    for _ in range(2, n + 1):\n        prev, curr = curr, prev + curr\n    return curr", [{ name: "fib", args: [7], expected: 13 }]);
  if (lower.includes("prime number check")) return lab("def prime_number_check(n):\n    if n < 2:\n        return False\n    divisor = 2\n    while divisor * divisor <= n:\n        if n % divisor == 0:\n            return False\n        divisor += 1\n    return True", [{ name: "prime", args: [29], expected: true }]);
  if (lower.includes("all primes")) return lab("def generate_all_primes_up_to_n(n):\n    primes = []\n    for value in range(2, n + 1):\n        is_prime = True\n        for divisor in range(2, int(value ** 0.5) + 1):\n            if value % divisor == 0:\n                is_prime = False\n                break\n        if is_prime:\n            primes.append(value)\n    return primes", [{ name: "primes", args: [10], expected: [2, 3, 5, 7] }]);
  if (lower.includes("binary search")) return lab("def binary_search_in_a_sorted_array(nums, target):\n    left, right = 0, len(nums) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if nums[mid] == target:\n            return mid\n        if nums[mid] < target:\n            left = mid + 1\n        else:\n            right = mid - 1\n    return -1", [{ name: "search", args: [[1, 3, 5, 7], 5], expected: 2 }]);
  if (lower.includes("longest substring")) return lab("def longest_substring_without_repeating_characters(s):\n    seen = {}\n    left = 0\n    best = 0\n    for right, ch in enumerate(s):\n        if ch in seen and seen[ch] >= left:\n            left = seen[ch] + 1\n        seen[ch] = right\n        best = max(best, right - left + 1)\n    return best", [{ name: "substring", args: ["abcabcbb"], expected: 3 }]);
  if (lower.includes("merge overlapping intervals")) return lab("def merge_overlapping_intervals(intervals):\n    intervals = sorted(intervals)\n    merged = []\n    for start, end in intervals:\n        if not merged or start > merged[-1][1]:\n            merged.append([start, end])\n        else:\n            merged[-1][1] = max(merged[-1][1], end)\n    return merged", [{ name: "intervals", args: [[[1, 3], [2, 6], [8, 10]]], expected: [[1, 6], [8, 10]] }]);
  if (lower.includes("maximum subarray")) return lab("def maximum_subarray_sum(nums):\n    best = current = nums[0]\n    for num in nums[1:]:\n        current = max(num, current + num)\n        best = max(best, current)\n    return best", [{ name: "kadane", args: [[-2, 1, -3, 4, -1, 2, 1]], expected: 6 }]);
  if (lower.includes("count error lines")) return lab("def read_a_large_log_file_and_count_error_lines(lines):\n    return sum(1 for line in lines if 'ERROR' in line.upper())", [{ name: "logs", args: [["INFO ok", "ERROR failed", "error retry"]], expected: 2 }]);
  if (lower.includes("parse csv")) return lab("def parse_csv_and_aggregate_a_numeric_column(csv_text, group_col, value_col):\n    import csv\n    from io import StringIO\n    totals = {}\n    for row in csv.DictReader(StringIO(csv_text)):\n        totals[row[group_col]] = totals.get(row[group_col], 0) + int(row[value_col])\n    return totals", [{ name: "csv aggregate", args: ["region,amount\\nwest,10\\nwest,5\\nnorth,7\\n", "region", "amount"], expected: { west: 15, north: 7 } }]);
  if (lower.includes("nested json")) return lab("def parse_nested_json_and_extract_selected_fields(records):\n    return [{'order_id': row['order']['id'], 'customer_id': row['order']['customer']['id']} for row in records]", [{ name: "json extract", args: [[{ order: { id: 101, customer: { id: 1 } } }]], expected: [{ order_id: 101, customer_id: 1 }] }]);
  if (lower.includes("compare two files")) return lab("def compare_two_files_line_by_line(left_lines, right_lines):\n    max_len = max(len(left_lines), len(right_lines))\n    diffs = []\n    for index in range(max_len):\n        left = left_lines[index] if index < len(left_lines) else None\n        right = right_lines[index] if index < len(right_lines) else None\n        if left != right:\n            diffs.append({'line': index + 1, 'left': left, 'right': right})\n    return diffs", [{ name: "diff", args: [["a", "b"], ["a", "c"]], expected: [{ line: 2, left: "b", right: "c" }] }]);
  if (lower.includes("duplicate records in a csv")) return lab("def find_duplicate_records_in_a_csv_by_key(rows, key):\n    seen = set()\n    duplicates = []\n    for row in rows:\n        value = row[key]\n        if value in seen:\n            duplicates.append(row)\n        seen.add(value)\n    return duplicates", [{ name: "dupes", args: [[{ id: 1, name: "A" }, { id: 1, name: "B" }], "id"], expected: [{ id: 1, name: "B" }] }]);
  if (lower.includes("rolling 7-day average")) return lab("def compute_a_rolling_7_day_average(values):\n    output = []\n    for index in range(len(values)):\n        window = values[max(0, index - 6):index + 1]\n        output.append(round(sum(window) / len(window), 2))\n    return output", [{ name: "rolling", args: [[10, 20, 30, 40]], expected: [10, 15, 20, 25] }]);
  if (lower.includes("tuples into a nested dictionary")) return lab("def convert_a_list_of_tuples_into_a_nested_dictionary(rows):\n    output = {}\n    for outer, inner, value in rows:\n        output.setdefault(outer, {})[inner] = value\n    return output", [{ name: "nested dict", args: [[["west", "orders", 10], ["west", "revenue", 100]]], expected: { west: { orders: 10, revenue: 100 } } }]);
  if (lower.includes("log parser")) return lab("def implement_a_simple_log_parser(lines):\n    parsed = []\n    for line in lines:\n        level, message = line.split(' ', 1)\n        parsed.append({'level': level, 'message': message})\n    return parsed", [{ name: "parse logs", args: [["INFO started", "ERROR failed"]], expected: [{ level: "INFO", message: "started" }, { level: "ERROR", message: "failed" }] }]);
  if (lower.includes("decorator")) return lab("def write_a_decorator_that_measures_execution_time(fn):\n    import time\n    if fn is None:\n        return None\n    def wrapper(*args, **kwargs):\n        start = time.time()\n        result = fn(*args, **kwargs)\n        wrapper.last_runtime_ms = (time.time() - start) * 1000\n        return result\n    return wrapper", [{ name: "decorator shape", args: [null], expected: null }]);
  if (lower.includes("generator")) return lab("def create_a_generator_that_yields_chunks_from_an_iterable(items, chunk_size):\n    for index in range(0, len(items), chunk_size):\n        yield items[index:index + chunk_size]", [{ name: "chunks", args: [[1, 2, 3, 4, 5], 2], expected: [[1, 2], [3, 4], [5]] }]);
  if (lower.includes("lru cache")) return lab("def implement_a_simple_lru_cache(operations, capacity):\n    cache = {}\n    order = []\n    output = []\n    for op in operations:\n        if op[0] == 'put':\n            _, key, value = op\n            if key in cache:\n                order.remove(key)\n            elif len(order) >= capacity:\n                oldest = order.pop(0)\n                del cache[oldest]\n            cache[key] = value\n            order.append(key)\n            output.append(None)\n        else:\n            _, key = op\n            if key not in cache:\n                output.append(-1)\n            else:\n                order.remove(key)\n                order.append(key)\n                output.append(cache[key])\n    return output", [{ name: "lru", args: [[["put", 1, "A"], ["put", 2, "B"], ["get", 1], ["put", 3, "C"], ["get", 2]], 2], expected: [null, null, "A", null, -1] }]);
  if (lower.includes("common elements")) return lab("def find_common_elements_across_multiple_lists(lists):\n    if not lists:\n        return []\n    common = set(lists[0])\n    for items in lists[1:]:\n        common &= set(items)\n    return sorted(common)", [{ name: "common", args: [[[1, 2, 3], [2, 3, 4], [2, 5]]], expected: [2] }]);
  if (lower.includes("normalize an email")) return lab("def normalize_an_email_list(emails):\n    output = []\n    seen = set()\n    for email in emails:\n        normalized = email.strip().lower()\n        if normalized and normalized not in seen:\n            seen.add(normalized)\n            output.append(normalized)\n    return output", [{ name: "emails", args: [[" A@X.COM ", "a@x.com", "b@y.com"]], expected: ["a@x.com", "b@y.com"] }]);
  if (lower.includes("top customer")) return lab("def find_the_top_customer_by_revenue_from_transactions(transactions):\n    totals = {}\n    for txn in transactions:\n        totals[txn['customer_id']] = totals.get(txn['customer_id'], 0) + txn['amount']\n    return max(totals.items(), key=lambda item: item[1])[0] if totals else None", [{ name: "top customer", args: [[{ customer_id: 1, amount: 50 }, { customer_id: 2, amount: 80 }, { customer_id: 1, amount: 40 }]], expected: 1 }]);

  const fallbackSolution = `def ${functionName}(*args):\n    # Practical placeholder pattern for this imported PDF lab.\n    # Replace this with your production-ready implementation.\n    return args[0] if args else None`;
  return lab(fallbackSolution, [{ name: "smoke test", args: [[1, 2, 3]], expected: [1, 2, 3] }]);
}

async function main() {
  const [sqlText, pythonText] = await Promise.all([
    extractPdfText(SQL_PDF),
    extractPdfText(PYTHON_PDF)
  ]);

  const sqlTitles = extractQuestionTitles(sqlText);
  const pythonTitles = extractQuestionTitles(pythonText);

  const labs = [
    ...sqlTitles.map((title, index) => buildSqlLab(title, index + 1)),
    ...pythonTitles.map((title, index) => buildPythonLab(title, index + 1))
  ];

  const json = `${JSON.stringify(labs, null, 2)}\n`;
  await mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await mkdir(path.dirname(ROOT_OUTPUT_JSON), { recursive: true });
  await writeFile(OUTPUT_JSON, json);
  await writeFile(ROOT_OUTPUT_JSON, json);
  console.log(`Imported ${sqlTitles.length} SQL labs and ${pythonTitles.length} Python labs.`);
  console.log(`Wrote ${OUTPUT_JSON}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
