export type QueryCell = string | number | boolean | null;
export type ValidationType =
  | "SQL_OUTPUT_MATCH"
  | "DEBUG_RUBRIC"
  | "DESIGN_RUBRIC"
  | "CODE_REVIEW_RUBRIC";

export interface QueryResult {
  columns: string[];
  column_types: string[];
  rows: QueryCell[][];
}

export interface RubricItem {
  point: string;
  weight: number;
}

export interface TablePreview {
  name: string;
  columns: string[];
  rows: QueryCell[][];
}

export interface ScenarioSummary {
  slug: string;
  title: string;
  difficulty: string;
  section: string;
  short_description: string;
  access_tier: "free" | "premium";
  topics: string[];
  validation_type: ValidationType;
}

export interface ScenarioDetail extends ScenarioSummary {
  business_context: string;
  problem_statement: string;
  student_task: string;
  learning_objectives: string[];
  tables: TablePreview[];
  broken_code: string;
  production_logs: string[];
  expected_output: QueryResult | null;
  submission_instructions: string;
  validation_logic: string | null;
  solution_answer: string;
  explanation: string;
  common_mistakes: string[];
  rubric: RubricItem[];
  hints: string[];
}

export interface ValidationRequest {
  answer: string;
}

export interface EmailCaptureRequest {
  email: string;
  source: string;
  scenario_slug?: string;
}

export interface EmailCaptureResponse {
  captured: boolean;
  email: string;
  unlocked_premium: boolean;
}

export interface ValidationResponse {
  validation_type: ValidationType;
  passed: boolean | null;
  message: string;
  actual_output: QueryResult | null;
  expected_output: QueryResult | null;
  explanation: string;
  solution_answer: string;
  rubric: RubricItem[];
}
