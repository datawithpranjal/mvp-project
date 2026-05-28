import { API_BASE_URL } from "./config";
import type {
  AuthProfileFields,
  AuthRequestOtpRequest,
  AuthRequestOtpResponse,
  AuthSessionResponse,
  AuthUserProfile,
  AuthVerifyOtpRequest,
  EmailCaptureRequest,
  EmailCaptureResponse,
  ScenarioDetail,
  ScenarioSummary,
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

export function getScenario(slug: string): Promise<ScenarioDetail> {
  return apiFetch<ScenarioDetail>(`/api/v1/scenarios/${slug}`);
}

export function validateScenario(
  slug: string,
  payload: ValidationRequest
): Promise<ValidationResponse> {
  return apiFetch<ValidationResponse>(`/api/v1/scenarios/${slug}/validate`, {
    method: "POST",
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
