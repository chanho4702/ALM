import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import * as store from "../store/jiraStore";
import * as mock from "../store/jiraMock";
import { __resetForTest } from "../store/jiraStore";
import { ApiError } from "../store/mapping";
import type { AgentPersonaDetail } from "../store/types";
import { __resetAiTeamActiveForTest } from "../components/useAiTeamActive";

const PATH = "/projects/p1/settings/ai-team";

function renderAt(path = PATH) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeAll(async () => {
  await Promise.all([import("../pages/ProjectSettingsPage"), import("./AiTeamSettings"), import("./AiOfficePage")]);
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  __resetAiTeamActiveForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function openEditor(user: ReturnType<typeof userEvent.setup>, name: string) {
  await screen.findByRole("table", { name: "AI 직원" });
  await user.click(await screen.findByRole("button", { name: `${name} 편집` }));
  return screen.findByRole("dialog", { name: `${name} 편집` });
}

/** 상세 응답이 와서 폼이 채워질 때까지 */
async function openReady(user: ReturnType<typeof userEvent.setup>, name: string) {
  const dialog = await openEditor(user, name);
  await waitFor(() => expect(within(dialog).queryByRole("status", { name: "직원 정보 불러오는 중" })).not.toBeInTheDocument());
  return dialog;
}

const saveButton = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "저장" });

describe("직원 편집 — 진입·프리필", () => {
  it("상세 API로 이름·이모지·말투·스킬·기본 모델을 채운다(목록 필드로 대신 채우지 않는다)", async () => {
    const user = userEvent.setup();
    const detail = vi.spyOn(store, "fetchAgentPersonaDetail");
    renderAt();
    const dialog = await openReady(user, "프론트봇");
    expect(detail).toHaveBeenCalledWith("103");
    expect(within(dialog).getByRole("tab", { name: "외형" })).toHaveAttribute("aria-selected", "true");

    await user.click(within(dialog).getByRole("tab", { name: "정보" }));
    expect(within(dialog).getByLabelText("슬러그")).toHaveValue("@frontend-bot");
    expect(within(dialog).getByLabelText("이름")).toHaveValue("프론트봇");
    expect(within(dialog).getByLabelText("이모지")).toHaveValue("🖥️");
    expect(within(dialog).getByLabelText("말투")).toHaveValue("짧고 단정하게");
    expect(within(dialog).getByText("프론트엔드")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("tab", { name: "능력" }));
    expect((within(dialog).getByLabelText("스킬") as HTMLTextAreaElement).value).toMatch(/^# 프론트봇 — 디자인시스템/);
    expect(within(dialog).getByRole("combobox", { name: "기본 모델" })).toHaveTextContent("Claude Sonnet 5");
    // 바뀐 것이 없으면 저장할 수 없다
    expect(saveButton(dialog)).toBeDisabled();
  });

  it("로딩 중 — 탭 자리에 스피너, 저장·랜덤·기본값·모드 라디오 비활성, 미리보기는 목록 외형으로 이미 그린다", async () => {
    const user = userEvent.setup();
    const pending = deferred<AgentPersonaDetail>();
    vi.spyOn(store, "fetchAgentPersonaDetail").mockReturnValueOnce(pending.promise);
    renderAt();
    const dialog = await openEditor(user, "디자인봇");
    expect(within(dialog).getAllByRole("status", { name: "직원 정보 불러오는 중" }).length).toBeGreaterThan(0);
    expect(saveButton(dialog)).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "랜덤" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "기본값으로" })).toBeDisabled();
    expect(within(dialog).getByRole("radio", { name: /서기/ })).toBeDisabled();
    expect(within(dialog).getByRole("img", { name: "모든 자세 미리보기" })).toBeInTheDocument();

    pending.resolve(await mock.fetchAgentPersonaDetail("102"));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "랜덤" })).toBeEnabled());
    expect(within(dialog).getByRole("radio", { name: /서기/ })).toBeEnabled();
    expect(within(dialog).getByRole("group", { name: "피부톤" })).toBeInTheDocument();
  });

  it("403이면 권한 없음 빈 상태 — 저장 불가, 취소는 확인 없이 닫힌다", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "fetchAgentPersonaDetail").mockRejectedValueOnce(new ApiError(403, "접근 권한이 없습니다"));
    renderAt();
    const dialog = await openEditor(user, "기획봇");
    expect(await within(dialog).findByText("이 직원을 편집할 권한이 없습니다")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(saveButton(dialog)).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "기획봇 편집" })).not.toBeInTheDocument());
  });

  it("그 밖의 오류는 원인과 '다시 시도' — 다시 부르면 채워진다", async () => {
    const user = userEvent.setup();
    const detail = vi.spyOn(store, "fetchAgentPersonaDetail").mockRejectedValueOnce(new ApiError(503, "agent-service 응답 없음"));
    renderAt();
    const dialog = await openEditor(user, "기획봇");
    expect(await within(dialog).findByText("직원 정보를 불러오지 못했습니다")).toBeInTheDocument();
    expect(within(dialog).getByText("agent-service 연결을 확인하세요 — agent-service 응답 없음")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "다시 시도" }));
    await user.click(await within(dialog).findByRole("tab", { name: "정보" }));
    expect(await within(dialog).findByLabelText("이름")).toHaveValue("기획봇");
    expect(detail).toHaveBeenCalledTimes(2);
  });

  it("늦게 온 응답은 버린다 — 닫고 다른 직원으로 다시 열면 이전 직원의 상세가 폼을 덮지 않는다", async () => {
    const user = userEvent.setup();
    const late = deferred<AgentPersonaDetail>();
    const spy = vi.spyOn(store, "fetchAgentPersonaDetail");
    spy.mockReturnValueOnce(late.promise);
    renderAt();
    let dialog = await openEditor(user, "기획봇");
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "기획봇 편집" })).not.toBeInTheDocument());

    dialog = await openReady(user, "프론트봇");
    late.resolve(await mock.fetchAgentPersonaDetail("101"));
    await user.click(within(dialog).getByRole("tab", { name: "정보" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(within(dialog).getByLabelText("이름")).toHaveValue("프론트봇");
    expect(within(dialog).getByLabelText("슬러그")).toHaveValue("@frontend-bot");
  });
});

