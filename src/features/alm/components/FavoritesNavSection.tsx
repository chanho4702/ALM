import { useState } from "react";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { Bookmark, FileText, StarOff } from "lucide-react";
import type { Project } from "../store/types";
import type { Favorite } from "../store/uiStore";
import { moveFavorite, removeFavorite } from "../store/uiStore";
import { ProjectAvatar } from "./ProjectAvatar";
import "./favorites.css";

export interface FavoritesNavSectionProps {
  favorites: Favorite[];
  projects: Project[];
  onOpen: (favorite: Favorite) => void;
  /** 지금 화면이 가리키는 항목(활성 표시) */
  isActive: (favorite: Favorite) => boolean;
}

/**
 * 사이드바 "즐겨찾기"(Linear Favorites) — 저장된 보기·프로젝트·이슈를 고정한 순서대로.
 * 순서는 끌어 놓기로 바꾸고, 키보드는 항목에서 Alt+↑/↓(WCAG 2.5.7 끌기 대체). 별표 버튼으로 해제한다.
 * 지워진 프로젝트의 항목은 그리지 않는다(프로젝트 삭제 때 pruneProject가 걷어 낸다).
 */
export function FavoritesNavSection({ favorites, projects, onOpen, isActive }: FavoritesNavSectionProps) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const visible = favorites.filter((f) => (f.kind === "project" ? projects.some((p) => p.id === f.id) : true));
  if (visible.length === 0) return null;

  const nameOf = (favorite: Favorite) =>
    favorite.kind === "project" ? (projects.find((p) => p.id === favorite.id)?.name ?? favorite.label) : favorite.label || favorite.id;

  const glyph = (favorite: Favorite): ReactNode => {
    if (favorite.kind === "project") {
      const project = projects.find((p) => p.id === favorite.id);
      return project ? <ProjectAvatar project={project} size="sm" /> : null;
    }
    return (
      <span className="global-nav-glyph" aria-hidden>
        {favorite.kind === "view" ? <Bookmark /> : <FileText />}
      </span>
    );
  };

  /** 화면 순서(visible)의 자리 → 저장 순서(favorites)의 자리 */
  const storedIndex = (visibleIndex: number) => favorites.indexOf(visible[visibleIndex]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const target = index + (event.key === "ArrowUp" ? -1 : 1);
    if (target < 0 || target >= visible.length) return;
    const favorite = visible[index];
    void moveFavorite(favorite.kind, favorite.id, storedIndex(target)).then(() => {
      // 옮긴 항목에 포커스를 남긴다
      setTimeout(() => {
        document
          .querySelector<HTMLElement>(`[data-favorite="${CSS.escape(`${favorite.kind}:${favorite.id}`)}"] .global-nav-item`)
          ?.focus();
      }, 0);
    });
  };

  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    const from = dragging;
    setDragging(null);
    setOver(null);
    if (from === null || from === index) return;
    const favorite = visible[from];
    void moveFavorite(favorite.kind, favorite.id, storedIndex(index));
  };

  return (
    <>
      <span className="global-nav-section" id="nav-favorites-title">
        즐겨찾기
      </span>
      <ul className="global-nav-list" data-testid="nav-favorites" aria-labelledby="nav-favorites-title">
        {visible.map((favorite, index) => {
          const name = nameOf(favorite);
          const classes = ["global-nav-filter-row", "favorite-row"];
          if (dragging === index) classes.push("is-dragging");
          if (over === index && dragging !== null && dragging !== index) classes.push("is-drop-target");
          return (
            <li
              key={`${favorite.kind}:${favorite.id}`}
              className={classes.join(" ")}
              data-favorite={`${favorite.kind}:${favorite.id}`}
              draggable
              onDragStart={(event) => {
                setDragging(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", `${favorite.kind}:${favorite.id}`);
              }}
              onDragOver={(event) => {
                if (dragging === null) return;
                event.preventDefault();
                setOver(index);
              }}
              onDragLeave={() => setOver((prev) => (prev === index ? null : prev))}
              onDrop={(event) => onDrop(event, index)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
            >
              <button
                type="button"
                className={isActive(favorite) ? "global-nav-item is-active" : "global-nav-item"}
                aria-label={name}
                title={`${name} — Alt+↑/↓로 순서 바꾸기`}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                onClick={() => onOpen(favorite)}
                onKeyDown={(event) => onKeyDown(event, index)}
              >
                {glyph(favorite)}
                <span className="global-nav-label global-nav-project-name">{name}</span>
              </button>
              <button
                type="button"
                className="global-nav-filter-delete"
                aria-label={`${name} 즐겨찾기 해제`}
                title="즐겨찾기 해제"
                onClick={() => void removeFavorite(favorite.kind, favorite.id)}
              >
                <StarOff size={12} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
