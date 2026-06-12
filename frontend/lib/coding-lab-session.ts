import type { CodingLabTrack } from "./coding-labs";

export interface CodingLabDraft {
  code: string;
  savedAt: string;
}

interface CodingLabSessionStore {
  drafts: Record<string, CodingLabDraft>;
  selectedByTrack: Partial<Record<CodingLabTrack, string>>;
}

const STORAGE_KEY = "data-foundry-coding-lab-session-v1";

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
