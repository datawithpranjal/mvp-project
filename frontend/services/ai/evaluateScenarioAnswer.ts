import type { ScenarioDetail } from "../../lib/types";

export interface AiEvaluationResult {
  totalScore: number;
  dimensionScores: {
    problemUnderstanding: number;
    rootCauseThinking: number;
    solutionDesign: number;
    tradeOffs: number;
    monitoringTesting: number;
    interviewClarity: number;
  };
  strengths: string[];
  missingPoints: string[];
  improvedAnswerSuggestion: string;
  followUpQuestions: string[];
  mode: "mock" | "provider";
}

export interface EvaluateScenarioAnswerInput {
  scenario: ScenarioDetail;
  userAnswer: string;
  hasScenarioAccess: boolean;
}

const SIGNALS = {
  problemUnderstanding: ["problem", "symptom", "impact", "grain", "business", "requirement"],
  rootCauseThinking: ["root cause", "why", "null", "duplicate", "late", "timezone", "retry", "partition"],
  solutionDesign: ["solution", "dedup", "watermark", "idempotent", "quarantine", "not exists", "row_number"],
  tradeOffs: ["trade-off", "tradeoff", "cost", "latency", "accuracy", "risk", "sla"],
  monitoringTesting: ["monitor", "test", "alert", "reconcile", "count", "validation", "dq"],
  interviewClarity: ["first", "then", "because", "I would", "step", "verify"]
};

function scoreDimension(answer: string, signals: string[]): number {
  const lowerAnswer = answer.toLowerCase();
  const matchedSignals = signals.filter((signal) => lowerAnswer.includes(signal));
  const lengthScore = Math.min(35, Math.floor(answer.trim().length / 18));
  return Math.min(100, 30 + matchedSignals.length * 15 + lengthScore);
}

export async function evaluateScenarioAnswer({
  scenario,
  userAnswer,
  hasScenarioAccess
}: EvaluateScenarioAnswerInput): Promise<AiEvaluationResult> {
  const trimmedAnswer = userAnswer.trim();

  if (!trimmedAnswer) {
    return {
      totalScore: 0,
      dimensionScores: {
        problemUnderstanding: 0,
        rootCauseThinking: 0,
        solutionDesign: 0,
        tradeOffs: 0,
        monitoringTesting: 0,
        interviewClarity: 0
      },
      strengths: [],
      missingPoints: ["Write an answer first so the evaluator can score your reasoning."],
      improvedAnswerSuggestion:
        "Start with the symptom, state the likely root cause, propose a safe fix, and add validation checks.",
      followUpQuestions: scenario.rubric.slice(0, 2).map((item) => item.point),
      mode: "mock"
    };
  }

  const dimensionScores = {
    problemUnderstanding: scoreDimension(trimmedAnswer, SIGNALS.problemUnderstanding),
    rootCauseThinking: scoreDimension(trimmedAnswer, SIGNALS.rootCauseThinking),
    solutionDesign: scoreDimension(trimmedAnswer, SIGNALS.solutionDesign),
    tradeOffs: scoreDimension(trimmedAnswer, SIGNALS.tradeOffs),
    monitoringTesting: scoreDimension(trimmedAnswer, SIGNALS.monitoringTesting),
    interviewClarity: scoreDimension(trimmedAnswer, SIGNALS.interviewClarity)
  };
  const totalScore = Math.round(
    Object.values(dimensionScores).reduce((sum, score) => sum + score, 0) / 6
  );

  const strengths = [
    dimensionScores.problemUnderstanding >= 65 ? "You identified the business or data symptom." : null,
    dimensionScores.rootCauseThinking >= 65 ? "Your answer shows root-cause thinking instead of only syntax fixes." : null,
    dimensionScores.solutionDesign >= 65 ? "You proposed an actionable pipeline or query fix." : null,
    dimensionScores.monitoringTesting >= 65 ? "You included validation, testing, or monitoring signals." : null
  ].filter((value): value is string => Boolean(value));

  const missingPoints = [
    dimensionScores.problemUnderstanding < 65 ? "Clarify the symptom and why it matters to the business." : null,
    dimensionScores.rootCauseThinking < 65 ? "Name the likely root cause before jumping to the fix." : null,
    dimensionScores.tradeOffs < 65 ? "Add trade-offs such as latency, cost, accuracy, or operational risk." : null,
    dimensionScores.monitoringTesting < 65 ? "Add reconciliation checks, tests, alerts, or replay safety." : null,
    dimensionScores.interviewClarity < 65 ? "Structure the answer as steps so it sounds interview-ready." : null
  ].filter((value): value is string => Boolean(value));

  return {
    totalScore,
    dimensionScores,
    strengths:
      strengths.length > 0
        ? strengths
        : ["You made an attempt. Now sharpen it with production reasoning."],
    missingPoints,
    improvedAnswerSuggestion: hasScenarioAccess
      ? "Use this structure: explain the symptom, identify root causes, propose the fix, discuss trade-offs, and close with monitoring/tests. Then compare with the model answer below."
      : "Use this structure: explain the symptom, identify root causes, propose a safe fix, discuss trade-offs, and close with monitoring/tests. Upgrade access before viewing the full model answer.",
    followUpQuestions:
      scenario.rubric.length > 0
        ? scenario.rubric.slice(0, 3).map((item) => item.point)
        : [
            "How would you detect this issue before business users report it?",
            "What rollback or replay strategy would you use?",
            "What metric would prove the fix worked?"
          ],
    mode: "mock"
  };
}

