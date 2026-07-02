"use client";

import { recordAnonymousUsageEvent, recordUsageEvent } from "./api";
import { getAuthToken } from "./auth";
import type { UsageEventName } from "./types";

const SESSION_STORAGE_KEY = "data-foundry-usage-session-id-v1";
const VISITOR_STORAGE_KEY = "data-foundry-usage-visitor-id-v1";

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `usage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getUsageSessionId(): string {
  if (!canUseSessionStorage()) return createSessionId();

  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const nextSessionId = createSessionId();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
  return nextSessionId;
}

export function getUsageVisitorId(): string {
  if (!canUseLocalStorage()) return createSessionId();

  const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;

  const nextVisitorId = createSessionId();
  window.localStorage.setItem(VISITOR_STORAGE_KEY, nextVisitorId);
  return nextVisitorId;
}

export function currentUsagePageUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.pathname}${window.location.search}`;
}

export function sendUsageEvent(
  eventName: UsageEventName,
  options: {
    activeSeconds?: number;
    metadata?: Record<string, string | number | boolean | null | undefined>;
    pageUrl?: string;
  } = {}
): void {
  const token = getAuthToken();
  const payload = {
    event_name: eventName,
    session_id: getUsageSessionId(),
    page_url: options.pageUrl ?? currentUsagePageUrl(),
    active_seconds: options.activeSeconds ?? 0,
    metadata: options.metadata ?? {}
  };

  if (!token) {
    void recordAnonymousUsageEvent({
      ...payload,
      visitor_id: getUsageVisitorId()
    }).catch(() => {
      // Usage metrics should never interrupt a learner's session.
    });
    return;
  }

  void recordUsageEvent(token, payload).catch(() => {
    // Usage metrics should never interrupt a learner's session.
  });
}
