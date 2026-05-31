interface CodeBlockProps {
  title?: string;
  code: string;
}

export function CodeBlock({ title, code }: CodeBlockProps) {
  if (!code.trim()) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/70">
      {title ? (
        <div className="border-b border-slate-800 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {title}
          </p>
        </div>
      ) : null}
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words p-5 text-sm leading-7 text-teal-50">
        <code>{code}</code>
      </pre>
    </div>
  );
}
