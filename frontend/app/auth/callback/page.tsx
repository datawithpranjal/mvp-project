"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { saveAuthSession } from "../../../lib/auth";
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

  useEffect(() => {
    const hashParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.hash.replace(/^#/, ""))
        : new URLSearchParams();
    const callbackError = searchParams.get("error") ?? hashParams.get("error");
    if (callbackError) {
      setError(callbackError);
      return;
    }

    const token = searchParams.get("token") ?? hashParams.get("token");
    const expiresAt = searchParams.get("expires_at") ?? hashParams.get("expires_at");
    const userJson = searchParams.get("user") ?? hashParams.get("user");
    const returnTo = searchParams.get("return_to") ?? hashParams.get("return_to") ?? "/dashboard";

    if (!token || !expiresAt || !userJson) {
      setError("Google login did not return a valid session.");
      return;
    }

    try {
      const user = JSON.parse(userJson) as AuthUserProfile;
      const session: AuthSessionResponse = {
        token,
        token_type: "bearer",
        expires_at: expiresAt,
        user
      };
      saveAuthSession(session);
      router.replace(returnTo.startsWith("/") ? returnTo : "/dashboard");
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
            <Link
              href="/"
              className="mt-6 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Go back home
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
