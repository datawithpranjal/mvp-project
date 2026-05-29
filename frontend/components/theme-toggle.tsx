"use client";

import { useEffect, useState } from "react";

import {
  applyThemePreference,
  getThemePreference,
  saveThemePreference,
  THEME_UPDATED_EVENT,
  type ThemePreference
} from "../lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>("dark");

  useEffect(() => {
    function syncTheme() {
      const nextTheme = getThemePreference();
      setTheme(nextTheme);
      applyThemePreference(nextTheme);
    }

    syncTheme();
    window.addEventListener("storage", syncTheme);
    window.addEventListener(THEME_UPDATED_EVENT, syncTheme);

    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener(THEME_UPDATED_EVENT, syncTheme);
    };
  }, []);

  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => saveThemePreference(nextTheme)}
      className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-teal-300/40 hover:text-teal-100"
      aria-label={`Switch to ${nextTheme} mode`}
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}

