import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, createIssue } from "../store/jiraStore";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderSearch(initialPath = "/search") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </ToastProvider>,
  );
}

const aqlPath = (aql: string) => `/search?aql=${encodeURIComponent(aql)}`;
const globalNav = () => screen.getByRole("navigation", { name: "전역 내비게이션" });
const editor = () => screen.getByLabelText("AQL");

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("AQL 모드 — 실행", () => {
  it("?aql= 로 들어오면 AQL 모드로 열리고 그 질의를 실행한다", async () => {
    renderSearch(aqlPath("project = ALM AND type = 버그"));

    expect(await screen.findByTestId("search-count")).toHaveTextContent("1개 이슈");
    expect(screen.getByText("ALM-8")).toBeInTheDocument();
    expect(screen.getByTestId("search-aql-bar")).toBeInTheDocument();
    expect(editor()).toHaveValue("project = ALM AND type = 버그");
  });

  it("currentUser()와 정렬이 목업에서도 서버와 같은 의미로 돈다", async () => {
    renderSearch(aqlPath("assignee = currentUser() ORDER BY key ASC"));

    expect(await screen.findByTestId("search-count")).toHaveTextContent("2개 이슈");
    expect(screen.getByText("ALM-1")).toBeInTheDocument();
    expect(screen.getByText("ALM-3")).toBeInTheDocument();
    expect(screen.queryByText("ALM-2")).not.toBeInTheDocument();
  });

  it("Enter로 새 질의를 실행하고 URL에 남긴다", async () => {
    const user = userEvent.setup();
    renderSearch(aqlPath("project = ALM"));
    await screen.findByTestId("search-count");

    await user.clear(editor());
    await user.type(editor(), "status = 완료");
    await user.keyboard("{Escape}{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("search-count")).toHaveTextContent("1개 이슈"); // ALM-1
    });
    expect(screen.getByTestId("location").textContent).toContain("aql=");
    expect(screen.getByText("ALM-1")).toBeInTheDocument();
  });
});

describe("AQL 모드 — 페이징", () => {
  it("한 페이지만 그리고 범위와 이전·다음으로 넘긴다 (머리글 숫자와 그린 줄 수가 어긋나지 않게)", async () => {
    const user = userEvent.setup();
    // 시드 8건 + 44건 = 52건 → 50건짜리 두 페이지
    for (let i = 0; i < 44; i += 1) {
      await createIssue({ projectId: "p1", title: `페이징 ${i + 1}` });
    }
    renderSearch(aqlPath("ORDER BY updated DESC"));
    // 건수 문구는 그대로 두고(총건수) 범위 표시를 옆에 덧붙인다
    expect(await screen.findByTestId("search-count")).toHaveTextContent("52개 이슈");
    expect(screen.getByTestId("search-range")).toHaveTextContent("1–50 / 52건");
    const pager = screen.getByRole("navigation", { name: "페이지" });
    expect(within(pager).getByRole("button", { name: "이전" })).toBeDisabled();

    await user.click(within(pager).getByRole("button", { name: "다음" }));
    await waitFor(() => {
      expect(screen.getByTestId("search-range")).toHaveTextContent("51–52 / 52건");
    });
    // 그린 줄 수가 범위와 같다 — 머리글 행 하나 + 이슈 2줄
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(within(pager).getByRole("button", { name: "다음" })).toBeDisabled();

    // 기본 모드는 서버 페이지가 없으므로 범위·페이저가 없다 (updated 정렬은 기본 모드로 되돌릴 수 있다)
    await user.click(screen.getByRole("button", { name: "기본 검색으로 전환" }));
    await waitFor(() => {
      expect(screen.queryByTestId("search-range")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("navigation", { name: "페이지" })).not.toBeInTheDocument();
    expect(screen.getByTestId("search-count")).toHaveTextContent("52개 이슈");
  }, 30_000);

  it("정렬만 있는 AQL이 기본 모드로 못 돌아가면 AQL을 유지하고 범위 표시도 남긴다", async () => {
    const user = userEvent.setup();
    renderSearch(aqlPath("ORDER BY key ASC"));
    expect(await screen.findByTestId("search-range")).toHaveTextContent("1–8 / 8건");

    await user.click(screen.getByRole("button", { name: "기본 검색으로 전환" }));
    expect(await screen.findByText("이 AQL은 기본 검색으로 옮길 수 없습니다")).toBeInTheDocument();
    expect(screen.getByTestId("search-range")).toHaveTextContent("1–8 / 8건");
  });
});

describe("AQL 모드 — 자동완성", () => {
  it("치는 중에 문맥 후보가 뜨고 ↑↓ Enter로 넣는다", async () => {
    const user = userEvent.setup();
    renderSearch(aqlPath(""));
    await screen.findByTestId("search-aql-bar");

    await user.type(editor(), "sta");
    const listbox = await screen.findByRole("listbox", { name: "AQL 자동완성" });
    // 접근 이름은 "필드 별칭" — 별칭이 보조 설명으로 함께 읽힌다
    expect(within(listbox).getByRole("option", { name: "status 상태" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "statusCategory 상태분류" })).toBeInTheDocument();

    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(editor()).toHaveValue("status"));

    // 필드를 넣고 나면 다음 후보는 그 필드가 받는 연산자다
    await user.type(editor(), " ");
    await waitFor(() => {
      expect(within(screen.getByRole("listbox", { name: "AQL 자동완성" })).getByRole("option", { name: "=" })).toBeInTheDocument();
    });
  });

  it("Esc로 닫으면 Enter가 실행이 된다", async () => {
    const user = userEvent.setup();
    renderSearch(aqlPath(""));
    await screen.findByTestId("search-aql-bar");

    await user.type(editor(), "type = 에픽");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "AQL 자동완성" })).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByTestId("search-count")).toHaveTextContent("1개 이슈"); // ALM-4
    });
  });
});

