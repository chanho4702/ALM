/**
 * 동시성 상한이 있는 병렬 처리 — 서버 일괄 API가 없는 작업(대량 변경·삭제, 하위의 하위 조회)을 이슈마다 부르되
 * 요청을 한꺼번에 쏟아붓지 않는다. 결과는 입력 순서 그대로, 실패는 삼키지 않고 `PromiseSettledResult`로 돌려준다.
 */
export const DEFAULT_CONCURRENCY = 5;

export async function settleWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  limit = DEFAULT_CONCURRENCY,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  const lanes = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: lanes }, run));
  return results;
}

export const reasonText = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));
