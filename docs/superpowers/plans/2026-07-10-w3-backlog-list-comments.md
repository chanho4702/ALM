# W3: 백로그/스프린트 + 이슈 목록 필터 + 코멘트/활동로그 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지라 클론의 마지막 웨이브 — 백로그 화면(스프린트 생성/시작/완료 + 인라인 이슈 생성 + Dropdown 이동/삭제), 이슈 목록 화면(테이블 + 검색/상태/우선순위/담당자 필터), 이슈 상세 모달의 코멘트/활동 Tabs를 완성한다.

**Architecture:** W1의 `jiraStore.ts`(17함수)와 W2의 BoardPage/IssueDetailModal 위에 W1 스텁 두 페이지(BacklogPage·IssueListPage)를 교체 구현한다. `?issue=` 모달 배선은 BoardPage 복붙이 아니라 공용 훅 `useIssueModal`로 승격해 세 페이지가 공유하고, BoardPage도 이 훅으로 리팩터한다(기존 테스트 무회귀가 게이트). 스토어는 W2 인계 사항 하나만 손댄다: `updateIssue`가 status/sprintId 변경 시 대상 그룹 맨 뒤 order를 재부여.

**Tech Stack:** Vite 7 + React 19 + TypeScript(strict) + react-router 7 + @chanho/react(디자인시스템 tarball) + Vitest/RTL. 신규 패키지 설치 없음.

## Global Constraints

- 작업 디렉터리: `C:\MSA_TEMPLATE\alm-front` (모든 명령은 여기서 실행, 패키지 매니저는 pnpm)
- UI는 100% 디자인시스템(@chanho/react) — MUI 등 타 UI 라이브러리 금지 (스펙 §2.1)
- 색상·간격 하드코딩 금지 — 스타일은 `src/app/app.css` 단일 파일에 `--chanho-*` 토큰 변수만 사용 (기존 관례)
- 화면은 `jiraStore.ts`의 async 함수만 호출한다. 스토어 내부 구조 의존 금지 (스펙 §2.3)
- 에러는 스토어가 한국어 메시지로 throw → 화면은 Toast(danger)로 표시 (스펙 §5)
- 디자인시스템 매핑: status→Lozenge(neutral/info/success), assignee→Avatar, 액션 피드백→Toast (스펙 §3)
- 활성 스프린트는 프로젝트당 최대 1개 — `startSprint` 중복 시 스토어가 throw, 화면은 Toast(danger) (스펙 §3)
- `completeSprint`: 미완료(todo/inprogress) 이슈는 백로그로 자동 이동, done 이슈는 스프린트에 남김 (스펙 §3)
- 게이트: `pnpm typecheck` && `pnpm test` && `pnpm build` — 각 태스크 커밋 전 전부 그린
- TDD: 실패하는 테스트를 먼저 쓰고 RED를 **실제로 관찰**한 뒤 구현한다
- 커밋: main 브랜치 직접 커밋, 한국어 커밋 메시지, push는 컨트롤러가 한다

## 이번 웨이브에서 하지 않는다 (범위 밖 — 절대 추가 금지)

- **백로그 드래그 정렬 없음** — 스프린트 배치는 Dropdown 액션으로 대체 (스펙 §1 범위 제외)
- **이슈 삭제 확인 다이얼로그 없음** — 확인 없이 삭제하고 Toast로 알린다 (확정 결정)
- **제목 편집 Escape 취소 없음** — jsdom/브라우저 검증이 불가해 W3에서 제외 유지 (W2 인계 결정)
- **completeSprint의 sprint 활동로그 기록 없음** — 스프린트 완료로 인한 백로그 이동은 활동로그를 남기지 않는 제품 결정 (updateIssue를 통한 개별 이동만 기록)
- 코멘트 수정/삭제, 에픽/라벨/워치어, 백엔드/인증 — 전부 MVP 범위 외 (스펙 §1)

## 파일 구조 (W3에서 만들거나 바꾸는 것)

```
src/features/jira/
├── components/
│   ├── useIssueModal.tsx        # [신규] ?issue= 모달 배선 공용 훅 (JSX 렌더 헬퍼 포함 → .tsx)
│   ├── SprintPanel.tsx          # [신규] 스프린트 패널 + BacklogIssueRow (백로그/패널 공용 행)
│   ├── IssueDetailModal.tsx     # [확장] 하단 Tabs(코멘트/활동) + 빈 제목 blur Toast
│   └── IssueDetailModal.test.tsx# [확장] 코멘트/활동/빈 제목 흐름 테스트 추가
├── pages/
│   ├── BoardPage.tsx            # [리팩터] useIssueModal 훅 사용 + reload 시작부 로딩 리셋
│   ├── BacklogPage.tsx          # [교체] W1 스텁 → 스프린트 패널/인라인 생성/Dropdown 액션
│   ├── BacklogPage.test.tsx     # [신규]
│   ├── IssueListPage.tsx        # [교체] W1 스텁 → 테이블 + 필터바
│   └── IssueListPage.test.tsx   # [신규]
└── store/
    ├── jiraStore.ts             # [수정] updateIssue: status/sprintId 변경 시 order 재부여
    └── jiraStore.issues.test.ts # [확장] order 재계산 테스트 추가
src/app/app.css                  # [확장] 백로그/테이블/탭 스타일 (토큰 변수만)
```

참고: 확정 결정문에는 `useIssueModal.ts`로 적혀 있으나 이 훅은 `<IssueDetailModal />` JSX를 반환하므로 **`.tsx`** 확장자가 필요하다. `BacklogList.tsx`는 "필요시"였는데, 백로그 섹션이 `BacklogIssueRow` 나열 + 폼 하나라 별도 파일은 YAGNI — BacklogPage 안에 인라인한다.

## 디자인시스템 실제 API (소스 확인 완료 — `C:\MSA_TEMPLATE\design-system\packages\react\src\`)

- **`Tabs`** (`Tabs/Tabs.tsx`): `label: string`(필수 — 탭 목록의 aria-label), `items: { value: string; label: string; content: ReactNode }[]`, `defaultValue?`(생략 시 첫 항목), `value?/onValueChange?`, `className?`. Radix Tabs 기반 — 트리거는 `role="tab"`, 활성 콘텐츠는 `role="tabpanel"`, **비활성 탭 콘텐츠는 언마운트**된다(쿼리에 안 잡힘)
- **`Dropdown`** (`Dropdown/Dropdown.tsx`): `trigger: ReactElement`(asChild로 클릭 트리거), `items: { label: string; onSelect?: () => void; danger?: boolean; disabled?: boolean }[]`, `className?`. Radix DropdownMenu 기반 — 항목은 `role="menuitem"`, Portal 렌더라 `screen.findByRole("menuitem", ...)`로 조회. **item key가 label이므로 한 메뉴 안에서 label 중복 금지**
- `Select`: `label`(필수, 트리거와 자동 연결 → `getByRole("combobox", { name })`), `options: { value; label; disabled? }[]`, `value`, `onValueChange(value: string)`. **Radix라 option value 빈 문자열 금지** → "전체"는 센티널 `"all"`
- `Modal`: `trigger`(필수 — URL 모달은 `<span hidden />` 더미), `title`(dialog 접근명), `open?/onOpenChange?`, `className`
- `TextField`/`TextArea`: `label`(필수) + 네이티브 props 전파 (`placeholder`, `onBlur`, `rows` 등)
- `Button`: `variant?: "primary" | "subtle" | "danger"`, `size?: "medium" | "small"`, 기본 `type="button"`, 네이티브 button props 전파(`aria-label`, `onClick`, ref — Dropdown trigger asChild에 사용 가능)
- `Lozenge`: `appearance?: "neutral" | "info" | "success" | "warning" | "danger"`, span rest 전파
- `Avatar`: `name`(필수), `size?: "small" | "medium" | "large"` — src 없으면 이니셜, `role="img" aria-label={name}`
- `Badge`: `appearance?: "neutral" | "brand" | "danger"`
- `useToast()`: `toast({ title, description?, appearance?: "info" | "success" | "danger" })`

## 시드 데이터 확인 결과 (`src/mock/seed.ts` — 테스트 단언의 근거)

