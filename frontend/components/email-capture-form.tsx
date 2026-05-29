"use client";

import { useState, type FormEvent } from "react";

import { captureEmail } from "../lib/api";
import { savePremiumAccess } from "../lib/premium-access";

interface EmailCaptureFormProps {
  source: string;
  scenarioSlug?: string;
  title: string;
  description: string;
  buttonLabel?: string;
  onSuccess?: (email: string) => void;
}

export function EmailCaptureForm({
  source,
  scenarioSlug,
  title,
  description,
  buttonLabel = "Unlock premium scenarios",
  onSuccess
}: EmailCaptureFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError(null);
      const response = await captureEmail({
        email,
        source,
        scenario_slug: scenarioSlug
      });
      savePremiumAccess({
        email: response.email,
        unlockedAt: new Date().toISOString(),
        billing_interval: "yearly",
        amount_inr: 0,
        payment_reference: "legacy-email-unlock",
        plan_label: "Legacy Premium Unlock",
        payment_method: "upi_manual"
      });
      setIsSubmitted(true);
      onSuccess?.(response.email);
    } catch (captureError) {
      const message =
        captureError instanceof Error
          ? captureError.message
          : "Unable to unlock premium scenarios right now.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="panel rounded-3xl p-5">
      <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>

      {isSubmitted ? (
        <div className="mt-4 rounded-2xl border border-teal-300/20 bg-teal-300/10 px-4 py-4 text-sm text-teal-100">
          Premium scenarios unlocked for <span className="font-semibold">{email}</span>.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor={`email-capture-${source}`} className="sr-only">
              Email
            </label>
            <input
              id={`email-capture-${source}`}
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-amber-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-amber-100"
          >
            {isSubmitting ? "Unlocking..." : buttonLabel}
          </button>
        </form>
      )}
    </div>
  );
}
