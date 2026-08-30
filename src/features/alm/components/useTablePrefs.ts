import { useCallback, useEffect, useState } from "react";
import { UI_CHANGED_EVENT, getTablePrefs, setTablePrefs, type TablePrefs } from "../store/uiStore";

/**
 * 테이블별 열 순서·너비(사용자 로컬 설정). DS Table의 제어형 columnOrder/columnWidths에 그대로 꽂는다.
 * 저장은 uiStore(localStorage) — 서버 동기화 대상이 아닌 개인 화면 취향이라 도메인 스토어를 거치지 않는다.
 */
export function useTablePrefs(tableId: string) {
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

  const setOrder = useCallback(
    (order: string[]) => {
      setPrefs((p) => ({ ...p, order }));
      void setTablePrefs(tableId, { order });
    },
    [tableId],
  );
  const setWidths = useCallback(
    (widths: Record<string, number>) => {
      setPrefs((p) => ({ ...p, widths }));
      void setTablePrefs(tableId, { widths });
    },
    [tableId],
  );

  return { order: prefs.order, widths: prefs.widths, setOrder, setWidths };
}