- 프로젝트 `p1`(ALM), 스프린트 `s1`("Sprint 1", **active**) 1개뿐 — **planned 스프린트 없음**
- s1 이슈: ALM-1(done/높음/김찬호) · ALM-2(진행 중/높음/이서연) · ALM-3(진행 중/보통/김찬호) · ALM-4(할 일/보통/박준영) · ALM-5(할 일/낮음/미배정)
- 백로그(sprintId=null) 이슈 3개: **ALM-6**("코멘트 기능 구현", 할 일/보통/**최다인**, order 1) · **ALM-7**("활동 로그 표시", 할 일/낮음/미배정, order 2) · **ALM-8**("다크 테마 점검", 할 일/낮음/미배정, order 3)
- 코멘트: ALM-2에 2개(김찬호 "드래그 라이브러리는 @dnd-kit로 확정했습니다." / 이서연 "컬럼 간 이동부터 붙여볼게요."), ALM-3에 1개(박준영)
- 활동: 이슈 8개 각각 created("이슈 생성") 1건씩, actor는 reporter(u1 김찬호)
- 목업 유저: u1 김찬호(현재 유저) / u2 이서연 / u3 박준영 / u4 최다인
- issueCounters: `{ p1: 8 }` → 다음 생성 이슈는 **ALM-9**

## jsdom + Radix 테스트 주의 (기존 하네스 패턴 계승)

- 렌더 하네스: `ToastProvider` + `MemoryRouter(initialEntries)` + `App` + `LocationProbe` (IssueDetailModal.test.tsx 패턴)
- `beforeEach`: `localStorage.clear()` + `__resetForTest()`
- Radix Select: 트리거 `getByRole("combobox", { name })` 클릭 → 옵션은 Portal이라 `screen.findByRole("option", { name })`
- Radix Dropdown: 트리거 클릭 → `screen.findByRole("menuitem", { name })`
- Radix Tabs: `getByRole("tab", { name })` 클릭으로 전환, 활성 패널만 DOM에 존재
- 모달이 열리면 배경이 aria-hidden 처리되므로 배경 조회는 `data-testid` 사용 (W2 인계)

---

### Task 1: 스토어 order 재계산(TDD) + useIssueModal 훅 승격 + BoardPage 리팩터

`updateIssue`가 status 또는 sprintId를 바꿀 때 대상 그룹(같은 project+sprintId+status)의 맨 뒤 order를 부여하도록 고친다(W2 인계 — 지금은 order가 그대로라 이동한 이슈가 대상 컬럼 중간에 끼어든다). 그리고 `?issue=` 모달 배선을 공용 훅으로 추출하고 BoardPage를 리팩터한다. **기존 테스트 44개 무회귀가 이 태스크의 게이트다.**

**Files:**

- Modify: `src/features/jira/store/jiraStore.ts` (updateIssue만)
- Test: `src/features/jira/store/jiraStore.issues.test.ts` (describe 추가)
- Create: `src/features/jira/components/useIssueModal.tsx`
- Modify: `src/features/jira/pages/BoardPage.tsx` (훅 사용 + reload 로딩 리셋)

**Interfaces:**

- Consumes: `updateIssue(id, patch): Promise<Issue>`, `getIssueByKey(key): Promise<Issue | null>` (기존 시그니처 그대로), `IssueDetailModalProps { issueKey: string; onClose: () => void; onIssueChanged: () => void | Promise<void> }`
- Produces (Task 2·3·4가 사용):
  - `useIssueModal(onIssueChanged: () => void | Promise<void>): { issueKey: string | null; openIssue: (key: string) => void; closeIssue: () => void; issueModal: ReactNode }` — `issueModal`을 페이지 JSX 마지막에 그대로 렌더하면 `?issue=` 쿼리에 따라 모달이 열린다
  - `updateIssue({ sprintId })`가 이동 후 대상 그룹 맨 뒤 order를 보장 → Task 2의 Dropdown 이동이 목록 맨 뒤에 붙는다

- [ ] **Step 1: 실패하는 스토어 테스트 작성**

`src/features/jira/store/jiraStore.issues.test.ts` 파일 끝에 describe 추가:

```ts
describe("updateIssue order 재계산 (W3)", () => {
  it("sprintId 변경 시 대상 그룹(프로젝트+스프린트+상태) 맨 뒤 order를 부여한다", async () => {
    const six = await getIssueByKey("ALM-6"); // 백로그 todo, order 1
    const moved = await updateIssue(six!.id, { sprintId: "s1" });
    // s1 todo 그룹: ALM-4(1), ALM-5(2) → 맨 뒤 3
    expect(moved.order).toBe(3);
  });

  it("status 변경 시 대상 그룹 맨 뒤 order를 부여한다", async () => {
    const four = await getIssueByKey("ALM-4"); // s1 todo, order 1
    const moved = await updateIssue(four!.id, { status: "done" });
    // s1 done 그룹: ALM-1(1) → 맨 뒤 2
    expect(moved.order).toBe(2);
  });

  it("제목/설명만 바꾸면 order를 유지한다", async () => {
    const four = await getIssueByKey("ALM-4");
    const updated = await updateIssue(four!.id, { title: "제목만 수정" });
    expect(updated.order).toBe(four!.order);
  });
});
```

- [ ] **Step 2: RED 관찰**

Run: `pnpm vitest run src/features/jira/store/jiraStore.issues.test.ts`
Expected: 앞의 2개 FAIL — `expected 1 to be 3`, `expected 1 to be 2` (현재는 order를 건드리지 않는다). 세 번째는 이미 통과(회귀 방지 가드).

- [ ] **Step 3: updateIssue 구현**

`src/features/jira/store/jiraStore.ts`의 `updateIssue`를 다음으로 교체:

```ts
export async function updateIssue(
  id: string,
  patch: Partial<
    Pick<Issue, "title" | "description" | "status" | "priority" | "assigneeId" | "sprintId">
  >,
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  const before = { ...issue };
  Object.assign(issue, patch);
  // 상태/스프린트가 바뀌면 대상 그룹(같은 프로젝트·스프린트·상태) 맨 뒤로 order 재부여
  // (moveIssue는 beforeId로 정밀 배치, updateIssue는 항상 맨 뒤 — W2 인계)
  if (before.status !== issue.status || before.sprintId !== issue.sprintId) {
    const maxOrder = data.issues
      .filter(
        (i) =>
          i.id !== id &&
          i.projectId === issue.projectId &&
          i.sprintId === issue.sprintId &&
          i.status === issue.status,
      )
      .reduce((max, i) => Math.max(max, i.order), 0);
    issue.order = maxOrder + 1;
  }
  issue.updatedAt = new Date().toISOString();
  recordChanges(data, before, issue, issue.updatedAt);
  persist();
  return clone(issue);
}
```

- [ ] **Step 4: GREEN 확인 (스토어 전체 무회귀)**

Run: `pnpm vitest run src/features/jira/store`
Expected: 전부 PASS (기존 활동로그/moveIssue 테스트 포함)

- [ ] **Step 5: 커밋**

```bash
git add src/features/jira/store/jiraStore.ts src/features/jira/store/jiraStore.issues.test.ts
git commit -m "W3: updateIssue 상태/스프린트 변경 시 대상 그룹 맨 뒤 order 재부여"
```

- [ ] **Step 6: useIssueModal 훅 작성**

`src/features/jira/components/useIssueModal.tsx` 신규 (전문):

```tsx
import { useCallback } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { IssueDetailModal } from "./IssueDetailModal";

export interface UseIssueModalResult {
  /** 현재 열린 이슈 키 (?issue= 값). 없으면 null */
  issueKey: string | null;
  openIssue: (key: string) => void;
  closeIssue: () => void;
  /** 페이지 JSX 마지막에 그대로 렌더할 모달 (issueKey 없으면 null) */
  issueModal: ReactNode;
}

/**
 * `?issue=ALM-1` 쿼리 기반 이슈 상세 모달 배선 — 보드/백로그/이슈 목록 공용 (스펙 §4).
 * @param onIssueChanged 모달에서 저장 성공 시 페이지 데이터 재조회 콜백
 */
