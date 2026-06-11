"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getCodingLabs, type CodingLab, type CodingLabTrack } from "../lib/coding-labs";
import { getPremiumAccess, type PremiumAccessRecord } from "../lib/premium-access";
import { getScenarioProgressMap, type ScenarioProgressSummary } from "../lib/progress";
import {
  formatDifficulty,
  formatDomain,
  formatScenarioType,
  getScenarios,
  type Scenario
} from "../lib/scenarios";
import { LAB_TRACKS, type LabTrack } from "../lib/labs";
import { trackEvent } from "../lib/analytics";

type SortOption =
  | "recommended"
  | "beginner"
  | "interview"
  | "shortest"
  | "free";

type PracticeItem =
  | { kind: "coding"; lab: CodingLab }
  | { kind: "scenario"; scenario: Scenario };

interface PracticeMetadata {
  title: string;
  outcome: string;
  domain: string;
  type: string;
  difficulty: string;
  estimatedMinutes: number;
  isFree: boolean;
  skills: string[];
  href: string;
}

export function PracticeHub() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("recommended");
  const [difficulty, setDifficulty] = useState("All");
  const [access, setAccess] = useState("All");
  const [progressMap, setProgressMap] = useState<
    Record<string, ScenarioProgressSummary>
  >({});
  const [premiumAccess, setPremiumAccess] = useState<PremiumAccessRecord | null>(null);

  const codingLabs = useMemo(() => getCodingLabs(), []);
  const scenarios = useMemo(() => getScenarios(), []);

  useEffect(() => {
    function syncState() {
      setProgressMap(getScenarioProgressMap());
      setPremiumAccess(getPremiumAccess());
    }

    syncState();
    window.addEventListener("storage", syncState);
    return () => window.removeEventListener("storage", syncState);
  }, []);

  const allItems = useMemo<PracticeItem[]>(
    () => [
      ...codingLabs.map((lab) => ({ kind: "coding" as const, lab })),
      ...scenarios.map((scenario) => ({ kind: "scenario" as const, scenario }))
    ],
    [codingLabs, scenarios]
  );

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = allItems.filter((item) => {
      const metadata = getPracticeMetadata(item);
      const searchMatches =
        !normalizedQuery ||
        [
          metadata.title,
          metadata.outcome,
          metadata.domain,
          metadata.type,
          metadata.difficulty,
          ...metadata.skills
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const difficultyMatches =
        difficulty === "All" || metadata.difficulty.toLowerCase() === difficulty.toLowerCase();
      const accessMatches =
        access === "All" ||
        (access === "Free" && metadata.isFree) ||
        (access === "Premium" && !metadata.isFree);
      return searchMatches && difficultyMatches && accessMatches;
    });

    return [...filtered].sort((left, right) => {
      const leftMeta = getPracticeMetadata(left);
      const rightMeta = getPracticeMetadata(right);
      if (sort === "beginner") {
        return difficultyRank(leftMeta.difficulty) - difficultyRank(rightMeta.difficulty);
      }
      if (sort === "shortest") return leftMeta.estimatedMinutes - rightMeta.estimatedMinutes;
      if (sort === "free") return Number(rightMeta.isFree) - Number(leftMeta.isFree);
      if (sort === "interview") {
        return interviewScore(rightMeta) - interviewScore(leftMeta);
      }
      return recommendedScore(rightMeta) - recommendedScore(leftMeta);
    });
  }, [access, allItems, difficulty, query, sort]);

  const freeScenarios = scenarios.filter((scenario) => scenario.isFree).slice(0, 3);
  const popularScenarios = [...scenarios]
    .sort((left, right) => interviewScore(scenarioMetadata(right)) - interviewScore(scenarioMetadata(left)))
    .slice(0, 3);
  const productionScenarios = scenarios
    .filter(
      (scenario) =>
        scenario.scenarioType === "log_analysis" ||
        scenario.scenarioType === "output_mismatch" ||
        scenario.domain === "airflow" ||
        scenario.domain === "data_quality"
    )
    .slice(0, 3);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 sm:px-10">
      <section className="panel overflow-hidden rounded-[2rem] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-200">
              Practice hub
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
              Choose the next skill, not the next random card.
            </h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">
              Search SQL, Python, PySpark, production scenarios, and system design practice.
              Start with a guided section, then narrow the library only when you need it.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Practice items" value={allItems.length} />
            <Stat label="Free starters" value={allItems.filter((item) => getPracticeMetadata(item).isFree).length} />
            <Stat label="Modes" value="5" />
          </div>
        </div>
      </section>

      <section className="panel mt-8 rounded-[2rem] p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <div>
            <label htmlFor="practice-search" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Search practice
            </label>
            <input
              id="practice-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search joins, CDC, skew, Airflow, beginner..."
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm text-slate-100 outline-none focus:border-teal-300/50"
            />
          </div>
          <div>
            <label htmlFor="practice-sort" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Sort
            </label>
            <select
              id="practice-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm text-slate-100"
            >
              <option value="recommended">Recommended</option>
              <option value="beginner">Beginner first</option>
              <option value="interview">Most interview-relevant</option>
              <option value="shortest">Shortest first</option>
              <option value="free">Free first</option>
            </select>
          </div>
        </div>

        <details className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">
            Advanced filters
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <SelectFilter
              label="Difficulty"
              value={difficulty}
              options={["All", "beginner", "intermediate", "advanced"]}
              onChange={setDifficulty}
            />
            <SelectFilter
              label="Access"
              value={access}
              options={["All", "Free", "Premium"]}
              onChange={setAccess}
            />
          </div>
        </details>
      </section>

      {!query && difficulty === "All" && access === "All" ? (
        <>
          <section className="mt-8">
            <SectionHeading
              eyebrow="Recommended for you"
              title="Start with a focused practice track."
              detail="Open a browser lab, production scenario, or architecture exercise."
            />
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {LAB_TRACKS.filter((track) => track.status === "active").map((track) => (
                <TrackCard key={track.slug} track={track} />
              ))}
              <TrackCard
                track={{
                  slug: "scenarios",
                  title: "Scenario Playground",
                  status: "active",
                  description: "Debug production incidents with sample data, logs, broken logic, and feedback.",
                  skills: ["Root cause", "Data quality", "Trade-offs"],
                  href: "/scenarios",
                  groups: ["SQL bugs", "Airflow incidents", "Data quality mismatches"],
                  badges: ["Production Practice"]
                }}
              />
              <TrackCard
                track={{
                  slug: "system-design",
                  title: "System Design Studio",
                  status: "active",
                  description: "Practice data platform design decisions and defend your trade-offs.",
                  skills: ["Architecture", "Scale", "Reliability"],
                  href: "/system-design",
                  groups: ["Batch", "Streaming", "Lakehouse"],
                  badges: ["Interview Favorite"]
                }}
              />
            </div>
          </section>

          <PracticeSection title="Free labs to start" items={freeScenarios} progressMap={progressMap} premiumAccess={premiumAccess} />
          <PracticeSection title="Popular interview labs" items={popularScenarios} progressMap={progressMap} premiumAccess={premiumAccess} />
          <PracticeSection title="Production debugging labs" items={productionScenarios} progressMap={progressMap} premiumAccess={premiumAccess} />
        </>
      ) : null}

      <section className="mt-10">
        <SectionHeading
          eyebrow="Library results"
          title={`${results.length} matching practice items`}
          detail="The first 24 are shown to keep this page useful instead of overwhelming."
        />
        {results.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {results.slice(0, 24).map((item) => (
              <PracticeResultCard
                key={practiceKey(item)}
                item={item}
                progressMap={progressMap}
                premiumAccess={premiumAccess}
              />
            ))}
          </div>
        ) : (
          <div className="panel rounded-3xl p-6 text-sm text-slate-300">
            No practice items match that search. Try a technology, production symptom, or
            skill such as joins, skew, CDC, or Airflow.
          </div>
        )}
      </section>
    </main>
  );
}

