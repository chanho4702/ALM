import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@chanho/react";

const THEME_KEY = "alm.theme";
export type Theme = "light" | "dark";

/** localStorage에 저장된 테마 (없으면 light). main.tsx 초기 적용에 쓴다. */
export function readStoredTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

/** 문서 루트에 테마를 반영한다 — 토큰이 [data-theme="dark"]로 색을 전환한다. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** 헤더용 라이트/다크 토글. 현재 값은 문서 루트의 data-theme에서 읽는다. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) || "light",
  );

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  };

  return (
    <Button iconOnly className="topbar-icon"
      variant="ghost"
      size="small"
      onClick={toggle}
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  );
}