export function useIssueModal(onIssueChanged: () => void | Promise<void>): UseIssueModalResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const issueKey = searchParams.get("issue");

  const openIssue = useCallback(
    (key: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("issue", key);
        return next;
      });
    },
    [setSearchParams],
  );

  const closeIssue = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("issue");
      return next;
    });
  }, [setSearchParams]);

  const issueModal = issueKey ? (
    <IssueDetailModal
      key={issueKey} // 키가 바뀌면 모달 내부 상태 초기화
      issueKey={issueKey}
      onClose={closeIssue}
      onIssueChanged={onIssueChanged}
    />
  ) : null;

  return { issueKey, openIssue, closeIssue, issueModal };
}
```

- [ ] **Step 7: BoardPage 리팩터 (훅 사용 + 로딩 리셋)**

`src/features/jira/pages/BoardPage.tsx` 전문 교체:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { Button, Spinner, useToast } from "@chanho/react";
import type { Issue, IssueStatus, Sprint, User } from "../store/types";
import { listIssues, listSprints, listUsers, moveIssue } from "../store/jiraStore";
import { BoardColumn } from "../components/BoardColumn";
import { IssueCard } from "../components/IssueCard";
import { useIssueModal } from "../components/useIssueModal";
import { BOARD_STATUSES } from "../components/labels";
import { resolveMove } from "./boardDnd";

export function BoardPage() {
  const { projectId } = useParams();

  /** undefined = 로딩 중, null = 활성 스프린트 없음 */
  const [sprint, setSprint] = useState<Sprint | null | undefined>(undefined);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const toast = useToast();

  // 클릭과 드래그 구분: 5px 이상 움직여야 드래그 시작
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reload = useCallback(async () => {
    if (!projectId) return;
    setSprint(undefined); // 재조회 시작 = 로딩 — projectId 전환 시 이전 프로젝트 보드 잔상 방지 (W2 인계)
    const sprints = await listSprints(projectId);
    const active = sprints.find((s) => s.state === "active") ?? null;
    const all = active ? await listIssues(projectId) : [];
    setIssues(active ? all.filter((i) => i.sprintId === active.id) : []);
    setSprint(active);
  }, [projectId]);

  useEffect(() => {
    void listUsers().then(setUsers);
    void reload();
  }, [reload]);

  /** ?issue=ALM-1 → 상세 모달 (URL 공유 가능) — 세 페이지 공용 훅 */
  const { openIssue, issueModal } = useIssueModal(reload);

  const userNames = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.name])),
    [users],
  );

  /** status → order순 이슈 id 배열 (resolveMove 입력) */
  const columnIds = useMemo(() => {
    const map: Record<IssueStatus, string[]> = { todo: [], inprogress: [], done: [] };
    for (const issue of issues) map[issue.status].push(issue.id);
    return map;
  }, [issues]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveIssue(issues.find((i) => i.id === event.active.id) ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveIssue(null);
    const { active, over } = event;
    if (!over) return;
    const target = resolveMove(String(active.id), String(over.id), columnIds);
    if (!target) return;
    try {
      await moveIssue(String(active.id), target);
    } catch (error) {
      toast({
        title: "이슈 이동 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reload(); // 성공/실패 모두 스토어 기준으로 재조회
  };

  let content: ReactNode;
  if (sprint === undefined) {
    content = (
      <div className="board-loading">
        <Spinner size="large" label="보드 불러오는 중" />
      </div>
    );
  } else if (sprint === null) {
    content = (
      <section className="board-empty">
        <h2>진행 중인 스프린트가 없습니다</h2>
        <p>백로그에서 스프린트를 만들고 시작하면 보드가 열립니다.</p>
        <Link to="../backlog">
          <Button variant="subtle" tabIndex={-1}>
            백로그로 이동
          </Button>
        </Link>
      </section>
    );
  } else {
    content = (
      <section>
        <h2 className="board-title">{sprint.name}</h2>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveIssue(null)}
        >
          <div className="board-columns">
            {BOARD_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                issues={issues.filter((i) => i.status === status)}
                userNames={userNames}
                onOpenIssue={openIssue}
              />
            ))}
          </div>
          <DragOverlay>
            {activeIssue ? (
              <IssueCard
                issue={activeIssue}
                assigneeName={
                  activeIssue.assigneeId ? userNames[activeIssue.assigneeId] : undefined
                }
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </section>
    );
  }

  return (
    <>
      {content}
      {/* 활성 스프린트가 없어도 백로그 이슈 키 공유 URL은 열려야 하므로 content 밖에서 렌더 */}
      {issueModal}
    </>
  );
}
```

변경 요약: `useSearchParams`/`openIssue`/`closeIssue`/`IssueDetailModal` 직접 배선 제거 → `useIssueModal(reload)` 훅으로 대체, `reload` 시작부에 `setSprint(undefined)` 한 줄 추가. 나머지는 그대로.

- [ ] **Step 8: 전체 무회귀 확인 (이 리팩터의 게이트)**

Run: `pnpm test`
Expected: 전부 PASS — 기존 44개(모달 5·보드 2·앱 3·스토어·boardDnd) + Step 1의 3개 = **47개**. 특히 `IssueDetailModal.test.tsx`의 5개(열기/닫기/URL 반영)가 훅 승격 후에도 그대로 통과해야 한다.

- [ ] **Step 9: 타입·빌드 게이트 후 커밋**

Run: `pnpm typecheck && pnpm build`
Expected: 에러 0

```bash
git add src/features/jira/components/useIssueModal.tsx src/features/jira/pages/BoardPage.tsx
git commit -m "W3: ?issue= 모달 배선을 useIssueModal 훅으로 승격, 보드 reload 로딩 리셋"
```

---

### Task 2: BacklogPage — 스프린트 패널 + 인라인 이슈 생성 + Dropdown 이동/삭제

W1 스텁을 교체한다. 화면 구성(스펙 §4 + 확정 결정): 상단 헤더(제목 + 스프린트 만들기 Button) → 스프린트 패널들(active 먼저, planned 다음 — done은 렌더 안 함, planned에 시작 Button / active에 완료 Button) → 백로그 목록(인라인 이슈 생성 폼 포함). 이슈 행마다 Dropdown 액션(스프린트/백로그 이동 + 삭제), 행 클릭 → `?issue=` 모달.

**Files:**

- Create: `src/features/jira/components/SprintPanel.tsx`
- Modify: `src/features/jira/pages/BacklogPage.tsx` (W1 스텁 전체 교체)
- Modify: `src/app/app.css` (백로그 스타일 추가)
- Test: `src/features/jira/pages/BacklogPage.test.tsx`

**Interfaces:**

- Consumes:
  - Task 1의 `useIssueModal(onIssueChanged)` → `{ openIssue, issueModal }`
  - 스토어: `listSprints(projectId)`, `createSprint(projectId)`, `startSprint(id)`(활성 존재 시 throw "이미 진행 중인 스프린트가 있습니다"), `completeSprint(id)`, `listIssues(projectId)`, `createIssue({ projectId, title })`(빈 제목 throw "이슈 제목을 입력하세요"), `updateIssue(id, { sprintId })`, `deleteIssue(id)`
  - `labels.ts`: `STATUS_LABELS/STATUS_APPEARANCE/PRIORITY_LABELS/PRIORITY_APPEARANCE`
