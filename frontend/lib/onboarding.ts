import { LEARNING_PATHS } from "./product";

export type CurrentStage =
  | "Fresher"
  | "Career switcher"
  | "Junior Data Engineer"
  | "Preparing for interviews"
  | "Recently joined as Data Engineer";

export type TargetGoal =
  | "Get interview calls"
  | "Clear technical interviews"
  | "Build projects"
  | "Improve production thinking"
  | "Survive first 90 days";

export type DailyTime = "30 min" | "1 hour" | "2 hours" | "3+ hours";
export type Timeline = "7 days" | "30 days" | "60 days" | "90 days";

export interface OnboardingProfile {
  currentStage: CurrentStage;
  targetGoal: TargetGoal;
  dailyTime: DailyTime;
  timeline: Timeline;
  recommendedPathSlug: string;
  completedAt: string;
}

export interface OnboardingRecommendation {
  title: string;
  href: string;
  estimatedMinutes: number;
  reason: string;
}

const STORAGE_KEY = "the-data-foundry-onboarding-v1";
const PLATFORM_ROADMAP_SLUG = "data-foundry-practice-roadmap";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getRecommendedPathSlug(timeline: Timeline, currentStage: CurrentStage): string {
  void timeline;
  void currentStage;
  return PLATFORM_ROADMAP_SLUG;
}

export function getOnboardingProfile(): OnboardingProfile | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as OnboardingProfile;
    const hasPath = LEARNING_PATHS.some((path) => path.slug === parsed.recommendedPathSlug);
    if (hasPath) {
      return parsed;
    }

    const migratedProfile = {
      ...parsed,
      recommendedPathSlug: PLATFORM_ROADMAP_SLUG
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedProfile));
    return migratedProfile;
  } catch {
    return null;
  }
}

export function saveOnboardingProfile(
  profile: Omit<OnboardingProfile, "recommendedPathSlug" | "completedAt">
): OnboardingProfile {
  const nextProfile: OnboardingProfile = {
    ...profile,
    recommendedPathSlug: getRecommendedPathSlug(profile.timeline, profile.currentStage),
    completedAt: new Date().toISOString()
  };

  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextProfile));
  }

  return nextProfile;
}

export function getOnboardingRecommendation(
  profile: Pick<OnboardingProfile, "currentStage" | "targetGoal" | "dailyTime" | "timeline">
): OnboardingRecommendation {
  if (profile.targetGoal === "Build projects" || profile.targetGoal === "Survive first 90 days") {
    return {
      title: "Incremental Load Missing Records",
      href: "/scenarios/incremental-load-missing-records",
      estimatedMinutes: 20,
      reason:
        "This production scenario builds the pipeline judgment you need for projects and early job ownership while the project sandbox is being prepared."
    };
  }

  if (
    profile.targetGoal === "Improve production thinking" ||
    profile.currentStage === "Junior Data Engineer" ||
    profile.currentStage === "Recently joined as Data Engineer"
  ) {
    return {
      title: "Incremental Load Missing Records",
      href: "/scenarios/incremental-load-missing-records",
      estimatedMinutes: 20,
      reason:
        "This lab builds production judgment around watermarks, late data, reconciliation, and safe incremental loading."
    };
  }

  return {
    title: "Wrong GROUP BY Grain",
    href: "/scenarios/wrong-group-by-grain-customer-revenue",
    estimatedMinutes: 18,
    reason:
      "It is a fast, interview-relevant SQL debugging lab with visible data, executable validation, and a clear production lesson."
  };
}

export function clearOnboardingProfile(): void {
  if (canUseStorage()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
