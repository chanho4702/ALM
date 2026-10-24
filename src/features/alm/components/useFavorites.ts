import { useCallback, useEffect, useState } from "react";
import type { Issue, Project, SavedView } from "../store/types";
import type { Favorite, FavoriteKind } from "../store/uiStore";
import { UI_CHANGED_EVENT, UI_USER_CHANGED_EVENT, listFavorites, toggleFavorite } from "../store/uiStore";

/** 즐겨찾기 항목 만들기 — 고정할 때의 이름을 함께 적는다(사이드바 폴백 표시) */
export const favoriteOfIssue = (issue: Pick<Issue, "key" | "title" | "projectId">): Favorite => ({
  kind: "issue",
  id: issue.key,
  label: `${issue.key} ${issue.title}`,
  projectId: issue.projectId,
});
export const favoriteOfProject = (project: Pick<Project, "id" | "name">): Favorite => ({
  kind: "project",
  id: project.id,
  label: project.name,
});
export const favoriteOfView = (view: Pick<SavedView, "id" | "name" | "projectId">): Favorite => ({
  kind: "view",
  id: view.id,
  label: view.name,
  projectId: view.projectId ?? undefined,
});

/** 즐겨찾기 목록 구독 — uiStore가 바뀌면(다른 화면에서 고정해도) 다시 읽는다 */
export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      void listFavorites().then((list) => {
        if (!cancelled) setFavorites(list);
      });
    refresh();
    window.addEventListener(UI_CHANGED_EVENT, refresh);
    window.addEventListener(UI_USER_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(UI_CHANGED_EVENT, refresh);
      window.removeEventListener(UI_USER_CHANGED_EVENT, refresh);
    };
  }, []);
  const isPinned = useCallback(
    (kind: FavoriteKind, id: string) => favorites.some((f) => f.kind === kind && f.id === id),
    [favorites],
  );
  const toggle = useCallback((favorite: Favorite) => toggleFavorite(favorite), []);
  return { favorites, isPinned, toggle };
}
