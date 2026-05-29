export type ThemePreference = "dark" | "light";

const STORAGE_KEY = "the-data-foundry-theme-v1";
export const THEME_UPDATED_EVENT = "theme-updated";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getThemePreference(): ThemePreference {
  if (!canUseStorage()) {
    return "dark";
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  return storedTheme === "light" ? "light" : "dark";
}

export function applyThemePreference(theme: ThemePreference): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
}

export function saveThemePreference(theme: ThemePreference): void {
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }

  applyThemePreference(theme);
  window.dispatchEvent(new Event(THEME_UPDATED_EVENT));
}

