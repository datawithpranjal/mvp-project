export interface LabTrack {
  slug: string;
  title: string;
  status: "active" | "coming-soon";
  description: string;
  skills: string[];
  href: string;
}

export const LAB_TRACKS: LabTrack[] = [
  {
    slug: "sql",
    title: "SQL Lab",
    status: "active",
    description:
      "Practice SQL interview problems with seeded tables and browser-side SQL execution. No backend judge required.",
    skills: ["Ranking", "Joins", "Windows", "Anti-joins", "Metrics"],
    href: "/labs/sql"
  },
  {
    slug: "python",
    title: "Python Lab",
    status: "active",
    description:
      "Practice Python coding questions in a browser Pyodide runtime with sample tests and model explanations.",
    skills: ["Lists", "Dicts", "Files", "APIs", "ETL logic"],
    href: "/labs/python"
  },
  {
    slug: "pyspark",
    title: "PySpark Lab",
    status: "coming-soon",
    description:
      "Practice DataFrame transformations, deduplication, skew reasoning, partition strategy, and code reviews.",
    skills: ["DataFrames", "Windows", "Joins", "Skew", "Performance"],
    href: "/labs"
  },
  {
    slug: "airflow",
    title: "Airflow Lab",
    status: "coming-soon",
    description:
      "Practice DAG dependency debugging, retries, sensors, backfills, and production incident triage.",
    skills: ["DAGs", "Retries", "Sensors", "Backfills", "Alerts"],
    href: "/labs"
  },
  {
    slug: "aws-data-platform",
    title: "AWS/Data Platform Lab",
    status: "coming-soon",
    description:
      "Practice storage layout, partitioning, lakehouse design, data quality, and platform trade-offs.",
    skills: ["S3", "Glue", "Athena", "Lakehouse", "DQ checks"],
    href: "/labs"
  }
];
