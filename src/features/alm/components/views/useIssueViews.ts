import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useToast } from "@chanho/react";
import { createView, deleteView, getMyProjectRole, getView, listProjectViews, updateView } from "../../store/jiraStore";
import type { SavedView, ViewScope } from "../../store/types";
import { errorStatus } from "../../store/mapping";
import { DEFAULT_VIEW_STATE, isDefaultViewState, sameViewState, useViewDisplay } from "./useViewDisplay";
import type { ViewState } from "./useViewDisplay";

/** 보기를 만들거나 고치거나 지운 뒤 알리는 창 이벤트 — 사이드바 보기 목록이 듣는다 */
export const VIEWS_CHANGED_EVENT = "alm:views-changed";

export const notifyViewsChanged = () => window.dispatchEvent(new Event(VIEWS_CHANGED_EVENT));

const stateOf = (view: SavedView): ViewState => ({ layout: view.layout, display: view.display, filter: view.filter });

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * 이슈 목록의 보기 상태 — 저장된 보기(`?view=<id>`, 서버) 또는 내 표시 옵션(localStorage).
 *
 * - 보기를 열면 그 보기의 layout·display·filter가 **작업본**이 된다. 표시 옵션을 바꾸면 작업본만 바뀌고
 *   "현재 보기 업데이트"로 서버에 올린다(버전 대조, 어긋나면 409 → 다시 불러오기 제안).
 * - 보기를 닫으면 내 표시 옵션으로 돌아간다. "보기로 저장"은 지금 상태를 보기로 만들고 그 보기를 연다
 *   (내 표시 옵션은 보기에 담겼으니 기본값으로 되돌린다 — 닫으면 평소 표로 돌아간다).
 */
