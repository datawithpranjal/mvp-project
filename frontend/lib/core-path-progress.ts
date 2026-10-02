import { getCodingLabDrafts, getCodingLabProgressMap } from "./coding-lab-session";
import { GOLD_CORE_ITEMS } from "./gold-core";
import { getScenarioProgressMap } from "./progress";

export type CorePathStatus = "new" | "in_progress" | "done";

interface SavedOperationsAnswer {
  optionId?: string;
  explanation?: string;
  completed?: boolean;
}

interface SavedSystemDesignProgress {
  completed?: boolean;
  draft?: string;
  selectedOptions?: Record<string, string>;
}

function readLocalRecord<T>(key: string): Record<string, T> {
  if (typeof window === "undefined") return {};

  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function status(completed: boolean, attempted: boolean): CorePathStatus {
  if (completed) return "done";
  if (attempted) return "in_progress";
  return "new";
}

export function getCorePathStatuses(): Record<string, CorePathStatus> {
  const codingProgress = getCodingLabProgressMap();
  const codingDrafts = getCodingLabDrafts();
  const scenarioProgress = getScenarioProgressMap();
  const operationsProgress = readLocalRecord<SavedOperationsAnswer>(
    "data-foundry-operations-lab-session-v1"
  );
  const systemDesignProgress = readLocalRecord<SavedSystemDesignProgress>(
    "the-data-foundry-system-design-progress-v1"
  );

  return Object.fromEntries(
    GOLD_CORE_ITEMS.map((item) => {
      if (item.kind === "coding") {
        const progress = codingProgress[item.slug];
        return [
          item.slug,
          status(
            Boolean(progress?.completed),
            Boolean((progress?.attemptCount ?? 0) > 0 || codingDrafts[item.slug])
          )
        ];
      }

      if (item.kind === "scenario") {
        const progress = scenarioProgress[item.slug];
        return [
          item.slug,
          status(
            Boolean(progress?.completed),
            Boolean((progress?.attemptCount ?? 0) > 0 || progress?.draftSavedAt)
          )
        ];
      }

      if (item.kind === "operations") {
        const progress = operationsProgress[item.slug];
        return [
          item.slug,
          status(
            Boolean(progress?.completed),
            Boolean(progress?.optionId || progress?.explanation?.trim())
          )
        ];
      }

      const progress = systemDesignProgress[item.slug];
      return [
        item.slug,
        status(
          Boolean(progress?.completed),
          Boolean(
            progress?.draft?.trim() ||
              (progress?.selectedOptions && Object.keys(progress.selectedOptions).length > 0)
          )
        )
      ];
    })
  );
}