- Produces (Task 2 내부 전용이지만 시그니처 고정):
  - `SprintPanel.tsx`: `MoveTarget { sprintId: string | null; label: string }`, `BacklogIssueRow({ issue, assigneeName?, moveTargets, onMove(issue, sprintId), onDelete(issue), onOpen(key) })`, `SprintPanel({ sprint, issues, userNames, moveTargets, onStart(sprint), onComplete(sprint), onMove, onDelete, onOpen })` — 패널은 `<section aria-label={sprint.name}>`, Dropdown 트리거는 `aria-label="{키} 액션"`, 메뉴 항목은 `"{대상}로 이동"`/`"삭제"`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/jira/pages/BacklogPage.test.tsx` 전문:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";

/** 현재 pathname+search를 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderBacklog(initialPath = "/projects/p1/backlog") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
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

describe("BacklogPage", () => {
  it("활성 스프린트 패널과 백로그 목록을 렌더한다", async () => {
    renderBacklog();

    // 활성 스프린트 패널: s1 이슈 5개 + 완료 버튼
    const sprint = await screen.findByRole("region", { name: "Sprint 1" });
    for (const key of ["ALM-1", "ALM-2", "ALM-3", "ALM-4", "ALM-5"]) {
      expect(within(sprint).getByText(key)).toBeInTheDocument();
    }
    expect(within(sprint).getByRole("button", { name: "스프린트 완료" })).toBeInTheDocument();

    // 백로그 목록: sprintId=null 이슈 3개 (시드: ALM-6 담당 최다인)
    const backlog = screen.getByRole("region", { name: "백로그 목록" });
    for (const key of ["ALM-6", "ALM-7", "ALM-8"]) {
      expect(within(backlog).getByText(key)).toBeInTheDocument();
    }
    expect(within(backlog).getByRole("img", { name: "최다인" })).toBeInTheDocument();

    // planned 스프린트가 없으므로 시작 버튼도 없다
    expect(screen.queryByRole("button", { name: "스프린트 시작" })).not.toBeInTheDocument();
  });

  it("인라인 생성: 제목 입력 → 만들기 → 백로그 목록에 새 이슈가 나타난다", async () => {
    const user = userEvent.setup();
    renderBacklog();

    const backlog = await screen.findByRole("region", { name: "백로그 목록" });
    await user.type(within(backlog).getByLabelText("새 이슈 제목"), "성능 개선 조사");
    await user.click(within(backlog).getByRole("button", { name: "만들기" }));

    // 시드 카운터가 8이므로 다음 키는 ALM-9, 백로그(sprintId=null)로 생성된다
    expect(await within(backlog).findByText("ALM-9")).toBeInTheDocument();
    expect(within(backlog).getByText("성능 개선 조사")).toBeInTheDocument();
    expect(within(backlog).getByLabelText("새 이슈 제목")).toHaveValue(""); // 성공 시 입력 초기화
  });

  it("스프린트 만들기 → planned 패널이 생기고, 활성 스프린트가 있으면 시작이 거부된다", async () => {
    const user = userEvent.setup();
    renderBacklog();

    await user.click(await screen.findByRole("button", { name: "스프린트 만들기" }));
    const planned = await screen.findByRole("region", { name: "Sprint 2" });
    await user.click(within(planned).getByRole("button", { name: "스프린트 시작" }));

    // 도메인 규칙(스펙 §3): 활성 스프린트는 프로젝트당 1개 → 스토어 throw → danger Toast
    expect(await screen.findByText("이미 진행 중인 스프린트가 있습니다")).toBeInTheDocument();
  });

  it("스프린트 완료: 미완료 이슈는 백로그로 돌아오고 done 이슈는 스프린트에 남는다", async () => {
    const user = userEvent.setup();
    renderBacklog();

    const sprint = await screen.findByRole("region", { name: "Sprint 1" });
    await user.click(within(sprint).getByRole("button", { name: "스프린트 완료" }));

    // done 스프린트 패널은 렌더하지 않는다
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Sprint 1" })).not.toBeInTheDocument();
    });
    // 미완료(todo/inprogress) 이슈 4개가 백로그로 복귀
    const backlog = screen.getByRole("region", { name: "백로그 목록" });
    for (const key of ["ALM-2", "ALM-3", "ALM-4", "ALM-5"]) {
      expect(within(backlog).getByText(key)).toBeInTheDocument();
    }
    // ALM-1(done)은 완료된 스프린트에 남아 화면에서 사라진다
    expect(screen.queryByText("ALM-1")).not.toBeInTheDocument();
  });

  it("Dropdown 액션: 스프린트로 이동과 삭제(확인 없이 Toast)", async () => {
    const user = userEvent.setup();
    renderBacklog();

    // ALM-6 → Sprint 1로 이동
    const backlog = await screen.findByRole("region", { name: "백로그 목록" });
    await user.click(within(backlog).getByRole("button", { name: "ALM-6 액션" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sprint 1로 이동" }));
    const sprint = screen.getByRole("region", { name: "Sprint 1" });
    expect(await within(sprint).findByText("ALM-6")).toBeInTheDocument();

    // ALM-8 삭제 — 확인 다이얼로그 없이 즉시 삭제 + Toast
    await user.click(within(backlog).getByRole("button", { name: "ALM-8 액션" }));
    await user.click(await screen.findByRole("menuitem", { name: "삭제" }));
    await waitFor(() => {
      expect(screen.queryByText("ALM-8")).not.toBeInTheDocument();
    });
    expect(screen.getByText("ALM-8 이슈를 삭제했습니다")).toBeInTheDocument();
  });

  it("행 클릭 → ?issue= 쿼리와 함께 상세 모달이 열린다", async () => {
    const user = userEvent.setup();
    renderBacklog();

    const backlog = await screen.findByRole("region", { name: "백로그 목록" });
    await user.click(within(backlog).getByText("코멘트 기능 구현")); // ALM-6

    expect(await screen.findByRole("dialog", { name: "ALM-6" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/backlog?issue=ALM-6");
  });
});
```

- [ ] **Step 2: RED 관찰**

Run: `pnpm vitest run src/features/jira/pages/BacklogPage.test.tsx`
Expected: 6개 전부 FAIL — 스텁은 "백로그/스프린트는 W3에서 구현합니다"만 렌더하므로 `Unable to find an accessible element with the role "region" and name "Sprint 1"` 류의 실패.

- [ ] **Step 3: SprintPanel.tsx 작성**

`src/features/jira/components/SprintPanel.tsx` 신규 (전문):

```tsx
import { Avatar, Badge, Button, Dropdown, Lozenge } from "@chanho/react";
import type { Issue, Sprint } from "../store/types";
import { PRIORITY_APPEARANCE, PRIORITY_LABELS, STATUS_APPEARANCE, STATUS_LABELS } from "./labels";

/** 이슈를 옮길 수 있는 대상. sprintId null = 백로그 */
export interface MoveTarget {
  sprintId: string | null;
  label: string; // "백로그" | "Sprint 2" ...
}

export interface BacklogIssueRowProps {
  issue: Issue;
  /** 담당자 이름. 미지정이면 undefined → Avatar 생략 */
  assigneeName?: string;
  moveTargets: MoveTarget[];
  onMove: (issue: Issue, sprintId: string | null) => void;
  onDelete: (issue: Issue) => void;
  onOpen: (key: string) => void;
}

/** 백로그/스프린트 패널 공용 이슈 행. 행 클릭 = 상세 모달, 우측 ⋯ = Dropdown 액션 */
export function BacklogIssueRow({
  issue,
  assigneeName,
  moveTargets,
  onMove,
  onDelete,
  onOpen,
}: BacklogIssueRowProps) {
  return (
    <div className="backlog-row" onClick={() => onOpen(issue.key)}>
      <span className="backlog-row-key">{issue.key}</span>
      <span className="backlog-row-title">{issue.title}</span>
      <Lozenge appearance={STATUS_APPEARANCE[issue.status]}>{STATUS_LABELS[issue.status]}</Lozenge>
      <Lozenge appearance={PRIORITY_APPEARANCE[issue.priority]}>
        {PRIORITY_LABELS[issue.priority]}
      </Lozenge>
      {assigneeName ? <Avatar name={assigneeName} size="small" /> : null}
      <Dropdown
        trigger={
          <Button
            variant="subtle"
            size="small"
            aria-label={`${issue.key} 액션`}
            onClick={(e) => e.stopPropagation()} // 행 클릭(모달 열기)과 분리
          >
            ⋯
          </Button>
        }
        items={[
          // 현재 위치는 이동 대상에서 제외 (백로그 이슈면 "백로그로 이동" 없음)
          ...moveTargets
            .filter((target) => target.sprintId !== issue.sprintId)
            .map((target) => ({
              label: `${target.label}로 이동`,
              onSelect: () => onMove(issue, target.sprintId),
            })),
          { label: "삭제", danger: true, onSelect: () => onDelete(issue) },
        ]}
      />
    </div>
  );
}

export interface SprintPanelProps {
  sprint: Sprint;
  /** 이 스프린트의 이슈 (order 오름차순) */
  issues: Issue[];
  /** userId → 이름 (Avatar용) */
  userNames: Record<string, string>;
  moveTargets: MoveTarget[];
  onStart: (sprint: Sprint) => void;
  onComplete: (sprint: Sprint) => void;
  onMove: (issue: Issue, sprintId: string | null) => void;
  onDelete: (issue: Issue) => void;
  onOpen: (key: string) => void;
}

/** planned/active 스프린트 패널 — planned엔 시작 Button, active엔 완료 Button (스펙 §4) */
export function SprintPanel({
  sprint,
  issues,
  userNames,
  moveTargets,
  onStart,
  onComplete,
  onMove,
  onDelete,
  onOpen,
}: SprintPanelProps) {
  return (
    <section className="sprint-panel" aria-label={sprint.name}>
      <header className="sprint-panel-header">
        <h3>{sprint.name}</h3>
        <Badge appearance={sprint.state === "active" ? "brand" : "neutral"}>{issues.length}</Badge>
        {sprint.state === "planned" ? (
          <Button size="small" onClick={() => onStart(sprint)}>
            스프린트 시작
          </Button>
        ) : null}
        {sprint.state === "active" ? (
          <Button size="small" variant="subtle" onClick={() => onComplete(sprint)}>
            스프린트 완료
          </Button>
        ) : null}
      </header>
      <div className="sprint-panel-issues">
        {issues.map((issue) => (
          <BacklogIssueRow
            key={issue.id}
            issue={issue}
            assigneeName={issue.assigneeId ? userNames[issue.assigneeId] : undefined}
            moveTargets={moveTargets}
            onMove={onMove}
            onDelete={onDelete}
            onOpen={onOpen}
          />
        ))}
        {issues.length === 0 ? <p className="sprint-panel-empty">이슈가 없습니다</p> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: BacklogPage.tsx 교체**

`src/features/jira/pages/BacklogPage.tsx` 전문 교체:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router";
import { Badge, Button, Spinner, TextField, useToast } from "@chanho/react";
import type { Issue, Sprint, User } from "../store/types";
import {
  completeSprint,
  createIssue,
  createSprint,
  deleteIssue,
  listIssues,
  listSprints,
  listUsers,
  startSprint,
  updateIssue,
} from "../store/jiraStore";
import { useIssueModal } from "../components/useIssueModal";
import { BacklogIssueRow, SprintPanel } from "../components/SprintPanel";
import type { MoveTarget } from "../components/SprintPanel";

export function BacklogPage() {
  const { projectId } = useParams();
  const [loading, setLoading] = useState(true);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const toast = useToast();

  const reload = useCallback(async () => {
    if (!projectId) return;
    const [sprintList, issueList] = await Promise.all([
      listSprints(projectId),
      listIssues(projectId), // order 오름차순
    ]);
    setSprints(sprintList);
    setIssues(issueList);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true); // projectId 전환 시 이전 프로젝트 잔상 방지
    void listUsers().then(setUsers);
    void reload();
  }, [reload]);

  const { openIssue, issueModal } = useIssueModal(reload);

  const userNames = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);

  // done 스프린트는 패널을 만들지 않는다 — active 먼저, planned 다음 (스펙 §4)
  const visibleSprints = useMemo(
    () => [
      ...sprints.filter((s) => s.state === "active"),
      ...sprints.filter((s) => s.state === "planned"),
    ],
    [sprints],
  );

  const moveTargets: MoveTarget[] = useMemo(
    () => [
      { sprintId: null, label: "백로그" },
      ...visibleSprints.map((s) => ({ sprintId: s.id, label: s.name })),
    ],
    [visibleSprints],
  );

  const backlogIssues = issues.filter((i) => i.sprintId === null);

  /** 스토어 액션 공통 래퍼: 성공/도메인 에러 Toast, 끝나면 항상 재조회 (스펙 §5) */
  const run = async (failTitle: string, successTitle: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toast({ title: successTitle, appearance: "success" });
    } catch (error) {
      toast({
        title: failTitle,
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reload();
  };

  const handleCreateIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run("이슈 생성 실패", "이슈를 생성했습니다", async () => {
      if (!projectId) throw new Error("프로젝트를 찾을 수 없습니다");
      await createIssue({ projectId, title: newTitle }); // sprintId 생략 = 백로그로 생성
      setNewTitle(""); // 성공했을 때만 입력 초기화
    });
  };

  const handleMove = (issue: Issue, sprintId: string | null) =>
    void run("이슈 이동 실패", "이슈를 이동했습니다", () => updateIssue(issue.id, { sprintId }));

  const handleDelete = (issue: Issue) =>
    void run("이슈 삭제 실패", `${issue.key} 이슈를 삭제했습니다`, () => deleteIssue(issue.id));

  if (loading) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="백로그 불러오는 중" />
      </div>
    );
  }

  return (
    <>
      <section className="backlog-page">
        <header className="backlog-page-header">
          <h2>백로그</h2>
          <Button
            variant="subtle"
            onClick={() =>
              void run("스프린트 생성 실패", "스프린트를 만들었습니다", () => {
                if (!projectId) throw new Error("프로젝트를 찾을 수 없습니다");
                return createSprint(projectId);
              })
            }
          >
            스프린트 만들기
          </Button>
        </header>

        {visibleSprints.map((sprint) => (
          <SprintPanel
            key={sprint.id}
            sprint={sprint}
            issues={issues.filter((i) => i.sprintId === sprint.id)}
            userNames={userNames}
            moveTargets={moveTargets}
            onStart={(s) => void run("스프린트 시작 실패", "스프린트를 시작했습니다", () => startSprint(s.id))}
            onComplete={(s) =>
              void run("스프린트 완료 실패", "스프린트를 완료했습니다", () => completeSprint(s.id))
            }
            onMove={handleMove}
            onDelete={handleDelete}
            onOpen={openIssue}
          />
        ))}

        <section className="sprint-panel" aria-label="백로그 목록">
          <header className="sprint-panel-header">
            <h3>백로그</h3>
            <Badge>{backlogIssues.length}</Badge>
          </header>
          <div className="sprint-panel-issues">
            {backlogIssues.map((issue) => (
              <BacklogIssueRow
                key={issue.id}
                issue={issue}
                assigneeName={issue.assigneeId ? userNames[issue.assigneeId] : undefined}
                moveTargets={moveTargets}
                onMove={handleMove}
                onDelete={handleDelete}
                onOpen={openIssue}
              />
            ))}
            {backlogIssues.length === 0 ? (
              <p className="sprint-panel-empty">백로그가 비어 있습니다</p>
            ) : null}
          </div>
          <form className="backlog-create-form" onSubmit={handleCreateIssue}>
            <TextField
              label="새 이슈 제목"
              placeholder="무엇을 해야 하나요?"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Button type="submit">만들기</Button>
          </form>
        </section>
      </section>
      {issueModal}
    </>
  );
}
```

