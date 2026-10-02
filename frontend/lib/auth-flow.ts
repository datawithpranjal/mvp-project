import { getGoogleAuthStartUrl } from "./api";
import { API_BASE_URL } from "./config";

export const BEFORE_AUTH_EVENT = "tdf-before-auth";
const GOOGLE_ATTEMPT_KEY = "tdf-google-attempt-v1";
const INTENT_KEY = "tdf-auth-intent-v1";
const ATTEMPT_TTL = 15 * 60 * 1000;

export function safeReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/dashboard";
  if (value.split(/[?#]/)[0] === "/auth/callback") return "/dashboard";
  return value;
}

export function currentAuthReturnTo(): string {
  return safeReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`);
}

export function rememberAuthIntent(key: string, action: string): void {
  try {
    window.sessionStorage.setItem(INTENT_KEY, JSON.stringify({ key, action, at: Date.now() }));
  } catch { /* Login remains usable if automatic continuation storage is blocked. */ }
}

export function clearAuthIntent(): void {
  try { window.sessionStorage.removeItem(INTENT_KEY); } catch { /* Storage may be blocked. */ }
}

export function consumeAuthIntent(key: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw);
    if (!Number.isFinite(intent.at) || Date.now() - intent.at < 0 || Date.now() - intent.at > ATTEMPT_TTL) { clearAuthIntent(); return null; }
    if (intent.key !== key) return null;
    clearAuthIntent();
    return typeof intent.action === "string" ? intent.action : null;
  } catch { return null; }
}

export async function beginGoogleLogin(returnTo?: string): Promise<void> {
  window.dispatchEvent(new Event(BEFORE_AUTH_EVENT));
  const safePath = safeReturnTo(returnTo ?? currentAuthReturnTo());
  const { url } = await getGoogleAuthStartUrl(safePath);
  const state = new URL(url).searchParams.get("state");
  if (!state) throw new Error("Google login is unavailable. Please continue with email.");
  window.sessionStorage.setItem(GOOGLE_ATTEMPT_KEY, JSON.stringify({ state, returnTo: safePath, at: Date.now() }));
  window.dispatchEvent(new Event(BEFORE_AUTH_EVENT));
  // Top-level navigation lets the API set a first-party CSRF cookie.
  window.location.assign(`${API_BASE_URL}/api/v1/auth/google/start?state=${encodeURIComponent(state)}`);
}

export function getGoogleAttempt(): { state: string; returnTo: string; at: number } | null {
  try {
    const attempt = JSON.parse(window.sessionStorage.getItem(GOOGLE_ATTEMPT_KEY) ?? "null");
    return attempt && typeof attempt.state === "string" && Number.isFinite(attempt.at) && Date.now() - attempt.at >= 0 && Date.now() - attempt.at < ATTEMPT_TTL
      ? attempt : null;
  } catch { return null; }
}

export function finishGoogleAttempt(state: string | null): boolean {
  const attempt = getGoogleAttempt();
  if (!state || !attempt || attempt.state !== state) return false;
  window.sessionStorage.removeItem(GOOGLE_ATTEMPT_KEY);
  return true;
}
