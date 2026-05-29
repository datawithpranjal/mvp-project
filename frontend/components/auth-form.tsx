"use client";

import { useState, type FormEvent } from "react";

import { getGoogleAuthStartUrl, requestAuthOtp, verifyAuthOtp } from "../lib/api";
import { saveAuthSession, type AuthUser } from "../lib/auth";

interface AuthFormProps {
  title: string;
  description: string;
  onSuccess?: (user: AuthUser) => void;
}

const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced"];

export function AuthForm({ title, description, onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [step, setStep] = useState<"details" | "otp">("details");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("Beginner");
  const [targetRole, setTargetRole] = useState("");
  const [country, setCountry] = useState("India");
  const [preparationGoal, setPreparationGoal] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function switchMode(nextMode: "signin" | "signup") {
    setMode(nextMode);
    setStep("details");
    setOtpCode("");
    setDemoOtp(null);
    setError(null);
  }

  async function handleRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await requestAuthOtp({
        mode,
        email,
        full_name: mode === "signup" ? fullName : undefined,
        role: mode === "signup" ? role : undefined,
        experience_level: mode === "signup" ? experienceLevel : undefined,
        target_role: mode === "signup" ? targetRole : undefined,
        country: mode === "signup" ? country : undefined,
        preparation_goal: mode === "signup" ? preparationGoal : undefined
      });

      setEmail(response.email);
      setDemoOtp(response.debug_otp ?? null);
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

      <div className="mt-5 flex gap-2">
        {[
          ["signin", "Sign in"],
          ["signup", "Sign up"]
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => switchMode(value as "signin" | "signup")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              mode === value
                ? "bg-teal-300 text-slate-950"
                : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:border-teal-300/40"
            }`}
          >
            {label}
          </button>
        ))}
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

      {step === "details" ? (
        <form onSubmit={handleRequestOtp} className="mt-5 space-y-4">
          {mode === "signup" ? (
            <div>
              <label htmlFor="auth-full-name" className="mb-2 block text-sm text-slate-300">
                Full name
              </label>
              <input
                id="auth-full-name"
                type="text"
                required
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
          </div>

          {mode === "signup" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="auth-role" className="mb-2 block text-sm text-slate-300">
                    Current role
                  </label>
                  <input
                    id="auth-role"
                    type="text"
                    required
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    placeholder="Data analyst"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
                  />
                </div>
                <div>
                  <label htmlFor="auth-experience" className="mb-2 block text-sm text-slate-300">
                    Experience level
                  </label>
                  <select
                    id="auth-experience"
                    value={experienceLevel}
                    onChange={(event) => setExperienceLevel(event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
                  >
                    {EXPERIENCE_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="auth-target-role" className="mb-2 block text-sm text-slate-300">
                    Target role
                  </label>
                  <input
                    id="auth-target-role"
                    type="text"
                    required
                    value={targetRole}
                    onChange={(event) => setTargetRole(event.target.value)}
                    placeholder="Data Engineer"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
                  />
                </div>
                <div>
                  <label htmlFor="auth-country" className="mb-2 block text-sm text-slate-300">
                    Country
                  </label>
                  <input
                    id="auth-country"
                    type="text"
                    required
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    placeholder="India"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="auth-goal" className="mb-2 block text-sm text-slate-300">
                  Preparation goal
                </label>
                <textarea
                  id="auth-goal"
                  required
                  value={preparationGoal}
                  onChange={(event) => setPreparationGoal(event.target.value)}
                  placeholder="Crack data engineering interviews in the next 90 days."
                  rows={2}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
                />
              </div>
            </>
          ) : null}

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
            {isSubmitting ? "Sending OTP..." : "Send OTP"}
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

          {error ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep("details")}
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