주의: 빈 제목으로 "만들기"를 누르면 `createIssue`가 "이슈 제목을 입력하세요"를 throw하고 danger Toast로 표시된다 — 화면에서 별도 검증을 두지 않는다(§5 관례). 시작 버튼도 마찬가지로 스토어 throw("이미 진행 중인 스프린트가 있습니다")를 Toast description으로 그대로 보여준다.

- [ ] **Step 5: app.css에 백로그 스타일 추가**

`src/app/app.css` 끝에 추가:

```css
/* ── 백로그/스프린트 (W3) ───────────────────────────────── */

.backlog-page {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-300);
}

.backlog-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.backlog-page-header h2 {
  margin: 0;
  font-size: var(--chanho-font-size-400);
}

.sprint-panel {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-150);
  padding: var(--chanho-space-150);
  border-radius: var(--chanho-radius-large);
  background: var(--chanho-color-background-subtle);
}

.sprint-panel-header {
  display: flex;
  align-items: center;
  gap: var(--chanho-space-100);
}

.sprint-panel-header h3 {
  margin: 0;
  font-size: var(--chanho-font-size-200);
  font-weight: var(--chanho-font-weight-semibold);
  color: var(--chanho-color-text-subtle);
}

.sprint-panel-header > button {
  margin-left: auto;
}

.sprint-panel-issues {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-50);
}

.sprint-panel-empty {
  margin: 0;
  padding: var(--chanho-space-100);
  color: var(--chanho-color-text-subtle);
  font-size: var(--chanho-font-size-200);
}

.backlog-row {
  display: flex;
  align-items: center;
  gap: var(--chanho-space-100);
  padding: var(--chanho-space-100) var(--chanho-space-150);
  border: 1px solid var(--chanho-color-border-default);
  border-radius: var(--chanho-radius-medium);
  background: var(--chanho-color-background-surface);
  cursor: pointer;
}

.backlog-row:hover {
  background: var(--chanho-color-background-neutral-hovered);
}

.backlog-row-key {
  flex-shrink: 0;
  font-size: var(--chanho-font-size-100);
  color: var(--chanho-color-text-subtle);
}

.backlog-row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--chanho-font-size-200);
}

.backlog-create-form {
  display: flex;
  align-items: flex-end;
  gap: var(--chanho-space-100);
}

.backlog-create-form > div {
  flex: 1; /* TextField 래퍼가 남은 폭을 채운다 */
}
```

- [ ] **Step 6: GREEN 확인**

Run: `pnpm vitest run src/features/jira/pages/BacklogPage.test.tsx`
Expected: 6개 전부 PASS

- [ ] **Step 7: 전체 게이트 후 커밋**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 그린 (47 + 6 = 53개)

```bash
git add src/features/jira/components/SprintPanel.tsx src/features/jira/pages/BacklogPage.tsx src/features/jira/pages/BacklogPage.test.tsx src/app/app.css
git commit -m "W3: 백로그 화면 — 스프린트 패널·인라인 이슈 생성·Dropdown 이동/삭제"
```

---

### Task 3: IssueListPage — 테이블 + 필터바

W1 스텁을 교체한다. 프로젝트 전체 이슈 테이블(키/제목/상태/우선순위/담당자/생성일 — 상태·우선순위는 Lozenge, 담당자는 Avatar+이름) + 필터바(검색 TextField, 상태/우선순위/담당자 Select — "전체" 센티널 `"all"`). 필터가 바뀔 때마다 `listIssues(projectId, filter)` 재조회(스펙 §4). 행 클릭 → `?issue=` 모달.

**Files:**

- Modify: `src/features/jira/pages/IssueListPage.tsx` (W1 스텁 전체 교체)
- Modify: `src/app/app.css` (테이블 스타일 추가)
- Test: `src/features/jira/pages/IssueListPage.test.tsx`

**Interfaces:**

- Consumes:
  - Task 1의 `useIssueModal(onIssueChanged)` → `{ openIssue, issueModal }`
  - `listIssues(projectId, filter?: { text?; status?; priority?; assigneeId? })` — 각 필드 undefined면 조건 미적용, text는 제목·키 부분일치
  - `labels.ts`: `BOARD_STATUSES`, `STATUS_LABELS/STATUS_APPEARANCE/PRIORITY_LABELS/PRIORITY_APPEARANCE`
