import type { ScenarioProgressSummary } from "./progress";
import { formatDomain, type Scenario } from "./scenarios";
import type { ScenarioSummary } from "./types";

export interface PracticeProgress {
  completedCount: number;
  totalCount: number;
  attemptedCount: number;
  assessedExplanationCount: number;
  averageExplanationFeedback: number | null;
  reattemptedCount: number;
  streakCount: number;
  weakAreas: string[];
  milestones: string[];
}

function calculateStreak(progressValues: ScenarioProgressSummary[]): number {
  const practicedDates = new Set(
    progressValues
      .map((progress) => progress.lastAttemptedAt ?? progress.completedAt)
      .filter(Boolean)
      .map((value) => new Date(value as string).toISOString().slice(0, 10))
  );

  let streak = 0;
  const cursor = new Date();

  for (let index = 0; index < 30; index += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (!practicedDates.has(key)) {
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function calculatePracticeProgress(
  scenarios: Array<ScenarioSummary | Scenario>,
  progressMap: Record<string, ScenarioProgressSummary>
): PracticeProgress {
  const progressValues = scenarios
    .map((scenario) => progressMap[scenario.slug])
    .filter(Boolean);
  const completedCount = scenarios.filter((scenario) => progressMap[scenario.slug]?.completed).length;
  const attemptedCount = progressValues.filter((progress) => progress.attemptCount > 0).length;
  const aiScores = progressValues
    .map((progress) => progress.aiScore)
    .filter((score): score is number => typeof score === "number");
  const averageExplanationFeedback = aiScores.length
    ? aiScores.reduce((sum, score) => sum + score, 0) / aiScores.length
    : null;
  const streakCount = calculateStreak(progressValues);
  const reattemptedCount = progressValues.filter(
    (progress) => progress.attemptCount > 1 || progress.revisitAt
  ).length;

  const weakAreas = scenarios
    .filter((scenario) => {
      const progress = progressMap[scenario.slug];
      return progress?.selfRating === "Weak" || (progress?.attemptCount ?? 0) > 0 && !progress?.completed;
    })
    .map((scenario) => scenarioSection(scenario))
    .filter((section, index, sections) => sections.indexOf(section) === index)
    .slice(0, 5);

  const milestones = [
    completedCount > 0 ? "First Scenario Completed" : null,
    completedCount >= 3 ? "Three scenarios completed" : null,
    reattemptedCount > 0 ? "First reattempt completed" : null,
    aiScores.length > 0 ? "First explanation assessed" : null,
    streakCount >= 7 ? "Practised on seven consecutive days" : null
  ].filter((milestone): milestone is string => Boolean(milestone));

  return {
    completedCount,
    totalCount: scenarios.length,
    attemptedCount,
    assessedExplanationCount: aiScores.length,
    averageExplanationFeedback:
      averageExplanationFeedback === null ? null : Math.round(averageExplanationFeedback),
    reattemptedCount,
    streakCount,
    weakAreas,
    milestones
  };
}

function scenarioSection(scenario: ScenarioSummary | Scenario): string {
  if ("domain" in scenario) {
    return formatDomain(scenario.domain);
  }

  return scenario.section;
}
