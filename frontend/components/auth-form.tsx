"use client";

import { useEffect, useState, type FormEvent } from "react";

import { requestAuthOtp, verifyAuthOtp } from "../lib/api";
import { saveAuthSession, type AuthUser } from "../lib/auth";
import type { AuthRequestOtpRequest } from "../lib/types";

interface AuthFormProps {
  title: string;
  description: string;
  initialMode?: "signin" | "signup";
  showModeTabs?: boolean;
  showOtpBadge?: boolean;
  onSuccess?: (user: AuthUser) => void;
}

export function AuthForm({
  title,
  description,
  initialMode = "signin",
  showModeTabs = true,
  showOtpBadge = true,
  onSuccess
}: AuthFormProps) {
  const [step, setStep] = useState<"details" | "otp">("details");
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (step !== "otp" || resendSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendSeconds, step]);

  function otpRequestPayload(): AuthRequestOtpRequest {
    return mode === "signup"
      ? { mode, email, full_name: fullName }
      : { mode, email };
  }

  async function handleRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await requestAuthOtp(otpRequestPayload());

      setEmail(response.email);
      setDemoOtp(response.debug_otp ?? null);
      setResendSeconds(response.resend_after_seconds ?? 60);
      setResendMessage(null);
      setStep("otp");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to send OTP right now.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendOtp() {
    if (resendSeconds > 0 || isResendingOtp) {
      return;
    }

    try {
      setIsResendingOtp(true);
      setError(null);
      setResendMessage(null);
      const response = await requestAuthOtp(otpRequestPayload());
      setDemoOtp(response.debug_otp ?? null);
      setOtpCode("");
      setResendSeconds(response.resend_after_seconds ?? 60);
      setResendMessage(`A new OTP was sent to ${response.email}.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to resend OTP right now."
      );
    } finally {
      setIsResendingOtp(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError(null);
      const session = await verifyAuthOtp({
        email,
        otp_code: otpCode
      });
      const user = saveAuthSession(session);
      onSuccess?.(user);
    } catch (verifyError) {
      const message =
        verifyError instanceof Error ? verifyError.message : "Unable to verify OTP.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="panel w-full rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
        </div>
        {showOtpBadge ? (
          <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
            OTP Login
          </span>
        ) : null}
      </div>

      {step === "details" ? (
        <form onSubmit={handleRequestOtp} className="mt-5 space-y-4">
          {showModeTabs ? (
            <div
              role="tablist"
              aria-label="Choose account action"
              className="grid grid-cols-2 rounded-2xl border border-slate-800 bg-slate-950/35 p-1"
            >
              {([
                ["signin", "Log in"],
                ["signup", "Create account"]
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    mode === value
                      ? "bg-teal-300 text-slate-950"
                      : "text-slate-300 hover:text-teal-100"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {mode === "signup" ? (
            <div>
              <label htmlFor="auth-name" className="mb-2 block text-sm text-slate-300">
                Your name
              </label>
              <input
                id="auth-name"
                type="text"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Pranjal Patidar"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
              />
            </div>
          ) : null}

          <div>
            <label htmlFor="auth-email" className="mb-2 block text-sm text-slate-300">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {mode === "signup"
                ? "We only need your name and email to create your learner profile."
                : "Enter the email linked to your existing account."}
            </p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-amber-100"
          >
            {isSubmitting
              ? "Sending OTP..."
              : mode === "signup"
                ? "Create account and send OTP"
                : "Send login OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="mt-5 space-y-4">
          <div className="rounded-2xl border border-teal-300/20 bg-teal-300/10 px-4 py-3 text-sm text-teal-100">
            {demoOtp ? "Demo OTP generated for " : "OTP sent to "}
            <span className="font-semibold">{email}</span>
            {demoOtp ? (
              <span className="mt-2 block text-lg font-semibold tracking-[0.22em] text-teal-50">
                {demoOtp}
              </span>
            ) : (
              <span className="mt-2 block text-sm text-teal-100/80">
                Check your inbox and enter the 6 digit code.
              </span>
            )}
          </div>

          <div>
            <label htmlFor="auth-otp" className="mb-2 block text-sm text-slate-300">
              6 digit OTP
            </label>
            <input
              id="auth-otp"
              type="text"
              inputMode="numeric"
              required
              minLength={6}
              maxLength={6}
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-center text-lg font-semibold tracking-[0.22em] text-slate-100 outline-none transition focus:border-teal-300/50"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/30 px-4 py-3">
            <p className="text-sm text-slate-400">Didn&apos;t receive the code?</p>
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={resendSeconds > 0 || isResendingOtp}
              className="text-sm font-semibold text-teal-200 transition hover:text-teal-100 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              {isResendingOtp
                ? "Sending..."
                : resendSeconds > 0
                  ? `Resend OTP in ${resendSeconds}s`
                  : "Resend OTP"}
            </button>
          </div>

          {resendMessage ? (
            <div
              aria-live="polite"
              className="rounded-2xl border border-teal-300/20 bg-teal-300/10 px-4 py-3 text-sm text-teal-100"
            >
              {resendMessage}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setStep("details");
                setResendSeconds(0);
                setResendMessage(null);
                setError(null);
              }}
              className="rounded-full border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40"
            >
              {mode === "signup" ? "Change details" : "Change email"}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full bg-amber-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-amber-100"
            >
              {isSubmitting ? "Verifying..." : "Verify and continue"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