describe("직원 편집 — 저장", () => {
  it("바뀐 필드만 PATCH — 이름만 고치면 name만, 성공하면 토스트·닫힘·목록 갱신", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(store, "updateAgentPersona");
    renderAt();
    const dialog = await openReady(user, "기획봇");
    await user.click(within(dialog).getByRole("tab", { name: "정보" }));
    const name = within(dialog).getByLabelText("이름");
    await user.clear(name);
    await user.type(name, "기획왕");
    await user.click(saveButton(dialog));
    expect(update).toHaveBeenCalledWith("101", { name: "기획왕" });
    expect(await screen.findByText("기획왕을(를) 저장했습니다")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "기획봇 편집" })).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "기획왕 편집" })).toBeInTheDocument();
  });

  it("이름을 비우면 오류 문구 + 저장 비활성", async () => {
    const user = userEvent.setup();
    renderAt();
    const dialog = await openReady(user, "기획봇");
    await user.click(within(dialog).getByRole("tab", { name: "정보" }));
    await user.clear(within(dialog).getByLabelText("이름"));
    expect(within(dialog).getByText("이름을 입력하세요")).toBeInTheDocument();
    expect(saveButton(dialog)).toBeDisabled();
  });

  it("외형을 바꾸면 avatarConfig만 — 현재 상태 전체를 표 순서로 직렬화한 문자열", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(store, "updateAgentPersona");
    renderAt();
    const dialog = await openReady(user, "기획봇");
    const hair = within(dialog).getByRole("group", { name: "머리 모양" });
    await user.click(within(hair).getByRole("radio", { name: "단발" }));
    const skin = within(dialog).getByRole("group", { name: "피부톤" });
    await user.click(within(skin).getByRole("radio", { name: "연한 분홍빛" }));
    const acc = within(dialog).getByRole("group", { name: "액세서리" });
    await user.click(within(acc).getByRole("radio", { name: "목도리" }));
    await user.click(saveButton(dialog));
    expect(update).toHaveBeenCalledTimes(1);
    const [, patch] = update.mock.calls[0];
    expect(Object.keys(patch)).toEqual(["avatarConfig"]);
    expect(JSON.parse(patch.avatarConfig ?? "")).toEqual({
      v: 1,
      skinTone: "d",
      hairStyle: "bob",
      hairColor: expect.stringMatching(/^[0-3]$/),
      accessory: "scarf",
    });
    expect(patch.avatarConfig?.startsWith('{"v":1,"skinTone":"d","hairStyle":"bob","hairColor":')).toBe(true);
  });

  it("기본 모델 '기본값 따름'은 defaultModel 빈 문자열(지움), 스킬을 전부 지우면 skills 빈 문자열", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(store, "updateAgentPersona");
    renderAt();
    const dialog = await openReady(user, "프론트봇");
    await user.click(within(dialog).getByRole("tab", { name: "능력" }));
    await user.clear(within(dialog).getByLabelText("스킬"));
    await user.click(within(dialog).getByRole("combobox", { name: "기본 모델" }));
    await user.click(await screen.findByRole("option", { name: "기본값 따름 (프로젝트·전역 설정)" }));
    await user.click(saveButton(dialog));
    expect(update).toHaveBeenCalledWith("103", { skills: "", defaultModel: "" });
  });

  it("스킬이 비어 있으면 '예시 넣기'로 골격을 채우고, 글자 수 카운터를 보여 준다", async () => {
    const user = userEvent.setup();
    renderAt();
    const dialog = await openReady(user, "기획봇");
    await user.click(within(dialog).getByRole("tab", { name: "능력" }));
    expect(within(dialog).getByText("0 / 8,000")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "예시 넣기" }));
    const skills = within(dialog).getByLabelText("스킬") as HTMLTextAreaElement;
    expect(skills.value.startsWith("# 기획봇 — 한 줄 소개 (이 줄이 요약이 된다)\n\n## 잘하는 것\n- \n")).toBe(true);
    expect(within(dialog).queryByRole("button", { name: "예시 넣기" })).not.toBeInTheDocument();
    expect(within(dialog).getByText(`${skills.value.length} / 8,000`)).toBeInTheDocument();
    expect(skills).toHaveAttribute("maxLength", "8000");
  });

  it("400은 서버 문구를 토스트로 — 다이얼로그와 입력은 남는다", async () => {
    const user = userEvent.setup();
    vi.spyOn(store, "updateAgentPersona").mockRejectedValueOnce(
      new ApiError(400, "defaultModel은 영문·숫자와 . _ : @ / [ ] - 만 쓸 수 있습니다(60자 이하)"),
    );
    renderAt();
    const dialog = await openReady(user, "기획봇");
    await user.click(within(dialog).getByRole("tab", { name: "정보" }));
    await user.type(within(dialog).getByLabelText("말투"), "차분하게");
    await user.click(saveButton(dialog));
    expect(await screen.findByText("저장하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByText("defaultModel은 영문·숫자와 . _ : @ / [ ] - 만 쓸 수 있습니다(60자 이하)")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "기획봇 편집" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("말투")).toHaveValue("차분하게");
  });

  it("바뀐 것이 있으면 취소가 '변경 사항을 버릴까요?'를 묻는다 — 계속 편집하면 남고, 버리면 닫힌다", async () => {
    const user = userEvent.setup();
    renderAt();
    const dialog = await openReady(user, "기획봇");
    await user.click(within(within(dialog).getByRole("group", { name: "머리색" })).getByRole("radio", { name: "청록" }));
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    let confirm = await screen.findByRole("dialog", { name: "변경 사항을 버릴까요?" });
    await user.click(within(confirm).getByRole("button", { name: "계속 편집" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "변경 사항을 버릴까요?" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "기획봇 편집" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    confirm = await screen.findByRole("dialog", { name: "변경 사항을 버릴까요?" });
    await user.click(within(confirm).getByRole("button", { name: "버리기" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "기획봇 편집" })).not.toBeInTheDocument());
  });
});

describe("직원 편집 — 외형", () => {
  it("롤 충돌 — 디자인 롤은 캡모자·꽃핀이 흐리게(선택 불가) + 이유 텍스트, 그룹 보조 문구", async () => {
    const user = userEvent.setup();
    renderAt();
    const dialog = await openReady(user, "디자인봇");
    const acc = within(dialog).getByRole("group", { name: "액세서리" });
    expect(within(acc).getByRole("radio", { name: "캡모자 · 디자인 표식과 겹침" })).toBeDisabled();
    expect(within(acc).getByRole("radio", { name: "꽃핀 · 디자인 표식과 겹침" })).toBeDisabled();
    expect(within(acc).getByRole("radio", { name: "목도리" })).toBeEnabled();
    expect(within(acc).getByText("디자인 롤은 머리 위·머리 옆 자리에 롤 표식이 있어 캡모자, 꽃핀을(를) 쓸 수 없습니다.")).toBeInTheDocument();
    // 저장된 외형이 프리필된다(목업 디자인봇 = 긴 머리·적갈·아이보리·빨간 테 안경)
    expect(within(within(dialog).getByRole("group", { name: "머리 모양" })).getByRole("radio", { name: "긴 머리" })).toBeChecked();
    expect(within(acc).getByRole("radio", { name: "빨간 테 안경" })).toBeChecked();
    expect(within(within(dialog).getByRole("group", { name: "셔츠색" })).getByRole("radio", { name: "아이보리" })).toBeChecked();
  });

  it("리뷰·매니저가 아닌 롤이 다른 롤 셔츠색을 고르면 안내하지만 막지 않는다", async () => {
    const user = userEvent.setup();
    renderAt();
    const dialog = await openReady(user, "기획봇");
    const shirt = within(dialog).getByRole("group", { name: "셔츠색" });
    expect(within(shirt).getByRole("radio", { name: "롤 기본 (호박)" })).toBeChecked();
    await user.click(within(shirt).getByRole("radio", { name: "보라" }));
    expect(within(shirt).getByText(/다른 롤의 기본색입니다/)).toBeInTheDocument();
    expect(saveButton(dialog)).toBeEnabled();
  });

  it("저장된 액세서리가 그 롤에서 못 쓰면 경고 배너 + '없음'으로 정규화(바뀐 것으로 간주)", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(store, "updateAgentPersona");
    const real = await mock.fetchAgentPersonaDetail("101");
    vi.spyOn(store, "fetchAgentPersonaDetail").mockResolvedValueOnce({ ...real, avatarConfig: '{"v":1,"accessory":"cap"}' });
    renderAt();
    const dialog = await openReady(user, "기획봇");
    expect(within(dialog).getByText("저장된 액세서리(캡모자)는 기획 롤에서 쓸 수 없어 표시되지 않습니다. 저장하면 '없음'으로 바뀝니다.")).toBeInTheDocument();
    expect(within(within(dialog).getByRole("group", { name: "액세서리" })).getByRole("radio", { name: "없음" })).toBeChecked();
    await user.click(saveButton(dialog));
    // 정규화 결과가 기본 외형과 같으므로 지움("")
    expect(update).toHaveBeenCalledWith("101", { avatarConfig: "" });
  });

  it("기본값으로 → 저장하면 avatarConfig 빈 문자열(지움), 이미 기본이면 버튼 비활성", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(store, "updateAgentPersona");
    renderAt();
    const dialog = await openReady(user, "백엔드봇");
    const reset = within(dialog).getByRole("button", { name: "기본값으로" });
    await user.click(reset);
    expect(within(dialog).getByRole("status")).toHaveTextContent("외형을 기본값으로 되돌렸습니다");
    expect(reset).toBeDisabled();
    await user.click(saveButton(dialog));
    expect(update).toHaveBeenCalledWith("104", { avatarConfig: "" });
  });

  it("랜덤 — 그 롤에서 가능한 액세서리만 고르고, 결과를 상태 알림으로 읽어 준다", async () => {
    const user = userEvent.setup();
    renderAt();
    const dialog = await openReady(user, "디자인봇");
    const values = [0.99, 0.99, 0.6, 0.2, 0.99];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => values[i++ % values.length]);
    await user.click(within(dialog).getByRole("button", { name: "랜덤" }));
    // 피부 0.99→구릿빛… 셔츠 0.2 → 롤 기본, 액세서리 0.99 → 디자인에서 가능한 마지막(볼터치)
    expect(within(dialog).getByRole("status")).toHaveTextContent("외형을 무작위로 바꿨습니다: 짧게 민 머리, 적갈, 갈색, 볼터치");
    const acc = within(dialog).getByRole("group", { name: "액세서리" });
    expect(within(acc).getByRole("radio", { name: "볼터치" })).toBeChecked();
    expect(within(within(dialog).getByRole("group", { name: "셔츠색" })).getByRole("radio", { name: "롤 기본 (자홍)" })).toBeChecked();
  });

  it("명판 이모지 — 이모지가 없으면 스위치 비활성 + 안내, 켜면 미리보기 아래 명패 모형", async () => {
    const user = userEvent.setup();
    renderAt();
    const dialog = await openReady(user, "기획봇");
    const toggle = within(dialog).getByRole("switch", { name: "명판에 이모지 표시" });
    expect(toggle).toBeEnabled();
    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(within(dialog).getByText("📝", { selector: ".office-nameplate-emoji" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("tab", { name: "정보" }));
    await user.clear(within(dialog).getByLabelText("이모지"));
    await user.click(within(dialog).getByRole("tab", { name: "외형" }));
    expect(within(dialog).getByRole("switch", { name: "명판에 이모지 표시" })).toBeDisabled();
    expect(within(dialog).getByText("정보 탭에서 이모지를 먼저 입력하세요")).toBeInTheDocument();
  });
});

describe("직원 편집 — 미리보기", () => {
  it("모드 라디오 — 대화 모드는 표정 캡션('지금: …'), 외형을 바꾸면 저장 전에도 미리보기가 바로 바뀐다", async () => {
    const user = userEvent.setup();
    renderAt();
    const dialog = await openReady(user, "기획봇");
    await user.click(within(dialog).getByRole("radio", { name: /대화/ }));
    expect(within(dialog).getByText(/^지금: /)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: /타이핑/ }));
    expect(within(dialog).queryByText(/^지금: /)).not.toBeInTheDocument();
    const stage = dialog.querySelector<SVGSVGElement>(".ai-avatar-stage svg")!;
    await user.click(within(within(dialog).getByRole("group", { name: "액세서리" })).getByRole("radio", { name: "목도리" }));
    expect(stage.style.getPropertyValue("--av-extra")).toBe("var(--office-extra-scarf)");
    expect(dialog.querySelector(".ai-avatar-stage .px-char-E")).not.toBeNull();
  });
});

