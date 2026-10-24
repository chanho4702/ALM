import { useCallback, useMemo, useState } from "react";
import {
  DEFAULT_VIEW_DISPLAY,
  VIEW_GROUPS,
  VIEW_ORDERS,
  VIEW_PROPERTIES,
} from "../../store/types";
import type { ViewDisplay, ViewFilter, ViewLayout, ViewProperty } from "../../store/types";

/** 화면이 지금 그리는 보기 상태 — 저장된 보기의 layout·filter·display와 같은 모양 */
export interface ViewState {
  layout: ViewLayout;
  display: ViewDisplay;
  filter: ViewFilter | null;
}

export const DEFAULT_VIEW_STATE: ViewState = {
  layout: "list",
  display: DEFAULT_VIEW_DISPLAY,
  filter: null,
};

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

export function sameDisplay(a: ViewDisplay, b: ViewDisplay): boolean {
  return (
    a.groupBy === b.groupBy &&
    a.subGroupBy === b.subGroupBy &&
    a.orderBy === b.orderBy &&
    a.orderDirection === b.orderDirection &&
    a.showSubIssues === b.showSubIssues &&
    a.showEmptyGroups === b.showEmptyGroups &&
    sameList(a.properties, b.properties)
  );
}

export function sameViewState(a: ViewState, b: ViewState): boolean {
  return (
    a.layout === b.layout &&
    sameDisplay(a.display, b.display) &&
    (a.filter?.kind ?? null) === (b.filter?.kind ?? null) &&
    (a.filter?.query ?? "") === (b.filter?.query ?? "")
  );
}

export function isDefaultViewState(state: ViewState): boolean {
  return sameViewState(state, DEFAULT_VIEW_STATE);
}

/**
 * 저장본 → 상태. 어휘 밖 값(옛 저장본·손으로 고친 값)은 기본값으로 떨군다 — 서버 normalize와 달리
 * 던지지 않는다(UI 선호라 잘못돼도 화면을 막지 않는다).
 */
export function normalizeViewState(raw: unknown): ViewState {
  if (!raw || typeof raw !== "object") return DEFAULT_VIEW_STATE;
  const input = raw as Partial<ViewState> & { display?: Partial<ViewDisplay> };
  const d: Partial<ViewDisplay> = input.display ?? {};
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  const groupBy = pick(d.groupBy, VIEW_GROUPS, DEFAULT_VIEW_DISPLAY.groupBy);
  let subGroupBy = pick(d.subGroupBy, VIEW_GROUPS, DEFAULT_VIEW_DISPLAY.subGroupBy);
  if (groupBy === "none" || subGroupBy === groupBy) subGroupBy = "none";
  const properties = Array.isArray(d.properties)
    ? [...new Set((d.properties as unknown[]).filter((p): p is ViewProperty => typeof p === "string" && (VIEW_PROPERTIES as readonly string[]).includes(p)))]
    : [...DEFAULT_VIEW_DISPLAY.properties];
  const filter =
    input.filter && (input.filter.kind === "aql" || input.filter.kind === "smart") && typeof input.filter.query === "string" && input.filter.query.trim()
      ? { kind: input.filter.kind, query: input.filter.query }
      : null;
  return {
    layout: input.layout === "board" ? "board" : "list",
    filter,
    display: {
      groupBy,
      subGroupBy,
      orderBy: pick(d.orderBy, VIEW_ORDERS, DEFAULT_VIEW_DISPLAY.orderBy),
      orderDirection: d.orderDirection === "desc" ? "desc" : "asc",
      properties,
      showSubIssues: typeof d.showSubIssues === "boolean" ? d.showSubIssues : DEFAULT_VIEW_DISPLAY.showSubIssues,
      showEmptyGroups: typeof d.showEmptyGroups === "boolean" ? d.showEmptyGroups : DEFAULT_VIEW_DISPLAY.showEmptyGroups,
    },
  };
}

const storageKey = (projectId: string) => `alm.viewDisplay.${projectId}`;

function read(projectId: string | undefined): ViewState {
  if (!projectId) return DEFAULT_VIEW_STATE;
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    return raw ? normalizeViewState(JSON.parse(raw)) : DEFAULT_VIEW_STATE;
  } catch {
    return DEFAULT_VIEW_STATE;
  }
}

function write(projectId: string | undefined, state: ViewState) {
  if (!projectId) return;
  try {
    if (isDefaultViewState(state)) localStorage.removeItem(storageKey(projectId));
    else localStorage.setItem(storageKey(projectId), JSON.stringify(state));
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 창 등) — 이번 화면에서만 적용된다
  }
}

/**
 * 프로젝트별 내 표시 옵션(저장된 보기를 열지 않았을 때) — 내 브라우저에만 남는 UI 선호다.
 * 도메인 데이터가 아니므로 스토어를 거치지 않는다(`useTablePrefs`와 같은 결).
 */
export function useViewDisplay(projectId: string | undefined) {
  const [state, setState] = useState<ViewState>(() => read(projectId));

  const replace = useCallback(
    (next: ViewState) => {
      const normalized = normalizeViewState(next);
      setState(normalized);
      write(projectId, normalized);
    },
    [projectId],
  );

  const reset = useCallback(() => replace(DEFAULT_VIEW_STATE), [replace]);

  return useMemo(() => ({ state, replace, reset }), [state, replace, reset]);
}
