"use client";

import { useEffect, useState, type FormEvent } from "react";

import { getGoogleAuthStartUrl, requestAuthOtp, verifyAuthOtp } from "../lib/api";
import { saveAuthSession, type AuthUser } from "../lib/auth";

interface AuthFormProps {
  title: string;
  description: string;
  onSuccess?: (user: AuthUser) => void;
}

export function AuthForm({ title, description, onSuccess }: AuthFormProps) {
  const [step, setStep] = useState<"details" | "otp">("details");
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

  function otpRequestPayload() {
    return {
      mode: "signup" as const,
      email
    } as const;
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

  async function handleGoogleLogin() {
    try {
      setIsSubmitting(true);
      setError(null);
      const response = await getGoogleAuthStartUrl("/dashboard");
      window.location.href = response.url;
    } catch (googleError) {
      const message =
        googleError instanceof Error
          ? googleError.message
          : "Google login is not available right now.";
      setError(message);
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
        <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
          OTP Login
        </span>
      </div>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={isSubmitting}
        className="mt-5 flex w-full items-center justify-center gap-3 rounded-full border border-slate-700 bg-slate-950/30 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-teal-300/40 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-950">
          G
        </span>
        Continue with Google
      </button>

      <div className="mt-4 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-500">
        <span className="h-px flex-1 bg-slate-800" />
        or use email OTP
        <span className="h-px flex-1 bg-slate-800" />
      </div>

      {step === "details" ? (
        <form onSubmit={handleRequestOtp} className="mt-5 space-y-4">
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
              No password and no long form. We will create your account automatically if this
              email is new.
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
            {isSubmitting ? "Sending OTP..." : "Continue with email"}
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
              Change email
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
