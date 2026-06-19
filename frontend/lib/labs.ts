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
      "Practice SQL interview problems with realistic tables, executable queries, and instant result validation.",
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
      "Practice Python coding questions with sample inputs, validation checks, and model explanations.",
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
    status: "active",
    description:
      "Practice DAG dependency debugging, retries, sensors, backfills, and production incident triage.",
    skills: ["DAGs", "Retries", "Sensors", "Backfills", "Alerts"],
    href: "/labs/airflow",
    groups: ["DAG Dependencies", "Retries and Backfills", "Sensors", "Incident Triage"],
    badges: ["Production Incidents", "Interview Favorite"]
  },
  {
    slug: "aws-data-platform",
    title: "AWS/Data Platform Lab",
    status: "active",
    description:
      "Practice storage layout, partitioning, lakehouse design, data quality, and platform trade-offs.",
    skills: ["S3", "Glue", "Athena", "Lakehouse", "DQ checks"],
    href: "/labs/aws",
    groups: ["Storage Layout", "Lakehouse Tables", "Data Quality", "Platform Trade-offs"],
    badges: ["Architecture Decisions", "Production Scenario"]
  }
];
