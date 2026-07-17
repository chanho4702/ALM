import "@chanho/tokens/css";
import "@chanho/react/styles.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "./App";
import { applyTheme, readStoredTheme } from "../features/alm/components/ThemeToggle";
import { AuthGate } from "../auth/AuthGate";

// 첫 페인트 전에 저장된 테마를 적용해 깜빡임을 막는다
applyTheme(readStoredTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <AuthGate>
        <BrowserRouter basename="/alm">
          <App />
        </BrowserRouter>
      </AuthGate>
    </ToastProvider>
  </StrictMode>,
);
