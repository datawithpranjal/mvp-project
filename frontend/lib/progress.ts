export interface AttemptHistoryEntry {
  id: string;
  attemptedAt: string;
  passed: boolean | null;
  answer: string;
  message: string;
}

export type ScenarioSelfRating = "Weak" | "Okay" | "Strong";

export interface ScenarioAiFeedback {
  totalScore: number;
  strengths: string[];
  missingPoints: string[];
  improvedAnswer: string;
  followUpQuestions: string[];
  evaluatedAt: string;
}

export interface ScenarioProgressEntry {
  slug: string;
  completed: boolean;
  hintsRevealed: number;
  attempts: AttemptHistoryEntry[];
  draftAnswer: string;
  draftInterviewAnswer: string;
  draftSavedAt: string | null;
  selfRating: ScenarioSelfRating | null;
  aiScore: number | null;
  aiFeedback: ScenarioAiFeedback | null;
  completedAt: string | null;
  revisitAt: string | null;
}

export interface ScenarioProgressSummary {
  slug: string;
  completed: boolean;
  hintsRevealed: number;
  attemptCount: number;
  lastAttemptedAt: string | null;
  lastPassedAt: string | null;
  draftSavedAt: string | null;
  selfRating: ScenarioSelfRating | null;
  aiScore: number | null;
  completedAt: string | null;
  revisitAt: string | null;
}

type ScenarioProgressStore = Record<string, Partial<ScenarioProgressEntry>>;

const STORAGE_KEY = "data-engineering-scenario-playground-progress-v1";
export const SCENARIO_PROGRESS_UPDATED_EVENT = "scenario-progress-updated";

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
  window.dispatchEvent(new Event(SCENARIO_PROGRESS_UPDATED_EVENT));
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

function normalizeSelfRating(value: unknown): ScenarioSelfRating | null {
  return value === "Weak" || value === "Okay" || value === "Strong" ? value : null;
}

function normalizeAiFeedback(value: unknown): ScenarioAiFeedback | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const feedback = value as Partial<ScenarioAiFeedback>;
  return {
    totalScore:
      typeof feedback.totalScore === "number"
        ? Math.max(0, Math.min(100, Math.round(feedback.totalScore)))
        : 0,
    strengths: Array.isArray(feedback.strengths) ? feedback.strengths.map(String) : [],
    missingPoints: Array.isArray(feedback.missingPoints)
      ? feedback.missingPoints.map(String)
      : [],
    improvedAnswer: typeof feedback.improvedAnswer === "string" ? feedback.improvedAnswer : "",
    followUpQuestions: Array.isArray(feedback.followUpQuestions)
      ? feedback.followUpQuestions.map(String)
      : [],
    evaluatedAt:
      typeof feedback.evaluatedAt === "string" && feedback.evaluatedAt
        ? feedback.evaluatedAt
        : new Date(0).toISOString()
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
    attempts,
    draftAnswer: typeof value?.draftAnswer === "string" ? value.draftAnswer : "",
    draftInterviewAnswer:
      typeof value?.draftInterviewAnswer === "string" ? value.draftInterviewAnswer : "",
    draftSavedAt:
      typeof value?.draftSavedAt === "string" && value.draftSavedAt ? value.draftSavedAt : null,
    selfRating: normalizeSelfRating(value?.selfRating),
    aiScore:
      typeof value?.aiScore === "number"
        ? Math.max(0, Math.min(100, Math.round(value.aiScore)))
        : null,
    aiFeedback: normalizeAiFeedback(value?.aiFeedback),
    completedAt:
      typeof value?.completedAt === "string" && value.completedAt ? value.completedAt : null,
    revisitAt: typeof value?.revisitAt === "string" && value.revisitAt ? value.revisitAt : null
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
    lastPassedAt: lastPassedAttempt?.attemptedAt ?? null,
    draftSavedAt: progress.draftSavedAt,
    selfRating: progress.selfRating,
    aiScore: progress.aiScore,
    completedAt: progress.completedAt,
    revisitAt: progress.revisitAt
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
    completed: existing.completed || attempt.passed === true,
    completedAt:
      existing.completedAt ?? (attempt.passed === true ? nextAttempt.attemptedAt : null),
    attempts: [nextAttempt, ...existing.attempts]
  };

  writeStore({
    ...store,
    [slug]: nextEntry
  });

  return nextEntry;
}

export function saveScenarioDraft(
  slug: string,
  draftAnswer: string,
  draftInterviewAnswer?: string
): ScenarioProgressEntry {
  const store = readStore();
  const existing = normalizeEntry(slug, store[slug]);
  const nextEntry: ScenarioProgressEntry = {
    ...existing,
    draftAnswer,
    draftInterviewAnswer:
      typeof draftInterviewAnswer === "string"
        ? draftInterviewAnswer
        : existing.draftInterviewAnswer,
    draftSavedAt: new Date().toISOString()
  };

  writeStore({
    ...store,
    [slug]: nextEntry
  });

  return nextEntry;
}

export function setScenarioSelfRating(
  slug: string,
  selfRating: ScenarioSelfRating
): ScenarioProgressEntry {
  const store = readStore();
  const existing = normalizeEntry(slug, store[slug]);
  const nextEntry: ScenarioProgressEntry = {
    ...existing,
    selfRating
  };

  writeStore({
    ...store,
    [slug]: nextEntry
  });

  return nextEntry;
}

export function markScenarioCompleted(slug: string): ScenarioProgressEntry {
  const store = readStore();
  const existing = normalizeEntry(slug, store[slug]);
  const completedAt = existing.completedAt ?? new Date().toISOString();
  const nextEntry: ScenarioProgressEntry = {
    ...existing,
    completed: true,
    completedAt
  };

  writeStore({
    ...store,
    [slug]: nextEntry
  });

  return nextEntry;
}

export function scheduleScenarioReattempt(slug: string): ScenarioProgressEntry {
  const store = readStore();
  const existing = normalizeEntry(slug, store[slug]);
  const revisitDate = new Date();
  revisitDate.setDate(revisitDate.getDate() + 7);
  const nextEntry: ScenarioProgressEntry = {
    ...existing,
    revisitAt: revisitDate.toISOString()
  };

  writeStore({
    ...store,
    [slug]: nextEntry
  });

  return nextEntry;
}

export function recordScenarioAiFeedback(
  slug: string,
  feedback: Omit<ScenarioAiFeedback, "evaluatedAt"> & { evaluatedAt?: string }
): ScenarioProgressEntry {
  const store = readStore();
  const existing = normalizeEntry(slug, store[slug]);
  const nextFeedback: ScenarioAiFeedback = {
    ...feedback,
    totalScore: Math.max(0, Math.min(100, Math.round(feedback.totalScore))),
    evaluatedAt: feedback.evaluatedAt ?? new Date().toISOString()
  };
  const nextEntry: ScenarioProgressEntry = {
    ...existing,
    aiScore: nextFeedback.totalScore,
    aiFeedback: nextFeedback
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
