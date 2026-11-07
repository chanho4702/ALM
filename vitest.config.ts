import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // 라우터·리액트 인스턴스를 하나로 묶는다. `@chanho/org-admin`이 자기 사본을 들고 오면
    // 컨텍스트가 갈라져 "useLocation() may be used only in the context of a <Router>"가 난다.
    dedupe: ["react", "react-dom", "react-router"],
    // 테스트는 항상 목업 — 파사드의 빌드 시점 구현 선택(vite.config.ts)과 같은 별칭
    alias: { "@alm-store-impl": "/src/features/alm/store/jiraMock.ts" },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    css: true,
    // 24개 jsdom 파일 병렬 실행 시 워커 경합으로 5초 기본값이 플레이키해 상향
    testTimeout: 15000,
    // 워커를 코어 수-1(12코어 기준 11)만큼 띄우면 jsdom 렌더와 lazy 모듈의 콜드 변환이 서로 CPU를 뺏어
    // 대기 한도를 넘긴다. pages 43파일 실측(2026-11-07): 11개 148초·실패 1 / 6개 215초·실패 0 / 4개 255초·실패 0.
    // vitest 3 기본 풀은 forks라 poolOptions.threads가 아니라 maxWorkers로 묶는다.
    maxWorkers: 6,
    server: {
      deps: {
        // ⚠️ pnpm alias(`@chanho/*`)가 아니라 **발행 스코프**로 적어야 매칭된다 —
        //    vitest는 실제 설치된 패키지 이름(`@chanho4702/*`)으로 해석한다.
        inline: ["@chanho4702/org-admin"],
      },
    },
  },
});
