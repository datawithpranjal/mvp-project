"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { trackEvent, type AnalyticsEvent } from "../lib/analytics";
import { sendUsageEvent } from "../lib/usage";

interface TrackedLinkProps extends ComponentProps<typeof Link> {
  event: AnalyticsEvent;
  eventPayload?: Record<string, string | number | boolean | null | undefined>;
}

export function TrackedLink({
  event,
  eventPayload,
  onClick,
  ...props
}: TrackedLinkProps) {
  const usageEvent =
    event === "homepage_start_clicked"
      ? "primary_cta_clicked"
      : event === "premium_unlock_clicked"
        ? "premium_unlock_clicked"
        : null;

  return (
    <Link
      {...props}
      onClick={(clickEvent) => {
        trackEvent(event, eventPayload);
        if (usageEvent) {
          sendUsageEvent(usageEvent, {
            metadata: {
              ...eventPayload,
              destination:
                typeof props.href === "string"
                  ? props.href
                  : props.href.pathname ?? "unknown"
            }
          });
        }
        onClick?.(clickEvent);
      }}
    />
  );
}
