import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * 데이터 계층 구현을 빌드 시점에 고른다 — `jiraStore` 파사드가 `@alm-store-impl`을 import한다.
 * 프로덕션 빌드(`vite build`)는 REST, 개발 서버는 기본 목업이고 `VITE_ALM_DATA=rest`면 REST.
 * 고르지 않은 쪽은 번들에 아예 들어가지 않는다(목업·시드가 배포본에 실리지 않는다). vitest는 vitest.config.ts가 목업으로 묶는다.
 */
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  const useRest = command === "build" || env.VITE_ALM_DATA === "rest";
  return {
    // nginx 경로 기반 통합 배포: http://localhost/alm/ 아래에서 서빙된다
    base: "/alm/",
    plugins: [react()],
    resolve: {
      alias: {
        "@alm-store-impl": useRest ? "/src/features/alm/store/jiraApi.ts" : "/src/features/alm/store/jiraMock.ts",
      },
    },
  };
});
