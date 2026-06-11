export type AnalyticsEvent =
  | "homepage_start_clicked"
  | "onboarding_completed"
  | "first_lab_started"
  | "first_lab_submitted"
  | "hint_used"
  | "model_solution_revealed"
  | "signup_prompt_seen"
  | "signup_started"
  | "premium_unlock_clicked"
  | "payment_started"
  | "lab_completed"
  | "roadmap_day_completed";

interface AnalyticsPayload {
  [key: string]: string | number | boolean | null | undefined;
}

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function trackEvent(event: AnalyticsEvent, payload: AnalyticsPayload = {}): void {
  if (typeof window === "undefined") return;

  const record = {
    event,
    ...payload,
    occurred_at: new Date().toISOString()
  };

  window.dataLayer?.push(record);
  window.dispatchEvent(new CustomEvent("data-foundry-analytics", { detail: record }));

  if (process.env.NODE_ENV !== "production") {
    console.info("[analytics]", record);
  }
}
