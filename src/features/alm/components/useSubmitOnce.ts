import { useCallback, useRef, useState } from "react";

/**
 * 이중 제출 가드 + 멱등 키(N10) — 생성 폼이 같은 요청을 두 번 보내지 않게 한다.
 *
 * - 제출하는 즉시 잠그고(ref라 같은 틱의 두 번째 제출도 막는다) 끝나면 푼다. `busy`로 입력·버튼을 잠근다.
 * - 멱등 키는 **폼 인스턴스(제출 시도 묶음)당 하나**다. 실패해 다시 제출하면 같은 키를 싣고(서버가 처음
 *   결과를 돌려주거나 다시 만든다), 성공하면 다음 제출용으로 새 키를 만든다.
 * - 작업이 `false`를 돌려주거나 던지면 실패로 본다(키 유지). 던진 오류는 그대로 다시 던진다.
 */
export function useSubmitOnce() {
  const inFlight = useRef(false);
  const keyRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** 작업을 한 번만 돌린다 — 이미 진행 중이면 돌리지 않고 false. 성공하면 true */
  const run = useCallback(async (task: (idempotencyKey: string) => Promise<boolean | void>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    keyRef.current ??= crypto.randomUUID();
    try {
      const ok = (await task(keyRef.current)) !== false;
      if (ok) keyRef.current = null;
      return ok;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
