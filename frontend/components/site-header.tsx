"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AUTH_UPDATED_EVENT, getCurrentUser, logoutCurrentUser, type AuthUser } from "../lib/auth";
import {
  PREMIUM_ACCESS_UPDATED_EVENT,
  getPremiumAccess,
  type PremiumAccessRecord
} from "../lib/premium-access";
import { AuthDialog } from "./auth-dialog";

export function SiteHeader() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [premiumAccess, setPremiumAccess] = useState<PremiumAccessRecord | null>(null);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    function syncState() {
      setCurrentUser(getCurrentUser());
      setPremiumAccess(getPremiumAccess());
    }

    syncState();
    window.addEventListener("storage", syncState);
    window.addEventListener(AUTH_UPDATED_EVENT, syncState);
    window.addEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncState);

    return () => {
      window.removeEventListener("storage", syncState);
      window.removeEventListener(AUTH_UPDATED_EVENT, syncState);
      window.removeEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncState);
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 sm:px-10">
          <Link href="/" className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              The Data Foundry
            </p>
            <p className="mt-1 truncate text-sm text-slate-400">
              Built by Data with Pranjal
            </p>
          </Link>

          <nav className="hidden items-center gap-5 text-sm font-semibold text-slate-300 lg:flex">
            <Link href="/dashboard" className="transition hover:text-teal-100">
              Dashboard
            </Link>
            <Link href="/scenarios" className="transition hover:text-teal-100">
              Scenarios
            </Link>
            <Link href="/labs" className="transition hover:text-teal-100">
              Labs
            </Link>
            <Link href="/roadmap" className="transition hover:text-teal-100">
              Roadmap
            </Link>
            <Link href="/projects" className="transition hover:text-teal-100">
              Projects
            </Link>
            <Link href="/mock-interview" className="transition hover:text-teal-100">
              Mock Interview
            </Link>
          </nav>

          {currentUser ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {premiumAccess ? (
                <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-100">
                  Premium active
                </span>
              ) : null}
              <div className="rounded-2xl border border-slate-700 bg-slate-950/40 px-4 py-3 text-right">
                <p className="text-sm font-semibold text-slate-50">{currentUser.name}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  {currentUser.email}
                </p>
              </div>
              <Link
                href="/profile"
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40 hover:text-teal-100"
              >
                Profile
              </Link>
              <button
                type="button"
                disabled={isLoggingOut}
                onClick={async () => {
                  setIsLoggingOut(true);
                  await logoutCurrentUser();
                  setIsLoggingOut(false);
                }}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-rose-300/40 hover:text-rose-100"
              >
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAuthDialogOpen(true)}
              className="rounded-full bg-teal-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-200"
            >
              Log in / Sign up
            </button>
          )}
        </div>
      </header>

      <AuthDialog isOpen={isAuthDialogOpen} onClose={() => setIsAuthDialogOpen(false)} />
    </>
  );
}
