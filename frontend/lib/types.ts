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
  is_locked?: boolean;
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

export interface PremiumManualUnlockRequest {
  plan_label: string;
  billing_interval: "monthly" | "yearly";
  amount_inr: number;
  payment_reference: string;
  coupon_code?: string;
}

export interface PremiumCouponQuote {
  plan_label: string;
  billing_interval: "monthly" | "yearly";
  original_amount_inr: number;
  discount_amount_inr: number;
  final_amount_inr: number;
  coupon_code: string | null;
  coupon_description: string | null;
  discount_label: string | null;
}

export interface PremiumManualUnlockResponse extends PremiumCouponQuote {
  submitted: boolean;
  pending_review: boolean;
  unlocked_premium: boolean;
  email: string;
}

export interface AuthProfileFields {
  full_name?: string | null;
  role?: string | null;
  experience_level?: string | null;
  target_role?: string | null;
  country?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  preparation_goal?: string | null;
}

export interface AuthUserProfile extends AuthProfileFields {
  id: string;
  email: string;
  full_name: string;
  role: string;
  experience_level: string;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
}

export interface AuthRequestOtpRequest extends AuthProfileFields {
  email: string;
  mode: "signin" | "signup";
}

export interface AuthRequestOtpResponse {
  email: string;
  otp_required: boolean;
  delivery_channel: string;
  expires_in_seconds: number;
  resend_after_seconds: number;
  debug_otp?: string | null;
}

export interface AuthVerifyOtpRequest {
  email: string;
  otp_code: string;
}

export interface AuthSessionResponse {
  token: string;
  token_type: "bearer";
  expires_at: string;
  user: AuthUserProfile;
}

export interface GoogleAuthStartUrlResponse {
  url: string;
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
