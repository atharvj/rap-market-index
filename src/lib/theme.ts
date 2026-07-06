export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "rmi-theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(storedPreference) ? storedPreference : "system";
}

export function resolveThemePreference(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return preference;
}

export function applyThemePreference(preference: ThemePreference) {
  const resolvedTheme = resolveThemePreference(preference);

  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = preference;
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);

  return resolvedTheme;
}
