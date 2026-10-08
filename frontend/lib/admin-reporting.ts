export interface ActivityMetrics {
  events: number;
  page_views: number;
  anonymous_browsers: number;
  observed_accounts: number;
  practising_accounts: number;
  submission_events: number;
  completion_events: number;
  checkout_sessions: number;
}

export interface AdminReport {
  generated_at: string;
  timezone: string;
  start: string;
  end_exclusive: string;
  previous_start: string;
  partial_day: boolean;
  history_start: string;
  storage: string;
  sources: Record<string, string>;
  limitations: string[];
  usage: null | {
    current: ActivityMetrics;
    previous: ActivityMetrics;
    latest_event: string | null;
    ambiguous_sessions: number;
    acquisition: {
      source: string;
      landing_sessions: number;
      content_sessions: number;
      account_practice_sessions: number;
      checkout_sessions: number;
    }[];
    authentication: {
      method: string;
      started_sessions: number;
      succeeded_after_start: number;
      sessions_with_error: number;
      practice_after_success: number;
    }[];
    learning: {
      content: string;
      kind: string;
      views: number;
      starters: number;
      attempts: number;
      reported_pass_accounts: number;
      completion_events: number;
      without_reported_pass: number;
    }[];
    retention: {
      window: string;
      eligible: number;
      returned: number;
      pending: number;
      rate: number | null;
    }[];
    daily: (ActivityMetrics & { date: string })[];
  };
  payments: null | {
    recorded_paid_orders: number;
    recorded_gross_inr: number;
    recorded_buyers: number;
    other_records: number;
    active_grants_now: number | null;
    paid_without_active_grant_now: number | null;
    breakdown: {
      provider: string;
      status: string;
      plan: string;
      count: number;
    }[];
  };
  feedback: null | {
    total: number;
    low_ratings: number;
    categories: { category: string; count: number }[];
  };
}
