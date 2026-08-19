const STORAGE_KEY = "starlive_theme";

export type Theme = "dark" | "light";

export function getTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme): void {
  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
  localStorage.setItem(STORAGE_KEY, theme);
}

/** 应用启动时恢复上次主题（默认暗色） */
export function initTheme(): Theme {
  const t = getTheme();
  applyTheme(t);
  return t;
}
