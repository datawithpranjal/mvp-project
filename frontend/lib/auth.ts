import { getAuthProfile, logoutAuthSession } from "./api";
import type { AuthSessionResponse, AuthUserProfile } from "./types";

export interface AuthUser extends AuthUserProfile {
  name: string;
}

interface StoredAuthSession {
  token: string;
  expires_at: string;
  user: AuthUserProfile;
}

const STORAGE_KEY = "data-engineering-scenario-playground-auth-session-v1";
export const AUTH_UPDATED_EVENT = "auth-updated";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function toAuthUser(user: AuthUserProfile): AuthUser {
  return {
    ...user,
    name: user.full_name
  };
}

function isExpired(expiresAt: string): boolean {
  return Number.isNaN(Date.parse(expiresAt)) || new Date(expiresAt).getTime() <= Date.now();
}

export function getStoredAuthSession(): StoredAuthSession | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) {
      return null;
    }

    const session = JSON.parse(value) as Partial<StoredAuthSession>;
    if (
      typeof session.token !== "string" ||
      typeof session.expires_at !== "string" ||
      !session.user ||
      typeof session.user.email !== "string"
    ) {
      return null;
    }

    if (isExpired(session.expires_at)) {
      clearCurrentUser();
      return null;
    }

    return session as StoredAuthSession;
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  return getStoredAuthSession()?.token ?? null;
}

export function getCurrentUser(): AuthUser | null {
  const session = getStoredAuthSession();
  return session ? toAuthUser(session.user) : null;
}

export function saveAuthSession(session: AuthSessionResponse): AuthUser {
  if (!canUseStorage()) {
    return toAuthUser(session.user);
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: session.token,
      expires_at: session.expires_at,
      user: session.user
    })
  );
  window.dispatchEvent(new Event(AUTH_UPDATED_EVENT));
  return toAuthUser(session.user);
}

export function saveCurrentUser(user: AuthUserProfile): AuthUser | null {
  const existingToken = getAuthToken();
  const existingSession = getStoredAuthSession();
  if (!existingToken || !existingSession || !canUseStorage()) {
    return null;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: existingToken,
      expires_at: existingSession.expires_at,
      user
    })
  );
  window.dispatchEvent(new Event(AUTH_UPDATED_EVENT));
  return toAuthUser(user);
}

export function clearCurrentUser(): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_UPDATED_EVENT));
}

export async function refreshCurrentUser(): Promise<AuthUser | null> {
  const token = getAuthToken();
  if (!token) {
    return null;
  }

  try {
    const user = await getAuthProfile(token);
    return saveCurrentUser(user);
  } catch {
    clearCurrentUser();
    return null;
  }
}

export async function logoutCurrentUser(): Promise<void> {
  const token = getAuthToken();

  try {
    if (token) {
      await logoutAuthSession(token);
    }
  } finally {
    clearCurrentUser();
  }
}
