"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AUTH_UPDATED_EVENT, getAuthToken } from "./auth";
import {
  PREMIUM_ACCESS_UPDATED_EVENT,
  refreshPremiumAccessFromServer,
  type PremiumAccessRecord
} from "./premium-access";

export type PremiumEntitlementStatus = "checking" | "active" | "inactive" | "unavailable";

export function usePremiumEntitlement() {
  const [access, setAccess] = useState<PremiumAccessRecord | null>(null);
  const [status, setStatus] = useState<PremiumEntitlementStatus>("checking");
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) {
      return;
    }
    refreshInFlight.current = true;
    const token = getAuthToken();
    if (!token) {
      setAccess(null);
      setStatus("inactive");
      refreshInFlight.current = false;
      return;
    }

    setStatus("checking");
    try {
      const confirmedAccess = await refreshPremiumAccessFromServer(token);
      setAccess(confirmedAccess);
      setStatus(confirmedAccess ? "active" : "inactive");
    } catch {
      // Fail closed when durable entitlement cannot be confirmed.
      setAccess(null);
      setStatus("unavailable");
    } finally {
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const syncAuth = () => void refresh();
    window.addEventListener(AUTH_UPDATED_EVENT, syncAuth);
    window.addEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncAuth);
    window.addEventListener("storage", syncAuth);
    return () => {
      window.removeEventListener(AUTH_UPDATED_EVENT, syncAuth);
      window.removeEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncAuth);
      window.removeEventListener("storage", syncAuth);
    };
  }, [refresh]);

  return {
    access,
    hasPremiumAccess: status === "active" && Boolean(access),
    status,
    refresh
  };
}
