"use client";

import { useEffect, useMemo, useState } from "react";

import { AUTH_UPDATED_EVENT, getAuthToken, getCurrentUser, type AuthUser } from "../lib/auth";
import {
  captureEmail,
  createRazorpayOrder,
  submitManualPremiumPayment,
  validatePremiumCoupon,
  verifyRazorpayPayment
} from "../lib/api";
import type { PremiumCouponQuote } from "../lib/types";
import {
  PREMIUM_ACCESS_UPDATED_EVENT,
  getPremiumAccess,
  savePremiumAccess,
  type BillingInterval,
  type PremiumAccessRecord
} from "../lib/premium-access";
import { trackEvent } from "../lib/analytics";
import { AuthForm } from "./auth-form";

interface PremiumUpgradePanelProps {
  title: string;
  description: string;
  onUnlocked?: () => void;
}

interface PricingPlan {
  id: BillingInterval;
  label: string;
  amountInr: number;
  cadenceLabel: string;
  compareAtInr?: number;
  badge?: string;
  summary: string;
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: "yearly",
    label: "Premium Annual",
    amountInr: 500,
    cadenceLabel: "per year",
    compareAtInr: 1999,
    badge: "Best value",
    summary: "Unlock the full scenario library for a full year at the strongest effective price."
  },
  {
    id: "monthly",
    label: "Premium Monthly",
    amountInr: 219,
    cadenceLabel: "per month",
    summary: "A lighter entry point if you want short-term interview prep access."
  }
];

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayFailureResponse {
  error?: {
    description?: string;
    reason?: string;
  };
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
  };
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
  handler: (response: RazorpaySuccessResponse) => void;
}

