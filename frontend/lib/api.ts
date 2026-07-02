import { API_BASE_URL } from "./config";
import type {
  AdminAiStatusResponse,
  AdminFeedbackResponse,
  AdminPremiumPurchasesResponse,
  AdminUsageSummaryResponse,
  AdminVisitorSummaryResponse,
  AiScenarioEvaluationRequest,
  AiScenarioEvaluationResponse,
  AnonymousUsageEventRequest,
  AuthProfileFields,
  AuthRequestOtpRequest,
  AuthRequestOtpResponse,
  AuthSessionResponse,
  AuthUserProfile,
  AuthVerifyOtpRequest,
  ContentAuditBulkResponse,
  ContentAuditDetailResponse,
  ContentAuditIssueStatus,
  ContentAuditItem,
  ContentAuditSummaryResponse,
  EmailCaptureRequest,
  EmailCaptureResponse,
  GoogleAuthStartUrlResponse,
  PremiumCouponQuote,
  PremiumManualUnlockRequest,
  PremiumManualUnlockResponse,
  PremiumStatusResponse,
  ProductFeedbackRequest,
  ProductFeedbackResponse,
  RazorpayCreateOrderRequest,
  RazorpayCreateOrderResponse,
  RazorpayVerifyPaymentRequest,
  RazorpayVerifyPaymentResponse,
  ScenarioDetail,
  ScenarioSummary,
  UsageEventRequest,
  UsageEventResponse,
  ValidationRequest,
  ValidationResponse
} from "./types";

interface ApiFetchOptions extends RequestInit {
  authToken?: string | null;
}

async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const { authToken, ...requestInit } = init ?? {};
  const hasBody = typeof requestInit.body !== "undefined";
  const headers = new Headers(requestInit.headers ?? undefined);

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (authToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const body = await response.json();
      if (typeof body.detail === "string") {
        errorMessage = body.detail;
      }
    } catch {
      // Ignore JSON parse errors and fall back to the default message.
    }

    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

export function getScenarios(): Promise<ScenarioSummary[]> {
  return apiFetch<ScenarioSummary[]>("/api/v1/scenarios");
}

export function getScenario(slug: string, authToken?: string | null): Promise<ScenarioDetail> {
  return apiFetch<ScenarioDetail>(`/api/v1/scenarios/${slug}`, {
    authToken
  });
}

export function validateScenario(
  slug: string,
  payload: ValidationRequest,
  authToken?: string | null
): Promise<ValidationResponse> {
  return apiFetch<ValidationResponse>(`/api/v1/scenarios/${slug}/validate`, {
    method: "POST",
    authToken,
    body: JSON.stringify(payload)
  });
}

export function evaluateScenarioWithAi(
  token: string,
  payload: AiScenarioEvaluationRequest
): Promise<AiScenarioEvaluationResponse> {
  return apiFetch<AiScenarioEvaluationResponse>("/api/v1/ai/evaluate-scenario", {
    method: "POST",
    authToken: token,
    body: JSON.stringify(payload)
  });
}

