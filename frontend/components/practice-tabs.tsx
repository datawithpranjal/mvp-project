"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PRACTICE_TABS = [
  { label: "All", href: "/labs" },
  { label: "SQL", href: "/labs/sql" },
  { label: "Python", href: "/labs/python" },
  { label: "PySpark", href: "/labs/pyspark" },
  { label: "Airflow", href: "/labs/airflow" },
  { label: "AWS", href: "/labs/aws" },
  { label: "System Design", href: "/system-design" }
];

export function PracticeTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Practice categories"
      className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-8"
    >
      {PRACTICE_TABS.map((tab) => {
        const isActive =
          tab.href === "/labs"
            ? pathname === "/labs"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
              isActive
                ? "bg-teal-300 text-slate-950"
                : "border border-slate-700 bg-slate-950/30 text-slate-300 hover:border-teal-300/40 hover:text-teal-100"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
