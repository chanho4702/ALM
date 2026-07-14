import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // nginx 경로 기반 통합 배포: http://localhost/alm/ 아래에서 서빙된다
  base: "/alm/",
  plugins: [react()],
});
