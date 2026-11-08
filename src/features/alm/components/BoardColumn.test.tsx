import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DndContext } from "@dnd-kit/core";
import { BoardColumn } from "./BoardColumn";

/** 끝나는 시점을 테스트가 쥐는 약속 — 진행 중 잠금을 관찰한다 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderColumn(onCreateIssue: (status: string, title: string, idempotencyKey?: string) => Promise<boolean | void>) {
  return render(
    <DndContext>
      <BoardColumn status="todo" columnName="할 일" issues={[]} usersById={{}} onCreateIssue={onCreateIssue} />
    </DndContext>,
  );
}

async function openForm(title: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "이슈 만들기" }));
  const input = screen.getByLabelText("할 일 컬럼에 이슈 만들기");
  await user.type(input, title);
  return { user, input: input as HTMLInputElement };
}

describe("BoardColumn 인라인 만들기 — 이중 제출 가드(N10)", () => {
  it("Enter 두 번이면 onCreateIssue는 한 번 — 진행 중 입력·버튼이 잠기고 만들기 버튼은 loading", async () => {
    const pending = deferred<void>();
    const onCreate = vi.fn(() => pending.promise);
    renderColumn(onCreate);
    const { user, input } = await openForm("중복 금지");

    await user.keyboard("{Enter}{Enter}");
    fireEvent.submit(input.closest("form")!);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]).toEqual(["todo", "중복 금지", expect.any(String)]);
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "만들기" })).toHaveAttribute("aria-busy", "true");

    pending.resolve();
    await waitFor(() => expect(screen.queryByLabelText("할 일 컬럼에 이슈 만들기")).not.toBeInTheDocument());
  });

  it("실패(false)면 입력값을 남기고 잠금을 풀며, 다시 만들기는 같은 멱등 키를 싣는다", async () => {
    const onCreate = vi.fn<(status: string, title: string, key?: string) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    renderColumn(onCreate);
    const { user, input } = await openForm("재시도");

    await user.keyboard("{Enter}");
    await waitFor(() => expect(input).not.toBeDisabled());
    expect(input).toHaveValue("재시도");

    await user.keyboard("{Enter}");
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
    expect(onCreate.mock.calls[1][2]).toBe(onCreate.mock.calls[0][2]);
  });
});
