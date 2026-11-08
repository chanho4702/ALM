import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigationType } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import { __resetForTest } from "../store/jiraStore";
import { issueLink } from "../components/useIssueActions";

/** 현재 주소와 마지막 이동 방식(PUSH/REPLACE/POP)을 노출하는 프로브 */
function LocationProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <>
      <div data-testid="location">{location.pathname + location.search}</div>
      <div data-testid="navigation-type">{navigationType}</div>
    </>
  );
}

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("키로 여는 주소 /browse/:key", () => {
  // 상세 모달은 지연 청크라 첫 변환이 느리다(IssueDetailModal.conflict.test와 같은 여유)
  it("이슈 프로젝트의 상세 모달 주소로 교체(replace) 이동한다", async () => {
    renderAt("/browse/ALM-2");
    expect(await screen.findByRole("dialog", { name: "ALM-2" }, { timeout: 12_000 })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/issues?issue=ALM-2");
    expect(screen.getByTestId("navigation-type")).toHaveTextContent("REPLACE");
  });

  it("키는 앞뒤 공백을 빼고 대문자로 맞춰 찾는다", async () => {
    const lookup = vi.spyOn(store, "getIssueByKey");
    renderAt("/browse/%20alm-3%20");
    expect(await screen.findByRole("dialog", { name: "ALM-3" }, { timeout: 12_000 })).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith("ALM-3");
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/issues?issue=ALM-3");
  });

  it("없는 키면 안내와 프로젝트 목록 버튼을 보여 준다", async () => {
    const user = userEvent.setup();
    renderAt("/browse/NOPE-999");
    expect(await screen.findByText("이슈를 찾을 수 없거나 볼 권한이 없습니다")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/browse/NOPE-999");
    await user.click(screen.getByRole("button", { name: "프로젝트 목록으로" }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/projects$/));
  });

  it("권한 없음(403) 등 조회 실패도 같은 안내로 보여 준다 — 존재 여부를 드러내지 않는다", async () => {
    vi.spyOn(store, "getIssueByKey").mockRejectedValue(new Error("권한이 없습니다"));
    renderAt("/browse/ALM-2");
    expect(await screen.findByText("이슈를 찾을 수 없거나 볼 권한이 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "ALM-2" })).not.toBeInTheDocument();
  });
});

describe("issueLink — 링크 복사·공유가 내는 정규 주소", () => {
  it("basename을 포함한 절대 주소 …/browse/{KEY}를 낸다", () => {
    const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    expect(issueLink({ key: "ALM-12" })).toBe(`${window.location.origin}${base}browse/ALM-12`);
  });
});
