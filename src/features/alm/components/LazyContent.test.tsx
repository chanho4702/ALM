import { lazy, useState } from "react";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { LazyModal, LazyPage } from "./LazyContent";

afterEach(() => vi.restoreAllMocks());

describe("지연 로딩 복구", () => {
  it("화면 로딩 중에도 내비게이션을 사용할 수 있고 완료 후 본문을 보여준다", async () => {
    let resolve!: (module: { default: ComponentType }) => void;
    const Page = lazy(() => new Promise<{ default: ComponentType }>((done) => { resolve = done; }));
    const navigate = vi.fn();
    render(
      <MemoryRouter>
        <button onClick={navigate}>홈으로</button>
        <LazyPage label="보드"><Page /></LazyPage>
      </MemoryRouter>,
    );
    expect(screen.getByRole("status", { name: "보드 불러오는 중" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "홈으로" }));
    expect(navigate).toHaveBeenCalledOnce();
    await act(async () => resolve({ default: () => <h1>보드 본문</h1> }));
    expect(await screen.findByRole("heading", { name: "보드 본문" })).toBeInTheDocument();
  });

  it("청크를 받지 못해도 셸을 유지하고 다른 경로로 이동하면 복구한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const FailedPage = lazy(() => Promise.reject(new Error("Failed to fetch dynamically imported module")));
    function Navigation() {
      const navigate = useNavigate();
      const { pathname } = useLocation();
      return (
        <>
          <button onClick={() => navigate("/home")}>홈으로</button>
          <LazyPage label="설정">
            {pathname === "/settings" ? <FailedPage /> : <h1>홈</h1>}
          </LazyPage>
        </>
      );
    }
    render(<MemoryRouter initialEntries={["/settings"]}><Navigation /></MemoryRouter>);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "새로고침" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "홈으로" }));
    expect(await screen.findByRole("heading", { name: "홈" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("모달을 받는 중 Escape로 취소하면 늦게 도착한 모달을 열지 않는다", async () => {
    let resolve!: (module: { default: ComponentType }) => void;
    const Dialog = lazy(() => new Promise<{ default: ComponentType }>((done) => { resolve = done; }));
    function PendingModal() {
      const [open, setOpen] = useState(true);
      return open ? (
        <LazyModal title="이슈 만들기" onClose={() => setOpen(false)}><Dialog /></LazyModal>
      ) : <p>모달 닫힘</p>;
    }
    render(<PendingModal />);
    expect(await screen.findByRole("dialog", { name: "이슈 만들기 불러오는 중" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => resolve({ default: () => <p>늦게 도착한 모달</p> }));
    expect(screen.queryByText("늦게 도착한 모달")).not.toBeInTheDocument();
  });

  it("모달 청크가 실패하면 닫기와 새로고침을 제공한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const FailedModal = lazy(() => Promise.reject(new Error("Network error")));
    const close = vi.fn();
    render(<LazyModal title="ALM-1" onClose={close}><FailedModal /></LazyModal>);
    const dialog = await screen.findByRole("dialog", { name: "ALM-1 불러오기 실패" });
    expect(within(dialog).getByRole("button", { name: "새로고침" })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(close).toHaveBeenCalledOnce();
  });
});
