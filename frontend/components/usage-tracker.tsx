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
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() =>
    typeof window === "undefined" ? null : getCurrentUser()
  );
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
    if (!canUseSessionStorage()) return;

    const sessionId = getUsageSessionId();
    const markerKey = `${SESSION_START_PREFIX}-${sessionId}`;
    if (!window.sessionStorage.getItem(markerKey)) {
      window.sessionStorage.setItem(markerKey, "true");
      sendUsageEvent("session_start", {
        metadata: {
          user_id: currentUser?.id ?? null
        }
      });
    }
  }, [currentUser]);

  useEffect(() => {
    sendUsageEvent("page_view", {
      metadata: {
        path: pathname
      }
    });
  }, [pathname]);

  useEffect(() => {
    const contentMetadata = getContentViewMetadata(pathname);
    if (!contentMetadata) return;
    sendUsageEvent("content_view", {
      metadata: contentMetadata
    });
  }, [pathname]);

  useEffect(() => {
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
  }, []);

  return null;
}

function getContentViewMetadata(pathname: string): Record<string, string | number | boolean | null> | null {
  if (pathname === "/") {
    return {
      content_type: "homepage",
      content_id: "home",
      section: "public"
    };
  }

  if (pathname.startsWith("/scenarios/")) {
    const slug = pathname.split("/").filter(Boolean).at(1);
    if (!slug) return null;
    return {
      content_type: "scenario",
      content_id: slug,
      section: "scenario_playground"
    };
  }

  if (pathname.startsWith("/labs/")) {
    const track = pathname.split("/").filter(Boolean).at(1) ?? "all";
    return {
      content_type: "lab",
      content_id: track,
      section: "practice",
      track
    };
  }

  if (pathname === "/system-design") {
    return {
      content_type: "system_design",
      content_id: "system-design",
      section: "practice"
    };
  }

  if (pathname === "/roadmap" || pathname === "/pricing" || pathname === "/dashboard") {
    return {
      content_type: "platform_page",
      content_id: pathname.replace("/", "") || "home",
      section: "platform"
    };
  }

  return null;
}