export function useIssueViews(projectId: string | undefined) {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewId = searchParams.get("view");
  const local = useViewDisplay(projectId);

  const [views, setViews] = useState<SavedView[]>([]);
  const [viewsError, setViewsError] = useState<string | null>(null);
  const [viewsRetry, setViewsRetry] = useState(0);
  const [canShare, setCanShare] = useState(false);
  const [active, setActive] = useState<SavedView | null>(null);
  const [draft, setDraft] = useState<ViewState | null>(null);
  /** 업데이트가 409로 막혔다 — 최신 보기를 다시 불러올지 묻는다 */
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  // 프로젝트 보기 목록 — 실패는 "없음"과 구분해 보여 준다
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const load = () =>
      void listProjectViews(projectId).then(
        (list) => {
          if (cancelled) return;
          setViews(list);
          setViewsError(null);
        },
        (error: unknown) => {
          if (!cancelled) setViewsError(message(error));
        },
      );
    load();
    window.addEventListener(VIEWS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(VIEWS_CHANGED_EVENT, load);
    };
  }, [projectId, viewsRetry]);

  // 프로젝트 공유는 편집 권한이 있을 때만 — 서버도 EDIT를 요구한다(뷰어면 403)
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void getMyProjectRole(projectId).then(
      (role) => {
        if (!cancelled) setCanShare(role === "editor" || role === "admin");
      },
      () => {
        if (!cancelled) setCanShare(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const setViewParam = useCallback(
    (id: string | null) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("view", id);
        else next.delete("view");
        return next;
      }),
    [setSearchParams],
  );

  // ?view= 가 가리키는 보기 — 공유 링크로 들어와도 같은 보기가 열린다
  useEffect(() => {
    if (!viewId) {
      setActive(null);
      setDraft(null);
      return;
    }
    let cancelled = false;
    void getView(viewId).then(
      (view) => {
        if (cancelled) return;
        if (projectId && view.projectId !== null && view.projectId !== projectId) {
          toast({ title: "다른 프로젝트의 보기입니다", appearance: "danger" });
          setViewParam(null);
          return;
        }
        setActive(view);
        setDraft(stateOf(view));
      },
      (error: unknown) => {
        if (cancelled) return;
        toast({ title: "보기를 열지 못했습니다", description: message(error), appearance: "danger" });
        setViewParam(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [viewId, projectId, toast, setViewParam]);

  /** 화면이 지금 그리는 상태 — 보기를 여는 중(아직 응답 전)에는 기본 표로 깜빡이지 않게 보기 쪽을 기다린다 */
  const opening = viewId !== null && active?.id !== viewId;
  const state: ViewState = active && draft ? draft : opening ? DEFAULT_VIEW_STATE : local.state;
  const dirty = active !== null && draft !== null && !sameViewState(draft, stateOf(active));
  /** 표 대신 그룹 보기를 그릴까 — 보기를 열었거나, 내 표시 옵션이 기본과 다를 때 */
  const engaged = viewId !== null || !isDefaultViewState(local.state);

  const setState = useCallback(
    (next: ViewState) => {
      if (active) setDraft(next);
      else local.replace(next);
    },
    [active, local],
  );

  const resetState = useCallback(() => setState(DEFAULT_VIEW_STATE), [setState]);

  const selectView = useCallback((id: string) => setViewParam(id), [setViewParam]);
  const closeView = useCallback(() => setViewParam(null), [setViewParam]);

  const saveAs = useCallback(
    async (name: string, scope: ViewScope): Promise<boolean> => {
      if (!projectId) return false;
      setSaving(true);
      try {
        const created = await createView({ name, scope, projectId, layout: state.layout, filter: state.filter, display: state.display });
        if (!active) local.reset();
        notifyViewsChanged();
        setViewParam(created.id);
        toast({ title: `"${created.name}" 보기를 저장했습니다`, appearance: "success" });
        return true;
      } catch (error) {
        toast({ title: "보기를 저장하지 못했습니다", description: message(error), appearance: "danger" });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [projectId, state, active, local, setViewParam, toast],
  );

  const updateCurrent = useCallback(async () => {
    if (!active || !draft) return;
    setSaving(true);
    try {
      const updated = await updateView(
        active.id,
        { layout: draft.layout, display: draft.display, filter: draft.filter },
        active.version,
      );
      setActive(updated);
      setDraft(stateOf(updated));
      notifyViewsChanged();
      toast({ title: `"${updated.name}" 보기를 업데이트했습니다`, appearance: "success" });
    } catch (error) {
      if (errorStatus(error) === 409) setConflict(true);
      else toast({ title: "보기를 업데이트하지 못했습니다", description: message(error), appearance: "danger" });
    } finally {
      setSaving(false);
    }
  }, [active, draft, toast]);

  /** 409 뒤 — 남이 저장한 최신 보기로 바꾼다(내 작업본은 버린다) */
  const reloadCurrent = useCallback(async () => {
    setConflict(false);
    if (!active) return;
    try {
      const fresh = await getView(active.id);
      setActive(fresh);
      setDraft(stateOf(fresh));
    } catch (error) {
      toast({ title: "보기를 다시 불러오지 못했습니다", description: message(error), appearance: "danger" });
    }
  }, [active, toast]);

  const deleteCurrent = useCallback(async () => {
    if (!active) return;
    setSaving(true);
    try {
      await deleteView(active.id);
      notifyViewsChanged();
      setViewParam(null);
      toast({ title: `"${active.name}" 보기를 삭제했습니다`, appearance: "success" });
    } catch (error) {
      toast({ title: "보기를 삭제하지 못했습니다", description: message(error), appearance: "danger" });
    } finally {
      setSaving(false);
    }
  }, [active, setViewParam, toast]);

  return useMemo(
    () => ({
      projectId,
      views,
      viewsError,
      retryViews: () => setViewsRetry((value) => value + 1),
      canShare,
      active,
      state,
      dirty,
      engaged,
      saving,
      conflict,
      dismissConflict: () => setConflict(false),
      setState,
      resetState,
      selectView,
      closeView,
      saveAs,
      updateCurrent,
      reloadCurrent,
      deleteCurrent,
    }),
    [projectId, views, viewsError, canShare, active, state, dirty, engaged, saving, conflict, setState, resetState, selectView, closeView, saveAs, updateCurrent, reloadCurrent, deleteCurrent],
  );
}

export type IssueViewsController = ReturnType<typeof useIssueViews>;
