"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  AUTH_UPDATED_EVENT,
  getAuthToken,
  getCurrentUser,
  logoutCurrentUser,
  type AuthUser
} from "../lib/auth";
import {
  PREMIUM_ACCESS_UPDATED_EVENT,
  getPremiumAccess,
  refreshPremiumAccessFromServer,
  type PremiumAccessRecord
} from "../lib/premium-access";
import { AuthDialog } from "./auth-dialog";
import { PracticeTabs } from "./practice-tabs";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [premiumAccess, setPremiumAccess] = useState<PremiumAccessRecord | null>(null);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const lastPremiumStatusSyncToken = useRef<string | null>(null);
  const isPracticeRoute =
    pathname === "/labs" ||
    pathname.startsWith("/labs/") ||
    pathname === "/system-design";
  const isScenarioRoute =
    pathname === "/scenarios" || pathname.startsWith("/scenarios/");

  useEffect(() => {
    function syncState(shouldRefreshPremium: boolean = false) {
      setCurrentUser(getCurrentUser());
      const cachedPremiumAccess = getPremiumAccess();
      setPremiumAccess(cachedPremiumAccess);

      const token = getAuthToken();
      if (
        shouldRefreshPremium &&
        token &&
        !cachedPremiumAccess &&
        lastPremiumStatusSyncToken.current !== token
      ) {
        lastPremiumStatusSyncToken.current = token;
        refreshPremiumAccessFromServer(token)
          .then((serverPremiumAccess) => {
            setPremiumAccess(serverPremiumAccess);
          })
          .catch(() => {
            // Keep navigation usable if premium status cannot be refreshed.
          });
      }
    }

    const syncWithServer = () => syncState(true);
    const syncLocalOnly = () => syncState(false);

    syncWithServer();
    window.addEventListener("storage", syncWithServer);
    window.addEventListener(AUTH_UPDATED_EVENT, syncWithServer);
    window.addEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncLocalOnly);

    return () => {
      window.removeEventListener("storage", syncWithServer);
      window.removeEventListener(AUTH_UPDATED_EVENT, syncWithServer);
      window.removeEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncLocalOnly);
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

          <nav className="hidden items-center gap-4 text-sm font-semibold text-slate-300 lg:flex">
            <Link
              href="/scenarios"
              aria-current={isScenarioRoute ? "page" : undefined}
              className={`rounded-full px-4 py-2 transition ${
                isScenarioRoute
                  ? "bg-teal-300 text-slate-950"
                  : "border border-teal-300/30 bg-teal-300/10 text-teal-100 hover:border-teal-300/60 hover:bg-teal-300/15"
              }`}
            >
              Scenario Playground
            </Link>
            <div className="group relative">
              <Link
                href="/labs"
                aria-current={isPracticeRoute ? "page" : undefined}
                className={`rounded-full px-3 py-2 transition hover:bg-slate-900/80 hover:text-teal-100 ${
                  isPracticeRoute ? "text-teal-100" : ""
                }`}
              >
                Practice
              </Link>
              <div className="practice-menu invisible absolute left-0 top-full z-50 w-[340px] translate-y-2 rounded-3xl border p-3 opacity-0 transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <PracticeLink href="/labs" title="All Practice" detail="Choose a guided lab or practice track" />
                <PracticeLink href="/labs/sql" title="SQL Lab" detail="Interview SQL with real data and validation" />
                <PracticeLink href="/labs/python" title="Python Lab" detail="Data engineering Python practice" />
                <PracticeLink href="/labs/pyspark" title="PySpark Lab" detail="Spark code review and production fixes" />
                <PracticeLink href="/labs/airflow" title="Airflow Lab" detail="DAG incidents, retries, sensors, and backfills" />
                <PracticeLink href="/labs/aws" title="AWS Lab" detail="Service choices, architecture, security, and cost" />
                <PracticeLink href="/system-design" title="System Design Studio" detail="Architecture trade-offs and interview framing" />
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
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-navigation"
                aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-slate-200 lg:hidden"
              >
                <MenuIcon isOpen={isMobileMenuOpen} />
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
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-navigation"
                aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-slate-200 lg:hidden"
              >
                <MenuIcon isOpen={isMobileMenuOpen} />
              </button>
            </div>
          )}
        </div>
        {isMobileMenuOpen ? (
          <nav
            id="mobile-navigation"
            className="mx-auto grid max-w-7xl grid-cols-2 gap-2 px-4 pb-4 text-sm font-semibold text-slate-300 sm:px-8 lg:hidden"
          >
            {[
              ["Scenario Playground", "/scenarios"],
              ["Practice", "/labs"],
              ["Roadmap", "/roadmap"],
              ["Pricing", "/pricing"]
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`rounded-2xl border px-4 py-3 transition ${
                  href === "/scenarios"
                    ? "border-teal-300/35 bg-teal-300/10 text-teal-100"
                    : "border-slate-800 bg-slate-950/35"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        ) : null}
        {isPracticeRoute ? <PracticeTabs /> : null}
      </header>

      <AuthDialog isOpen={isAuthDialogOpen} onClose={() => setIsAuthDialogOpen(false)} />
    </>
  );
}

function MenuIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-5 w-5"
    >
      {isOpen ? (
        <>
          <path d="m6 6 12 12" />
          <path d="M18 6 6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
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