describe("AQL 모드 — 오류 표시", () => {
  it("실시간 검증이 문구와 위치 밑줄을 보여준다", async () => {
    const user = userEvent.setup();
    renderSearch(aqlPath(""));
    await screen.findByTestId("search-aql-bar");

    await user.type(editor(), "status == done");

    const error = await screen.findByTestId("aql-error", undefined, { timeout: 3000 });
    expect(error).toHaveTextContent("연산자를 모릅니다: ==");
    // position 7의 토큰(`==`)에 밑줄이 걸린다
    expect(document.querySelector(".aql-underline")?.textContent).toBe("==");
  });

  it("모르는 필드는 가까운 이름을 알려준다", async () => {
    const user = userEvent.setup();
    renderSearch(aqlPath(""));
    await screen.findByTestId("search-aql-bar");

    await user.type(editor(), "statuss = done");
    expect(await screen.findByTestId("aql-error", undefined, { timeout: 3000 })).toHaveTextContent(
      "필드를 모릅니다: statuss",
    );
  });

  it("실행에서만 드러나는 값 오류도 밑줄로 온다 (결과를 조용히 비우지 않는다)", async () => {
    // 실시간 검증은 값을 해석하지 않는다(서버 validate와 같다) — 이 오류는 실행이 낸다
    renderSearch(aqlPath("due > yesterday"));
    expect(await screen.findByTestId("aql-error", undefined, { timeout: 3000 })).toHaveTextContent(
      "날짜 형식이 아닙니다: yesterday",
    );
  });
});

describe("AQL 모드 — 검증은 성공을 표시하지 않는다", () => {
  it("문법이 맞아도 성공 표시가 없다 — 값 실재는 실행에서만 확인된다", async () => {
    const user = userEvent.setup();
    renderSearch(aqlPath(""));
    await screen.findByTestId("search-aql-bar");

    // 서버 validate는 문법·필드만 본다 — "없는상태"는 검증을 통과한다
    await user.type(editor(), "status = 없는상태");
    await user.keyboard("{Escape}");
    await new Promise((resolve) => setTimeout(resolve, 500)); // 디바운스 300ms 통과

    expect(screen.queryByTestId("aql-error")).not.toBeInTheDocument();
    // 통과를 성공으로 표시하지 않는다(체크 아이콘·"올바른 질의" 문구 금지)
    expect(screen.queryByText(/올바른|유효한|사용할 수 있는 질의/)).not.toBeInTheDocument();
    expect(document.querySelector(".aql-hint")).toBeInTheDocument();

    // 실행하면 값 해석 오류가 같은 밑줄·메시지 경로로 드러난다
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("aql-error", undefined, { timeout: 3000 })).toHaveTextContent(
      "상태를 모릅니다: 없는상태",
    );
    expect(document.querySelector(".aql-underline")?.textContent).toBe("없는상태");
  }, 30_000);

  it("입력은 서버 상한(4000자)에서 먼저 막힌다", async () => {
    renderSearch(aqlPath(""));
    await screen.findByTestId("search-aql-bar");
    expect(editor()).toHaveAttribute("maxlength", "4000");
  });
});

