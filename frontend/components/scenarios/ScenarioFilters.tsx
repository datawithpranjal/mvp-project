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
  return (
    <div className="panel rounded-[2rem] p-5">
      <div className="grid gap-5 lg:grid-cols-2">
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