- Produces: 없음 (말단 화면)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/jira/pages/IssueListPage.test.tsx` 전문:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest } from "../store/jiraStore";

/** 현재 pathname+search를 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderIssues(initialPath = "/projects/p1/issues") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
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

describe("IssueListPage", () => {
  it("프로젝트 전체 이슈를 테이블로 렌더한다 — 상태·우선순위 Lozenge, 담당자 Avatar+이름", async () => {
    renderIssues();

    expect(await screen.findByText("ALM-1")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(9); // 헤더 1 + 시드 이슈 8

    // ALM-4 행: 할 일 / 보통 / 박준영 (Avatar + 이름)
    const row4 = screen.getByText("ALM-4").closest("tr")!;
    expect(within(row4).getByText("할 일")).toBeInTheDocument();
    expect(within(row4).getByText("보통")).toBeInTheDocument();
    expect(within(row4).getByRole("img", { name: "박준영" })).toBeInTheDocument();
    expect(within(row4).getByText("박준영")).toBeInTheDocument();

    // 미배정 이슈는 "미지정"
    const row7 = screen.getByText("ALM-7").closest("tr")!;
    expect(within(row7).getByText("미지정")).toBeInTheDocument();
  });

  it("텍스트+상태 조합 필터가 목록을 좁힌다 (스펙 §7)", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");

    // 텍스트 필터: "구현" 포함 = ALM-2·3·4·5·6
    await user.type(screen.getByLabelText("검색"), "구현");
    await waitFor(() => {
      expect(screen.queryByText("ALM-1")).not.toBeInTheDocument();
    });
    expect(screen.getByText("ALM-2")).toBeInTheDocument();

    // 상태 필터 추가: 할 일 → ALM-4·5·6만 남는다
    await user.click(screen.getByRole("combobox", { name: "상태" }));
    await user.click(await screen.findByRole("option", { name: "할 일" }));
    await waitFor(() => {
      expect(screen.queryByText("ALM-2")).not.toBeInTheDocument();
    });
    for (const key of ["ALM-4", "ALM-5", "ALM-6"]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
    expect(screen.queryByText("ALM-3")).not.toBeInTheDocument();
  });

  it("담당자 필터, 조건이 겹치면 빈 결과 문구를 보여준다", async () => {
    const user = userEvent.setup();
    renderIssues();
    await screen.findByText("ALM-1");

    // 담당자 = 박준영 → ALM-4만
    await user.click(screen.getByRole("combobox", { name: "담당자" }));
    await user.click(await screen.findByRole("option", { name: "박준영" }));
    await waitFor(() => {
      expect(screen.getAllByRole("row")).toHaveLength(2); // 헤더 + ALM-4
    });
    expect(screen.getByText("ALM-4")).toBeInTheDocument();

    // 우선순위 = 높음까지 겹치면 결과 없음 (ALM-4는 보통)
    await user.click(screen.getByRole("combobox", { name: "우선순위" }));
    await user.click(await screen.findByRole("option", { name: "높음" }));
    expect(await screen.findByText("조건에 맞는 이슈가 없습니다")).toBeInTheDocument();
  });

  it("행 클릭 → ?issue= 쿼리와 함께 상세 모달이 열린다", async () => {
    const user = userEvent.setup();
    renderIssues();

    await user.click(await screen.findByText("칸반 보드 UI 구현")); // ALM-2

    expect(await screen.findByRole("dialog", { name: "ALM-2" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/issues?issue=ALM-2");
  });
});
```

- [ ] **Step 2: RED 관찰**

Run: `pnpm vitest run src/features/jira/pages/IssueListPage.test.tsx`
Expected: 4개 전부 FAIL — 스텁은 "이슈 목록/필터는 W3에서 구현합니다"만 렌더하므로 `Unable to find an element with the text: ALM-1` 류의 실패.

- [ ] **Step 3: IssueListPage.tsx 교체**

`src/features/jira/pages/IssueListPage.tsx` 전문 교체:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Avatar, Lozenge, Select, Spinner, TextField } from "@chanho/react";
import type { Issue, IssuePriority, IssueStatus, User } from "../store/types";
import { listIssues, listUsers } from "../store/jiraStore";
import { useIssueModal } from "../components/useIssueModal";
import {
  BOARD_STATUSES,
  PRIORITY_APPEARANCE,
  PRIORITY_LABELS,
  STATUS_APPEARANCE,
  STATUS_LABELS,
} from "../components/labels";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → "전체"는 센티널
const ALL = "all";
const PRIORITIES: IssuePriority[] = ["high", "medium", "low"];

export function IssueListPage() {
  const { projectId } = useParams();
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [users, setUsers] = useState<User[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [assigneeId, setAssigneeId] = useState(ALL);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const list = await listIssues(projectId, {
      text: text.trim() || undefined,
      status: status === ALL ? undefined : (status as IssueStatus),
      priority: priority === ALL ? undefined : (priority as IssuePriority),
      assigneeId: assigneeId === ALL ? undefined : assigneeId,
    });
    setIssues(list);
  }, [projectId, text, status, priority, assigneeId]);

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);

  // 필터가 바뀔 때마다 스토어 재조회 — 화면에서 직접 거르지 않는다 (스펙 §4)
  useEffect(() => {
    void reload();
  }, [reload]);

  const { openIssue, issueModal } = useIssueModal(reload);

  const userNames = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);

  return (
    <>
      <section>
        <h2 className="board-title">이슈</h2>
        <div className="issue-filter-bar">
          <TextField
            label="검색"
            placeholder="제목·키 검색"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Select
            label="상태"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: ALL, label: "전체" },
              ...BOARD_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
            ]}
          />
          <Select
            label="우선순위"
            value={priority}
            onValueChange={setPriority}
            options={[
              { value: ALL, label: "전체" },
              ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
            ]}
          />
          <Select
            label="담당자"
            value={assigneeId}
            onValueChange={setAssigneeId}
            options={[
              { value: ALL, label: "전체" },
              ...users.map((u) => ({ value: u.id, label: u.name })),
            ]}
          />
        </div>
        {issues === null ? (
          <div className="board-loading">
            <Spinner size="large" label="이슈 불러오는 중" />
          </div>
        ) : (
          <table className="issue-table">
            <thead>
              <tr>
                <th>키</th>
                <th>제목</th>
                <th>상태</th>
                <th>우선순위</th>
                <th>담당자</th>
                <th>생성일</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id} onClick={() => openIssue(issue.key)}>
                  <td className="issue-table-key">{issue.key}</td>
                  <td>{issue.title}</td>
                  <td>
                    <Lozenge appearance={STATUS_APPEARANCE[issue.status]}>
                      {STATUS_LABELS[issue.status]}
                    </Lozenge>
                  </td>
                  <td>
                    <Lozenge appearance={PRIORITY_APPEARANCE[issue.priority]}>
                      {PRIORITY_LABELS[issue.priority]}
                    </Lozenge>
                  </td>
                  <td>
                    {issue.assigneeId ? (
                      <span className="issue-table-assignee">
                        <Avatar name={userNames[issue.assigneeId] ?? ""} size="small" />
                        {userNames[issue.assigneeId]}
                      </span>
                    ) : (
                      "미지정"
                    )}
                  </td>
                  <td>{new Date(issue.createdAt).toLocaleDateString("ko-KR")}</td>
                </tr>
              ))}
              {issues.length === 0 ? (
                <tr>
                  <td colSpan={6} className="issue-table-empty">
                    조건에 맞는 이슈가 없습니다
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </section>
      {issueModal}
    </>
  );
}
```

- [ ] **Step 4: app.css에 테이블 스타일 추가**

`src/app/app.css` 끝에 추가:

```css
/* ── 이슈 목록 (W3) ─────────────────────────────────────── */

.issue-filter-bar {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: var(--chanho-space-150);
  align-items: end;
  margin-bottom: var(--chanho-space-300);
}

.issue-table {
  width: 100%;
  border-collapse: collapse;
}

.issue-table th {
  padding: var(--chanho-space-100) var(--chanho-space-150);
  border-bottom: 2px solid var(--chanho-color-border-default);
  text-align: left;
  font-size: var(--chanho-font-size-100);
  color: var(--chanho-color-text-subtle);
}

.issue-table td {
  padding: var(--chanho-space-100) var(--chanho-space-150);
  border-bottom: 1px solid var(--chanho-color-border-default);
  font-size: var(--chanho-font-size-200);
}

.issue-table tbody tr {
  cursor: pointer;
}

.issue-table tbody tr:hover {
  background: var(--chanho-color-background-neutral-hovered);
}

.issue-table-key {
  white-space: nowrap;
  color: var(--chanho-color-text-subtle);
}

.issue-table-assignee {
  display: inline-flex;
  align-items: center;
  gap: var(--chanho-space-100);
}

