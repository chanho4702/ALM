import { useCallback, useRef, useState } from "react";

/**
 * 이중 제출 가드 + 멱등 키(N10) — 생성 폼이 같은 요청을 두 번 보내지 않게 한다.
 *
 * - 제출하는 즉시 잠그고(ref라 같은 틱의 두 번째 제출도 막는다) 끝나면 푼다. `busy`로 입력·버튼을 잠근다.
 * - 멱등 키는 **폼 인스턴스(제출 시도 묶음)당 하나**다. 실패해 다시 제출하면 같은 키를 싣고(서버가 처음
 *   결과를 돌려주거나 다시 만든다), 성공하면 다음 제출용으로 새 키를 만든다.
 * - 작업이 `false`를 돌려주거나 던지면 실패로 본다(키 유지). 던진 오류는 그대로 다시 던진다.
 * - 실패 뒤 **본문이 바뀌면** 새 키를 만든다 — 서버는 같은 키면 본문이 달라도 처음 이슈를 재응답하므로
 *   (Stripe식), 제목을 고친 재시도가 옛 이슈를 받지 않게 한다. 본문은 `fingerprint`(직렬화한 요청 값)로 비교한다.
 */
export function useSubmitOnce() {
  const inFlight = useRef(false);
  const keyRef = useRef<string | null>(null);
  /** 마지막으로 실패한 제출의 본문 지문 — 다음 제출과 다르면 키를 바꾼다 */
  const failedFingerprint = useRef<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  /** 작업을 한 번만 돌린다 — 이미 진행 중이면 돌리지 않고 false. 성공하면 true */
  const run = useCallback(
    async (task: (idempotencyKey: string) => Promise<boolean | void>, fingerprint?: string): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      // 실패 뒤 본문이 바뀌었으면 새 키 — 그대로 재시도면 같은 키
      if (keyRef.current !== null && fingerprint !== failedFingerprint.current) keyRef.current = null;
      keyRef.current ??= crypto.randomUUID();
      let ok = false;
      try {
        ok = (await task(keyRef.current)) !== false;
        if (ok) keyRef.current = null;
        return ok;
      } finally {
        failedFingerprint.current = ok ? undefined : fingerprint;
        inFlight.current = false;
        setBusy(false);
      }
    },
    [],
  );

  /**
   * 폼을 닫거나 취소할 때 — 남은 키·실패 지문을 버린다. 응답을 잃은 실패 뒤 닫고 다시 만들면
   * 서버가 옛 이슈를 재응답하는 일을 막는다(다음 제출은 새 키).
   */
  const reset = useCallback(() => {
    keyRef.current = null;
    failedFingerprint.current = undefined;
  }, []);

  return { busy, run, reset };
}
