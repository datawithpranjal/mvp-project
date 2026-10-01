import type { CodingLabTrack } from "./coding-labs";
import { getCurrentUser } from "./auth";

export interface CodingLabDraft {
  code: string;
  savedAt: string;
}

export interface CodingLabProgress {
  completed: boolean;
  completedAt?: string;
  lastAttemptedAt?: string;
  attemptCount: number;
  track: CodingLabTrack;
  lastResult?: unknown;
}

interface CodingLabSessionStore {
  drafts: Record<string, CodingLabDraft>;
  selectedByTrack: Partial<Record<CodingLabTrack, string>>;
}

const STORAGE_KEY = "data-foundry-coding-lab-session-v1";
const PROGRESS_STORAGE_KEY = "data-foundry-coding-lab-progress";

function storageSuffix(userId?: string | null): string {
  const resolvedUserId = userId ?? getCurrentUser()?.id;
  return resolvedUserId ? `user-${resolvedUserId}` : "guest";
}

function sessionStorageKey(suffix: string = storageSuffix()): string {
  return `${STORAGE_KEY}:${suffix}`;
}

function progressStorageKey(suffix: string = storageSuffix()): string {
  return `${PROGRESS_STORAGE_KEY}:${suffix}`;
}

function emptyStore(): CodingLabSessionStore {
  return {
    drafts: {},
    selectedByTrack: {}
  };
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStore(suffix: string = storageSuffix()): CodingLabSessionStore {
  if (!canUseStorage()) return emptyStore();

  try {
    const raw = window.localStorage.getItem(sessionStorageKey(suffix));
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<CodingLabSessionStore>;
    return {
      drafts:
        typeof parsed.drafts === "object" && parsed.drafts !== null ? parsed.drafts : {},
      selectedByTrack:
        typeof parsed.selectedByTrack === "object" && parsed.selectedByTrack !== null
          ? parsed.selectedByTrack
          : {}
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: CodingLabSessionStore, suffix: string = storageSuffix()): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(sessionStorageKey(suffix), JSON.stringify(store));
}

export function getCodingLabDrafts(): Record<string, CodingLabDraft> {
  return readStore().drafts;
}

export function saveCodingLabDraft(slug: string, code: string): CodingLabDraft {
  const store = readStore();
  const draft = {
    code,
    savedAt: new Date().toISOString()
  };
  writeStore({
    ...store,
    drafts: {
      ...store.drafts,
      [slug]: draft
    }
  });
  return draft;
}

export function getLastCodingLab(track: CodingLabTrack): string | null {
  return readStore().selectedByTrack[track] ?? null;
}

export function saveLastCodingLab(track: CodingLabTrack, slug: string): void {
  const store = readStore();
  writeStore({
    ...store,
    selectedByTrack: {
      ...store.selectedByTrack,
      [track]: slug
    }
  });
}

function normalizeProgressMap(value: unknown): Record<string, CodingLabProgress> {
  if (typeof value !== "object" || value === null) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, Record<string, unknown>] => {
        const [, progress] = entry;
        return typeof progress === "object" && progress !== null;
      })
      .map(([slug, progress]) => {
        const track =
          progress.track === "python" || progress.track === "pyspark" ? progress.track : "sql";
        const completed = Boolean(progress.completed);
        const attemptCount =
          typeof progress.attemptCount === "number" && progress.attemptCount > 0
            ? progress.attemptCount
            : completed
              ? 1
              : 0;

        return [
          slug,
          {
            completed,
            completedAt:
              typeof progress.completedAt === "string" ? progress.completedAt : undefined,
            lastAttemptedAt:
              typeof progress.lastAttemptedAt === "string"
                ? progress.lastAttemptedAt
                : typeof progress.completedAt === "string"
                  ? progress.completedAt
                  : undefined,
            attemptCount,
            track,
            lastResult: progress.lastResult
          }
        ];
      })
  );
}

export function getCodingLabProgressMap(): Record<string, CodingLabProgress> {
  return getCodingLabProgressMapForSuffix(storageSuffix());
}