export function captureEmail(
  payload: EmailCaptureRequest
): Promise<EmailCaptureResponse> {
  return apiFetch<EmailCaptureResponse>("/api/v1/email-captures", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function submitProductFeedback(
  payload: ProductFeedbackRequest
): Promise<ProductFeedbackResponse> {
  return apiFetch<ProductFeedbackResponse>("/api/v1/feedback", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function recordUsageEvent(
  token: string,
  payload: UsageEventRequest
): Promise<UsageEventResponse> {
  return apiFetch<UsageEventResponse>("/api/v1/usage/events", {
    method: "POST",
    authToken: token,
    body: JSON.stringify(payload)
  });
}

export function recordAnonymousUsageEvent(
  payload: AnonymousUsageEventRequest
): Promise<UsageEventResponse> {
  return apiFetch<UsageEventResponse>("/api/v1/usage/anonymous-events", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function requestAuthOtp(
  payload: AuthRequestOtpRequest
): Promise<AuthRequestOtpResponse> {
  return apiFetch<AuthRequestOtpResponse>("/api/v1/auth/request-otp", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function verifyAuthOtp(
  payload: AuthVerifyOtpRequest
): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>("/api/v1/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getAuthProfile(token: string): Promise<AuthUserProfile> {
  return apiFetch<AuthUserProfile>("/api/v1/auth/me", {
    authToken: token
  });
}

export function updateAuthProfile(
  token: string,
  payload: AuthProfileFields
): Promise<AuthUserProfile> {
  return apiFetch<AuthUserProfile>("/api/v1/auth/profile", {
    method: "PATCH",
    authToken: token,
    body: JSON.stringify(payload)
  });
}

export function logoutAuthSession(token: string): Promise<{ logged_out: boolean }> {
  return apiFetch<{ logged_out: boolean }>("/api/v1/auth/logout", {
    method: "POST",
    authToken: token
  });
}

export function getGoogleAuthStartUrl(returnTo: string = "/dashboard"): Promise<GoogleAuthStartUrlResponse> {
  return apiFetch<GoogleAuthStartUrlResponse>(
    `/api/v1/auth/google/start-url?return_to=${encodeURIComponent(returnTo)}`
  );
}

export function submitManualPremiumPayment(
  token: string,
  payload: PremiumManualUnlockRequest
): Promise<PremiumManualUnlockResponse> {
  return apiFetch<PremiumManualUnlockResponse>("/api/v1/premium/manual-unlock", {
    method: "POST",
    authToken: token,
    body: JSON.stringify(payload)
  });
}

export function getPremiumStatus(token: string): Promise<PremiumStatusResponse> {
  return apiFetch<PremiumStatusResponse>("/api/v1/premium/status", {
    authToken: token
  });
}

export function validatePremiumCoupon(
  token: string,
  payload: {
    billing_interval: "monthly" | "yearly";
    coupon_code: string;
  }
): Promise<PremiumCouponQuote> {
  return apiFetch<PremiumCouponQuote>("/api/v1/premium/coupons/validate", {
    method: "POST",
    authToken: token,
    body: JSON.stringify(payload)
  });
}

export function createRazorpayOrder(
  token: string,
  payload: RazorpayCreateOrderRequest
): Promise<RazorpayCreateOrderResponse> {
  return apiFetch<RazorpayCreateOrderResponse>("/api/v1/premium/razorpay/create-order", {
    method: "POST",
    authToken: token,
    body: JSON.stringify(payload)
  });
}

export function verifyRazorpayPayment(
  token: string,
  payload: RazorpayVerifyPaymentRequest
): Promise<RazorpayVerifyPaymentResponse> {
  return apiFetch<RazorpayVerifyPaymentResponse>("/api/v1/premium/razorpay/verify-payment", {
    method: "POST",
    authToken: token,
    body: JSON.stringify(payload)
  });
}

export function getContentAuditSummary(
  adminToken: string
): Promise<ContentAuditSummaryResponse> {
  return apiFetch<ContentAuditSummaryResponse>("/api/v1/admin/content-audit", {
    headers: { "X-Admin-Token": adminToken }
  });
}

export function getContentAuditDetail(
  adminToken: string,
  contentId: string
): Promise<ContentAuditDetailResponse> {
  return apiFetch<ContentAuditDetailResponse>(
    `/api/v1/admin/content-audit/${encodeURIComponent(contentId)}`,
    {
      headers: { "X-Admin-Token": adminToken }
    }
  );
}

export function auditContentItem(
  adminToken: string,
  item: ContentAuditItem
): Promise<ContentAuditDetailResponse> {
  return apiFetch<ContentAuditDetailResponse>(
    `/api/v1/admin/content-audit/${encodeURIComponent(item.content_id)}`,
    {
      method: "POST",
      headers: { "X-Admin-Token": adminToken },
      body: JSON.stringify(item)
    }
  );
}

export function auditContentItems(
  adminToken: string,
  items: ContentAuditItem[]
): Promise<ContentAuditBulkResponse> {
  return apiFetch<ContentAuditBulkResponse>("/api/v1/admin/content-audit/run", {
    method: "POST",
    headers: { "X-Admin-Token": adminToken },
    body: JSON.stringify({ items })
  });
}

export function updateContentAuditIssueStatus(
  adminToken: string,
  contentId: string,
  issueId: string,
  status: ContentAuditIssueStatus
): Promise<ContentAuditDetailResponse> {
  return apiFetch<ContentAuditDetailResponse>(
    `/api/v1/admin/content-audit/${encodeURIComponent(contentId)}/issues/${encodeURIComponent(issueId)}`,
    {
      method: "PATCH",
      headers: { "X-Admin-Token": adminToken },
      body: JSON.stringify({ status })
    }
  );
}

export function getAdminFeedback(
  adminToken: string,
  limit: number = 50
): Promise<AdminFeedbackResponse> {
  return apiFetch<AdminFeedbackResponse>(`/api/v1/admin/feedback?limit=${limit}`, {
    headers: { "X-Admin-Token": adminToken }
  });
}

export function getAdminUsageSummary(
  adminToken: string,
  days: number = 30,
  limit: number = 100
): Promise<AdminUsageSummaryResponse> {
  return apiFetch<AdminUsageSummaryResponse>(
    `/api/v1/admin/usage/summary?days=${days}&limit=${limit}`,
    {
      headers: { "X-Admin-Token": adminToken }
    }
  );
}

export function getAdminVisitorSummary(
  adminToken: string,
  days: number = 30,
  limit: number = 25
): Promise<AdminVisitorSummaryResponse> {
  return apiFetch<AdminVisitorSummaryResponse>(
    `/api/v1/admin/usage/visitors?days=${days}&limit=${limit}`,
    {
      headers: { "X-Admin-Token": adminToken }
    }
  );
}

export function getAdminPremiumPurchases(
  adminToken: string
): Promise<AdminPremiumPurchasesResponse> {
  return apiFetch<AdminPremiumPurchasesResponse>("/api/v1/admin/premium/purchases", {
    headers: { "X-Admin-Token": adminToken }
  });
}

export function getAdminAiStatus(adminToken: string): Promise<AdminAiStatusResponse> {
  return apiFetch<AdminAiStatusResponse>("/api/v1/admin/ai/status", {
    headers: { "X-Admin-Token": adminToken }
  });
}
