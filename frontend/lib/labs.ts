export interface LabTrack {
  slug: string;
  title: string;
  status: "active" | "coming-soon";
  description: string;
  skills: string[];
  href: string;
  groups: string[];
  badges: string[];
}

export const LAB_TRACKS: LabTrack[] = [
  {
    slug: "sql",
    title: "SQL Lab",
    status: "active",
    description:
      "Practice SQL interview problems with seeded tables and browser-side SQL execution. No backend judge required.",
    skills: ["Ranking", "Joins", "Windows", "Anti-joins", "Metrics"],
    href: "/labs/sql",
    groups: ["SQL Interview Essentials", "Data Engineering SQL", "Production Debugging", "Advanced SQL"],
    badges: ["Must Do", "Interview Favorite"]
  },
  {
    slug: "python",
    title: "Python Lab",
    status: "active",
    description:
      "Practice Python coding questions in a browser Pyodide runtime with sample tests and model explanations.",
    skills: ["Lists", "Dicts", "Files", "APIs", "ETL logic"],
    href: "/labs/python",
    groups: ["Data Engineering Python", "File / JSON / CSV Processing", "Interview Basics", "Advanced Logic"],
    badges: ["Beginner Friendly", "Hands-on"]
  },
  {
    slug: "pyspark",
    title: "PySpark Lab",
    status: "active",
    description:
      "Fix production PySpark code without a Spark cluster: reason through DataFrame logic, joins, skew, files, and safe writes.",
    skills: ["DataFrames", "Windows", "Joins", "Skew", "Performance"],
    href: "/labs/pyspark",
    groups: ["DataFrame Transformations", "Joins and Aggregations", "Performance Debugging", "Production Scenarios"],
    badges: ["Production Scenario", "Advanced"]
  },
  {
    slug: "airflow",
    title: "Airflow Lab",
    status: "coming-soon",
    description:
      "Practice DAG dependency debugging, retries, sensors, backfills, and production incident triage.",
    skills: ["DAGs", "Retries", "Sensors", "Backfills", "Alerts"],
    href: "/labs",
    groups: ["DAG Dependencies", "Retries and Backfills", "Sensors", "Incident Triage"],
    badges: ["Coming Soon"]
  },
  {
    slug: "aws-data-platform",
    title: "AWS/Data Platform Lab",
    status: "coming-soon",
    description:
      "Practice storage layout, partitioning, lakehouse design, data quality, and platform trade-offs.",
    skills: ["S3", "Glue", "Athena", "Lakehouse", "DQ checks"],
    href: "/labs",
    groups: ["Storage Layout", "Lakehouse Tables", "Data Quality", "Platform Trade-offs"],
    badges: ["Coming Soon"]
  }
];
