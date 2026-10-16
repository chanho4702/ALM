import "@chanho/tokens/css";
import "@chanho/react/styles.css";
import "@chanho/org-admin/styles.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "./App";
import { applyTheme, readStoredTheme } from "../features/alm/components/ThemeToggle";
import { AuthGate } from "../auth/AuthGate";
import { installPreloadErrorHandler } from "../features/alm/components/newVersion";
import { NewVersionBanner } from "../features/alm/components/NewVersionBanner";

// 첫 페인트 전에 저장된 테마를 적용해 깜빡임을 막는다
applyTheme(readStoredTheme());
// 배포로 사라진 청크를 받으려다 실패하면 화면을 깨뜨리지 않고 새 버전 안내를 띄운다(자동 새로고침 없음)
installPreloadErrorHandler();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <NewVersionBanner />
      <AuthGate>
        <BrowserRouter basename="/alm">
          <App />
        </BrowserRouter>
      </AuthGate>
    </ToastProvider>
  </StrictMode>,
);
