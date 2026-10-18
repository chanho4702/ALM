// localStorage 목업 스토어 — clock (jiraMock.ts에서 분할, 동작 불변)

// 사무실 목업이 시각을 만드는 공용 시계 — 다른 목업 모듈의 초기화(teamState 등)가 쓰므로 의존 없는 잎 모듈로 둔다.

export const MINUTE = 60_000;

export const ago = (now: number, minutes: number) => new Date(now - minutes * MINUTE).toISOString();
