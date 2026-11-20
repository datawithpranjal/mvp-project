import Link from "next/link";

import { BrowserCodingLab } from "../../../components/labs/BrowserCodingLab";

export default function SqlLabPage() {
  return (
    <>
      <div className="mx-auto max-w-[1500px] px-4 pt-8 sm:px-8">
        <Link href="/labs" className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">
          ← Back to labs
        </Link>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
          Working on SQL 3 salary bands and ties?{" "}
          <Link href="/learn/sql/top-3-salaries-per-department" className="font-semibold text-teal-200 underline underline-offset-4">
            Read the top 3 salaries per department worked example
          </Link>.
        </p>
      </div>
      <BrowserCodingLab track="sql" />
    </>
  );
}
