import assert from "node:assert/strict";
import { getAuthToken, getCurrentUser, refreshCurrentUser, saveAuthSession } from "../frontend/lib/auth";
import { BEFORE_AUTH_EVENT, beginGoogleLogin, clearAuthIntent, consumeAuthIntent, finishGoogleAttempt, getGoogleAttempt, rememberAuthIntent, safeReturnTo } from "../frontend/lib/auth-flow";
import type { AuthSessionResponse } from "../frontend/lib/types";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const events = new EventTarget();
let navigation = "";
Object.defineProperty(globalThis, "window", { configurable: true, value: {
  localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage(),
  dispatchEvent: events.dispatchEvent.bind(events),
  location: { pathname: "/labs/sql", search: "?lab=test", hash: "", origin: "https://datawithpranjal.com", assign: (url: string) => { navigation = url; } }
} });

function session(id = "existing-customer", token = "original-token"): AuthSessionResponse {
  return {
    token, token_type: "bearer", expires_at: new Date(Date.now() + 86400000).toISOString(),
    user: { id, email: `${id}@example.com`, full_name: "Existing Customer", role: "Engineer", experience_level: "Senior", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }
  };
}

async function main() {
  for (const status of [500, 503, 429, 403, 404]) {
    saveAuthSession(session());
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Temporarily unavailable" }), { status });
    assert.equal((await refreshCurrentUser())?.id, "existing-customer", `HTTP ${status} erased the session`);
    assert.equal(getAuthToken(), "original-token");
  }
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await refreshCurrentUser();
  assert.equal(getAuthToken(), "original-token", "Network failure erased the session");
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Expired session" }), { status: 401 });
  assert.equal(await refreshCurrentUser(), null);
  assert.equal(getAuthToken(), null, "Invalid session was retained");

  for (const status of [200, 401]) {
    saveAuthSession(session());
    let resolveRequest!: (response: Response) => void;
    globalThis.fetch = () => new Promise<Response>((resolve) => { resolveRequest = resolve; });
    const pending = refreshCurrentUser();
    saveAuthSession(session("new-customer", "new-token"));
    resolveRequest(new Response(JSON.stringify(status === 200 ? session().user : { detail: "Expired" }), { status }));
    await pending;
    assert.equal(getAuthToken(), "new-token", "Old request erased newer login");
    assert.equal(getCurrentUser()?.id, "new-customer", "Old request replaced account identity");
  }
  saveAuthSession({ ...session(), expires_at: "2020-01-01T00:00:00Z" });
  assert.equal(getAuthToken(), null);

  for (const path of ["https://evil.example", "//evil.example", "/\\evil.example", "/\nevil", "/auth/callback#token=x"]) assert.equal(safeReturnTo(path), "/dashboard");
  assert.equal(safeReturnTo("/labs/sql?lab=free-one#editor"), "/labs/sql?lab=free-one#editor");
  rememberAuthIntent("sql:one", "submit");
  assert.equal(consumeAuthIntent("sql:two"), null, "Resumed on the wrong exercise");
  assert.equal(consumeAuthIntent("sql:one"), "submit");
  assert.equal(consumeAuthIntent("sql:one"), null, "Submitted twice");
  rememberAuthIntent("sql:one", "submit");
  clearAuthIntent();
  assert.equal(consumeAuthIntent("sql:one"), null, "Cancellation left an active action");
  const googleKey = "tdf-google-attempt-v1";
  for (const at of [Date.now() - 16 * 60000, Date.now() + 60000]) {
    window.sessionStorage.setItem(googleKey, JSON.stringify({ state: "test-state", returnTo: "/labs", at }));
    assert.equal(getGoogleAttempt(), null, "Accepted expired or future OAuth attempt");
  }
  window.sessionStorage.setItem(googleKey, JSON.stringify({ state: "test-state", returnTo: "/labs", at: Date.now() }));
  assert.equal(finishGoogleAttempt("different-state"), false);
  assert.equal(finishGoogleAttempt("test-state"), true);
  assert.equal(finishGoogleAttempt("test-state"), false, "OAuth callback was accepted twice");

  for (const origin of ["https://datawithpranjal.com", "https://www.datawithpranjal.com"]) {
    Object.defineProperty(window.location, "origin", { configurable: true, value: origin });
    let flushes = 0;
    const onFlush = () => { flushes += 1; };
    events.addEventListener(BEFORE_AUTH_EVENT, onFlush);
    globalThis.fetch = async (input, init) => {
      const requested = new URL(String(input));
      assert.equal(requested.searchParams.get("frontend_origin"), origin, "Lost the original frontend origin");
      assert.equal(requested.searchParams.get("return_to"), "/labs/sql?lab=test");
      assert.equal(init?.cache, "no-store", "OAuth state must not be cached");
      assert.equal(flushes, 1, "Draft was not flushed before requesting login");
      return new Response(JSON.stringify({ url: "https://accounts.google.com/o/oauth2/v2/auth?state=test-origin-state" }));
    };
    await beginGoogleLogin();
    assert.equal(flushes, 2);
    assert.equal(new URL(navigation).pathname, "/api/v1/auth/google/start");
    assert.equal(new URL(navigation).searchParams.get("state"), "test-origin-state");
    assert.equal(getGoogleAttempt()?.returnTo, "/labs/sql?lab=test");
    assert.equal(finishGoogleAttempt("test-origin-state"), true);
    events.removeEventListener(BEFORE_AUTH_EVENT, onFlush);
  }
  console.log("Auth continuity passed: transient failures, invalid sessions, account-switch races, return paths, single-use actions, two-origin OAuth and draft flushing.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
