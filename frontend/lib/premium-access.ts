import { getPremiumStatus } from "./api";
import { getCurrentUser } from "./auth";

export type BillingInterval = "monthly" | "yearly";

export interface PremiumAccessRecord {
  email: string;
  unlockedAt: string;
  expiresAt: string;
  billing_interval: BillingInterval;
  amount_inr: number;
  payment_reference: string;
  plan_label: string;
  payment_method: "upi_manual" | "upi_dummy" | "razorpay" | "coupon";
}

const STORAGE_KEY = "data-engineering-scenario-playground-premium-access-v1";
export const PREMIUM_ACCESS_UPDATED_EVENT = "premium-access-updated";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isExpired(expiresAt: string): boolean {
  return Number.isNaN(Date.parse(expiresAt)) || new Date(expiresAt).getTime() <= Date.now();
}

export function getPremiumAccess(): PremiumAccessRecord | null {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return null;
  }

  if (!canUseStorage()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as Partial<PremiumAccessRecord>;
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.unlockedAt !== "string" ||
      typeof parsed.expiresAt !== "string"
    ) {
      clearPremiumAccess();
      return null;
    }

    if (parsed.email.trim().toLowerCase() !== currentUser.email) {
      return null;
    }

    if (isExpired(parsed.expiresAt)) {
      clearPremiumAccess();
      return null;
    }

    return {
      email: parsed.email.trim().toLowerCase(),
      unlockedAt: parsed.unlockedAt,
      expiresAt: parsed.expiresAt,
      billing_interval: parsed.billing_interval === "monthly" ? "monthly" : "yearly",
      amount_inr: typeof parsed.amount_inr === "number" ? parsed.amount_inr : 0,
      payment_reference:
        typeof parsed.payment_reference === "string" && parsed.payment_reference
          ? parsed.payment_reference
          : "legacy-premium-unlock",
      plan_label:
        typeof parsed.plan_label === "string" && parsed.plan_label
          ? parsed.plan_label
          : "Premium Annual",
      payment_method:
        parsed.payment_method === "razorpay"
          ? "razorpay"
          : parsed.payment_method === "coupon"
            ? "coupon"
            : parsed.payment_method === "upi_dummy"
              ? "upi_dummy"
              : "upi_manual"
    };
  } catch {
    return null;
  }
}

export function hasPremiumAccess(): boolean {
  return getPremiumAccess() !== null;
}

export function savePremiumAccess(record: PremiumAccessRecord): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  window.dispatchEvent(new Event(PREMIUM_ACCESS_UPDATED_EVENT));
}

export function clearPremiumAccess(): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(PREMIUM_ACCESS_UPDATED_EVENT));
}

export async function refreshPremiumAccessFromServer(
  token: string
): Promise<PremiumAccessRecord | null> {
  const status = await getPremiumStatus(token);
  if (
    !status.unlocked_premium ||
    !status.plan_label ||
    !status.billing_interval ||
    typeof status.amount_inr !== "number" ||
    !status.payment_reference ||
    !status.granted_at ||
    !status.expires_at
  ) {
    clearPremiumAccess();
    return null;
  }

  const record: PremiumAccessRecord = {
    email: status.email.trim().toLowerCase(),
    unlockedAt: status.granted_at,
    expiresAt: status.expires_at,
    billing_interval: status.billing_interval,
    amount_inr: status.amount_inr,
    payment_reference: status.payment_reference,
    plan_label: status.plan_label,
    payment_method: status.payment_reference.startsWith("pay_") ? "razorpay" : "coupon"
  };
  savePremiumAccess(record);
  return record;
}