interface RazorpayCheckoutInstance {
  open: () => void;
  on: (event: "payment.failed", handler: (response: RazorpayFailureResponse) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}

let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayCheckout(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay checkout can only run in the browser."));
  }

  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayScriptPromise = null;
      reject(new Error("Unable to load Razorpay checkout. Please try again."));
    };
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function PremiumUpgradePanel({
  title,
  description,
  onUnlocked
}: PremiumUpgradePanelProps) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [premiumAccess, setPremiumAccessState] = useState<PremiumAccessRecord | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<BillingInterval>("yearly");
  const [couponCode, setCouponCode] = useState("");
  const [couponQuote, setCouponQuote] = useState<PremiumCouponQuote | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [isRazorpayLoading, setIsRazorpayLoading] = useState(false);

  useEffect(() => {
    function syncState() {
      setCurrentUser(getCurrentUser());
      setPremiumAccessState(getPremiumAccess());
    }

    syncState();
    window.addEventListener("storage", syncState);
    window.addEventListener(AUTH_UPDATED_EVENT, syncState);
    window.addEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncState);

    return () => {
      window.removeEventListener("storage", syncState);
      window.removeEventListener(AUTH_UPDATED_EVENT, syncState);
      window.removeEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncState);
    };
  }, []);

  const activePlan = useMemo(
    () => PRICING_PLANS.find((plan) => plan.id === selectedPlan) ?? PRICING_PLANS[0],
    [selectedPlan]
  );
  const payableAmount = couponQuote?.final_amount_inr ?? activePlan.amountInr;

  function choosePlan(plan: BillingInterval) {
    setSelectedPlan(plan);
    setCouponQuote(null);
    setCouponError(null);
    setCheckoutError(null);
    setCheckoutSuccess(null);
  }

  async function applyCoupon() {
    const token = getAuthToken();
    const normalizedCode = couponCode.trim();
    if (!token) {
      setCouponError("Please sign in again before applying a coupon.");
      return;
    }
    if (!normalizedCode) {
      setCouponError("Enter a coupon code first.");
      return;
    }

    try {
      setIsApplyingCoupon(true);
      setCouponError(null);
      setCouponQuote(
        await validatePremiumCoupon(token, {
          billing_interval: activePlan.id,
          coupon_code: normalizedCode
        })
      );
    } catch (error) {
      setCouponQuote(null);
      setCouponError(
        error instanceof Error ? error.message : "Unable to apply this coupon."
      );
    } finally {
      setIsApplyingCoupon(false);
    }
  }

  function removeCoupon() {
    setCouponCode("");
    setCouponQuote(null);
    setCouponError(null);
  }

  async function handleRazorpayCheckout() {
    if (!currentUser) {
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setCheckoutError("Please sign in again before unlocking premium access.");
      return;
    }

    if (couponCode.trim() && !couponQuote) {
      setCheckoutError("Apply the coupon before starting checkout.");
      return;
    }

    try {
      setIsRazorpayLoading(true);
      setCheckoutError(null);
      setCheckoutSuccess(null);

      await captureEmail({
        email: currentUser.email,
        source: `premium-razorpay-${activePlan.id}`,
      });

      const order = await createRazorpayOrder(token, {
        billing_interval: activePlan.id,
        coupon_code: couponQuote?.coupon_code ?? undefined
      });

      if (!order.key_id) {
        throw new Error("Razorpay checkout is not configured. Please contact support.");
      }

      await loadRazorpayCheckout();

      trackEvent("payment_started", {
        plan: activePlan.id,
        amount_inr: order.final_amount_inr,
        coupon_code: order.coupon_code ?? undefined,
        payment_method: "razorpay"
      });

      await new Promise<void>((resolve, reject) => {
        const checkout = new window.Razorpay!({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: "The Data Foundry",
          description: `${order.plan_label} access`,
          order_id: order.order_id,
          prefill: {
            name: currentUser.full_name || currentUser.name,
            email: currentUser.email
          },
          theme: {
            color: "#0f766e"
          },
          modal: {
            ondismiss: () => {
              reject(new Error("Payment cancelled. No charge was completed."));
            }
          },
          handler: async (response) => {
            try {
              const verification = await verifyRazorpayPayment(token, {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                billing_interval: activePlan.id,
                amount_inr: order.final_amount_inr,
                coupon_code: order.coupon_code ?? undefined
              });

              const premiumRecord: PremiumAccessRecord = {
                email: verification.email,
                unlockedAt: verification.granted_at,
                expiresAt: verification.expires_at,
                billing_interval: verification.billing_interval,
                amount_inr: verification.final_amount_inr,
                payment_reference: response.razorpay_payment_id,
                plan_label: verification.plan_label,
                payment_method: "razorpay"
              };
              savePremiumAccess(premiumRecord);
              setPremiumAccessState(premiumRecord);
              setCheckoutSuccess("Payment verified. Premium access is active on this device.");
              onUnlocked?.();
              resolve();
            } catch (error) {
              reject(error);
            }
          }
        });

        checkout.on("payment.failed", (response) => {
          reject(
            new Error(
              response.error?.description ||
                response.error?.reason ||
                "Payment failed. Please try again."
            )
          );
        });

        checkout.open();
      });
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Unable to complete Razorpay checkout. Please try again."
      );
    } finally {
      setIsRazorpayLoading(false);
    }
  }

  async function handleFreeCouponUnlock() {
    if (!currentUser) {
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setCheckoutError("Please sign in again before unlocking premium access.");
      return;
    }

    if (!couponQuote || couponQuote.final_amount_inr !== 0) {
      setCheckoutError("Apply a valid 100% coupon before unlocking premium access.");
      return;
    }

    try {
      setIsRazorpayLoading(true);
      setCheckoutError(null);
      setCheckoutSuccess(null);

      const response = await submitManualPremiumPayment(token, {
        plan_label: couponQuote.plan_label,
        billing_interval: activePlan.id,
        amount_inr: 0,
        payment_reference: `COUPON-${couponQuote.coupon_code}-${Date.now()}`,
        coupon_code: couponQuote.coupon_code ?? undefined
      });

      if (!response.unlocked_premium) {
        throw new Error("Coupon unlock is pending review. Please contact support.");
      }

      const premiumRecord: PremiumAccessRecord = {
        email: response.email,
        unlockedAt: response.granted_at ?? new Date().toISOString(),
        expiresAt: response.expires_at ?? new Date().toISOString(),
        billing_interval: response.billing_interval,
        amount_inr: response.final_amount_inr,
        payment_reference: response.coupon_code ?? "COUPON",
        plan_label: response.plan_label,
        payment_method: "coupon"
      };
      savePremiumAccess(premiumRecord);
      setPremiumAccessState(premiumRecord);
      setCheckoutSuccess("Coupon applied. Premium access is active.");
      onUnlocked?.();
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Unable to unlock premium with this coupon. Please try again."
      );
    } finally {
      setIsRazorpayLoading(false);
    }
  }

  if (!currentUser) {
    return (
      <AuthForm
        title="Create an account to continue"
        description="Sign in with OTP first, then choose a plan and pay securely with Razorpay."
      />
    );
  }

  if (premiumAccess) {
    return (
      <div className="panel rounded-3xl border border-teal-300/20 bg-teal-300/10 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-teal-50">Premium unlocked</h3>
            <p className="mt-2 text-sm leading-6 text-teal-100">
              {currentUser.email} is active on the{" "}
              <span className="font-semibold">{premiumAccess.plan_label}</span> plan.
            </p>
          </div>
          <span className="rounded-full border border-teal-200/30 bg-teal-200/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal-50">
            {premiumAccess.billing_interval}
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-teal-200/20 bg-slate-950/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-teal-200/70">Plan price</p>
            <p className="mt-2 text-lg font-semibold text-teal-50">Rs {premiumAccess.amount_inr}</p>
          </div>
          <div className="rounded-2xl border border-teal-200/20 bg-slate-950/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-teal-200/70">Unlocked at</p>
            <p className="mt-2 text-sm font-semibold text-teal-50">
              {formatTimestamp(premiumAccess.unlockedAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-teal-200/20 bg-slate-950/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-teal-200/70">Valid until</p>
            <p className="mt-2 text-sm font-semibold text-teal-50">
              {formatTimestamp(premiumAccess.expiresAt)}
            </p>
          </div>
          <div className="rounded-2xl border border-teal-200/20 bg-slate-950/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-teal-200/70">Payment reference</p>
            <p className="mt-2 text-sm font-semibold text-teal-50">
              {premiumAccess.payment_reference}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel rounded-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-slate-50">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
          Signed in as <span className="font-semibold text-slate-50">{currentUser.email}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {PRICING_PLANS.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => choosePlan(plan.id)}
                className={`rounded-3xl border p-5 text-left transition ${
                  selectedPlan === plan.id
                    ? "border-amber-300/50 bg-amber-300/10 shadow-glow"
                    : "border-slate-700 bg-slate-950/30 hover:border-amber-300/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                      {plan.label}
                    </p>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <span className="text-3xl font-semibold text-slate-50">
                        Rs {plan.amountInr}
                      </span>
                      <span className="pb-1 text-sm text-slate-400">{plan.cadenceLabel}</span>
                    </div>
                    {plan.compareAtInr ? (
                      <p className="mt-2 text-sm text-slate-500">
                        <span className="line-through">Rs {plan.compareAtInr}</span> before launch
                      </p>
                    ) : null}
                  </div>
                  {plan.badge ? (
                    <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                      {plan.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-300">{plan.summary}</p>
              </button>
            ))}
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-950/35 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              What happens next
            </p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
              <p>1. Pick a plan.</p>
              <p>2. Pay securely with Razorpay using UPI, cards, wallets, or net banking.</p>
              <p>3. Premium access unlocks after payment signature verification.</p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-700 bg-slate-950/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                Secure Checkout
              </p>
              <h4 className="mt-2 text-2xl font-semibold text-slate-50">{activePlan.label}</h4>
            </div>
            <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100">
              Razorpay + UPI
            </span>
          </div>

          <div className="mt-5 rounded-3xl border border-slate-700 bg-slate-950/35 p-4">
            <label
              htmlFor="premium-coupon-code"
              className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400"
            >
              Have a coupon?
            </label>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                id="premium-coupon-code"
                type="text"
                value={couponCode}
                onChange={(event) => {
                  setCouponCode(event.target.value);
                  setCouponQuote(null);
                  setCouponError(null);
                }}
                placeholder="Enter coupon code"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm uppercase text-slate-100 outline-none transition focus:border-amber-300/40"
              />
              {couponQuote ? (
                <button
                  type="button"
                  onClick={removeCoupon}
                  className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-rose-300/40"
                >
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={isApplyingCoupon}
                  className="rounded-full border border-amber-300/35 bg-amber-300/10 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-wait disabled:opacity-60"
                >
                  {isApplyingCoupon ? "Applying..." : "Apply coupon"}
                </button>
              )}
            </div>
            {couponQuote ? (
              <div className="mt-3 rounded-2xl border border-teal-300/20 bg-teal-300/10 px-4 py-3">
                <p className="text-sm font-semibold text-teal-100">
                  {couponQuote.discount_label} applied
                </p>
                <p className="mt-1 text-xs leading-5 text-teal-100/80">
                  {couponQuote.coupon_description}
                </p>
              </div>
            ) : null}
            {couponError ? (
              <p className="mt-3 text-sm text-rose-200">{couponError}</p>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Payable</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <p className="text-xl font-semibold text-slate-50">Rs {payableAmount}</p>
                {couponQuote ? (
                  <p className="text-sm text-slate-500 line-through">
                    Rs {couponQuote.original_amount_inr}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Activation</p>
              <p className="mt-2 text-sm font-semibold text-slate-50">Instant after verification</p>
            </div>
          </div>

          <button
            type="button"
            onClick={payableAmount === 0 ? handleFreeCouponUnlock : handleRazorpayCheckout}
            disabled={isRazorpayLoading}
            className="mt-5 w-full rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200 disabled:cursor-not-allowed disabled:bg-teal-100"
          >
            {isRazorpayLoading
              ? payableAmount === 0
                ? "Unlocking access..."
                : "Opening Razorpay..."
              : payableAmount === 0
                ? "Unlock premium with coupon"
                : `Pay Rs ${payableAmount} securely`}
          </button>

          <p className="mt-3 text-center text-xs leading-5 text-slate-500">
            Razorpay supports UPI, cards, wallets, and net banking. Premium access unlocks only
            after the payment signature and amount are verified.
          </p>

          {checkoutError ? (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {checkoutError}
            </div>
          ) : null}

          {checkoutSuccess ? (
            <div className="mt-4 rounded-2xl border border-teal-300/20 bg-teal-300/10 px-4 py-3 text-sm text-teal-100">
              {checkoutSuccess}
            </div>
          ) : null}

        </div>
      </div>
    </div>
  );
}
