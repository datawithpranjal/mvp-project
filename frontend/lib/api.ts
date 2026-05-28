import { API_BASE_URL } from "./config";
import type {
  EmailCaptureRequest,
  EmailCaptureResponse,
  ScenarioDetail,
  ScenarioSummary,
  ValidationRequest,
  ValidationResponse
} from "./types";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
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