.issue-table-empty {
  text-align: center;
  color: var(--chanho-color-text-subtle);
}
```

- [ ] **Step 5: GREEN 확인**

Run: `pnpm vitest run src/features/jira/pages/IssueListPage.test.tsx`
Expected: 4개 전부 PASS

- [ ] **Step 6: 전체 게이트 후 커밋**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 그린 (53 + 4 = 57개)

```bash
git add src/features/jira/pages/IssueListPage.tsx src/features/jira/pages/IssueListPage.test.tsx src/app/app.css
git commit -m "W3: 이슈 목록 화면 — 테이블 + 검색/상태/우선순위/담당자 필터"
```

---

### Task 4: IssueDetailModal 확장 — 코멘트/활동 Tabs + 빈 제목 blur Toast

모달 하단에 Tabs를 추가한다(스펙 §4). 코멘트 탭: 목록(작성자 이름 + 본문 + 시각) + 작성 폼(TextArea + Button). 활동 탭: `listActivity` 자동 로그를 시간순으로(actor는 유저 이름). 빈 본문 코멘트는 스토어 throw → danger Toast. W2 인계: 빈 제목으로 blur하면 조용히 무시하는 대신 "제목을 입력하세요" 정보 Toast.

**Files:**

- Modify: `src/features/jira/components/IssueDetailModal.tsx`
- Modify: `src/app/app.css` (탭/코멘트/활동 스타일 추가)
- Test: `src/features/jira/components/IssueDetailModal.test.tsx` (describe 추가)

**Interfaces:**

- Consumes:
  - `Tabs({ label, items: { value; label; content }[] })` — 디자인시스템, 비활성 탭 콘텐츠는 언마운트
  - 스토어: `listComments(issueId): Promise<Comment[]>`(createdAt 오름차순), `addComment(issueId, body): Promise<Comment>`(빈 본문 throw "코멘트 내용을 입력하세요", 작성자는 현재 유저 u1), `listActivity(issueId): Promise<Activity[]>`(at 오름차순)
  - 활동로그는 스토어 부수효과(스펙 §2.3) — 모달은 상태 변경 후 `listActivity`만 다시 부르면 된다
- Produces: `IssueDetailModalProps`는 변경 없음 (`issueKey/onClose/onIssueChanged`) — Task 1의 useIssueModal이 그대로 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/jira/components/IssueDetailModal.test.tsx` 파일 끝에 describe 추가 (기존 5개 테스트와 렌더 헬퍼는 그대로 둔다):

```tsx
describe("IssueDetailModal 코멘트/활동 탭 (W3)", () => {
  it("코멘트 탭: 시드 코멘트가 작성자 이름과 함께 보이고, 작성하면 목록에 반영된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-2"); // 시드: 코멘트 2개 (김찬호/이서연)

    const dialog = await screen.findByRole("dialog", { name: "ALM-2" });
    // 코멘트 탭이 기본 활성 (첫 항목)
    expect(await within(dialog).findByRole("tab", { name: "코멘트 (2)" })).toBeInTheDocument();
    const comments = within(dialog).getByTestId("issue-comments");
    expect(
      within(comments).getByText("드래그 라이브러리는 @dnd-kit로 확정했습니다."),
    ).toBeInTheDocument();
    expect(within(comments).getByText("이서연")).toBeInTheDocument();

    // 작성 → 현재 유저(김찬호) 명의로 목록에 추가, 입력 초기화
    await user.type(within(comments).getByLabelText("코멘트"), "리뷰 완료했습니다");
    await user.click(within(comments).getByRole("button", { name: "코멘트 남기기" }));
    expect(await within(comments).findByText("리뷰 완료했습니다")).toBeInTheDocument();
    expect(within(comments).getAllByText("김찬호")).toHaveLength(2); // 시드 1 + 새 코멘트
    expect(within(comments).getByLabelText("코멘트")).toHaveValue("");
  });

  it("빈 코멘트 제출은 스토어가 거부하고 danger Toast를 보여준다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    const comments = await within(dialog).findByTestId("issue-comments");
    await user.click(within(comments).getByRole("button", { name: "코멘트 남기기" }));

    expect(await screen.findByText("코멘트 내용을 입력하세요")).toBeInTheDocument();
  });

  it("활동 탭: 상태 변경이 유저 이름과 함께 자동 로그로 보인다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4"); // 시드: todo

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    // 상태 변경 (활동로그는 스토어 부수효과로 기록된다)
    await user.click(within(dialog).getByRole("combobox", { name: "상태" }));
    await user.click(await screen.findByRole("option", { name: "완료" }));
    await waitFor(() => {
      expect(within(dialog).getByTestId("issue-status-lozenge")).toHaveTextContent("완료");
    });

    // 활동 탭으로 전환 → created + status 로그가 시간순으로 보인다
    await user.click(within(dialog).getByRole("tab", { name: "활동" }));
    const activity = await within(dialog).findByTestId("issue-activity");
    expect(within(activity).getByText("이슈 생성")).toBeInTheDocument();
    expect(within(activity).getByText(/할 일 → 완료/)).toBeInTheDocument();
    // actor는 유저 이름으로 표시 (u1 = 김찬호)
    expect(within(activity).getAllByText("김찬호").length).toBeGreaterThanOrEqual(2);
  });

  it("빈 제목으로 blur하면 정보 Toast를 띄우고 기존 제목을 유지한다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await user.click(within(dialog).getByRole("button", { name: "백로그 화면 구현" }));
    await user.clear(within(dialog).getByLabelText("제목"));
    await user.tab(); // blur

    expect(await screen.findByText("제목을 입력하세요")).toBeInTheDocument();
    // 저장되지 않고 기존 제목으로 복귀
    expect(
      await within(dialog).findByRole("button", { name: "백로그 화면 구현" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED 관찰**

Run: `pnpm vitest run src/features/jira/components/IssueDetailModal.test.tsx`
Expected: 기존 5개 PASS + 신규 4개 FAIL — `Unable to find an accessible element with the role "tab"`, `Unable to find an element by: [data-testid="issue-comments"]`, 빈 제목 테스트는 `Unable to find an element with the text: 제목을 입력하세요`.

- [ ] **Step 3: IssueDetailModal.tsx 확장**

`src/features/jira/components/IssueDetailModal.tsx` 전문 교체:

```tsx
import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import {
  Avatar,
  Button,
  Lozenge,
  Modal,
  Select,
  Tabs,
  TextArea,
  TextField,
  useToast,
} from "@chanho/react";
import type {
  Activity,
  Comment,
  Issue,
  IssuePriority,
  IssueStatus,
  Sprint,
  User,
} from "../store/types";
import {
  addComment,
  getIssueByKey,
  listActivity,
  listComments,
  listSprints,
  listUsers,
  updateIssue,
} from "../store/jiraStore";
import { BOARD_STATUSES, PRIORITY_LABELS, STATUS_APPEARANCE, STATUS_LABELS } from "./labels";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → null은 센티널로 표현
const UNASSIGNED = "unassigned";
const BACKLOG = "backlog";
const PRIORITIES: IssuePriority[] = ["high", "medium", "low"];

export interface IssueDetailModalProps {
  /** "ALM-1" 형식 이슈 키 (?issue= 쿼리 값) */
  issueKey: string;
  /** 모달 닫기 = URL 쿼리 제거 */
  onClose: () => void;
  /** 저장 성공 후 페이지 재조회 (모달을 연 채 목록 반영) */
  onIssueChanged: () => void | Promise<void>;
}

