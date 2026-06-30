"use client";

import { useMemo, useState } from "react";

import {
  ACCESS_FILTERS,
  DIFFICULTY_FILTERS,
  DOMAIN_FILTERS,
  TYPE_FILTERS
} from "../../lib/scenarios";

export interface ScenarioFilterState {
  domain: string;
  difficulty: string;
  type: string;
  access: string;
}

interface ScenarioFiltersProps {
  value: ScenarioFilterState;
  onChange: (nextValue: ScenarioFilterState) => void;
}

export function ScenarioFilters({ value, onChange }: ScenarioFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeFilters = useMemo(
    () =>
      [
        value.domain !== "All" ? value.domain : null,
        value.type !== "All" ? value.type : null,
        value.difficulty !== "All" ? value.difficulty : null,
        value.access !== "All" ? value.access : null
      ].filter((item): item is string => Boolean(item)),
    [value]
  );

  return (
    <div className="panel rounded-[2rem] p-5">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full flex-col gap-4 rounded-[1.5rem] border border-slate-800 bg-slate-950/35 px-5 py-4 text-left transition hover:border-teal-300/35 sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={isOpen}
      >
        <span>
          <span className="block text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
            Filters
          </span>
          <span className="mt-2 block text-sm leading-6 text-slate-300">
            {activeFilters.length > 0
              ? activeFilters.join(" / ")
              : "Domain, difficulty, practice type, and access"}
          </span>
        </span>
        <span className="inline-flex items-center gap-3 rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100">
          {isOpen ? "Hide filters" : "Show filters"}
          <span
            aria-hidden="true"
            className={`text-base transition-transform ${isOpen ? "rotate-180" : ""}`}
          >
            ↓
          </span>
        </span>
      </button>

      {isOpen ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <FilterGroup
            label="Domain"
            options={DOMAIN_FILTERS}
            value={value.domain}
            onChange={(domain) => onChange({ ...value, domain })}
          />
          <FilterGroup
            label="Practice Type"
            options={TYPE_FILTERS}
            value={value.type}
            onChange={(type) => onChange({ ...value, type })}
          />
          <FilterGroup
            label="Difficulty"
            options={DIFFICULTY_FILTERS}
            value={value.difficulty}
            onChange={(difficulty) => onChange({ ...value, difficulty })}
          />
          <FilterGroup
            label="Access"
            options={ACCESS_FILTERS}
            value={value.access}
            onChange={(access) => onChange({ ...value, access })}
          />
        </div>
      ) : null}

      {activeFilters.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <span
              key={filter}
              className="rounded-full border border-teal-300/25 bg-teal-300/10 px-3 py-1 text-xs font-semibold text-teal-100"
            >
              {filter}
            </span>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                domain: "All",
                type: "All",
                difficulty: "All",
                access: "All"
              })
            }
            className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-rose-300/35 hover:text-rose-100"
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              value === option
                ? "bg-teal-300 text-slate-950"
                : "border border-slate-700 bg-slate-950/30 text-slate-200 hover:border-teal-300/40"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
