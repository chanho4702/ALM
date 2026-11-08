import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "alm.theme";
const THEME_CHANGED_EVENT = "alm:theme-changed";
export type Theme = "light" | "dark";

/** localStorage에 저장된 테마 (없으면 light). main.tsx 초기 적용에 쓴다. */
export function readStoredTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

/** 문서 루트에 테마를 반영한다 — 토큰이 [data-theme="dark"]로 색을 전환한다. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function setStoredTheme(theme: Theme) {
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGED_EVENT, { detail: theme }));
}

/** 상단 메뉴와 일반 설정 화면이 같은 테마 상태를 공유한다. */
export function useThemePreference() {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) || readStoredTheme(),
  );

  useEffect(() => {
    const sync = (event: Event) => setTheme((event as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, sync);
  }, []);

  const toggle = useCallback(() => {
    setStoredTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);

  return { theme, toggle };
}
