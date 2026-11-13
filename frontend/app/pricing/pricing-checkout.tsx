"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { PremiumUpgradePanel } from "../../components/premium-upgrade-panel";
import { TrackedLink } from "../../components/tracked-link";
import type { BillingInterval } from "../../lib/premium-access";

const CHECKOUT_HASH = "#unlock-premium";

function checkoutHref(plan: BillingInterval, search = "") {
  const params = new URLSearchParams(search);
  params.set("plan", plan);
  return `/pricing?${params}${CHECKOUT_HASH}`;
}

interface PricingPlanLinkProps {
  plan: BillingInterval;
  source: string;
  className: string;
  children: ReactNode;
}

function PlanLink({ plan, source, className, children, search }: PricingPlanLinkProps & { search?: string }) {
  return (
    <TrackedLink
      href={checkoutHref(plan, search)}
      usageDestination={CHECKOUT_HASH}
      event="premium_unlock_clicked"
      eventPayload={{ source }}
      className={className}
    >
      {children}
    </TrackedLink>
  );
}

function PlanLinkWithSearch(props: PricingPlanLinkProps) {
  return <PlanLink {...props} search={useSearchParams().toString()} />;
}

export function PricingPlanLink(props: PricingPlanLinkProps) {
  return (
    <Suspense fallback={<PlanLink {...props} />}>
      <PlanLinkWithSearch {...props} />
    </Suspense>
  );
}

interface PricingCheckoutProps {
  title: string;
  description: string;
}

function CheckoutWithSelection(props: PricingCheckoutProps) {
  const plans = useSearchParams().getAll("plan");
  const billingInterval = plans.length === 1 && plans[0] === "monthly" ? "monthly" : "yearly";

  return (
    <PremiumUpgradePanel
      {...props}
      billingInterval={billingInterval}
      onBillingIntervalChange={(plan) => {
        window.history.replaceState(null, "", checkoutHref(plan, window.location.search));
      }}
    />
  );
}

export function PricingCheckout(props: PricingCheckoutProps) {
  return (
    <Suspense fallback={null}>
      <CheckoutWithSelection {...props} />
    </Suspense>
  );
}