export function IssueDetailModal({ issueKey, onClose, onIssueChanged }: IssueDetailModalProps) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const toast = useToast();

  /** 코멘트·활동 재조회 — 속성 저장/코멘트 작성 후 호출 (활동로그는 스토어 부수효과) */
  const refreshLogs = async (issueId: string) => {
    const [commentList, activityList] = await Promise.all([
      listComments(issueId),
      listActivity(issueId),
    ]);
    setComments(commentList);
    setActivities(activityList);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await getIssueByKey(issueKey);
      if (cancelled) return;
      if (!found) {
        toast({ title: `이슈를 찾을 수 없습니다: ${issueKey}`, appearance: "danger" });
        onClose();
        return;
      }
      const [userList, sprintList, commentList, activityList] = await Promise.all([
        listUsers(),
        listSprints(found.projectId),
        listComments(found.id),
        listActivity(found.id),
      ]);
      if (cancelled) return;
      setIssue(found);
      setDescriptionDraft(found.description);
      setUsers(userList);
      setSprints(sprintList);
      setComments(commentList);
      setActivities(activityList);
    })();
    return () => {
      cancelled = true;
    };
    // issueKey가 바뀔 때만 재조회 (toast/onClose는 재조회 트리거가 아니다)
  }, [issueKey]);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "알 수 없음";
  const formatDateTime = (iso: string) => new Date(iso).toLocaleString("ko-KR");

  const applyPatch = async (
    patch: Partial<
      Pick<Issue, "title" | "description" | "status" | "priority" | "assigneeId" | "sprintId">
    >,
    successTitle: string,
  ) => {
    if (!issue) return;
    try {
      const updated = await updateIssue(issue.id, patch);
      setIssue(updated);
      await refreshLogs(updated.id); // 상태 등 변경 → 활동 탭 즉시 반영
      await onIssueChanged();
      toast({ title: successTitle, appearance: "success" });
    } catch (error) {
      toast({
        title: "저장 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur(); // 저장은 blur 핸들러 한 곳에서만
  };

  const handleTitleBlur = async () => {
    setEditingTitle(false);
    if (!issue) return;
    const next = titleDraft.trim();
    if (!next) {
      // W2 인계: 조용한 무시 대신 정보 Toast로 피드백
      toast({ title: "제목을 입력하세요", appearance: "info" });
      return;
    }
    if (next === issue.title) return; // 변경 없음 → 저장 안 함
    await applyPatch({ title: next }, "제목을 저장했습니다");
  };

  const handleDescriptionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await applyPatch({ description: descriptionDraft }, "설명을 저장했습니다");
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!issue) return;
    try {
      await addComment(issue.id, commentDraft); // 빈 본문은 스토어가 throw
      setCommentDraft("");
      await refreshLogs(issue.id);
      toast({ title: "코멘트를 남겼습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "코멘트 작성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  if (!issue) return null;

  return (
    <Modal
      trigger={<span hidden />} // URL 쿼리로 여는 모달 — 트리거는 사용하지 않는다 (Modal.trigger가 필수 prop)
      title={issue.key}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      className="issue-detail-modal"
    >
      <div className="issue-detail-body">
        <div className="issue-detail-main">
          {editingTitle ? (
            <TextField
              label="제목"
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
            />
          ) : (
            <button
              type="button"
              className="issue-title-button"
              onClick={() => {
                setTitleDraft(issue.title);
                setEditingTitle(true);
              }}
            >
              {issue.title}
            </button>
          )}
          <form className="issue-description-form" onSubmit={handleDescriptionSubmit}>
            <TextArea
              label="설명"
              rows={5}
              placeholder="이슈 설명을 입력하세요"
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
            />
            <Button type="submit" size="small" disabled={descriptionDraft === issue.description}>
              설명 저장
            </Button>
          </form>
        </div>
        <aside className="issue-props">
          <Lozenge appearance={STATUS_APPEARANCE[issue.status]} data-testid="issue-status-lozenge">
            {STATUS_LABELS[issue.status]}
          </Lozenge>
          <Select
            label="상태"
            value={issue.status}
            options={BOARD_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            onValueChange={(v) => void applyPatch({ status: v as IssueStatus }, "상태를 변경했습니다")}
          />
          <Select
            label="담당자"
            value={issue.assigneeId ?? UNASSIGNED}
            options={[
              { value: UNASSIGNED, label: "미지정" },
              ...users.map((u) => ({ value: u.id, label: u.name })),
            ]}
            onValueChange={(v) =>
              void applyPatch({ assigneeId: v === UNASSIGNED ? null : v }, "담당자를 변경했습니다")
            }
          />
          <Select
            label="우선순위"
            value={issue.priority}
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
            onValueChange={(v) =>
              void applyPatch({ priority: v as IssuePriority }, "우선순위를 변경했습니다")
            }
          />
          <Select
            label="스프린트"
            value={issue.sprintId ?? BACKLOG}
            options={[
              { value: BACKLOG, label: "백로그" },
              // 완료된 스프린트는 선택지에서 제외하되, 현재 값이면 표시를 위해 포함
              ...sprints
                .filter((s) => s.state !== "done" || s.id === issue.sprintId)
                .map((s) => ({ value: s.id, label: s.name })),
            ]}
            onValueChange={(v) =>
              void applyPatch({ sprintId: v === BACKLOG ? null : v }, "스프린트를 변경했습니다")
            }
          />
        </aside>
      </div>
      <Tabs
        label="이슈 기록"
        className="issue-tabs"
        items={[
          {
            value: "comments",
            label: `코멘트 (${comments.length})`,
            content: (
              <div className="issue-comments" data-testid="issue-comments">
                {comments.map((comment) => (
                  <div key={comment.id} className="issue-comment">
                    <Avatar name={userName(comment.authorId)} size="small" />
                    <div>
                      <p className="issue-comment-meta">
                        <strong>{userName(comment.authorId)}</strong> ·{" "}
                        {formatDateTime(comment.createdAt)}
                      </p>
                      <p className="issue-comment-body">{comment.body}</p>
                    </div>
                  </div>
                ))}
                {comments.length === 0 ? (
                  <p className="issue-comment-empty">아직 코멘트가 없습니다</p>
                ) : null}
                <form className="issue-comment-form" onSubmit={handleCommentSubmit}>
                  <TextArea
                    label="코멘트"
                    rows={3}
                    placeholder="코멘트를 입력하세요"
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                  />
                  <Button type="submit" size="small">
                    코멘트 남기기
                  </Button>
                </form>
              </div>
            ),
          },
          {
            value: "activity",
            label: "활동",
            content: (
              <ul className="issue-activity" data-testid="issue-activity">
                {activities.map((activity) => (
                  <li key={activity.id}>
                    <strong>{userName(activity.actorId)}</strong> — {activity.detail}
                    <span className="issue-activity-time">{formatDateTime(activity.at)}</span>
                  </li>
                ))}
              </ul>
            ),
          },
        ]}
      />
    </Modal>
  );
}
```

기존 대비 변경: import에 `Avatar/Tabs` + `addComment/listComments/listActivity` + `Activity/Comment` 타입 추가, `comments/activities/commentDraft` 상태 추가, 로드 effect가 코멘트·활동도 함께 조회, `refreshLogs` 헬퍼, `applyPatch` 성공 시 `refreshLogs` 호출, `handleTitleBlur` 빈 제목 정보 Toast, `handleCommentSubmit`, Modal children 끝에 Tabs. 나머지(제목/설명/속성 패널)는 그대로.

- [ ] **Step 4: app.css에 탭/코멘트/활동 스타일 추가**

`src/app/app.css` 끝에 추가:

```css
/* ── 이슈 상세 코멘트/활동 탭 (W3) ──────────────────────── */

.issue-tabs {
  margin-top: var(--chanho-space-300);
}

.issue-comments {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-150);
  padding-top: var(--chanho-space-150);
}

.issue-comment {
  display: flex;
  gap: var(--chanho-space-100);
}

.issue-comment-meta {
  margin: 0;
  font-size: var(--chanho-font-size-100);
  color: var(--chanho-color-text-subtle);
}

.issue-comment-body {
  margin: var(--chanho-space-50) 0 0;
  font-size: var(--chanho-font-size-200);
  white-space: pre-wrap;
}

.issue-comment-empty {
  margin: 0;
  color: var(--chanho-color-text-subtle);
  font-size: var(--chanho-font-size-200);
}

.issue-comment-form {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-100);
}

.issue-comment-form button {
  align-self: flex-start;
}

.issue-activity {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-100);
  margin: 0;
  padding: var(--chanho-space-150) 0 0;
  list-style: none;
}

.issue-activity li {
  font-size: var(--chanho-font-size-200);
}

.issue-activity-time {
  margin-left: var(--chanho-space-100);
  font-size: var(--chanho-font-size-100);
  color: var(--chanho-color-text-subtle);
}
```

- [ ] **Step 5: GREEN 확인 (기존 모달 테스트 포함 무회귀)**

Run: `pnpm vitest run src/features/jira/components/IssueDetailModal.test.tsx`
Expected: 9개 전부 PASS (기존 5 + 신규 4)

- [ ] **Step 6: 전체 게이트 후 커밋**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 전부 그린 (57 + 4 = 61개)

```bash
git add src/features/jira/components/IssueDetailModal.tsx src/features/jira/components/IssueDetailModal.test.tsx src/app/app.css
git commit -m "W3: 이슈 상세 코멘트/활동 Tabs + 빈 제목 blur 안내 Toast"
```

---

## 완료 기준 (스펙 §6 W3 범위 대조)

- [ ] 백로그/스프린트: 생성·시작·완료, 이슈 배치(Dropdown) — Task 2
- [ ] 이슈 목록: 검색/상태/우선순위/담당자 필터 — Task 3
- [ ] 코멘트/활동로그 Tabs — Task 4
- [ ] `?issue=` 모달이 세 페이지(보드/백로그/이슈)에서 모두 열린다 — Task 1~3
- [ ] 스펙 §7 화면 테스트: 이슈 생성 흐름(Task 2), 필터 동작(Task 3) 커버
- [ ] `pnpm typecheck && pnpm test && pnpm build` 전부 그린 (61개 테스트)

이 계획이 끝나면 지라 클론 MVP(스펙 §1 풀코스)가 완성된다. 남은 후속(범위 외): 백엔드 연동, Keycloak, 컨플루언스 클론.