function getCodingLabProgressMapForSuffix(
  suffix: string
): Record<string, CodingLabProgress> {
  if (!canUseStorage()) return {};

  try {
    return normalizeProgressMap(
      JSON.parse(window.localStorage.getItem(progressStorageKey(suffix)) ?? "{}")
    );
  } catch {
    return {};
  }
}

function timestamp(value?: string): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mergeProgress(
  accountProgress: CodingLabProgress | undefined,
  guestProgress: CodingLabProgress
): CodingLabProgress {
  if (!accountProgress) return guestProgress;

  const guestIsNewer =
    timestamp(guestProgress.lastAttemptedAt ?? guestProgress.completedAt) >
    timestamp(accountProgress.lastAttemptedAt ?? accountProgress.completedAt);
  const newest = guestIsNewer ? guestProgress : accountProgress;
  const older = guestIsNewer ? accountProgress : guestProgress;

  return {
    ...newest,
    completed: accountProgress.completed || guestProgress.completed,
    completedAt: accountProgress.completedAt ?? guestProgress.completedAt,
    lastAttemptedAt:
      timestamp(accountProgress.lastAttemptedAt) >= timestamp(guestProgress.lastAttemptedAt)
        ? accountProgress.lastAttemptedAt
        : guestProgress.lastAttemptedAt,
    attemptCount: Math.max(accountProgress.attemptCount, guestProgress.attemptCount),
    lastResult: newest.lastResult ?? older.lastResult
  };
}

export interface CodingLabMigrationSnapshot {
  drafts: Record<string, CodingLabDraft>;
  progress: Record<string, CodingLabProgress>;
}

/**
 * Copies guest recovery state into the signed-in browser namespace without deleting
 * either source. Server synchronization remains the caller's responsibility.
 */
export function migrateGuestCodingLabStateToUser(
  userId: string
): CodingLabMigrationSnapshot {
  const guestStore = readStore("guest");
  const userSuffix = storageSuffix(userId);
  const userStore = readStore(userSuffix);
  const drafts = { ...userStore.drafts };

  Object.entries(guestStore.drafts).forEach(([slug, guestDraft]) => {
    const accountDraft = drafts[slug];
    if (!accountDraft || timestamp(guestDraft.savedAt) > timestamp(accountDraft.savedAt)) {
      drafts[slug] = guestDraft;
    }
  });

  writeStore(
    {
      drafts,
      selectedByTrack: {
        ...guestStore.selectedByTrack,
        ...userStore.selectedByTrack
      }
    },
    userSuffix
  );

  const guestProgress = getCodingLabProgressMapForSuffix("guest");
  const progress = { ...getCodingLabProgressMapForSuffix(userSuffix) };
  Object.entries(guestProgress).forEach(([slug, item]) => {
    progress[slug] = mergeProgress(progress[slug], item);
  });
  if (canUseStorage()) {
    window.localStorage.setItem(progressStorageKey(userSuffix), JSON.stringify(progress));
  }

  return { drafts, progress };
}

export function recordCodingLabAttempt(
  slug: string,
  track: CodingLabTrack,
  passed: boolean,
  lastResult?: unknown
): Record<string, CodingLabProgress> {
  const progressMap = getCodingLabProgressMap();
  const existing = progressMap[slug];
  const attemptedAt = new Date().toISOString();
  const nextProgress: CodingLabProgress = {
    completed: Boolean(existing?.completed || passed),
    completedAt: existing?.completedAt ?? (passed ? attemptedAt : undefined),
    lastAttemptedAt: attemptedAt,
    attemptCount: (existing?.attemptCount ?? 0) + 1,
    track,
    lastResult: lastResult ?? existing?.lastResult
  };

  const nextProgressMap = {
    ...progressMap,
    [slug]: nextProgress
  };

  if (canUseStorage()) {
    window.localStorage.setItem(progressStorageKey(), JSON.stringify(nextProgressMap));
  }

  return nextProgressMap;
}
