import type { CodingLab } from "./coding-labs";

export function isSqlSalaryEntry(lab: CodingLab): boolean {
  return lab.track === "sql" && lab.isFree && (
    (lab.id === "sql-coding-001" && lab.slug === "sql-coding-01-second-highest-salary") ||
    (lab.id === "sql-coding-002" && lab.slug === "sql-coding-02-nth-highest-salary")
  );
}

export function sqlSalarySampleMessage(): string {
  return "Your output matches the visible salary example. Submit requires an account and checks this example and one additional configured salary-ranking dataset. These are finite checks, not proof that every edge case has been tested.";
}

export function sqlSalaryFullMessage(passed: boolean, passedCount: number, count: number, lab?: CodingLab): string {
  const column = lab?.id === "sql-coding-002" && lab.slug === "sql-coding-02-nth-highest-salary"
    ? "third_highest_salary"
    : "second_highest_salary";
  return passed
    ? `Your output matches the ${count} configured salary-ranking datasets. These finite checks do not establish general correctness or unaided skill.`
    : `${passedCount}/${count} configured salary-ranking datasets matched. Compare the requested overall row, distinct non-NULL salary bands and ${column} column.`;
}
