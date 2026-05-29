"use client";

import { useEffect, useMemo, useState } from "react";

import { AUTH_UPDATED_EVENT, getCurrentUser, type AuthUser } from "../lib/auth";
import { captureEmail } from "../lib/api";
import {
  PREMIUM_ACCESS_UPDATED_EVENT,
  getPremiumAccess,
  savePremiumAccess,
  type BillingInterval,
  type PremiumAccessRecord
} from "../lib/premium-access";
import { AuthForm } from "./auth-form";
import { PaymentQrCode } from "./payment-qr-code";

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
  const [paymentReference, setPaymentReference] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);

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

  async function handleCompleteDemoPayment() {
    if (!currentUser) {
      return;
    }

    try {
      setIsCompletingPayment(true);
      setCheckoutError(null);

      await captureEmail({
        email: currentUser.email,
        source: `premium-upi-${activePlan.id}`,
      });

      savePremiumAccess({
        email: currentUser.email,
        unlockedAt: new Date().toISOString(),
        billing_interval: activePlan.id,
        amount_inr: activePlan.amountInr,
        payment_reference: paymentReference.trim() || `DEMO-UPI-${Date.now()}`,
        plan_label: activePlan.label,
        payment_method: "upi_manual"
      });
      onUnlocked?.();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to capture your email right now. Please try again.";
      setCheckoutError(message);
    } finally {
      setIsCompletingPayment(false);
    }
  }

  if (!currentUser) {
    return (
      <AuthForm
        title="Create an account to continue"
        description="Sign in with OTP first, then choose a plan and pay through the manual UPI QR."
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
        <div className="mt-4 grid gap-3 md:grid-cols-3">
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
                onClick={() => setSelectedPlan(plan.id)}
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
              <p>2. Scan the Paytm UPI QR and complete the payment manually.</p>
              <p>3. Enter a reference if you have one, then confirm access for this MVP.</p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-700 bg-slate-950/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                Manual UPI Checkout
              </p>
              <h4 className="mt-2 text-2xl font-semibold text-slate-50">{activePlan.label}</h4>
            </div>
            <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100">
              MVP manual flow
            </span>
          </div>

          <div className="mt-5 flex justify-center">
            <PaymentQrCode />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Payable</p>
              <p className="mt-2 text-xl font-semibold text-slate-50">Rs {activePlan.amountInr}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">UPI ID</p>
              <p className="mt-2 text-sm font-semibold text-slate-50">8889990355@pthdfc</p>
            </div>
          </div>

          <div className="mt-5">
            <label htmlFor="manual-upi-reference" className="mb-2 block text-sm text-slate-300">
              Payment reference
            </label>
            <input
              id="manual-upi-reference"
              type="text"
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              placeholder="Optional: UPI_REF_2026_001"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-amber-300/40"
            />
          </div>

          <p className="mt-4 text-sm leading-6 text-slate-400">
            This is an MVP manual checkout. The QR can accept UPI payments, but access
            confirmation is still handled inside this browser until a real payment gateway is added.
          </p>

          {checkoutError ? (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {checkoutError}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleCompleteDemoPayment}
            disabled={isCompletingPayment}
            className="mt-5 w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-amber-100"
          >
            {isCompletingPayment ? "Capturing access..." : "I completed the UPI payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
