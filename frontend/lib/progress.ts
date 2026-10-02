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
  // Local recovery state; the current server draft schema does not store this choice.
  draftDiagnosisId?: string;
  draftSavedAt: string | null;
  selfRating: ScenarioSelfRating | null;
  aiScore: number | null;
  aiFeedback: ScenarioAiFeedback | null;
  completedAt: string | null;
  revisitAt: string | null;
  latestResult: unknown | null;
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
  latestResult: unknown | null;
}

type ScenarioProgressStore = Record<string, Partial<ScenarioProgressEntry>>;

const STORAGE_KEY = "data-engineering-scenario-playground-progress-v1";
export const SCENARIO_PROGRESS_UPDATED_EVENT = "scenario-progress-updated";

function storageKeyForSuffix(suffix: string): string {
  return `${STORAGE_KEY}:${suffix}`;
}

function storageSuffix(userId?: string | null): string {
  if (userId) return `user-${userId}`;
  try {
    const rawSession = window.localStorage.getItem("data-engineering-scenario-playground-auth-session-v1");
    if (rawSession) {
      const session = JSON.parse(rawSession) as { user?: { id?: string } };
      if (session.user?.id) return `user-${session.user.id}`;
    }
  } catch {
    // Fall back to the isolated guest namespace when the auth cache is malformed.
  }
  return "guest";
}

function storageKey(suffix: string = storageSuffix()): string {
  return storageKeyForSuffix(suffix);
}

function buildAttemptId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `attempt-${Date.now()}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStore(suffix: string = storageSuffix()): ScenarioProgressStore {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const value = window.localStorage.getItem(storageKey(suffix));
    if (!value) {
      return {};
    }

    const parsed = JSON.parse(value) as ScenarioProgressStore;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: ScenarioProgressStore, suffix: string = storageSuffix()): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(storageKey(suffix), JSON.stringify(store));
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
    draftDiagnosisId: typeof value?.draftDiagnosisId === "string" ? value.draftDiagnosisId : "",
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
    revisitAt: typeof value?.revisitAt === "string" && value.revisitAt ? value.revisitAt : null,
    latestResult: value?.latestResult ?? null
  };
}

function timestamp(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mergeAttempts(
  accountAttempts: AttemptHistoryEntry[],
  guestAttempts: AttemptHistoryEntry[]
): AttemptHistoryEntry[] {
  const attempts = new Map<string, AttemptHistoryEntry>();
  [...accountAttempts, ...guestAttempts].forEach((attempt) => {
    const current = attempts.get(attempt.id);
    if (!current || timestamp(attempt.attemptedAt) > timestamp(current.attemptedAt)) {
      attempts.set(attempt.id, attempt);
    }
  });
  return Array.from(attempts.values()).sort(
    (left, right) => timestamp(right.attemptedAt) - timestamp(left.attemptedAt)
  );
}

function mergeScenarioEntries(
  slug: string,
  accountValue: Partial<ScenarioProgressEntry> | undefined,
  guestValue: Partial<ScenarioProgressEntry>
): ScenarioProgressEntry {
  const account = normalizeEntry(slug, accountValue);
  const guest = normalizeEntry(slug, guestValue);
  const guestDraftIsNewer = timestamp(guest.draftSavedAt) > timestamp(account.draftSavedAt);
  const guestFeedbackIsNewer =
    timestamp(guest.aiFeedback?.evaluatedAt) > timestamp(account.aiFeedback?.evaluatedAt);

  return {
    ...account,
    completed: account.completed || guest.completed,
    completedAt: account.completedAt ?? guest.completedAt,
    hintsRevealed: Math.max(account.hintsRevealed, guest.hintsRevealed),
    attempts: mergeAttempts(account.attempts, guest.attempts),
    draftAnswer: guestDraftIsNewer ? guest.draftAnswer : account.draftAnswer,
    draftInterviewAnswer: guestDraftIsNewer
      ? guest.draftInterviewAnswer
      : account.draftInterviewAnswer,
    draftDiagnosisId: guestDraftIsNewer ? guest.draftDiagnosisId : account.draftDiagnosisId,
    draftSavedAt: guestDraftIsNewer ? guest.draftSavedAt : account.draftSavedAt,
    selfRating: account.selfRating ?? guest.selfRating,
    aiScore: guestFeedbackIsNewer ? guest.aiScore : account.aiScore,
    aiFeedback: guestFeedbackIsNewer ? guest.aiFeedback : account.aiFeedback,
    revisitAt:
      timestamp(guest.revisitAt) > timestamp(account.revisitAt)
        ? guest.revisitAt
        : account.revisitAt,
    latestResult: guestDraftIsNewer
      ? guest.latestResult ?? account.latestResult
      : account.latestResult ?? guest.latestResult
  };
}

/**
 * Preserves guest recovery state when authentication changes the browser namespace.
 * The guest copy remains intact until server synchronization is confirmed elsewhere.
 */
export function migrateGuestScenarioProgressToUser(
  userId: string
): Record<string, ScenarioProgressEntry> {
  const guestStore = readStore("guest");
  const userSuffix = storageSuffix(userId);
  const userStore = readStore(userSuffix);
  const merged: Record<string, ScenarioProgressEntry> = {};

  new Set([...Object.keys(userStore), ...Object.keys(guestStore)]).forEach((slug) => {
    merged[slug] = guestStore[slug]
      ? mergeScenarioEntries(slug, userStore[slug], guestStore[slug])
      : normalizeEntry(slug, userStore[slug]);
  });

  writeStore(merged, userSuffix);
  return merged;
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
    revisitAt: progress.revisitAt,
    latestResult: progress.latestResult
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
    latestResult?: unknown;
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
    attempts: [nextAttempt, ...existing.attempts],
    latestResult: attempt.latestResult ?? existing.latestResult
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
  draftInterviewAnswer?: string,
  draftDiagnosisId?: string
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
    draftDiagnosisId: draftDiagnosisId ?? existing.draftDiagnosisId,
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
