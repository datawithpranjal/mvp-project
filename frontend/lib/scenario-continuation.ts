import type { PysparkValidationResponse } from "./types";

export function getScenarioContinuationSlug(
  slug: string,
  result: PysparkValidationResponse | null
): string | null {
  if (
    slug !== "yesterdays-sales-missing-late-source-arrival" ||
    !result?.passed ||
    result.validation_type !== "PYSPARK_OUTPUT_MATCH" ||
    (result.mode !== "sample" && result.mode !== "hidden") ||
    result.tests.length === 0 ||
    !result.tests.every((test) => test.passed)
  ) {
    return null;
  }
  return "airflow-green-dashboard-wrong";
}