describe("AQL 모드 — 전환", () => {
  it("기본 → AQL은 지금 필터를 AQL로 옮긴다", async () => {
    const user = userEvent.setup();
    renderSearch();
    await screen.findByTestId("search-count");

    await user.click(screen.getByRole("button", { name: "담당자" }));
    await user.click(await screen.findByRole("checkbox", { name: "김찬호" }));
    await waitFor(() => expect(screen.getByTestId("search-count")).toHaveTextContent("2개 이슈"));

    await user.click(screen.getByRole("button", { name: "AQL로 전환" }));

    expect(await screen.findByTestId("search-aql-bar")).toBeInTheDocument();
    expect(editor()).toHaveValue("assignee = 김찬호 ORDER BY updated DESC");
    expect(screen.getByTestId("location").textContent).toContain("aql=");
    expect(screen.getByTestId("search-count")).toHaveTextContent("2개 이슈");
  });

  it("AQL → 기본은 단순 조건만 되돌린다", async () => {
    const user = userEvent.setup();
    renderSearch(aqlPath("type = 버그 AND labels = design"));
    await screen.findByTestId("search-count");

    await user.click(screen.getByRole("button", { name: "기본 검색으로 전환" }));

    expect(await screen.findByTestId("search-basic-bar")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toContain("q=");
    });
    expect(screen.getByTestId("location").textContent).not.toContain("aql=");
    expect(screen.getByRole("button", { name: "타입: 버그" })).toBeInTheDocument();
  });

  it("되돌릴 수 없는 AQL은 그대로 두고 이유를 알린다", async () => {
    const user = userEvent.setup();
    renderSearch(aqlPath("type = 버그 OR priority = 높음"));
    await screen.findByTestId("search-count");

    await user.click(screen.getByRole("button", { name: "기본 검색으로 전환" }));

    expect(await screen.findByText("이 AQL은 기본 검색으로 옮길 수 없습니다")).toBeInTheDocument();
    expect(screen.getByTestId("search-aql-bar")).toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toContain("aql=");
  });
});

describe("AQL 모드 — 저장 필터와 전역 검색", () => {
  it("AQL 필터를 저장하면 사이드바에서 ?aql= 로 다시 열린다", async () => {
    const user = userEvent.setup();
    renderSearch(aqlPath("type = 버그"));
    await screen.findByText("ALM-8");

    await user.click(screen.getByRole("button", { name: "필터로 저장" }));
    const dialog = await screen.findByRole("dialog", { name: "필터로 저장" });
    await user.type(within(dialog).getByLabelText("필터 이름"), "AQL 버그");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));

    const filters = await within(globalNav()).findByTestId("nav-filters");
    await user.click(within(globalNav()).getByRole("button", { name: "홈" }));
    await user.click(within(filters).getByRole("button", { name: "AQL 버그" }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toContain("/search?aql=");
    });
    expect(await screen.findByText("ALM-8")).toBeInTheDocument();
  });

  it("전역 검색 입력이 AQL로 보이면 'AQL로 검색'이 뜬다", async () => {
    const user = userEvent.setup();
    renderSearch("/home");
    await screen.findByRole("heading", { name: /안녕하세요/ });

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByLabelText("전역 검색"), { target: { value: "type = 버그" } });
    const dialog = await screen.findByRole("dialog", { name: "이슈 검색" });
    await user.click(within(dialog).getByRole("button", { name: /AQL로 검색/ }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toContain("/search?aql=");
    });
    expect(await screen.findByText("ALM-8")).toBeInTheDocument();
  });

  it("평범한 검색어에는 'AQL로 검색'이 뜨지 않는다", async () => {
    renderSearch("/home");
    await screen.findByRole("heading", { name: /안녕하세요/ });

    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(screen.getByLabelText("전역 검색"), { target: { value: "칸반" } });
    const dialog = await screen.findByRole("dialog", { name: "이슈 검색" });
    expect(within(dialog).queryByRole("button", { name: /AQL로 검색/ })).not.toBeInTheDocument();
  });
});
