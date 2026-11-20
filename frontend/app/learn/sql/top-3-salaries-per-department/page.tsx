import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import answer from "../../../../content/sql-salary-answer.json";

export const metadata: Metadata = {
  title: answer.title,
  description: answer.description,
  alternates: { canonical: answer.canonical }
};

// The reviewed, static reader copy uses only these Markdown conventions.
// React escapes the text; no HTML or client-side content loader is used.
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith("`")) return <code key={index} className="break-words rounded bg-slate-800/60 px-1.5 py-0.5 text-[0.9em] text-teal-100">{part.slice(1, -1)}</code>;
    if (part.startsWith("**")) return <strong key={index} className="font-semibold text-slate-100">{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return <Link key={index} href={link[2]} className="font-semibold text-teal-200 underline decoration-teal-300/50 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-300">{link[1]}</Link>;
    return part;
  });
}

function ReaderBlock({ text }: { text: string }) {
  if (text.startsWith("# ")) return <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-4xl">{text.slice(2)}</h1>;
  if (text.startsWith("## ")) return <h2 className="pt-5 text-2xl font-semibold leading-snug tracking-tight text-slate-100">{text.slice(3)}</h2>;
  if (text.startsWith("```sql\n")) {
    const code = text.slice(7, -4);
    return <pre tabIndex={0} aria-label={code.startsWith("CREATE") ? "SQLite setup" : "Salary band query"} className="max-w-full overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-xs leading-6 text-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300 sm:p-6 sm:text-sm"><code>{code}</code></pre>;
  }
  if (text.startsWith("|")) {
    const lines = text.split("\n");
    const cells = (line: string) => line.slice(1, -1).split("|").map((cell) => cell.trim());
    const headings = cells(lines[0]);
    return <div tabIndex={0} role="region" aria-label={headings[0] === "department" ? "Expected employee output" : "Ranking function comparison"} className="max-w-full overflow-x-auto rounded-3xl border border-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"><table className="w-full text-left text-sm leading-6"><thead className="bg-slate-900/70 text-slate-200"><tr>{headings.map((heading) => <th key={heading} scope="col" className="px-4 py-3 font-semibold">{inline(heading)}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{lines.slice(2).map((line, row) => <tr key={row}>{cells(line).map((cell, column) => <td key={column} className="min-w-28 px-4 py-3 align-top">{inline(cell)}</td>)}</tr>)}</tbody></table></div>;
  }
  if (text.startsWith("- ")) return <ul className="list-disc space-y-3 pl-6">{text.split("\n").map((item, index) => <li key={index}>{inline(item.slice(2))}</li>)}</ul>;
  return <p className={text.startsWith("[Open the free") ? "rounded-3xl border border-teal-300/25 bg-teal-300/5 p-5" : undefined}>{inline(text.replace(/\n/g, " "))}</p>;
}

export default function SalaryBandsAnswerPage() {
  // Split code fences separately so blank SQL lines remain part of the code.
  const blocks = answer.readerMarkdown.split(/(```sql\n[\s\S]*?\n```)/g).flatMap((part) =>
    part.startsWith("```sql\n") ? [part] : part.trim().split(/\n\n+/).filter(Boolean)
  );
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <nav aria-label="Breadcrumb" className="mb-8 text-sm leading-6 text-slate-400">
        <ol className="flex flex-wrap gap-x-2 gap-y-1">
          <li><Link href="/labs/sql" className="text-teal-200 underline underline-offset-4">SQL practice</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Top salary bands</li>
        </ol>
      </nav>
      <article className="min-w-0 space-y-6 text-base leading-8 text-slate-300" aria-label="SQL salary bands worked example">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">The Data Foundry editorial team</p>
        {blocks.map((text, index) => <ReaderBlock key={index} text={text} />)}
      </article>
    </main>
  );
}
