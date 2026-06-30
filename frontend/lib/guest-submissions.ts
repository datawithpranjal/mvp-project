"use client";

const GUEST_SUBMISSION_LIMIT = 3;
const STORAGE_KEY = "data-foundry-guest-submissions-v1";

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function readQuestionKeys(): string[] {
  if (!canUseSessionStorage()) {
    return Array.from({ length: GUEST_SUBMISSION_LIMIT }, (_, index) => `unavailable-${index + 1}`);
  }
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    const legacyCount = Number(raw);
    if (Number.isFinite(legacyCount) && legacyCount > 0) {
      return Array.from({ length: Math.min(GUEST_SUBMISSION_LIMIT, legacyCount) }, (_, index) =>
        `legacy-${index + 1}`
      );
    }
  }

  return [];
}

export function getGuestSubmissionStatus(questionKey?: string) {
  const questionKeys = readQuestionKeys();
  const cleanQuestionKey = questionKey?.trim();
  const alreadyUsed = cleanQuestionKey ? questionKeys.includes(cleanQuestionKey) : false;
  const used = questionKeys.length;
  const remaining = Math.max(0, GUEST_SUBMISSION_LIMIT - used);
  return {
    limit: GUEST_SUBMISSION_LIMIT,
    used,
    remaining,
    alreadyUsed,
    canSubmit: alreadyUsed || remaining > 0
  };
}

export function recordGuestSubmission(questionKey: string) {
  const cleanQuestionKey = questionKey.trim();
  const questionKeys = readQuestionKeys();
  const nextQuestionKeys =
    cleanQuestionKey && !questionKeys.includes(cleanQuestionKey)
      ? [...questionKeys, cleanQuestionKey].slice(0, GUEST_SUBMISSION_LIMIT)
      : questionKeys;

  if (canUseSessionStorage()) {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextQuestionKeys));
  }
  return getGuestSubmissionStatus();
}
