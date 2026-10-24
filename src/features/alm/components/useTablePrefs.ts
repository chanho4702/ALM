import { useCallback, useEffect, useState } from "react";
import { UI_CHANGED_EVENT, getTablePrefs, setTablePrefs, type TablePrefs } from "../store/uiStore";

/** DS Table과 같은 해석 — 저장 순서에 있는 열이 먼저, 나머지는 기본 순서로 뒤에 */
function resolveOrder(saved: string[] | undefined, allKeys: string[]): string[] {
  const known = (saved ?? []).filter((key) => allKeys.includes(key));
  return [...known, ...allKeys.filter((key) => !known.includes(key))];
}

/**
 * 숨긴 열이 있을 때 표가 알려 주는 순서는 **보이는 열만**이다. 그대로 저장하면 숨긴 열의 자리가 사라져
 * 다시 켤 때 맨 뒤로 밀린다 — 보이는 열이 차지하던 자리에만 새 순서를 채우고 숨긴 열은 제자리에 둔다.
 */
export function mergeColumnOrder(saved: string[] | undefined, allKeys: string[], visibleOrder: string[]): string[] {
  const full = resolveOrder(saved, allKeys);
  const visible = new Set(visibleOrder);
  const queue = [...visibleOrder];
  const merged = full.map((key) => (visible.has(key) ? (queue.shift() ?? key) : key));
  // 표가 아는데 전체 목록에 없던 열(이론상 없음)은 뒤에 붙인다
  return [...merged, ...queue.filter((key) => !merged.includes(key))];
}

/**
 * 테이블별 열 순서·너비·숨김(사용자 로컬 설정). DS Table의 제어형 columnOrder/columnWidths에 그대로 꽂는다.
 * 저장은 uiStore(localStorage) — 서버 동기화 대상이 아닌 개인 화면 취향이라 도메인 스토어를 거치지 않는다.
 *
 * `allKeys`(표의 전체 열 key, 기본 순서)를 주면 숨긴 열이 있어도 순서 저장이 숨긴 열의 자리를 지킨다.
 */
export function useTablePrefs(tableId: string, allKeys?: string[]) {
  const [prefs, setPrefs] = useState<TablePrefs>({});

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void getTablePrefs(tableId).then((value) => {
        if (!cancelled) setPrefs(value);
      });
    load();
    window.addEventListener(UI_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(UI_CHANGED_EVENT, load);
    };
  }, [tableId]);

  const allKeysId = allKeys?.join("|");
  const setOrder = useCallback(
    (order: string[]) => {
      const next = allKeysId ? mergeColumnOrder(prefs.order, allKeysId.split("|"), order) : order;
      setPrefs((p) => ({ ...p, order: next }));
      void setTablePrefs(tableId, { order: next });
    },
    [tableId, allKeysId, prefs.order],
  );
  const setWidths = useCallback(
    (widths: Record<string, number>) => {
      setPrefs((p) => ({ ...p, widths }));
      void setTablePrefs(tableId, { widths });
    },
    [tableId],
  );
  const setHidden = useCallback(
    (hidden: string[]) => {
      setPrefs((p) => ({ ...p, hidden }));
      void setTablePrefs(tableId, { hidden });
    },
    [tableId],
  );
  /** "기본값으로" — 열 구성(표시·순서·너비)을 처음 상태로 */
  const reset = useCallback(() => {
    setPrefs({});
    void setTablePrefs(tableId, { order: undefined, widths: undefined, hidden: undefined });
  }, [tableId]);

  return {
    order: prefs.order,
    widths: prefs.widths,
    hidden: prefs.hidden ?? [],
    setOrder,
    setWidths,
    setHidden,
    reset,
  };
}
