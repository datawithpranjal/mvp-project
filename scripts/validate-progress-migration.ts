import { migrateGuestCodingLabStateToUser } from "../frontend/lib/coding-lab-session";
import { migrateGuestScenarioProgressToUser } from "../frontend/lib/progress";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const storage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: storage,
  dispatchEvent: () => undefined
};

storage.setItem(
  "data-foundry-coding-lab-session-v1:guest",
  JSON.stringify({
    drafts: {
      "guest-newer": { code: "guest-new", savedAt: "2026-09-29T10:00:00Z" },
      "account-newer": { code: "guest-old", savedAt: "2026-09-27T10:00:00Z" }
    },
    selectedByTrack: { sql: "guest-newer" }
  })
);
storage.setItem(
  "data-foundry-coding-lab-session-v1:user-user-1",
  JSON.stringify({
    drafts: {
      "guest-newer": { code: "account-old", savedAt: "2026-09-28T10:00:00Z" },
      "account-newer": { code: "account-new", savedAt: "2026-09-29T11:00:00Z" }
    },
    selectedByTrack: {}
  })
);
storage.setItem(
  "data-foundry-coding-lab-progress:guest",
  JSON.stringify({
    "guest-newer": {
      completed: true,
      completedAt: "2026-09-29T10:05:00Z",
      attemptCount: 1,
      track: "sql"
    }
  })
);
storage.setItem(
  "data-foundry-coding-lab-progress:user-user-1",
  JSON.stringify({
    "guest-newer": { completed: false, attemptCount: 0, track: "sql" }
  })
);

const codingMigration = migrateGuestCodingLabStateToUser("user-1");
assert(codingMigration.drafts["guest-newer"].code === "guest-new", "Newer guest code was not preserved.");
assert(codingMigration.drafts["account-newer"].code === "account-new", "Newer account code was overwritten.");
assert(codingMigration.progress["guest-newer"].completed, "Guest completion was not preserved.");
assert(storage.getItem("data-foundry-coding-lab-session-v1:guest"), "Guest recovery copy was deleted.");

storage.setItem(
  "data-engineering-scenario-playground-progress-v1:guest",
  JSON.stringify({
    "scenario-1": {
      draftAnswer: "guest answer",
      draftInterviewAnswer: "guest explanation",
      draftSavedAt: "2026-09-29T11:00:00Z",
      completed: true,
      hintsRevealed: 2
    },
    "scenario-2": {
      draftAnswer: "older guest answer",
      draftSavedAt: "2026-09-27T11:00:00Z",
      completed: false,
      hintsRevealed: 0
    }
  })
);
storage.setItem(
  "data-engineering-scenario-playground-progress-v1:user-user-1",
  JSON.stringify({
    "scenario-1": {
      draftAnswer: "old account answer",
      draftSavedAt: "2026-09-28T11:00:00Z",
      completed: false,
      hintsRevealed: 0
    },
    "scenario-2": {
      draftAnswer: "newer account answer",
      draftSavedAt: "2026-09-29T12:00:00Z",
      completed: false,
      hintsRevealed: 1
    }
  })
);

const scenarioMigration = migrateGuestScenarioProgressToUser("user-1");
assert(scenarioMigration["scenario-1"].draftAnswer === "guest answer", "Newer guest scenario draft was not preserved.");
assert(
  scenarioMigration["scenario-2"].draftAnswer === "newer account answer",
  "Newer account scenario draft was overwritten."
);
assert(scenarioMigration["scenario-1"].completed, "Guest scenario completion was not preserved.");
assert(scenarioMigration["scenario-1"].hintsRevealed === 2, "Guest hint progress was not preserved.");
assert(storage.getItem("data-engineering-scenario-playground-progress-v1:guest"), "Guest scenario recovery copy was deleted.");

console.log("Guest-to-account progress migration checks passed.");
