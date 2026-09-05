import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // 라우터·리액트 인스턴스를 하나로 묶는다. `@chanho/org-admin`이 자기 사본을 들고 오면
    // 컨텍스트가 갈라져 "useLocation() may be used only in the context of a <Router>"가 난다.
    dedupe: ["react", "react-dom", "react-router"],
  },
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    css: true,
    // 24개 jsdom 파일 병렬 실행 시 워커 경합으로 5초 기본값이 플레이키해 상향
    testTimeout: 15000,
    server: {
      deps: {
        // ⚠️ pnpm alias(`@chanho/*`)가 아니라 **발행 스코프**로 적어야 매칭된다 —
        //    vitest는 실제 설치된 패키지 이름(`@chanho4702/*`)으로 해석한다.
        inline: ["@chanho4702/org-admin"],
      },
    },
  },
});