function PracticeSection({
  title,
  items,
  progressMap,
  premiumAccess
}: {
  title: string;
  items: Scenario[];
  progressMap: Record<string, ScenarioProgressSummary>;
  premiumAccess: PremiumAccessRecord | null;
}) {
  return (
    <section className="mt-10">
      <SectionHeading eyebrow="Guided selection" title={title} />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((scenario) => (
          <PracticeResultCard
            key={scenario.slug}
            item={{ kind: "scenario", scenario }}
            progressMap={progressMap}
            premiumAccess={premiumAccess}
          />
        ))}
      </div>
    </section>
  );
}

function PracticeResultCard({
  item,
  progressMap,
  premiumAccess
}: {
  item: PracticeItem;
  progressMap: Record<string, ScenarioProgressSummary>;
  premiumAccess: PremiumAccessRecord | null;
}) {
  const metadata = getPracticeMetadata(item);
  const progress =
    item.kind === "scenario" ? progressMap[item.scenario.slug] : undefined;
  const locked = !metadata.isFree && !premiumAccess;

  return (
    <article className="flex min-h-[340px] flex-col rounded-[2rem] border border-slate-800 bg-slate-950/45 p-6 transition hover:-translate-y-1 hover:border-teal-300/30">
      <div className="flex flex-wrap gap-2">
        {[metadata.domain, metadata.type, metadata.difficulty].map((badge) => (
          <span key={badge} className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
            {badge}
          </span>
        ))}
        <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${metadata.isFree ? "border-teal-300/25 text-teal-100" : "border-amber-300/25 text-amber-100"}`}>
          {metadata.isFree ? "Free" : "Premium"}
        </span>
      </div>
      <h3 className="mt-5 text-xl font-semibold leading-7 text-slate-50">{metadata.title}</h3>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-300">{metadata.outcome}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {metadata.skills.slice(0, 4).map((skill) => (
          <span key={skill} className="rounded-full bg-teal-300/10 px-3 py-1 text-xs text-teal-100">
            {skill}
          </span>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between text-xs text-slate-400">
        <span>{metadata.estimatedMinutes} min</span>
        <span>{progress?.completed ? "Completed" : progress?.attemptCount ? "Attempted" : "Not started"}</span>
      </div>
      <Link
        href={metadata.href}
        onClick={() =>
          trackEvent("first_lab_started", {
            source: "practice_hub",
            item: metadata.title
          })
        }
        className={`mt-auto inline-flex justify-center rounded-full px-5 py-3 text-sm font-semibold transition ${
          locked
            ? "border border-amber-300/30 text-amber-100 hover:bg-amber-300/10"
            : "bg-amber-300 text-slate-950 hover:bg-amber-200"
        }`}
      >
        {locked ? "Preview / Unlock" : progress?.attemptCount ? "Continue Lab" : "Start Lab"}
      </Link>
    </article>
  );
}

function TrackCard({ track }: { track: LabTrack }) {
  return (
    <Link href={track.href} className="panel flex min-h-[270px] flex-col rounded-[2rem] p-6 transition hover:-translate-y-1 hover:border-teal-300/30">
      <span className="badge w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
        {track.badges[0] ?? "Practice"}
      </span>
      <h3 className="mt-5 text-2xl font-semibold text-slate-50">{track.title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">{track.description}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {track.skills.slice(0, 4).map((skill) => (
          <span key={skill} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
            {skill}
          </span>
        ))}
      </div>
      <span className="mt-auto pt-6 text-sm font-semibold text-teal-100">Open practice track →</span>
    </Link>
  );
}

function SelectFilter({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm normal-case tracking-normal text-slate-100"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SectionHeading({
  eyebrow,
  title,
  detail
}: {
  eyebrow: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-50">{title}</h2>
      </div>
      {detail ? <p className="max-w-2xl text-sm leading-6 text-slate-400">{detail}</p> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-slate-700/70 bg-slate-950/30 p-5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-50">{value}</p>
    </div>
  );
}

function practiceKey(item: PracticeItem): string {
  return item.kind === "coding" ? `coding-${item.lab.slug}` : `scenario-${item.scenario.slug}`;
}

function getPracticeMetadata(item: PracticeItem): PracticeMetadata {
  return item.kind === "coding" ? codingMetadata(item.lab) : scenarioMetadata(item.scenario);
}

function codingMetadata(lab: CodingLab): PracticeMetadata {
  return {
    title: lab.title,
    outcome: lab.studentTask || lab.problemStatement,
    domain: formatCodingTrack(lab.track),
    type: lab.section,
    difficulty: lab.difficulty,
    estimatedMinutes: lab.estimatedMinutes,
    isFree: lab.isFree,
    skills: lab.topicTags,
    href: `/labs/${lab.track}?lab=${encodeURIComponent(lab.slug)}`
  };
}

function scenarioMetadata(scenario: Scenario): PracticeMetadata {
  return {
    title: scenario.title,
    outcome: scenario.requirement ?? scenario.tasks[0] ?? scenario.problemStatement,
    domain: formatDomain(scenario.domain),
    type: formatScenarioType(scenario.scenarioType),
    difficulty: formatDifficulty(scenario.difficulty),
    estimatedMinutes: scenario.estimatedMinutes,
    isFree: scenario.isFree,
    skills: scenario.tags,
    href: `/scenarios/${scenario.slug}`
  };
}

function formatCodingTrack(track: CodingLabTrack): string {
  if (track === "pyspark") return "PySpark";
  if (track === "python") return "Python";
  return "SQL";
}

function difficultyRank(difficulty: string): number {
  if (difficulty.toLowerCase() === "beginner") return 0;
  if (difficulty.toLowerCase() === "intermediate") return 1;
  return 2;
}

function interviewScore(metadata: PracticeMetadata): number {
  const haystack = `${metadata.title} ${metadata.outcome} ${metadata.skills.join(" ")}`.toLowerCase();
  return ["interview", "sql", "join", "window", "debug", "pipeline"].reduce(
    (score, keyword) => score + (haystack.includes(keyword) ? 1 : 0),
    0
  );
}

function recommendedScore(metadata: PracticeMetadata): number {
  return (
    (metadata.isFree ? 5 : 0) +
    (metadata.difficulty.toLowerCase() === "beginner" ? 3 : 0) +
    interviewScore(metadata) -
    metadata.estimatedMinutes / 60
  );
}
