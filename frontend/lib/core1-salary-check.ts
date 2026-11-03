import { BrowserSqlError, validateSqlOutput, type BrowserSqlResultTable } from "./browser-sql";
import type { CodingLab } from "./coding-labs";

export interface SalaryCheckResult {
  passed: boolean | null;
  status?: "query_error" | "unavailable";
  message: string;
  sqlResults?: Array<{
    name: string;
    description: string;
    passed: boolean;
    actual: BrowserSqlResultTable;
    expected: BrowserSqlResultTable;
  }>;
}

// Only the accepted Core1 packet opts into this feedback contract.
export async function checkCore1SalaryBands(
  lab: CodingLab,
  answer: string,
  mode: "sample" | "full"
): Promise<SalaryCheckResult> {
  const feedback = lab.practiceGuidance!.feedback;
  const cases = [
    { name: "Visible sample data", description: "The complete sample shown in Data.", tables: lab.tables },
    ...(mode === "full" ? lab.sqlTestCases ?? [] : [])
  ];
  try {
    const sqlResults = [];
    for (const test of cases) {
      const result = await validateSqlOutput(test.tables, answer, lab.expectedSql!);
      sqlResults.push({ ...result, name: test.name, description: test.description });
    }
    const passed = sqlResults.every((test) => test.passed);
    return {
      passed,
      message: passed
        ? mode === "sample" ? feedback.visible_pass : feedback.integrated_suite_pass
        : feedback.incorrect,
      sqlResults
    };
  } catch (error) {
    const status = error instanceof BrowserSqlError ? error.kind : "unavailable";
    return {
      passed: null,
      status,
      message: status === "query_error"
        ? `${feedback.query_error} ${error instanceof Error ? error.message : ""}`.trim()
        : feedback.unavailable
    };
  }
}
