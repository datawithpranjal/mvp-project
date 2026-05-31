import { LEVELS } from "./product";
import type { ScenarioProgressSummary } from "./progress";
import { formatDomain, type Scenario } from "./scenarios";
import type { ScenarioSummary } from "./types";

export interface ReadinessScore {
  score: number;
  label: string;
  scenarioCompletion: number;
  averageAiScore: number;
  practiceCompletion: number;
  consistency: number;
  followUpPractice: number;
  confidence: number;
  xp: number;
  levelName: string;
  streakCount: number;
  weakAreas: string[];
  badges: string[];
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getScoreLabel(score: number): string {
  if (score <= 30) {
    return "Beginner";
  }
  if (score <= 55) {
    return "Building";
  }
  if (score <= 75) {
    return "Interview Practice Ready";
  }
  if (score <= 90) {
    return "Strong Candidate";
  }
  return "Job Ready";
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

function getLevelName(xp: number): string {
  return LEVELS.reduce((currentLevel, level) => {
    return xp >= level.minXp ? level.name : currentLevel;
  }, LEVELS[0]?.name ?? "Data Rookie");
}

export function calculateReadinessScore(
  scenarios: Array<ScenarioSummary | Scenario>,
  progressMap: Record<string, ScenarioProgressSummary>
): ReadinessScore {
  const progressValues = scenarios
    .map((scenario) => progressMap[scenario.slug])
    .filter(Boolean);
  const completedCount = scenarios.filter((scenario) => progressMap[scenario.slug]?.completed).length;
  const attemptedCount = progressValues.filter((progress) => progress.attemptCount > 0).length;
  const aiScores = progressValues
    .map((progress) => progress.aiScore)
    .filter((score): score is number => typeof score === "number");
  const confidenceValues = progressValues
    .map((progress) => progress.selfRating)
    .filter(Boolean)
    .map((rating) => {
      if (rating === "Strong") {
        return 95;
      }
      if (rating === "Okay") {
        return 65;
      }
      return 35;
    });

  const scenarioCompletion = scenarios.length ? (completedCount / scenarios.length) * 100 : 0;
  const averageAiScore = aiScores.length
    ? aiScores.reduce((sum, score) => sum + score, 0) / aiScores.length
    : 0;
  const practiceCompletion = Math.min(100, attemptedCount * 12);
  const streakCount = calculateStreak(progressValues);
  const consistency = Math.min(100, streakCount * 15);
  const followUpPractice = Math.min(
    100,
    progressValues.filter((progress) => progress.attemptCount > 1 || progress.revisitAt).length * 20
  );
  const confidence = confidenceValues.length
    ? confidenceValues.reduce((sum, score) => sum + score, 0) / confidenceValues.length
    : 0;

  const score = clampPercent(
    scenarioCompletion * 0.25 +
      averageAiScore * 0.2 +
      practiceCompletion * 0.2 +
      consistency * 0.15 +
      followUpPractice * 0.1 +
      confidence * 0.1
  );

  const weakAreas = scenarios
    .filter((scenario) => {
      const progress = progressMap[scenario.slug];
      return progress?.selfRating === "Weak" || (progress?.attemptCount ?? 0) > 0 && !progress?.completed;
    })
    .map((scenario) => scenarioSection(scenario))
    .filter((section, index, sections) => sections.indexOf(section) === index)
    .slice(0, 5);

  const xp = completedCount * 75 + attemptedCount * 20 + Math.round(averageAiScore);
  const badges = [
    completedCount > 0 ? "First Scenario Completed" : null,
    weakAreas.includes("PySpark") || weakAreas.includes("Spark") ? "Spark Skew Hunter" : null,
    scenarios.some((scenario) => scenarioSection(scenario) === "SQL" && progressMap[scenario.slug]?.completed)
      ? "SQL Grain Master"
      : null,
    scenarios.some((scenario) => scenarioSection(scenario) === "Airflow" && progressMap[scenario.slug]?.completed)
      ? "Airflow Rescuer"
      : null,
    completedCount >= 3 ? "Production Debugger" : null,
    streakCount >= 7 ? "7-Day Streak" : null,
    streakCount >= 30 ? "30-Day Consistency" : null
  ].filter((badge): badge is string => Boolean(badge));

  return {
    score,
    label: getScoreLabel(score),
    scenarioCompletion: clampPercent(scenarioCompletion),
    averageAiScore: clampPercent(averageAiScore),
    practiceCompletion: clampPercent(practiceCompletion),
    consistency: clampPercent(consistency),
    followUpPractice: clampPercent(followUpPractice),
    confidence: clampPercent(confidence),
    xp,
    levelName: getLevelName(xp),
    streakCount,
    weakAreas,
    badges
  };
}

function scenarioSection(scenario: ScenarioSummary | Scenario): string {
  if ("domain" in scenario) {
    return formatDomain(scenario.domain);
  }

  return scenario.section;
}
