"use client";

import { useEffect, useRef, useState } from "react";
import { AUTH_UPDATED_EVENT, getAuthToken } from "./auth";
import { BEFORE_AUTH_EVENT, consumeAuthIntent } from "./auth-flow";

export function useAuthDraftFlush(flush: () => void): void {
  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => {
    const handler = () => latest.current();
    window.addEventListener(BEFORE_AUTH_EVENT, handler);
    return () => window.removeEventListener(BEFORE_AUTH_EVENT, handler);
  }, []);
}

export function useAuthContinuation(key: string, ready: boolean, resume: (action: string) => void): void {
  const latest = useRef(resume);
  const [epoch, setEpoch] = useState(0);
  latest.current = resume;
  useEffect(() => {
    const changed = () => setEpoch((value) => value + 1);
    window.addEventListener(AUTH_UPDATED_EVENT, changed);
    return () => window.removeEventListener(AUTH_UPDATED_EVENT, changed);
  }, []);
  useEffect(() => {
    if (!ready || !getAuthToken()) return;
    const timer = window.setTimeout(() => {
      const action = consumeAuthIntent(key);
      if (action && getAuthToken()) latest.current(action);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [key, ready, epoch]);
}
