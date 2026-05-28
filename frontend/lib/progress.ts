export interface AttemptHistoryEntry {
  id: string;
  attemptedAt: string;
  passed: boolean | null;
  answer: string;
  message: string;
}

export interface ScenarioProgressEntry {
  slug: string;
  completed: boolean;
  hintsRevealed: number;
  attempts: AttemptHistoryEntry[];
}

export interface ScenarioProgressSummary {
  slug: string;
  completed: boolean;
  hintsRevealed: number;
  attemptCount: number;
  lastAttemptedAt: string | null;
  lastPassedAt: string | null;
}

type ScenarioProgressStore = Record<string, Partial<ScenarioProgressEntry>>;

const STORAGE_KEY = "data-engineering-scenario-playground-progress-v1";

function buildAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `attempt-${Date.now()}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStore(): ScenarioProgressStore {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) {
      return {};
    }

    const parsed = JSON.parse(value) as ScenarioProgressStore;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: ScenarioProgressStore): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function normalizeAttempt(value: Partial<AttemptHistoryEntry>, index: number): AttemptHistoryEntry {
  return {
    id: typeof value.id === "string" && value.id ? value.id : `attempt-${index}`,
    attemptedAt:
      typeof value.attemptedAt === "string" && value.attemptedAt
        ? value.attemptedAt
        : new Date(0).toISOString(),
    passed:
      typeof value.passed === "boolean" || value.passed === null ? value.passed : false,
    answer:
      typeof value.answer === "string"
        ? value.answer
        : typeof (value as { sql?: string }).sql === "string"
          ? ((value as { sql?: string }).sql ?? "")
          : "",
    message: typeof value.message === "string" ? value.message : ""
  };
}

function normalizeEntry(slug: string, value?: Partial<ScenarioProgressEntry>): ScenarioProgressEntry {
  const attempts = Array.isArray(value?.attempts)
    ? value.attempts.map((attempt, index) => normalizeAttempt(attempt, index))
    : [];

  return {
    slug,
    completed: Boolean(value?.completed),
    hintsRevealed:
      typeof value?.hintsRevealed === "number" && value.hintsRevealed > 0
        ? Math.floor(value.hintsRevealed)
        : 0,
    attempts
  };
}

export function summarizeScenarioProgress(
  progress: ScenarioProgressEntry,
  slug: string = progress.slug
): ScenarioProgressSummary {
  const lastPassedAttempt = progress.attempts.find((attempt) => attempt.passed) ?? null;

  return {
    slug,
    completed: progress.completed,
    hintsRevealed: progress.hintsRevealed,
    attemptCount: progress.attempts.length,
    lastAttemptedAt: progress.attempts[0]?.attemptedAt ?? null,
    lastPassedAt: lastPassedAttempt?.attemptedAt ?? null
  };
}

export function getScenarioProgress(slug: string): ScenarioProgressEntry {
  const store = readStore();
  return normalizeEntry(slug, store[slug]);
}

export function getScenarioProgressMap(): Record<string, ScenarioProgressSummary> {
  const store = readStore();
  const progressMap: Record<string, ScenarioProgressSummary> = {};

  Object.entries(store).forEach(([slug, value]) => {
    progressMap[slug] = summarizeScenarioProgress(normalizeEntry(slug, value), slug);
  });

  return progressMap;
}

export function recordScenarioAttempt(
  slug: string,
  attempt: Omit<AttemptHistoryEntry, "id" | "attemptedAt"> & {
    id?: string;
    attemptedAt?: string;
  }
): ScenarioProgressEntry {
  const store = readStore();
  const existing = normalizeEntry(slug, store[slug]);
  const nextAttempt: AttemptHistoryEntry = {
    id: attempt.id ?? buildAttemptId(),
    attemptedAt: attempt.attemptedAt ?? new Date().toISOString(),
    passed: attempt.passed,
    answer: attempt.answer,
    message: attempt.message
  };
  const nextEntry: ScenarioProgressEntry = {
    ...existing,
    completed: existing.completed || attempt.passed !== false,
    attempts: [nextAttempt, ...existing.attempts]
  };

  writeStore({
    ...store,
    [slug]: nextEntry
  });

  return nextEntry;
}

export function setScenarioHintsRevealed(
  slug: string,
  hintsRevealed: number
): ScenarioProgressEntry {
  const store = readStore();
  const existing = normalizeEntry(slug, store[slug]);
  const nextEntry: ScenarioProgressEntry = {
    ...existing,
    hintsRevealed: Math.max(0, Math.floor(hintsRevealed))
  };

  writeStore({
    ...store,
    [slug]: nextEntry
  });

  return nextEntry;
}
