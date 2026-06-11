"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { trackEvent, type AnalyticsEvent } from "../lib/analytics";

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
  return (
    <Link
      {...props}
      onClick={(clickEvent) => {
        trackEvent(event, eventPayload);
        onClick?.(clickEvent);
      }}
    />
  );
}
