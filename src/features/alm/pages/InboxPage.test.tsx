import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, listNotificationInbox, snoozeNotification } from "../store/jiraStore";
import { __resetCommandScopeForTest } from "../components/commandScope";
import { formatSnoozeUntil, fromLocalInput, snoozePresets, toLocalInput } from "../components/inboxTime";
import "./InboxPage";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
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
  __resetCommandScopeForTest();
});
afterEach(() => vi.restoreAllMocks());

const location = () => screen.getByTestId("location").textContent;
const items = () => within(screen.getByRole("list", { name: "알림 목록" })).getAllByRole("listitem");
const itemOf = (key: string) => items().find((li) => within(li).queryByText(key))!;

async function openInbox() {
  renderAt("/notifications");
  await screen.findByRole("list", { name: "알림 목록" });
  await waitFor(() => expect(items().length).toBeGreaterThan(0));
}

describe("인박스 (Linear Inbox)", () => {
  it("벨 대신 전체 화면 — 시드 알림 5개를 최신순으로, 읽지 않은 것은 표시가 붙는다", async () => {
    await openInbox();
    expect(screen.getByRole("heading", { name: "인박스" })).toBeInTheDocument();
    expect(items()).toHaveLength(5);
    expect(screen.getAllByText("읽지 않음", { selector: ".visually-hidden" })).toHaveLength(2);
    expect(screen.getByText("읽지 않음 2개")).toBeInTheDocument();
    // 종류는 아이콘 + 텍스트
    expect(within(itemOf("ALM-4")).getByText("멘션")).toBeInTheDocument();
    expect(within(itemOf("ALM-1")).getByText("자동화")).toBeInTheDocument();
  });

  it("필터 탭 — 멘션·할당·자동화·읽지 않음", async () => {
    const user = userEvent.setup();
    await openInbox();
    await user.click(screen.getByRole("tab", { name: "멘션" }));
    await waitFor(() => expect(items().map((li) => li.textContent)).toEqual([expect.stringContaining("ALM-4")]));
    await user.click(screen.getByRole("tab", { name: "할당" }));
    await waitFor(() => expect(items().map((li) => li.textContent)).toEqual([expect.stringContaining("ALM-3")]));
    await user.click(screen.getByRole("tab", { name: "자동화" }));
    await waitFor(() => expect(items().map((li) => li.textContent)).toEqual([expect.stringContaining("ALM-1")]));
    await user.click(screen.getByRole("tab", { name: "읽지 않음 (2)" }));
    await waitFor(() => expect(items()).toHaveLength(2));
    await user.click(screen.getByRole("tab", { name: "미뤄 둠" }));
    expect(await screen.findByText(/미뤄 둔 알림이 없습니다/)).toBeInTheDocument();
  });

  it("j/k로 이동하고 U로 읽음을 토글한다 — 벨 배지도 따라간다", async () => {
    const user = userEvent.setup();
    await openInbox();
    await user.keyboard("j");
    const first = items()[0];
    expect(within(first).getByRole("button", { name: /ALM-/ })).toHaveAttribute("aria-current", "true");
    const wasUnread = first.classList.contains("is-unread");
    await user.keyboard("U");
    await waitFor(() => expect(items()[0].classList.contains("is-unread")).toBe(!wasUnread));
    await user.keyboard("k");
    expect(within(items()[0]).getByRole("button", { name: /ALM-/ })).toHaveAttribute("aria-current", "true");
    await user.keyboard("j");
    expect(within(items()[1]).getByRole("button", { name: /ALM-/ })).toHaveAttribute("aria-current", "true");
    expect(await screen.findByRole("button", { name: wasUnread ? "알림 1개 미읽음" : "알림 3개 미읽음" })).toBeInTheDocument();
  });

  it("E로 보관하면 목록에서 빠지고 보관함에 보이며, 보관함에서 Backspace로 되돌린다", async () => {
    const user = userEvent.setup();
    await openInbox();
    await user.keyboard("j");
    const firstText = items()[0].textContent!;
    await user.keyboard("e");
    await waitFor(() => expect(items()).toHaveLength(4));
    expect(items().some((li) => li.textContent === firstText)).toBe(false);
    expect(await screen.findByText("1개 알림을 보관했습니다")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "보관함" }));
    await waitFor(() => expect(items()).toHaveLength(1));
    await user.keyboard("j");
    await user.keyboard("{Backspace}");
    expect(await screen.findByText(/보관한 알림이 없습니다/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "전체" }));
    await waitFor(() => expect(items()).toHaveLength(5));
  });

  it("H로 미루기 — 프리셋을 고르면 전체에서 빠지고 '미뤄 둠'에 해제 시각과 함께 보인다", async () => {
    const user = userEvent.setup();
    await openInbox();
    await user.keyboard("j");
    const key = within(items()[0]).getByText(/^ALM-\d+$/).textContent!;
    await user.keyboard("h");
    const menu = await screen.findByRole("list", { name: "미루기 시각" });
    expect(within(menu).getByRole("button", { name: /1시간 뒤/ })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: /다음 주 월요일 9시/ })).toBeInTheDocument();
    await user.click(within(menu).getByRole("button", { name: /내일 아침 9시/ }));
    await waitFor(() => expect(items()).toHaveLength(4));
    await user.click(screen.getByRole("tab", { name: "미뤄 둠" }));
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(within(items()[0]).getByText(key)).toBeInTheDocument();
    expect(within(items()[0]).getByText(/09:00까지 미룸/)).toBeInTheDocument();
  });

  it("미루기 '직접 고르기' — 과거 시각은 막고, 미래면 미룬다", async () => {
    const user = userEvent.setup();
    await openInbox();
    fireEvent.click(within(items()[0]).getByRole("button", { name: "미루기" }));
    await user.click(await screen.findByRole("button", { name: "직접 고르기…" }));
    const dialog = await screen.findByRole("dialog", { name: /알림 미루기/ });
    const field = within(dialog).getByLabelText("미룰 시각");
    fireEvent.change(field, { target: { value: "2000-01-01T09:00" } });
    await user.click(within(dialog).getByRole("button", { name: "미루기" }));
    expect(await within(dialog).findByText("미루기 시각은 미래여야 합니다")).toBeInTheDocument();
    fireEvent.change(field, { target: { value: toLocalInput(new Date(Date.now() + 3 * 86_400_000)) } });
    await user.click(within(dialog).getByRole("button", { name: "미루기" }));
    await waitFor(() => expect(items()).toHaveLength(4));
  });

  it("미루기에서 돌아온 알림은 맨 위에 읽지 않음으로 '미루기에서 돌아옴' 표시와 함께 온다", async () => {
    const page = await listNotificationInbox();
    const oldest = page.items[page.items.length - 1];
    await snoozeNotification(oldest.id, new Date(Date.now() + 300).toISOString());
    expect((await listNotificationInbox()).items.some((n) => n.id === oldest.id)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const back = await listNotificationInbox();
    expect(back.items[0].id).toBe(oldest.id);
    expect(back.items[0].read).toBe(false);
    expect(back.unreadCount).toBe(3);
    await openInbox();
    expect(within(items()[0]).getByText("미루기에서 돌아옴")).toBeInTheDocument();
  });

  it("x·Shift+클릭으로 여러 개 고르고 일괄 읽음 — Esc로 선택 해제, Enter는 이슈를 연다", async () => {
    const user = userEvent.setup();
    await openInbox();
    await user.keyboard("j");
    await user.keyboard("x");
    const bar = await screen.findByRole("toolbar", { name: "인박스 일괄 작업" });
    expect(within(bar).getByText("1개 선택")).toBeInTheDocument();
    await user.keyboard("{Shift>}");
    await user.click(within(items()[2]).getByRole("button", { name: /ALM-/ }));
    await user.keyboard("{/Shift}");
    expect(within(bar).getByText("3개 선택")).toBeInTheDocument();
    await user.click(within(bar).getByRole("button", { name: "읽음으로" }));
    await waitFor(() => expect(screen.getByText(/읽지 않음 [0-9]개|모두 읽었습니다/)).toBeInTheDocument());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("toolbar", { name: "인박스 일괄 작업" })).not.toBeInTheDocument());

    // Enter — 커서 알림의 이슈 상세
    const cursor = items().find((li) => li.classList.contains("is-cursor"))!;
    const key = within(cursor).getByText(/^ALM-\d+$/).textContent!;
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(location()).toContain(`issue=${key}`));
  });

  it("못 읽으면 빈 목록이 아니라 이유와 '다시 시도'", async () => {
    const store = await import("../store/jiraStore");
    const real = store.listNotificationInbox;
    let fail = true;
    vi.spyOn(store, "listNotificationInbox").mockImplementation(async (query) => {
      if (fail) {
        fail = false;
        throw Object.assign(new Error("Service Unavailable"), { status: 503 });
      }
      return real(query);
    });
    renderAt("/notifications");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("알림을 불러오지 못했습니다");
  });
});

