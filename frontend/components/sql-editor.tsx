"use client";

import { handleTextareaTabKeyDown } from "../lib/textarea-tab";

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  title: string;
  description: string;
  placeholder: string;
  submitLabel: string;
}

export function SqlEditor({
  value,
  onChange,
  onSubmit,
  isSubmitting,
  title,
  description,
  placeholder,
  submitLabel
}: SqlEditorProps) {
  return (
    <div className="panel w-full rounded-3xl p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
          <p className="mt-1 break-words text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="shrink-0 rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-200"
        >
          {isSubmitting ? "Submitting..." : submitLabel}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => handleTextareaTabKeyDown(event, onChange)}
        spellCheck={false}
        className="mt-4 min-h-[320px] w-full resize-y rounded-2xl border border-slate-800 bg-slate-950/90 p-4 text-sm leading-6 text-teal-100 outline-none transition focus:border-teal-300/50"
        placeholder={placeholder}
      />
    </div>
  );
}
