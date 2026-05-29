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

const STORAGE_KEY = "the-data-foundry-onboarding-v1";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getRecommendedPathSlug(timeline: Timeline, currentStage: CurrentStage): string {
  if (timeline === "7 days") {
    return "7-day-interview-crash-plan";
  }

  if (timeline === "60 days" || currentStage === "Career switcher") {
    return "60-day-career-switcher-plan";
  }

  if (timeline === "90 days" || currentStage === "Recently joined as Data Engineer") {
    return "90-day-job-ready-data-engineer-plan";
  }

  return "30-day-data-engineering-interview-plan";
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
    return hasPath ? parsed : null;
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

export function clearOnboardingProfile(): void {
  if (canUseStorage()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

