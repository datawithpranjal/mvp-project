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
import { ThemeToggle } from "./theme-toggle";

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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link href="/" className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              The Data Foundry
            </p>
            <p className="mt-1 truncate text-sm text-slate-400">
              Built by Data with Pranjal
            </p>
          </Link>

          <nav className="hidden items-center gap-5 text-sm font-semibold text-slate-300 lg:flex">
            <div className="group relative">
              <button
                type="button"
                className="rounded-full px-3 py-2 transition hover:bg-slate-900/80 hover:text-teal-100"
              >
                Practice
              </button>
              <div className="invisible absolute left-0 top-full z-50 w-[340px] translate-y-2 rounded-3xl border border-slate-800 bg-slate-950/95 p-3 opacity-0 shadow-2xl shadow-slate-950/40 backdrop-blur-xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <PracticeLink href="/scenarios" title="Scenario Playground" detail="Broken pipelines, logs, and debugging cases" />
                <PracticeLink href="/labs/sql" title="SQL Lab" detail="Interview SQL with real data and validation" />
                <PracticeLink href="/labs/python" title="Python Lab" detail="Data engineering Python practice" />
                <PracticeLink href="/labs/pyspark" title="PySpark Lab" detail="Spark code review and production fixes" />
                <PracticeLink href="/system-design" title="System Design Studio" detail="Architecture trade-offs and interview framing" />
                <PracticeLink href="/projects/ecommerce-pipeline" title="Project Simulator" detail="Decision-based e-commerce pipeline simulation" />
                <PracticeLink href="/mock-interview" title="Mock Interview" detail="Explain fixes like a real interview" />
              </div>
            </div>
            <Link href="/roadmap" className="transition hover:text-teal-100">
              Roadmap
            </Link>
            <Link href="/pricing" className="transition hover:text-teal-100">
              Pricing
            </Link>
          </nav>

          {currentUser ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <ThemeToggle />
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
                href="/dashboard"
                className="rounded-full bg-teal-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-200"
              >
                Dashboard
              </Link>
              <Link
                href="/profile"
                className="hidden rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40 hover:text-teal-100 sm:inline-flex"
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
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setIsAuthDialogOpen(true)}
                className="rounded-full bg-teal-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-200"
              >
                Log in / Sign up
              </button>
            </div>
          )}
        </div>
        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300 sm:px-8 lg:hidden">
          <Link href="/scenarios" className="rounded-full border border-slate-800 px-3 py-2">
            Practice
          </Link>
          <Link href="/labs" className="rounded-full border border-slate-800 px-3 py-2">
            Labs
          </Link>
          <Link href="/system-design" className="rounded-full border border-slate-800 px-3 py-2">
            Design
          </Link>
          <Link href="/roadmap" className="rounded-full border border-slate-800 px-3 py-2">
            Roadmap
          </Link>
          <Link href="/pricing" className="rounded-full border border-slate-800 px-3 py-2">
            Pricing
          </Link>
        </nav>
      </header>

      <AuthDialog isOpen={isAuthDialogOpen} onClose={() => setIsAuthDialogOpen(false)} />
    </>
  );
}

function PracticeLink({
  href,
  title,
  detail
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl px-4 py-3 transition hover:bg-teal-300/10"
    >
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
    </Link>
  );
}
