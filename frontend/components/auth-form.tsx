"use client";

import { useState, type FormEvent } from "react";

import { saveCurrentUser, type AuthUser } from "../lib/auth";

interface AuthFormProps {
  title: string;
  description: string;
  onSuccess?: (user: AuthUser) => void;
}

export function AuthForm({ title, description, onSuccess }: AuthFormProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setError(null);
      const nextUser = saveCurrentUser({
        name,
        email,
        signedInAt: new Date().toISOString()
      });

      if (!nextUser) {
        setError("Unable to create a local demo session right now.");
        return;
      }

      onSuccess?.(nextUser);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="panel rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
        </div>
        <span className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
          Demo Auth
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
            onClick={() => setMode(value as "signin" | "signup")}
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

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {mode === "signup" ? (
          <div>
            <label htmlFor="demo-auth-name" className="mb-2 block text-sm text-slate-300">
              Full name
            </label>
            <input
              id="demo-auth-name"
              type="text"
              required={mode === "signup"}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Pranjal Patidar"
              className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-teal-300/50"
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="demo-auth-email" className="mb-2 block text-sm text-slate-300">
            Email
          </label>
          <input
            id="demo-auth-email"
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

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs leading-5 text-slate-500">
            Local demo session only. No real password or backend account is created yet.
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-amber-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-amber-100"
          >
            {isSubmitting ? "Saving..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </div>
      </form>
    </div>
  );
}
