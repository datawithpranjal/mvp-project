"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { saveAuthSession } from "../../../lib/auth";
import { finishGoogleAttempt, getGoogleAttempt, safeReturnTo } from "../../../lib/auth-flow";
import { sendUsageEvent } from "../../../lib/usage";
import { AuthForm } from "../../../components/auth-form";
import type { AuthSessionResponse, AuthUserProfile } from "../../../lib/types";

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCallbackShell />}>
      <AuthCallbackContent />
    </Suspense>
  );
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [returnPath, setReturnPath] = useState("/dashboard");
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const hashParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.hash.replace(/^#/, ""))
        : new URLSearchParams();
    const attempt = getGoogleAttempt();
    const destination = safeReturnTo(attempt?.returnTo);
    setReturnPath(destination);
    const callbackError = searchParams.get("error") ?? hashParams.get("error");
    // Remove credentials from browser history before any further UI work.
    window.history.replaceState(null, "", "/auth/callback");
    if (callbackError) {
      setError(callbackError);
      sendUsageEvent("auth_failed", { metadata: { phase: "google_callback" } });
      return;
    }

    const token = hashParams.get("token");
    const expiresAt = hashParams.get("expires_at");
    const userJson = hashParams.get("user");

    if (!token || !expiresAt || !userJson) {
      setError("Google login did not return a valid session.");
      return;
    }

    try {
      const user = JSON.parse(userJson) as AuthUserProfile;
      if (!user.id || !user.email || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now() || !finishGoogleAttempt(hashParams.get("state"))) {
        throw new Error("This login was not started in this browser. Please try again.");
      }
      const session: AuthSessionResponse = {
        token,
        token_type: "bearer",
        expires_at: expiresAt,
        user
      };
      saveAuthSession(session);
      sendUsageEvent("auth_succeeded", { metadata: { method: "google", elapsed_ms: Date.now() - (attempt?.at ?? Date.now()) } });
      router.replace(destination);
    } catch {
      setError("Unable to complete Google login.");
    }
  }, [router, searchParams]);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        {error ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-200">
              Login failed
            </p>
            <h1 className="mt-4 text-3xl font-semibold text-slate-50">
              Google login could not be completed.
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">{error}</p>
            <div className="mt-5"><AuthForm title="Continue with your account" description="Use the email linked to your Premium access and saved progress." returnTo={returnPath} onSuccess={() => router.replace(returnPath)} /></div>
            <Link
              href={returnPath}
              className="mt-6 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Back to your practice
            </Link>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              Login
            </p>
            <h1 className="mt-4 text-3xl font-semibold text-slate-50">
              Completing Google login...
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Your session is being saved in this browser.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function AuthCallbackShell() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10 sm:px-10">
      <section className="panel rounded-[2rem] p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
          Login
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-50">
          Completing Google login...
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          Your session is being prepared.
        </p>
      </section>
    </main>
  );
}
