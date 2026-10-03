"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError, getAuthProviders, requestAuthOtp, verifyAuthOtp } from "../lib/api";
import { saveAuthSession, type AuthUser } from "../lib/auth";
import { BEFORE_AUTH_EVENT, beginGoogleLogin } from "../lib/auth-flow";
import { sendUsageEvent } from "../lib/usage";

interface AuthFormProps {
  title: string;
  description: string;
  returnTo?: string;
  onSuccess?: (user: AuthUser) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 429) return error.message;
  if (error instanceof ApiError && error.status === 401) return "That code is invalid or expired. Use the latest email, or request a new code.";
  if (error instanceof ApiError && error.status >= 500) return "We could not reach the login service. Your draft is safe. Please try again shortly.";
  if (error instanceof ApiError && error.status === 404) return "Login is temporarily unavailable. Please try again shortly.";
  if (error instanceof Error && error.message !== "Failed to fetch") return error.message;
  return "Connection interrupted. Check your connection and try again. Your draft is safe.";
}

export function AuthForm({ title, description, returnTo, onSuccess }: AuthFormProps) {
  const id = useId();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [expiresMinutes, setExpiresMinutes] = useState(10);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [busy, setBusy] = useState<"send" | "verify" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef<number | null>(null);
  const startedMethod = useRef<"email" | "google" | null>(null);
  const opened = useRef(false);
  const inFlight = useRef(false);
  const lastAutomaticCode = useRef("");

  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      sendUsageEvent("auth_opened");
    }
    let active = true;
    void getAuthProviders().then((providers) => { if (active) setGoogleAvailable(providers.google); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (step === "code" && !busy) inputRef.current?.focus();
  }, [step, busy]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  function start(method: "email" | "google") {
    if (startedMethod.current !== method) {
      startedMethod.current = method;
      startedAt.current = Date.now();
      sendUsageEvent("auth_started", { metadata: { method } });
    }
    window.dispatchEvent(new Event(BEFORE_AUTH_EVENT));
  }

  function fail(requestError: unknown, phase: string) {
    setError(errorMessage(requestError));
    sendUsageEvent("auth_failed", { metadata: { method: startedMethod.current, phase, status: requestError instanceof ApiError ? requestError.status : 0 } });
  }

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (inFlight.current || resendSeconds > 0) return;
    inFlight.current = true;
    setBusy("send"); setError(null); setNotice(null);
    start("email");
    try {
      const response = await requestAuthOtp({ email: email.trim(), mode: "continue" });
      setEmail(response.email); setCode(""); lastAutomaticCode.current = "";
      setDemoCode(response.debug_otp ?? null);
      setExpiresMinutes(Math.ceil(response.expires_in_seconds / 60));
      setResendSeconds(response.resend_after_seconds);
      setStep("code"); setNotice("Code sent. If it does not arrive, check spam or use resend.");
      sendUsageEvent("auth_code_requested", { metadata: { method: "email", channel: response.delivery_channel } });
    } catch (requestError) { fail(requestError, "request_code"); }
    finally { inFlight.current = false; setBusy(null); }
  }

  async function verify(codeToVerify = code) {
    if (inFlight.current || codeToVerify.length !== 6) return;
    inFlight.current = true;
    setBusy("verify"); setError(null);
    try {
      window.dispatchEvent(new Event(BEFORE_AUTH_EVENT));
      const session = await verifyAuthOtp({ email, otp_code: codeToVerify });
      const user = saveAuthSession(session);
      sendUsageEvent("auth_succeeded", { metadata: { method: "email", elapsed_ms: Date.now() - (startedAt.current ?? Date.now()) } });
      onSuccess?.(user);
    } catch (verifyError) { fail(verifyError, "verify_code"); }
    finally { inFlight.current = false; setBusy(null); }
  }

  function changeCode(value: string) {
    const next = value.replace(/\D/g, "").slice(0, 6);
    setCode(next); setError(null);
    if (next.length === 6 && next !== lastAutomaticCode.current) {
      lastAutomaticCode.current = next;
      void verify(next);
    }
  }

  async function google() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy("google"); setError(null); start("google");
    try { await beginGoogleLogin(returnTo); }
    catch (requestError) { fail(requestError, "google_start"); inFlight.current = false; setBusy(null); }
  }

  const inputClass = "w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-slate-100 outline-none transition focus:border-teal-300";
  return (
    <div className="panel w-full rounded-3xl p-5 sm:p-7">
      <h3 className="text-xl font-semibold text-slate-50">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
      {step === "email" ? (
        <>
          {googleAvailable && <>
            <button type="button" onClick={() => void google()} disabled={busy !== null} className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-900 disabled:opacity-60">
              <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.04 46.98 31.87 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.85 23.85 0 0 0 0 24c0 3.87.94 7.52 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>
              {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </button>
            <p className="my-4 text-center text-xs text-slate-400">or continue with email</p>
          </>}
          <form onSubmit={sendCode} className="mt-5 space-y-4">
            <label htmlFor={`${id}-email`} className="block text-sm text-slate-300">Email address</label>
            <input id={`${id}-email`} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required value={email} disabled={busy !== null} onChange={(event) => { setEmail(event.target.value); setResendSeconds(0); }} placeholder="you@example.com" className={inputClass} />
            <p className="text-xs leading-5 text-slate-400">Use your existing account email to keep your Premium access and progress. New here? We&apos;ll create your account after verification.</p>
            <button type="submit" disabled={busy !== null || resendSeconds > 0} className="w-full rounded-full bg-teal-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">{busy === "send" ? "Sending code…" : resendSeconds > 0 ? `Resend available in ${resendSeconds}s` : "Continue with email"}</button>
            <p className="text-center text-xs text-slate-500">No password needed. Add profile details later.</p>
          </form>
        </>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); void verify(); }} className="mt-5 space-y-4">
          <p className="text-sm text-slate-300">Enter the code sent to <strong>{email}</strong>. It expires in {expiresMinutes} minutes.</p>
          {demoCode && <p className="text-sm text-amber-200">Local demo code: {demoCode}</p>}
          <label htmlFor={`${id}-code`} className="block text-sm text-slate-300">6-digit code</label>
          <input ref={inputRef} id={`${id}-code`} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required minLength={6} maxLength={6} disabled={busy !== null} value={code} onChange={(event) => changeCode(event.target.value)} onPaste={(event) => { event.preventDefault(); changeCode(event.clipboardData.getData("text")); }} aria-describedby={`${id}-status`} className={`${inputClass} text-center text-xl tracking-[0.35em]`} />
          <button type="submit" disabled={busy !== null || code.length !== 6} className="w-full rounded-full bg-teal-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">{busy === "verify" ? "Verifying…" : "Verify and continue"}</button>
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <button type="button" disabled={busy !== null || resendSeconds > 0} onClick={() => void sendCode()} className="font-semibold text-teal-200 disabled:text-slate-500">{busy === "send" ? "Sending…" : resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}</button>
            <button type="button" disabled={busy !== null} onClick={() => { setStep("email"); setCode(""); setError(null); setNotice(null); }} className="text-slate-300">Change email</button>
          </div>
        </form>
      )}
      <div id={`${id}-status`} aria-live="polite" className="mt-4 text-sm">
        {error ? <p role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-3 text-rose-200">{error}</p> : notice ? <p className="text-teal-100">{notice}</p> : null}
      </div>
    </div>
  );
}
