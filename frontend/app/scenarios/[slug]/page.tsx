"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PremiumLockedCard } from "../../../components/scenarios/PremiumLockedCard";
import { ScenarioWorkspace } from "../../../components/scenarios/ScenarioWorkspace";
import { AUTH_UPDATED_EVENT } from "../../../lib/auth";
import {
  getPremiumAccess,
  PREMIUM_ACCESS_UPDATED_EVENT,
  type PremiumAccessRecord
} from "../../../lib/premium-access";
import { getScenarioBySlug } from "../../../lib/scenarios";

export default function ScenarioDetailPage() {
  const params = useParams<{ slug: string }>();
  const scenario = getScenarioBySlug(params.slug);
  const [premiumAccess, setPremiumAccess] = useState<PremiumAccessRecord | null>(null);

  useEffect(() => {
    function syncPremiumAccess() {
      setPremiumAccess(getPremiumAccess());
    }

    syncPremiumAccess();
    window.addEventListener("storage", syncPremiumAccess);
    window.addEventListener(AUTH_UPDATED_EVENT, syncPremiumAccess);
    window.addEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncPremiumAccess);

    return () => {
      window.removeEventListener("storage", syncPremiumAccess);
      window.removeEventListener(AUTH_UPDATED_EVENT, syncPremiumAccess);
      window.removeEventListener(PREMIUM_ACCESS_UPDATED_EVENT, syncPremiumAccess);
    };
  }, []);

  if (!scenario) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 py-10 sm:px-10">
        <section className="panel rounded-[2rem] p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-200">
            Lab not found
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-50">
            This Broken Pipeline Lab does not exist yet.
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            The scenario may still be in the legacy backend library or not imported into the
            new lab schema yet.
          </p>
          <Link
            href="/scenarios"
            className="mt-6 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Back to Broken Pipeline Lab
          </Link>
        </section>
      </main>
    );
  }

  if (!scenario.isFree && !premiumAccess) {
    return <PremiumLockedCard scenario={scenario} />;
  }

  return <ScenarioWorkspace scenario={scenario} />;
}
