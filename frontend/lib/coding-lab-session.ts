import type { CodingLabTrack } from "./coding-labs";

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
}

interface CodingLabSessionStore {
  drafts: Record<string, CodingLabDraft>;
  selectedByTrack: Partial<Record<CodingLabTrack, string>>;
}

const STORAGE_KEY = "data-foundry-coding-lab-session-v1";
const PROGRESS_STORAGE_KEY = "data-foundry-coding-lab-progress";

function emptyStore(): CodingLabSessionStore {
  return {
    drafts: {},
    selectedByTrack: {}
  };
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStore(): CodingLabSessionStore {
  if (!canUseStorage()) return emptyStore();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

function writeStore(store: CodingLabSessionStore): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
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
            track
          }
        ];
      })
  );
}

export function getCodingLabProgressMap(): Record<string, CodingLabProgress> {
  if (!canUseStorage()) return {};

  try {
    return normalizeProgressMap(
      JSON.parse(window.localStorage.getItem(PROGRESS_STORAGE_KEY) ?? "{}")
    );
  } catch {
    return {};
  }
}

export function recordCodingLabAttempt(
  slug: string,
  track: CodingLabTrack,
  passed: boolean
): Record<string, CodingLabProgress> {
  const progressMap = getCodingLabProgressMap();
  const existing = progressMap[slug];
  const attemptedAt = new Date().toISOString();
  const nextProgress: CodingLabProgress = {
    completed: Boolean(existing?.completed || passed),
    completedAt: existing?.completedAt ?? (passed ? attemptedAt : undefined),
    lastAttemptedAt: attemptedAt,
    attemptCount: (existing?.attemptCount ?? 0) + 1,
    track
  };

  const nextProgressMap = {
    ...progressMap,
    [slug]: nextProgress
  };

  if (canUseStorage()) {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(nextProgressMap));
  }

  return nextProgressMap;
}
