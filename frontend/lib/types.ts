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

export interface ProductFeedbackRequest {
  name: string;
  email: string;
  category: "general" | "content" | "bug" | "feature" | "other";
  message: string;
  rating?: number;
  page_url?: string;
  website?: string;
}

export interface ProductFeedbackResponse {
  submitted: boolean;
  message: string;
}

export type UsageEventName =
  | "session_start"
  | "session_heartbeat"
  | "page_view"
  | "coding_lab_submitted"
  | "coding_lab_completed"
  | "scenario_submitted"
  | "scenario_completed";

export interface UsageEventRequest {
  event_name: UsageEventName;
  session_id: string;
  page_url?: string;
  active_seconds?: number;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface UsageEventResponse {
  recorded: boolean;
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
  granted_at?: string;
  expires_at?: string;
}

export interface RazorpayCreateOrderRequest {
  billing_interval: "monthly" | "yearly";
  coupon_code?: string;
}

export interface RazorpayCreateOrderResponse extends PremiumCouponQuote {
  key_id: string;
  order_id: string;
  amount: number;
  currency: string;
  receipt: string;
}

export interface RazorpayVerifyPaymentRequest {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  billing_interval: "monthly" | "yearly";
  amount_inr: number;
  coupon_code?: string;
}

export interface RazorpayVerifyPaymentResponse extends PremiumCouponQuote {
  verified: boolean;
  unlocked_premium: boolean;
  email: string;
  granted_at: string;
  expires_at: string;
}

export interface PremiumStatusResponse {
  unlocked_premium: boolean;
  email: string;
  plan_label?: string;
  billing_interval?: "monthly" | "yearly";
  amount_inr?: number;
  payment_reference?: string;
  granted_at?: string;
  expires_at?: string;
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

export interface AiRubricWeights {
  root_cause: number;
  correctness: number;
  production_thinking: number;
  tradeoffs: number;
  communication: number;
}

export interface AiScenarioEvaluationContext {
  title: string;
  domain: string;
  scenario_type: string;
  business_context: string;
  problem_statement: string;
  requirement: string;
  broken_code: string;
  actual_output: string;
  expected_output: string;
  model_solution: string;
  production_explanation: string;
  common_mistakes: string[];
  follow_ups: string[];
  rubric: AiRubricWeights;
}

export interface AiScenarioEvaluationRequest {
  scenario_slug: string;
  user_answer: string;
  context: AiScenarioEvaluationContext;
}

export interface AiScenarioEvaluationResponse {
  score: number;
  verdict: "weak" | "partial" | "good" | "strong";
  strengths: string[];
  gaps: string[];
  improved_answer: string;
  follow_up_questions: string[];
  rubric_breakdown: AiRubricWeights;
  mode: "openai" | "gemini";
  model: string;
}

export type ContentAuditSeverity = "critical" | "warning" | "suggestion";
export type ContentAuditIssueStatus = "open" | "fixed" | "ignored";

export interface ContentAuditItem {
  content_id: string;
  content_type: string;
  title?: string | null;
  slug?: string | null;
  topic?: string | null;
  difficulty?: string | null;
  tags: string[];
  problem_statement?: string | null;
  expected_output?: string | null;
  solution?: string | null;
  explanation?: string | null;
  body?: string | null;
  internal_links: string[];
  prerequisites: string[];
  estimated_minutes?: number | null;
  updated_at?: string | null;
  metadata: Record<string, unknown>;
}

export interface ContentAuditIssue {
  id: string;
  run_id: string;
  content_id: string;
  severity: ContentAuditSeverity;
  category: string;
  issue: string;
  suggestion: string;
  status: ContentAuditIssueStatus;
  created_at: string;
  updated_at: string;
}

export interface ContentAuditRun {
  id: string;
  content_id: string;
  content_type: string;
  title: string;
  slug: string;
  topic: string;
  difficulty: string;
  tags: string[];
  audit_score: number;
  issue_counts: Record<ContentAuditSeverity, number>;
  content_hash: string;
  audited_at: string;
  source_updated_at?: string | null;
}

export interface ContentAuditSummaryResponse {
  storage_backend: "postgres" | "file";
  table_exists: boolean;
  total_audited_content: number;
  average_audit_score: number;
  critical_issues: number;
  warning_issues: number;
  suggestion_issues: number;
  items: ContentAuditRun[];
}

export interface ContentAuditDetailResponse {
  storage_backend: "postgres" | "file";
  table_exists: boolean;
  run: ContentAuditRun | null;
  issues: ContentAuditIssue[];
}

export interface ContentAuditBulkResponse {
  audited: number;
  failed: number;
  items: ContentAuditRun[];
  errors: string[];
}
