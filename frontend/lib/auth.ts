export interface AuthUser {
  name: string;
  email: string;
  signedInAt: string;
}

const STORAGE_KEY = "data-engineering-scenario-playground-auth-v1";
export const AUTH_UPDATED_EVENT = "auth-updated";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function deriveNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "learner";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeUser(value: Partial<AuthUser>): AuthUser | null {
  if (typeof value.email !== "string" || !value.email.trim()) {
    return null;
  }

  const normalizedEmail = value.email.trim().toLowerCase();
  const normalizedName =
    typeof value.name === "string" && value.name.trim()
      ? value.name.trim()
      : deriveNameFromEmail(normalizedEmail);

  return {
    name: normalizedName,
    email: normalizedEmail,
    signedInAt:
      typeof value.signedInAt === "string" && value.signedInAt
        ? value.signedInAt
        : new Date().toISOString()
  };
}

export function getCurrentUser(): AuthUser | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) {
      return null;
    }

    return normalizeUser(JSON.parse(value) as Partial<AuthUser>);
  } catch {
    return null;
  }
}

export function saveCurrentUser(user: Partial<AuthUser>): AuthUser | null {
  if (!canUseStorage()) {
    return null;
  }

  const normalizedUser = normalizeUser(user);
  if (!normalizedUser) {
    return null;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedUser));
  window.dispatchEvent(new Event(AUTH_UPDATED_EVENT));
  return normalizedUser;
}

export function clearCurrentUser(): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_UPDATED_EVENT));
}
