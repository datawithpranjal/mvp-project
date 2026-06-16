export interface RoadmapProgress {
  activePathSlug: string | null;
  completedDays: Record<string, number[]>;
  updatedAt: string | null;
}

const STORAGE_KEY = "the-data-foundry-roadmap-progress-v1";
const PLATFORM_ROADMAP_SLUG = "data-foundry-practice-roadmap";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getRoadmapProgress(): RoadmapProgress {
  if (!canUseStorage()) {
    return { activePathSlug: null, completedDays: {}, updatedAt: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activePathSlug: null, completedDays: {}, updatedAt: null };
    const parsed = JSON.parse(raw) as Partial<RoadmapProgress>;
    const completedStages =
      parsed.completedDays &&
      typeof parsed.completedDays === "object" &&
      Array.isArray(parsed.completedDays[PLATFORM_ROADMAP_SLUG])
        ? parsed.completedDays[PLATFORM_ROADMAP_SLUG]
        : [];
    const migratedProgress = {
      activePathSlug:
        typeof parsed.activePathSlug === "string" ? PLATFORM_ROADMAP_SLUG : null,
      completedDays: {
        [PLATFORM_ROADMAP_SLUG]: completedStages
      },
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedProgress));
    return migratedProgress;
  } catch {
    return { activePathSlug: null, completedDays: {}, updatedAt: null };
  }
}

function saveRoadmapProgress(progress: RoadmapProgress): RoadmapProgress {
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }
  return progress;
}

export function startRoadmap(pathSlug: string): RoadmapProgress {
  const current = getRoadmapProgress();
  return saveRoadmapProgress({
    ...current,
    activePathSlug: pathSlug,
    updatedAt: new Date().toISOString()
  });
}

export function toggleRoadmapDay(pathSlug: string, day: number): RoadmapProgress {
  const current = getRoadmapProgress();
  const existing = current.completedDays[pathSlug] ?? [];
  const completedDays = existing.includes(day)
    ? existing.filter((completedDay) => completedDay !== day)
    : [...existing, day].sort((left, right) => left - right);

  return saveRoadmapProgress({
    activePathSlug: pathSlug,
    completedDays: {
      ...current.completedDays,
      [pathSlug]: completedDays
    },
    updatedAt: new Date().toISOString()
  });
}