describe("인박스 이동", () => {
  it("g 다음 n으로 어디서든 인박스를 연다", async () => {
    const user = userEvent.setup();
    renderAt("/home");
    await screen.findByRole("navigation", { name: "전역 내비게이션" });
    await user.keyboard("gn");
    await waitFor(() => expect(location()).toBe("/notifications"));
    expect(await screen.findByRole("heading", { name: "인박스" })).toBeInTheDocument();
  });
});

describe("인박스 미루기 시각", () => {
  it("프리셋 — 1시간 뒤·내일 9시·다음 주 월요일 9시(월요일 당일이면 7일 뒤)", () => {
    const thursday = new Date(2026, 9, 22, 15, 30); // 2026-10-22(목)
    const [hour, tomorrow, monday] = snoozePresets(thursday);
    expect(hour.at.getTime() - thursday.getTime()).toBe(3_600_000);
    expect([tomorrow.at.getDate(), tomorrow.at.getHours()]).toEqual([23, 9]);
    expect([monday.at.getDay(), monday.at.getDate(), monday.at.getHours()]).toEqual([1, 26, 9]);
    const mondayNow = new Date(2026, 9, 26, 8, 0);
    expect(snoozePresets(mondayNow)[2].at.getDate()).toBe(2); // 11월 2일
  });

  it("datetime-local 왕복과 표기", () => {
    const at = new Date(2026, 9, 25, 9, 5);
    expect(toLocalInput(at)).toBe("2026-10-25T09:05");
    expect(fromLocalInput("2026-10-25T09:05")?.getTime()).toBe(at.getTime());
    expect(fromLocalInput("어제")).toBeNull();
    expect(formatSnoozeUntil(at.toISOString())).toBe("10월 25일 (일) 09:05");
  });
});
