import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    css: true,
    // 24개 jsdom 파일 병렬 실행 시 워커 경합으로 5초 기본값이 플레이키해 상향
    testTimeout: 15000,
  },
});
