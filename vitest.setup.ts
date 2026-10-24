import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import { __resetUiUserForTest } from "./src/features/alm/store/uiStore";

// findBy*/waitFor 기본 1초는 24개 jsdom 파일 병렬 실행의 워커 경합에서 플레이키하다
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  // uiStore의 사용자별 자리(즐겨찾기·초안)는 모듈 상태 — 테스트마다 익명으로
  __resetUiUserForTest();
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  window.HTMLElement.prototype.releasePointerCapture = () => {};
}
