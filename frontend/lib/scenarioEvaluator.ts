import type { EvaluationRubric, Scenario } from "./scenarios";

export interface ScenarioEvaluationResult {
  score: number;
  verdict: "weak" | "partial" | "good" | "strong";
  strengths: string[];
  gaps: string[];
  improvedAnswer: string;
  rubricBreakdown: EvaluationRubric;
  mode: "mock" | "openai";
  model?: string;
}

const SIGNALS = {
  rootCause: [
    "root cause",
    "grain",
    "skew",
    "duplicate",
    "timezone",
    "late",
    "idempotent",
    "partition",
    "join"
  ],
  correctness: [
    "fix",
    "where",
    "join",
    "group by",
    "dedup",
    "row_number",
    "overwrite",
    "merge",
    "mapping"
  ],
  productionThinking: [
    "monitor",
    "alert",
    "reconcile",
    "checkpoint",
    "backfill",
    "quarantine",
    "test",
    "validation"
  ],
  tradeoffs: ["trade", "cost", "latency", "sla", "risk", "accuracy", "rerun", "replay"],
  communication: ["because", "first", "then", "I would", "impact", "business", "verify"]
};

function scoreSignals(answer: string, signals: string[], maxScore: number): number {
  const normalized = answer.toLowerCase();
  const matchedCount = signals.filter((signal) => normalized.includes(signal)).length;
  const lengthBonus = Math.min(maxScore * 0.35, Math.floor(answer.trim().length / 35));
  return Math.min(maxScore, Math.round(matchedCount * (maxScore / 4) + lengthBonus));
}

function verdictFromScore(score: number): ScenarioEvaluationResult["verdict"] {
  if (score >= 85) {
    return "strong";
  }
  if (score >= 70) {
    return "good";
  }
  if (score >= 45) {
    return "partial";
  }
  return "weak";
}

function buildBreakdown(answer: string, rubric: EvaluationRubric): EvaluationRubric {
  return {
    rootCause: scoreSignals(answer, SIGNALS.rootCause, rubric.rootCause),
    correctness: scoreSignals(answer, SIGNALS.correctness, rubric.correctness),
    productionThinking: scoreSignals(
      answer,
      SIGNALS.productionThinking,
      rubric.productionThinking
    ),
    tradeoffs: scoreSignals(answer, SIGNALS.tradeoffs, rubric.tradeoffs),
    communication: scoreSignals(answer, SIGNALS.communication, rubric.communication)
  };
}

function sumBreakdown(breakdown: EvaluationRubric): number {
  return Object.values(breakdown).reduce((sum, value) => sum + value, 0);
}

export function evaluateScenarioAnswer(
  scenario: Scenario,
  userAnswer: string
): ScenarioEvaluationResult {
  const trimmedAnswer = userAnswer.trim();

  if (scenario.scenarioType === "mcq") {
    const selectedOption = scenario.mcqOptions?.find((option) => option.id === trimmedAnswer);
    const isCorrect = Boolean(selectedOption?.isCorrect);
    const score = isCorrect ? 100 : selectedOption ? 35 : 0;
    return {
      score,
      verdict: verdictFromScore(score),
      strengths: isCorrect
        ? ["You identified the most likely production root cause."]
        : selectedOption
          ? ["You made a diagnosis attempt. Now compare the failure symptoms more carefully."]
          : [],
      gaps: isCorrect
        ? ["Add the prevention and monitoring angle in your interview explanation."]
        : [
            selectedOption?.explanation ??
              "Choose one option before checking the answer.",
            "Tie your diagnosis to logs, row counts, or task metrics."
          ],
      improvedAnswer: isCorrect
        ? scenario.modelSolution
        : `Better answer: ${scenario.modelSolution}`,
      rubricBreakdown: {
        rootCause: isCorrect ? scenario.evaluationRubric.rootCause : 5,
        correctness: isCorrect ? scenario.evaluationRubric.correctness : 5,
        productionThinking: isCorrect ? scenario.evaluationRubric.productionThinking : 10,
        tradeoffs: isCorrect ? scenario.evaluationRubric.tradeoffs : 5,
        communication: isCorrect ? scenario.evaluationRubric.communication : 10
      },
      mode: "mock"
    };
  }

  if (!trimmedAnswer) {
    return {
      score: 0,
      verdict: "weak",
      strengths: [],
      gaps: ["Write an answer before evaluation."],
      improvedAnswer:
        "Start with the symptom, name the root cause, propose the fix, then add validation and monitoring.",
      rubricBreakdown: {
        rootCause: 0,
        correctness: 0,
        productionThinking: 0,
        tradeoffs: 0,
        communication: 0
      },
      mode: "mock"
    };
  }

  const breakdown = buildBreakdown(trimmedAnswer, scenario.evaluationRubric);
  const score = Math.min(100, sumBreakdown(breakdown));
  const strengths = [
    breakdown.rootCause >= scenario.evaluationRubric.rootCause * 0.55
      ? "You are pointing at the root cause instead of only rewriting code."
      : null,
    breakdown.correctness >= scenario.evaluationRubric.correctness * 0.55
      ? "Your answer includes an actionable fix."
      : null,
    breakdown.productionThinking >= scenario.evaluationRubric.productionThinking * 0.55
      ? "You included production validation, monitoring, or recovery thinking."
      : null,
    breakdown.communication >= scenario.evaluationRubric.communication * 0.55
      ? "The answer is moving toward interview-ready structure."
      : null
  ].filter((value): value is string => Boolean(value));

  const gaps = [
    breakdown.rootCause < scenario.evaluationRubric.rootCause * 0.55
      ? "State the root cause more explicitly."
      : null,
    breakdown.correctness < scenario.evaluationRubric.correctness * 0.55
      ? "Make the fix concrete enough that an engineer could implement it."
      : null,
    breakdown.productionThinking < scenario.evaluationRubric.productionThinking * 0.55
      ? "Add tests, reconciliation, alerting, or replay safety."
      : null,
    breakdown.tradeoffs < scenario.evaluationRubric.tradeoffs * 0.55
      ? "Mention at least one trade-off or operational risk."
      : null,
    breakdown.communication < scenario.evaluationRubric.communication * 0.55
      ? "Frame it as: symptom, root cause, fix, validation, prevention."
      : null
  ].filter((value): value is string => Boolean(value));

  return {
    score,
    verdict: verdictFromScore(score),
    strengths:
      strengths.length > 0
        ? strengths
        : ["You made a useful first attempt. Now add production evidence and structure."],
    gaps,
    improvedAnswer:
      "A stronger answer: first describe the business symptom, then identify the root cause, apply the practical fix, validate with row counts/reconciliation, and close with monitoring/prevention. Compare your answer with the model solution below.",
    rubricBreakdown: breakdown,
    mode: "mock"
  };
}
