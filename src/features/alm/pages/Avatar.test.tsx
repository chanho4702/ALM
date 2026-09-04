import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, uploadMyAvatar } from "../store/jiraStore";

/**
 * 프로필 사진 통합 — 개인 설정에서 올린 사진이 사람을 그리는 화면 전체에 퍼지는지 본다.
 * 목업의 avatarUrl은 dataURL이라 `<img src>`가 그대로 붙는다.
 *
 * DS Avatar는 사진이 있으면 `<img alt={이름}>`, 없으면 `<span role="img" aria-label={이름}>`을
 * 그린다 — 둘 다 role="img"라서 "사진이 붙었는지"는 태그로 가른다.
 */
function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** 1x1 투명 PNG */
const PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
const pngFile = () => new File([PNG_BYTES], "me.png", { type: "image/png" });

function expectPhoto(element: HTMLElement) {
  expect(element.tagName).toBe("IMG");
  expect(element).toHaveAttribute("src", expect.stringContaining("data:image/png"));
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("프로필 사진", () => {
  it("개인 설정에서 사진을 올리면 저장 버튼 없이 즉시 미리보기가 뜬다", async () => {
    const user = userEvent.setup();
    renderAt("/settings/personal");

    const card = within(await screen.findByRole("region", { name: "프로필" }));
    expect(await card.findByRole("img", { name: "김찬호" })).not.toHaveAttribute("src");
    expect(card.getByRole("button", { name: "제거" })).toBeDisabled();

    await user.upload(card.getByLabelText("사진 올리기"), pngFile());

    expect(await screen.findByText("프로필 사진을 변경했습니다")).toBeInTheDocument();
    expectPhoto(card.getByRole("img", { name: "김찬호" }));
    expect(card.getByRole("button", { name: "제거" })).toBeEnabled();

    // 상단바 아바타도 새로고침 없이 따라온다(AVATAR_CHANGED_EVENT)
    const topBar = screen.getAllByRole("banner")[0];
    await waitFor(() => expectPhoto(within(topBar).getByRole("img", { name: "김찬호" })));
  });

  it("제거하면 다시 이니셜로 돌아간다", async () => {
    const user = userEvent.setup();
    await uploadMyAvatar(pngFile());
    renderAt("/settings/personal");

    const card = within(await screen.findByRole("region", { name: "프로필" }));
    await screen.findByText("사진 올리기");
    expectPhoto(await card.findByRole("img", { name: "김찬호" }));

    await user.click(card.getByRole("button", { name: "제거" }));

    expect(await screen.findByText("프로필 사진을 제거했습니다")).toBeInTheDocument();
    expect(card.getByRole("img", { name: "김찬호" })).not.toHaveAttribute("src");
  });

  it("올린 사진은 이슈 목록 담당자 셀과 상단바 사용자 메뉴에 함께 뜬다", async () => {
    await uploadMyAvatar(pngFile()); // 목업 현재 사용자 = 김찬호(ALM-1·ALM-3 담당자)
    renderAt("/projects/p1/issues");

    const row = (await screen.findByText("ALM-1")).closest("tr")!;
    expectPhoto(within(row).getByRole("img", { name: "김찬호" }));

    // 다른 담당자(박준영)는 사진이 없으니 이니셜 그대로
    const otherRow = (await screen.findByText("ALM-4")).closest("tr")!;
    expect(within(otherRow).getByRole("img", { name: "박준영" })).not.toHaveAttribute("src");

    // 상단바(AppShell)의 현재 사용자 아바타 — 화면 머리글도 banner라 첫 번째(TopBar)를 잡는다
    const topBar = screen.getAllByRole("banner")[0];
    expectPhoto(within(topBar).getByRole("img", { name: "김찬호" }));
  });

  it("보드 카드의 담당자 아바타에도 사진이 붙는다", async () => {
    await uploadMyAvatar(pngFile());
    renderAt("/projects/p1/board");

    // ALM-3(김찬호 담당) 카드
    const card = (await screen.findByText("이슈 상세 모달 구현")).closest("button")!;
    expectPhoto(within(card).getByRole("img", { name: "김찬호" }));
  });
});
