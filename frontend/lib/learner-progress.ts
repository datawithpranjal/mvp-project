import type { CodingLabProgress } from "./coding-lab-session";
import type { ScenarioProgressEntry } from "./progress";
import type { LearnerAttemptRecord, LearnerProgressRecord } from "./types";

export function codingProgressFromRemote(record: LearnerProgressRecord): CodingLabProgress {
  return {
    completed: record.completed,
    completedAt: record.completed_at ?? undefined,
    lastAttemptedAt: record.attempts[0]?.created_at,
    attemptCount: record.attempts.length,
    track: record.content_type === "coding_lab:pyspark" ? "pyspark" : record.content_type === "coding_lab:python" ? "python" : "sql",
    lastResult: record.latest_result
  };
}

function attemptFromRemote(attempt: LearnerAttemptRecord) {
  return {
    id: attempt.id,
    attemptedAt: attempt.created_at,
    passed: attempt.passed,
    answer: attempt.answer,
    message: attempt.message
  };
}

export function scenarioProgressFromRemote(record: LearnerProgressRecord): ScenarioProgressEntry {
  const feedback = record.ai_feedback;
  return {
    slug: record.content_id,
    completed: record.completed,
    hintsRevealed: record.hints_revealed,
    attempts: record.attempts.map(attemptFromRemote),
    draftAnswer: record.draft_answer,
    draftInterviewAnswer: record.draft_interview_answer,
    draftSavedAt: record.updated_at,
    selfRating: null,
    aiScore: typeof feedback?.totalScore === "number" ? feedback.totalScore : null,
    aiFeedback: feedback as ScenarioProgressEntry["aiFeedback"],
    completedAt: record.completed_at,
    revisitAt: null,
    latestResult: record.latest_result
  };
}
