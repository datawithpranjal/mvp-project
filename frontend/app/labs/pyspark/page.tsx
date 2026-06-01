import Link from "next/link";

import { BrowserCodingLab } from "../../../components/labs/BrowserCodingLab";

export default function PySparkLabPage() {
  return (
    <>
      <div className="mx-auto max-w-[1500px] px-4 pt-8 sm:px-8">
        <Link href="/labs" className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">
          Back to labs
        </Link>
      </div>
      <BrowserCodingLab track="pyspark" />
    </>
  );
}