describe("사무실 반영(AGP-62 §8)", () => {
  it("showEmoji=1 직원은 명판 이름 뒤에 이모지(aria-hidden), 설정 없는 직원은 그대로", async () => {
    renderAt("/projects/p1/ai-office");
    await screen.findByRole("button", { name: /^기획봇, 기획/ });
    const plates = [...document.querySelectorAll(".office-nameplate")];
    const designer = plates.find((p) => p.textContent?.startsWith("디자인봇"));
    expect(designer?.querySelector(".office-nameplate-emoji")).toHaveTextContent("🎨");
    expect(designer?.querySelector(".office-nameplate-emoji")).toHaveAttribute("aria-hidden", "true");
    const planner = plates.find((p) => p.textContent?.startsWith("기획봇"));
    expect(planner?.querySelector(".office-nameplate-emoji")).toBeNull();
    // 커스텀 외형이 캔버스 슬롯 변수로 반영된다(추가 액세서리 색 슬롯)
    const avatar = document.querySelector<SVGGElement>('.office-avatar[data-persona="102"]');
    expect(avatar?.style.getPropertyValue("--av-extra")).toBe("var(--office-extra-glasses)");
    expect(avatar?.style.getPropertyValue("--av-shirt")).toBe("var(--office-shirt-ivory)");
  });
});
