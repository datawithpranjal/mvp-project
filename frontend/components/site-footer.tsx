import Link from "next/link";

const SUPPORT_EMAIL = "datawithpranjal@gmail.com";

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-12 w-full max-w-[1600px] px-4 pb-8 sm:px-8">
      <div className="panel rounded-[2rem] p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              Contact Us
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-50">
              Questions, access issues, or complaints?
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Contact the Data with Pranjal support team. For payment or account issues,
              include your registered email and payment reference so we can help faster.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=The%20Data%20Foundry%20Support`}
              className="mt-5 inline-flex rounded-full bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-200"
            >
              Email {SUPPORT_EMAIL}
            </a>
          </div>

          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 text-sm">
            <Link className="text-slate-300 transition hover:text-teal-100" href="/labs">
              Practice
            </Link>
            <Link className="text-slate-300 transition hover:text-teal-100" href="/roadmap">
              Roadmap
            </Link>
            <Link className="text-slate-300 transition hover:text-teal-100" href="/pricing">
              Pricing
            </Link>
            <Link className="text-slate-300 transition hover:text-teal-100" href="/dashboard">
              Dashboard
            </Link>
          </nav>
        </div>

        <div className="mt-8 border-t border-slate-800 pt-5 text-sm text-slate-400">
          The Data Foundry. Built by Data with Pranjal.
        </div>
      </div>
    </footer>
  );
}
