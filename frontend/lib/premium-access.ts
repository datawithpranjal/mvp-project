import { getCurrentUser } from "./auth";

export type BillingInterval = "monthly" | "yearly";

export interface PremiumAccessRecord {
  email: string;
  unlockedAt: string;
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
    if (typeof parsed.email !== "string" || typeof parsed.unlockedAt !== "string") {
      return null;
    }

    if (parsed.email.trim().toLowerCase() !== currentUser.email) {
      return null;
    }

    return {
      email: parsed.email.trim().toLowerCase(),
      unlockedAt: parsed.unlockedAt,
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
