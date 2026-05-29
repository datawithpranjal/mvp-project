"use client";

import { useEffect } from "react";

import { applyThemePreference, getThemePreference } from "../lib/theme";

export function ThemeBootstrap() {
  useEffect(() => {
    applyThemePreference(getThemePreference());
  }, []);

  return null;
}

