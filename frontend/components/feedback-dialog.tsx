"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { submitProductFeedback } from "../lib/api";
import { getCurrentUser } from "../lib/auth";
import type { ProductFeedbackRequest } from "../lib/types";

const CATEGORIES: Array<{ value: ProductFeedbackRequest["category"]; label: string }> = [
  { value: "general", label: "General feedback" },
  { value: "content", label: "Question or explanation" },
  { value: "bug", label: "Something is not working" },
  { value: "feature", label: "Feature suggestion" },
  { value: "other", label: "Other" }
];

interface FeedbackDialogProps {
  triggerLabel?: string;
  defaultCategory?: ProductFeedbackRequest["category"];
  triggerClassName?: string;
}

export function FeedbackDialog({
  triggerLabel = "Share feedback",
  defaultCategory = "general",
  triggerClassName = "inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
}: FeedbackDialogProps = {}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<ProductFeedbackRequest["category"]>(defaultCategory);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [website, setWebsite] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCategory(defaultCategory);
    const currentUser = getCurrentUser();
    if (currentUser) {
      setName((current) => current || currentUser.full_name);
      setEmail((current) => current || currentUser.email);
    }
  }, [defaultCategory, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!dialog) return;
    dialog.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]"
      )).filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (active === first || active === dialog || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || active === dialog || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await submitProductFeedback({
        name,
        email,
        category,
        message,
        rating: rating ?? undefined,
        page_url: window.location.pathname,
        website
      });
      setSuccess(response.message);
      setMessage("");
      setRating(null);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Feedback could not be sent right now."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>

      {isOpen ? createPortal(
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 px-4 py-6 backdrop-blur-sm sm:py-10"
          onClick={() => setIsOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="mx-auto w-full max-w-2xl rounded-[2rem] border border-slate-800 bg-slate-950 p-6 shadow-2xl sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
                  Help shape The Data Foundry
                </p>
                <h2 id="feedback-title" className="mt-3 text-2xl font-semibold text-slate-50">
                  Tell us what would make your practice better.
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Honest feedback is welcome. Report unclear questions, broken flows, or ideas
                  that would make the platform more useful.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close feedback form"
                onClick={() => setIsOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 text-xl text-slate-300 transition hover:border-teal-300/40 hover:text-teal-100"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Your name" htmlFor="feedback-name">
                  <input
                    id="feedback-name"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
                  />
                </FormField>
                <FormField label="Email" htmlFor="feedback-email">
                  <input
                    id="feedback-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
                  />
                </FormField>
              </div>

              <FormField label="Feedback type" htmlFor="feedback-category">
                <select
                  id="feedback-category"
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as ProductFeedbackRequest["category"])
                  }
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
                >
                  {CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <fieldset>
                <legend className="text-sm text-slate-300">Overall experience (optional)</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`Rate ${value} out of 5`}
                      aria-pressed={rating === value}
                      onClick={() => setRating(value)}
                      className={`h-10 w-10 rounded-full border text-sm font-semibold transition ${
                        rating === value
                          ? "border-amber-300 bg-amber-300 text-slate-950"
                          : "border-slate-700 text-slate-300 hover:border-amber-300/50 hover:text-amber-100"
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>

              <FormField label="Your feedback" htmlFor="feedback-message">
                <textarea
                  id="feedback-message"
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={6}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="What worked well? What was confusing or missing?"
                  className="w-full resize-y rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm leading-6 text-slate-100 outline-none transition focus:border-teal-300/50"
                />
              </FormField>

              <div className="absolute -left-[9999px]" aria-hidden="true">
                <label htmlFor="feedback-website">Website</label>
                <input
                  id="feedback-website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </div>

              {error ? (
                <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </p>
              ) : null}
              {success ? (
                <p
                  role="status"
                  className="rounded-2xl border border-teal-300/20 bg-teal-300/10 px-4 py-3 text-sm text-teal-100"
                >
                  {success}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmitting ? "Sending feedback..." : "Send feedback"}
              </button>
            </form>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

function FormField({
  label,
  htmlFor,
  children
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm text-slate-300">
        {label}
      </label>
      {children}
    </div>
  );
}
