"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  AUTH_UPDATED_EVENT,
  getCurrentUser,
  type AuthUser
} from "../lib/auth";
import { getUsageSessionId, sendUsageEvent } from "../lib/usage";

const SESSION_START_PREFIX = "data-foundry-usage-started";
const HEARTBEAT_INTERVAL_MS = 30_000;

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function UsageTracker() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const lastHeartbeatAt = useRef(Date.now());

  useEffect(() => {
    function syncUser() {
      setCurrentUser(getCurrentUser());
    }

    syncUser();
    window.addEventListener(AUTH_UPDATED_EVENT, syncUser);
    window.addEventListener("storage", syncUser);
    return () => {
      window.removeEventListener(AUTH_UPDATED_EVENT, syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, []);

  useEffect(() => {
    if (!currentUser || !canUseSessionStorage()) return;

    const sessionId = getUsageSessionId();
    const markerKey = `${SESSION_START_PREFIX}-${sessionId}-${currentUser.id}`;
    if (!window.sessionStorage.getItem(markerKey)) {
      window.sessionStorage.setItem(markerKey, "true");
      sendUsageEvent("session_start", {
        metadata: {
          user_id: currentUser.id
        }
      });
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    sendUsageEvent("page_view", {
      metadata: {
        path: pathname
      }
    });
  }, [currentUser, pathname]);

  useEffect(() => {
    if (!currentUser) return;

    lastHeartbeatAt.current = Date.now();

    function sendHeartbeat() {
      if (document.visibilityState !== "visible") {
        lastHeartbeatAt.current = Date.now();
        return;
      }

      const now = Date.now();
      const activeSeconds = Math.max(
        1,
        Math.min(60, Math.round((now - lastHeartbeatAt.current) / 1000))
      );
      lastHeartbeatAt.current = now;
      sendUsageEvent("session_heartbeat", {
        activeSeconds,
        metadata: {
          path: window.location.pathname
        }
      });
    }

    const intervalId = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", sendHeartbeat);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", sendHeartbeat);
    };
  }, [currentUser]);

  return null;
}
