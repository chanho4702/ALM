# W2: 칸반 보드 + 이슈 상세 모달 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 활성 스프린트 이슈를 3컬럼 칸반 보드로 렌더하고 @dnd-kit 드래그로 이동시키며, `?issue=ALM-1` 쿼리로 열리는 이슈 상세 모달에서 제목/설명/속성(상태·담당자·우선순위·스프린트)을 편집한다.

**Architecture:** W1에서 완성된 `jiraStore.ts`(17함수)와 라우팅/JiraLayout 위에 BoardPage를 교체 구현한다. 드래그 종료 시 moveIssue 파라미터(status/beforeId) 계산은 순수함수 `resolveMove`로 분리해 단위 테스트하고(드래그 시뮬레이션 금지 — 스펙 §7), 화면은 항상 스토어 재조회로 동기화한다. 모달은 URL 쿼리 기반이라 공유 가능하고, 저장 성공 시 보드를 재조회해 모달을 연 채로 카드에 반영한다.

**Tech Stack:** Vite 7 + React 19 + TypeScript(strict) + react-router 7 + @chanho/react(디자인시스템 tarball) + @dnd-kit(core/sortable/utilities, 이번 태스크에서 설치) + Vitest/RTL

## Global Constraints

- 작업 디렉터리: `C:\MSA_TEMPLATE\alm-front` (모든 명령은 여기서 실행, 패키지 매니저는 pnpm)
- UI는 100% 디자인시스템(@chanho/react) — MUI 등 타 UI 라이브러리 금지 (스펙 §2.1)
- 색상·간격 하드코딩 금지 — 스타일은 `src/app/app.css` 단일 파일에 `--chanho-*` 토큰 변수만 사용 (기존 관례: JiraLayout 스타일도 app.css)
- 화면은 `jiraStore.ts`의 async 함수만 호출한다. 스토어 내부 구조에 의존 금지 (스펙 §2.3)
- 에러는 스토어가 한국어 메시지로 throw → 화면은 Toast(danger)로 표시 (스펙 §5)
- 디자인시스템 매핑: status→Lozenge(neutral/info/success), assignee→Avatar, 액션 피드백→Toast (스펙 §3)
- 드래그 상호작용 자체는 jsdom 테스트 금지 — `resolveMove` 순수함수 단위 테스트 + 브라우저 수동 확인으로 갈음 (스펙 §7)
- 코멘트/활동 Tabs는 W3 범위 — 이번에 절대 넣지 않는다 (YAGNI)
- 게이트: `pnpm typecheck` && `pnpm test` && `pnpm build` — 각 태스크 커밋 전 전부 그린
- TDD: 실패하는 테스트를 먼저 쓰고 RED를 **실제로 관찰**한 뒤 구현한다
- 커밋: main 브랜치 직접 커밋, 한국어 커밋 메시지, push는 컨트롤러가 한다

## 파일 구조 (W2에서 만들거나 바꾸는 것)

```
src/features/jira/
├── components/
│   ├── labels.ts              # [신규] 상태/우선순위 라벨·Lozenge 매핑 상수 (화면 공용)
│   ├── IssueCard.tsx          # [신규] 이슈 카드 (표시 전용) + SortableIssueCard (드래그 래퍼)
│   ├── BoardColumn.tsx        # [신규] 보드 컬럼 (droppable + SortableContext)
│   └── IssueDetailModal.tsx   # [신규] 이슈 상세 모달 (?issue= 쿼리)
├── pages/
│   ├── BoardPage.tsx          # [교체] W1 스텁 → 칸반 보드
│   ├── BoardPage.test.tsx     # [신규] 컬럼별 렌더 / EmptyState
│   ├── boardDnd.ts            # [신규] resolveMove 순수함수 (드래그→moveIssue 파라미터)
│   └── boardDnd.test.ts       # [신규] resolveMove 단위 테스트
├── components/IssueDetailModal.test.tsx  # [신규] 모달 흐름 테스트
└── store/jiraStore.ts         # [주석 1줄 추가] moveIssue stale beforeId 의도 문서화
src/app/app.css                # [확장] 보드/카드/모달 스타일 (토큰 변수만)
package.json                   # [수정] @dnd-kit 3개 패키지 추가
```

디자인시스템 실제 API (소스 확인 완료 — `C:\MSA_TEMPLATE\design-system\packages\react\src\`):

- `Lozenge`: `appearance?: "neutral" | "info" | "success" | "warning" | "danger"` (기본 neutral). span에 rest 전파 → `data-testid` 가능
- `Avatar`: `name: string`(필수), `size?: "small" | "medium" | "large"`. src 없으면 이니셜, `role="img" aria-label={name}`
- `Badge`: `appearance?: "neutral" | "brand" | "danger"`
- `Select`: `label`(필수, 트리거와 자동 연결 → `getByRole("combobox", { name })`), `options: { value; label; disabled? }[]`, `value`, `onValueChange(value: string)`. **Radix 기반이라 option value에 빈 문자열 금지** → null 표현은 센티널 값 사용
- `Modal`: `trigger: ReactElement`(**필수** — URL로 여는 모달은 `<span hidden />` 더미 전달), `title: string`(dialog 접근명), `open?/onOpenChange?`, `className`은 콘텐츠 패널에 병합(기본 폭 `min(480px, 100vw-32px)`)
- `TextField`/`TextArea`: `label`(필수) + 네이티브 input/textarea props 전파 (`onBlur`, `onKeyDown`, `rows` 등)
- `Button`: `variant?: "primary" | "subtle" | "danger"`, `size?: "medium" | "small"`, 기본 `type="button"`
- `useToast()`: `toast({ title, description?, appearance?: "info" | "success" | "danger" })` — ToastProvider는 main.tsx/테스트 헬퍼에 이미 있음

우선순위 표시 결정(아이콘 패키지 없음 → Lozenge + 한국어 라벨): Lozenge에 subtle appearance가 없어서 **high=danger(빨강), medium=warning(주황), low=neutral(회색)** 로 매핑한다 — 지라 원본 색 언어(빨강/주황/회색)와 일치하고 3단계가 시각적으로 구분된다.

---

### Task 1: @dnd-kit 설치 + 보드 정적 렌더 (3컬럼·카드·EmptyState)

드래그 없이 활성 스프린트 이슈를 상태별 3컬럼으로 렌더한다. 활성 스프린트가 없으면 백로그로 유도하는 EmptyState.

**Files:**

- Modify: `package.json` (@dnd-kit 3개 추가 — pnpm이 자동 수정)
- Create: `src/features/jira/components/labels.ts`
- Create: `src/features/jira/components/IssueCard.tsx`
- Create: `src/features/jira/components/BoardColumn.tsx`
- Modify: `src/features/jira/pages/BoardPage.tsx` (W1 스텁 전체 교체)
- Modify: `src/app/app.css` (보드 스타일 추가)
- Test: `src/features/jira/pages/BoardPage.test.tsx`

**Interfaces:**

- Consumes (W1 스토어, 시그니처 그대로):
  - `listSprints(projectId: string): Promise<Sprint[]>`
  - `listIssues(projectId: string, filter?): Promise<Issue[]>` — order 오름차순 정렬 반환
  - `listUsers(): Promise<User[]>`
  - 시드: 프로젝트 `p1`(ALM), 스프린트 `s1`(active), s1 이슈 5개 — todo: ALM-4·ALM-5 / inprogress: ALM-2·ALM-3 / done: ALM-1, 백로그 3개(ALM-6~8)
- Produces (Task 2·3이 사용):
  - `labels.ts`: `STATUS_LABELS: Record<IssueStatus, string>`, `STATUS_APPEARANCE: Record<IssueStatus, LozengeAppearance>`, `PRIORITY_LABELS: Record<IssuePriority, string>`, `PRIORITY_APPEARANCE: Record<IssuePriority, LozengeAppearance>`, `BOARD_STATUSES: IssueStatus[]`
  - `IssueCard.tsx`: `IssueCardProps { issue: Issue; assigneeName?: string }`, `function IssueCard(props: IssueCardProps)`
  - `BoardColumn.tsx`: `BoardColumnProps { status: IssueStatus; issues: Issue[]; userNames: Record<string, string> }`, `function BoardColumn(props: BoardColumnProps)` — 컬럼 `<section aria-label={라벨} data-testid="board-column-{status}">`
  - `BoardPage`: 내부에 `reload()` 재조회 콜백 보유 (Task 2·3에서 드래그/모달 저장 후 호출)

- [ ] **Step 1: @dnd-kit 설치**

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: `package.json` dependencies에 `"@dnd-kit/core"`, `"@dnd-kit/sortable"`, `"@dnd-kit/utilities"`가 캐럿(^) 최신 버전으로 추가. 이 태스크에서는 아직 import하지 않는다(Task 2에서 사용).

- [ ] **Step 2: 실패하는 테스트 작성**

`src/features/jira/pages/BoardPage.test.tsx` 전문:

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "../../../app/App";
import { __resetForTest, completeSprint } from "../store/jiraStore";

function renderBoard(initialPath = "/projects/p1/board") {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("BoardPage", () => {
  it("활성 스프린트의 이슈만 상태별 3컬럼으로 렌더한다", async () => {
    renderBoard();

    // 컬럼별 카드 배치 (시드 기준)
    const todo = await screen.findByRole("region", { name: "할 일" });
    expect(within(todo).getByText("ALM-4")).toBeInTheDocument();
    expect(within(todo).getByText("ALM-5")).toBeInTheDocument();

    const inprogress = screen.getByRole("region", { name: "진행 중" });
    expect(within(inprogress).getByText("ALM-2")).toBeInTheDocument();
    expect(within(inprogress).getByText("ALM-3")).toBeInTheDocument();

    const done = screen.getByRole("region", { name: "완료" });
    expect(within(done).getByText("ALM-1")).toBeInTheDocument();

    // 백로그 이슈(sprintId=null)는 보드에 없다
    expect(screen.queryByText("ALM-6")).not.toBeInTheDocument();
    expect(screen.queryByText("ALM-7")).not.toBeInTheDocument();
    expect(screen.queryByText("ALM-8")).not.toBeInTheDocument();

    // 카드 구성: 제목 · 우선순위 Lozenge(한국어 라벨) · 담당자 Avatar
    expect(within(todo).getByText("백로그 화면 구현")).toBeInTheDocument(); // ALM-4 제목
    expect(within(todo).getByText("보통")).toBeInTheDocument(); // ALM-4 medium
    expect(within(todo).getByText("낮음")).toBeInTheDocument(); // ALM-5 low
    expect(within(todo).getByRole("img", { name: "박준영" })).toBeInTheDocument(); // ALM-4 담당자
    expect(within(done).getByText("높음")).toBeInTheDocument(); // ALM-1 high
  });

  it("활성 스프린트가 없으면 백로그로 유도하는 EmptyState를 보여준다", async () => {
    await completeSprint("s1"); // 시드의 활성 스프린트를 종료시킨다 (첫 호출이 시드도 생성)
    renderBoard();

    expect(
      await screen.findByRole("heading", { name: "진행 중인 스프린트가 없습니다" }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "백로그로 이동" });
    expect(link).toHaveAttribute("href", "/projects/p1/backlog");
    // 컬럼은 렌더되지 않는다
    expect(screen.queryByRole("region", { name: "할 일" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: RED 확인**

```bash
pnpm test src/features/jira/pages/BoardPage.test.tsx
```

Expected: FAIL 2건 — `Unable to find role="region" and name "할 일"` (W1 스텁은 "칸반 보드는 W2에서 구현합니다"만 렌더), `Unable to find role="heading" ... "진행 중인 스프린트가 없습니다"`.

- [ ] **Step 4: 구현**

`src/features/jira/components/labels.ts` 전문 (신규):

```ts
import type { LozengeProps } from "@chanho/react";
import type { IssuePriority, IssueStatus } from "../store/types";

type LozengeAppearance = NonNullable<LozengeProps["appearance"]>;

/** 상태 한국어 라벨 (칸반 컬럼 제목 겸용) */
export const STATUS_LABELS: Record<IssueStatus, string> = {
  todo: "할 일",
  inprogress: "진행 중",
  done: "완료",
};

/** 스펙 §3 매핑: status → Lozenge neutral/info/success */
export const STATUS_APPEARANCE: Record<IssueStatus, LozengeAppearance> = {
  todo: "neutral",
  inprogress: "info",
  done: "success",
};

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

/** 아이콘 패키지가 없어 우선순위는 Lozenge 색으로 구분한다 (지라 색 언어: 빨강/주황/회색) */
export const PRIORITY_APPEARANCE: Record<IssuePriority, LozengeAppearance> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

/** 보드 컬럼 순서 */
export const BOARD_STATUSES: IssueStatus[] = ["todo", "inprogress", "done"];
```

`src/features/jira/components/IssueCard.tsx` 전문 (신규):

```tsx
import { Avatar, Lozenge } from "@chanho/react";
import type { Issue } from "../store/types";
import { PRIORITY_APPEARANCE, PRIORITY_LABELS } from "./labels";

export interface IssueCardProps {
  issue: Issue;
  /** 담당자 이름. 미지정이면 undefined → Avatar 생략 */
  assigneeName?: string;
}

export function IssueCard({ issue, assigneeName }: IssueCardProps) {
  return (
    <article className="issue-card">
      <p className="issue-card-title">{issue.title}</p>
      <div className="issue-card-meta">
        <span className="issue-card-key">{issue.key}</span>
        <Lozenge appearance={PRIORITY_APPEARANCE[issue.priority]}>
          {PRIORITY_LABELS[issue.priority]}
        </Lozenge>
        {assigneeName ? <Avatar name={assigneeName} size="small" /> : null}
      </div>
    </article>
  );
}
```

`src/features/jira/components/BoardColumn.tsx` 전문 (신규):

```tsx
import { Badge } from "@chanho/react";
import type { Issue, IssueStatus } from "../store/types";
import { IssueCard } from "./IssueCard";
import { STATUS_LABELS } from "./labels";

export interface BoardColumnProps {
  status: IssueStatus;
  /** 이 컬럼의 이슈 (order 오름차순) */
  issues: Issue[];
  /** userId → 이름 (Avatar용) */
  userNames: Record<string, string>;
}

export function BoardColumn({ status, issues, userNames }: BoardColumnProps) {
  const label = STATUS_LABELS[status];
  return (
    <section className="board-column" aria-label={label} data-testid={`board-column-${status}`}>
      <header className="board-column-header">
        <h3>{label}</h3>
        <Badge>{issues.length}</Badge>
      </header>
      <div className="board-column-cards">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            assigneeName={issue.assigneeId ? userNames[issue.assigneeId] : undefined}
          />
        ))}
      </div>
    </section>
  );
}
```

`src/features/jira/pages/BoardPage.tsx` 전문 (W1 스텁 전체 교체):

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Button, Spinner } from "@chanho/react";
import type { Issue, Sprint, User } from "../store/types";
import { listIssues, listSprints, listUsers } from "../store/jiraStore";
import { BoardColumn } from "../components/BoardColumn";
import { BOARD_STATUSES } from "../components/labels";

export function BoardPage() {
  const { projectId } = useParams();
  /** undefined = 로딩 중, null = 활성 스프린트 없음 */
  const [sprint, setSprint] = useState<Sprint | null | undefined>(undefined);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const reload = useCallback(async () => {
    if (!projectId) return;
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

  const userNames = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.name])),
    [users],
  );

  if (sprint === undefined) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="보드 불러오는 중" />
      </div>
    );
  }

  if (sprint === null) {
    return (
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
  }

  return (
    <section>
      <h2 className="board-title">{sprint.name}</h2>
      <div className="board-columns">
        {BOARD_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            issues={issues.filter((i) => i.status === status)}
            userNames={userNames}
          />
        ))}
      </div>
    </section>
  );
}
```

`src/app/app.css` — 파일 끝에 추가:

```css
/* ── 칸반 보드 (W2) ─────────────────────────────────────── */

.board-loading {
  display: flex;
  justify-content: center;
  padding: var(--chanho-space-600);
}

.board-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--chanho-space-200);
  padding: var(--chanho-space-600) 0;
  text-align: center;
}

.board-empty h2 {
  margin: 0;
}

.board-empty p {
  margin: 0;
  color: var(--chanho-color-text-subtle);
}

.board-title {
  margin: 0 0 var(--chanho-space-300);
  font-size: var(--chanho-font-size-400);
}

.board-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--chanho-space-200);
  align-items: start;
}

.board-column {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-150);
  padding: var(--chanho-space-150);
  border-radius: var(--chanho-radius-large);
  background: var(--chanho-color-background-subtle);
}

.board-column-header {
  display: flex;
  align-items: center;
  gap: var(--chanho-space-100);
}

.board-column-header h3 {
  margin: 0;
  font-size: var(--chanho-font-size-200);
  font-weight: var(--chanho-font-weight-semibold);
  color: var(--chanho-color-text-subtle);
}

.board-column-cards {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-100);
  min-height: 60px; /* 빈 컬럼도 드롭 영역 확보 (Task 2) */
}

.issue-card {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-100);
  padding: var(--chanho-space-150);
  border: 1px solid var(--chanho-color-border-default);
  border-radius: var(--chanho-radius-medium);
  background: var(--chanho-color-background-surface);
  cursor: grab;
}

.issue-card-title {
  margin: 0;
  font-size: var(--chanho-font-size-200);
}

.issue-card-meta {
  display: flex;
  align-items: center;
  gap: var(--chanho-space-100);
}

.issue-card-key {
  margin-right: auto;
  font-size: var(--chanho-font-size-100);
  color: var(--chanho-color-text-subtle);
}

.board-empty a {
  text-decoration: none;
}
```

- [ ] **Step 5: GREEN 확인**

```bash
pnpm test src/features/jira/pages/BoardPage.test.tsx
```

Expected: PASS 2건.

- [ ] **Step 6: 게이트 전체**

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: 전부 성공. 기존 28개 테스트 + 신규 2개 = 30개 그린. (App.test의 "새 프로젝트 생성 후 이동" 테스트는 스프린트 없는 새 프로젝트 보드로 가는데, 이제 EmptyState가 렌더된다 — 해당 테스트는 location/스위처만 단언하므로 영향 없음. 깨지면 원인 파악 후 보고.)

- [ ] **Step 7: 커밋**

```bash
git add package.json pnpm-lock.yaml src/features/jira/components/labels.ts src/features/jira/components/IssueCard.tsx src/features/jira/components/BoardColumn.tsx src/features/jira/pages/BoardPage.tsx src/features/jira/pages/BoardPage.test.tsx src/app/app.css
git commit -m "W2: 칸반 보드 정적 렌더 — 3컬럼·이슈 카드·활성 스프린트 없음 EmptyState"
```

---

### Task 2: 드래그 배선 (@dnd-kit + resolveMove + moveIssue 재조회)

드래그 종료 이벤트를 `moveIssue(id, { status, beforeId? })` 호출로 변환한다. 변환 로직은 순수함수 `resolveMove`로 분리해 단위 테스트한다 (jsdom 드래그 시뮬레이션 금지 — 스펙 §7). W1 리뷰 인계인 moveIssue의 stale beforeId 의도 주석도 여기서 단다.

**Files:**

- Create: `src/features/jira/pages/boardDnd.ts`
- Test: `src/features/jira/pages/boardDnd.test.ts`
- Modify: `src/features/jira/components/IssueCard.tsx` (SortableIssueCard 추가)
- Modify: `src/features/jira/components/BoardColumn.tsx` (useDroppable + SortableContext)
- Modify: `src/features/jira/pages/BoardPage.tsx` (DndContext + DragOverlay + onDragEnd)
- Modify: `src/features/jira/store/jiraStore.ts:301` 부근 (주석 1줄 — 코드 변경 없음)

**Interfaces:**

- Consumes:
  - Task 1의 `BOARD_STATUSES`, `IssueCard`/`IssueCardProps`, `BoardColumn`, `reload()`
  - 스토어: `moveIssue(id: string, to: { status: IssueStatus; beforeId?: string }): Promise<Issue>` — beforeId 앞으로 order 재계산, stale beforeId는 조용히 맨 끝 추가 (order 재계산 로직은 W1 스토어 테스트가 커버)
  - @dnd-kit 표준 API만: `DndContext`, `useSensor`, `useSensors`, `PointerSensor`, `closestCorners`, `DragOverlay`, `SortableContext`, `verticalListSortingStrategy`, `useSortable`, `useDroppable`, `CSS`(utilities)
- Produces:
  - `boardDnd.ts`: `interface MoveTarget { status: IssueStatus; beforeId?: string }`, `function resolveMove(activeId: string, overId: string, columns: Record<IssueStatus, string[]>): MoveTarget | null`
  - `IssueCard.tsx`: `function SortableIssueCard(props: IssueCardProps)` — useSortable 래퍼 (Task 3도 이 형태 유지)

- [ ] **Step 1: 실패하는 단위 테스트 작성**

`src/features/jira/pages/boardDnd.test.ts` 전문:

```ts
import { describe, expect, it } from "vitest";
import { resolveMove } from "./boardDnd";

// status → order순 이슈 id 배열
const columns = {
  todo: ["a", "b", "c"],
  inprogress: ["d"],
  done: [] as string[],
};

describe("resolveMove — 드래그 결과를 moveIssue 파라미터로 변환", () => {
  it("같은 컬럼에서 위로 이동: over 카드 앞에 삽입", () => {
    expect(resolveMove("c", "a", columns)).toEqual({ status: "todo", beforeId: "a" });
  });

  it("같은 컬럼에서 아래로 이동: over 카드 다음 카드 앞에 삽입", () => {
    expect(resolveMove("a", "b", columns)).toEqual({ status: "todo", beforeId: "c" });
  });

  it("같은 컬럼 맨 아래로 이동: beforeId 없이 맨 끝 추가", () => {
    expect(resolveMove("a", "c", columns)).toEqual({ status: "todo", beforeId: undefined });
  });

  it("다른 컬럼의 카드 위에 드롭: 그 카드 앞에 삽입", () => {
    expect(resolveMove("a", "d", columns)).toEqual({ status: "inprogress", beforeId: "d" });
  });

  it("빈 컬럼 영역에 드롭: 해당 status로 맨 끝 추가", () => {
    expect(resolveMove("a", "done", columns)).toEqual({ status: "done" });
  });

  it("카드가 있는 다른 컬럼의 빈 영역에 드롭: 맨 끝 추가", () => {
    expect(resolveMove("a", "inprogress", columns)).toEqual({ status: "inprogress" });
  });

  it("자기 자신 위에 드롭하면 null (이동 없음)", () => {
    expect(resolveMove("a", "a", columns)).toBeNull();
  });

  it("이미 그 컬럼 맨 끝인 카드를 컬럼 영역에 드롭하면 null", () => {
    expect(resolveMove("c", "todo", columns)).toBeNull();
  });

  it("모르는 overId면 null", () => {
    expect(resolveMove("a", "unknown", columns)).toBeNull();
  });
});
```

- [ ] **Step 2: RED 확인**

```bash
pnpm test src/features/jira/pages/boardDnd.test.ts
```

Expected: FAIL — `Failed to resolve import "./boardDnd"` (모듈 없음).

- [ ] **Step 3: resolveMove 구현**

`src/features/jira/pages/boardDnd.ts` 전문 (신규):

```ts
import type { IssueStatus } from "../store/types";
import { BOARD_STATUSES } from "../components/labels";

export interface MoveTarget {
  status: IssueStatus;
  beforeId?: string;
}

/**
 * 드래그 종료(active를 over 위에 드롭)를 moveIssue 파라미터로 변환한다.
 *
 * @param activeId 드래그한 이슈 id
 * @param overId   드롭 대상 id — 이슈 id 또는 컬럼 droppable id(= IssueStatus 문자열)
 * @param columns  status → order순 이슈 id 배열 (드래그 시작 시점의 보드 상태)
 * @returns 이동이 불필요하면(제자리) null
 */
export function resolveMove(
  activeId: string,
  overId: string,
  columns: Record<IssueStatus, string[]>,
): MoveTarget | null {
  if (activeId === overId) return null;

  // 컬럼 영역 자체에 드롭 → 그 컬럼 맨 끝에 추가
  if ((BOARD_STATUSES as string[]).includes(overId)) {
    const status = overId as IssueStatus;
    const ids = columns[status];
    if (ids[ids.length - 1] === activeId) return null; // 이미 맨 끝
    return { status };
  }

  const overStatus = BOARD_STATUSES.find((s) => columns[s].includes(overId));
  if (!overStatus) return null;

  const overIndex = columns[overStatus].indexOf(overId);
  const activeIndex = columns[overStatus].indexOf(activeId);

  if (activeIndex !== -1 && activeIndex < overIndex) {
    // 같은 컬럼에서 아래로: over 자리를 차지하려면 over 다음 카드 앞에 삽입
    // (over가 마지막이면 beforeId=undefined → 맨 끝)
    return { status: overStatus, beforeId: columns[overStatus][overIndex + 1] };
  }
  // 같은 컬럼에서 위로, 또는 컬럼 간 이동: over 카드 앞에 삽입
  return { status: overStatus, beforeId: overId };
}
```

- [ ] **Step 4: GREEN 확인**

```bash
pnpm test src/features/jira/pages/boardDnd.test.ts
```

Expected: PASS 9건.

- [ ] **Step 5: 드래그 배선 (컴포넌트 3개 수정)**

`src/features/jira/components/IssueCard.tsx` 전문 (SortableIssueCard 추가):

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, Lozenge } from "@chanho/react";
import type { Issue } from "../store/types";
import { PRIORITY_APPEARANCE, PRIORITY_LABELS } from "./labels";

export interface IssueCardProps {
  issue: Issue;
  /** 담당자 이름. 미지정이면 undefined → Avatar 생략 */
  assigneeName?: string;
}

export function IssueCard({ issue, assigneeName }: IssueCardProps) {
  return (
    <article className="issue-card">
      <p className="issue-card-title">{issue.title}</p>
      <div className="issue-card-meta">
        <span className="issue-card-key">{issue.key}</span>
        <Lozenge appearance={PRIORITY_APPEARANCE[issue.priority]}>
          {PRIORITY_LABELS[issue.priority]}
        </Lozenge>
        {assigneeName ? <Avatar name={assigneeName} size="small" /> : null}
      </div>
    </article>
  );
}

/**
 * useSortable 래퍼. DragOverlay에는 래핑 없는 IssueCard를 써야 한다
 * (같은 id로 useSortable을 두 번 등록하면 안 되기 때문).
 */
export function SortableIssueCard(props: IssueCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.issue.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <IssueCard {...props} />
    </div>
  );
}
```

`src/features/jira/components/BoardColumn.tsx` 전문 (droppable + SortableContext):

```tsx
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@chanho/react";
import type { Issue, IssueStatus } from "../store/types";
import { SortableIssueCard } from "./IssueCard";
import { STATUS_LABELS } from "./labels";

export interface BoardColumnProps {
  status: IssueStatus;
  /** 이 컬럼의 이슈 (order 오름차순) */
  issues: Issue[];
  /** userId → 이름 (Avatar용) */
  userNames: Record<string, string>;
}

export function BoardColumn({ status, issues, userNames }: BoardColumnProps) {
  const label = STATUS_LABELS[status];
  // 컬럼 droppable id = status 문자열 → resolveMove가 컬럼 드롭을 인식한다
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <section className="board-column" aria-label={label} data-testid={`board-column-${status}`}>
      <header className="board-column-header">
        <h3>{label}</h3>
        <Badge>{issues.length}</Badge>
      </header>
      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="board-column-cards">
          {issues.map((issue) => (
            <SortableIssueCard
              key={issue.id}
              issue={issue}
              assigneeName={issue.assigneeId ? userNames[issue.assigneeId] : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
```

`src/features/jira/pages/BoardPage.tsx` 전문 (DndContext 배선):

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
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

  // 클릭과 드래그 구분: 5px 이상 움직여야 드래그 시작 (Task 3의 카드 클릭 열기 대비)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reload = useCallback(async () => {
    if (!projectId) return;
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

  if (sprint === undefined) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="보드 불러오는 중" />
      </div>
    );
  }

  if (sprint === null) {
    return (
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
  }

  return (
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
            />
          ))}
        </div>
        <DragOverlay>
          {activeIssue ? (
            <IssueCard
              issue={activeIssue}
              assigneeName={activeIssue.assigneeId ? userNames[activeIssue.assigneeId] : undefined}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
```

- [ ] **Step 6: moveIssue stale beforeId 의도 주석 (W1 리뷰 인계 — 코드 변경 아님)**

`src/features/jira/store/jiraStore.ts`의 moveIssue 내부, 아래 두 줄 사이에 주석을 추가한다:

변경 전 (현재 301~302행 부근):

```ts
  const insertAt = to.beforeId ? column.findIndex((i) => i.id === to.beforeId) : -1;
  if (insertAt === -1) column.push(issue);
```

변경 후:

```ts
  const insertAt = to.beforeId ? column.findIndex((i) => i.id === to.beforeId) : -1;
  // beforeId가 대상 컬럼에 없으면(드래그 중 다른 곳에서 옮겨진 stale 참조 등) 조용히 맨 끝에
  // 추가한다 — 의도된 동작. 화면은 이동 후 항상 재조회하므로 최종 상태는 일관된다. (W1 리뷰 인계)
  if (insertAt === -1) column.push(issue);
```

- [ ] **Step 7: 게이트 전체 (드래그 배선 회귀 확인)**

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: 전부 성공. BoardPage.test.tsx의 기존 2건도 그대로 그린이어야 한다 (DndContext/useSortable은 jsdom에서 렌더만으로는 문제 없음). 총 39건(30 + resolveMove 9).

- [ ] **Step 8: 브라우저 수동 확인 (스펙 §7 — 드래그는 수동확인으로 갈음)**

`pnpm dev` 실행 후 브라우저에서: 같은 컬럼 내 순서 변경 / 컬럼 간 이동 / 빈 완료 컬럼으로 이동 / 새로고침 후 유지(localStorage) 확인. 에이전트 실행 환경에서 불가하면 커밋 메시지에 "드래그 수동확인은 컨트롤러 몫"임을 남기고 컨트롤러에게 보고한다.

- [ ] **Step 9: 커밋**

```bash
git add src/features/jira/pages/boardDnd.ts src/features/jira/pages/boardDnd.test.ts src/features/jira/components/IssueCard.tsx src/features/jira/components/BoardColumn.tsx src/features/jira/pages/BoardPage.tsx src/features/jira/store/jiraStore.ts
git commit -m "W2: 보드 드래그 이동 배선 — @dnd-kit + resolveMove 순수함수, moveIssue stale beforeId 의도 주석"
```

---

### Task 3: IssueDetailModal (?issue= 쿼리, 제목/설명/속성 편집, 보드 반영)

`?issue=ALM-1` 쿼리로 열리는 상세 모달. 제목 인라인 편집(클릭→TextField→blur/Enter 저장), 설명 TextArea(저장 버튼), 우측 속성 패널(상태/담당자/우선순위/스프린트 Select). 저장 성공/실패 Toast, 저장 후 보드 재조회(모달 연 채 카드 반영). 모달 닫기 = 쿼리 제거. **코멘트/활동 Tabs는 W3 — 넣지 않는다.**

**Files:**

- Create: `src/features/jira/components/IssueDetailModal.tsx`
- Modify: `src/features/jira/components/IssueCard.tsx` (onOpen 클릭 추가)
- Modify: `src/features/jira/components/BoardColumn.tsx` (onOpenIssue 전달)
- Modify: `src/features/jira/pages/BoardPage.tsx` (useSearchParams + 모달 렌더)
- Modify: `src/app/app.css` (모달 스타일 추가)
- Test: `src/features/jira/components/IssueDetailModal.test.tsx`

**Interfaces:**

- Consumes:
  - Task 1 `labels.ts`: `STATUS_LABELS`, `STATUS_APPEARANCE`, `PRIORITY_LABELS`, `BOARD_STATUSES`
  - Task 2 `SortableIssueCard(props: IssueCardProps)`, BoardPage의 `reload()`
  - 스토어: `getIssueByKey(key: string): Promise<Issue | null>`, `updateIssue(id, patch: Partial<Pick<Issue, "title" | "description" | "status" | "priority" | "assigneeId" | "sprintId">>): Promise<Issue>`, `listUsers()`, `listSprints(projectId)`
- Produces:
  - `IssueDetailModal.tsx`:
    ```ts
    export interface IssueDetailModalProps {
      issueKey: string;                            // "ALM-1" — ?issue= 쿼리 값
      onClose: () => void;                         // 모달 닫기 = 쿼리 제거
      onIssueChanged: () => void | Promise<void>;  // 저장 성공 후 보드 재조회
    }
    export function IssueDetailModal(props: IssueDetailModalProps): JSX.Element | null
    ```
  - `IssueCardProps`에 `onOpen?: () => void` 추가, `BoardColumnProps`에 `onOpenIssue?: (key: string) => void` 추가 (W3의 IssueListPage도 이 모달을 재사용할 수 있는 형태)
  - Radix 제약: Select option value에 빈 문자열 금지 → 센티널 `"unassigned"`(담당자 없음), `"backlog"`(스프린트 없음) ↔ `null` 변환

- [ ] **Step 1: 실패하는 테스트 작성**

`src/features/jira/components/IssueDetailModal.test.tsx` 전문:

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

function renderBoard(initialPath: string) {
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

describe("IssueDetailModal", () => {
  it("?issue= 쿼리로 모달이 열리고, 상태 변경이 Lozenge와 보드 카드에 반영된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4"); // 시드: ALM-4 = todo, 보통, 박준영

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    expect(within(dialog).getByRole("button", { name: "백로그 화면 구현" })).toBeInTheDocument();
    expect(within(dialog).getByTestId("issue-status-lozenge")).toHaveTextContent("할 일");
    expect(within(dialog).getByLabelText("설명")).toBeInTheDocument();

    // 상태 Select: 할 일 → 완료
    await user.click(within(dialog).getByRole("combobox", { name: "상태" }));
    await user.click(await screen.findByRole("option", { name: "완료" }));

    // 모달 Lozenge 반영
    await waitFor(() => {
      expect(within(dialog).getByTestId("issue-status-lozenge")).toHaveTextContent("완료");
    });
    // 모달을 연 채로 보드 카드가 완료 컬럼으로 이동 (모달 뒤 보드는 aria-hidden이라 testid로 조회)
    await waitFor(() => {
      expect(within(screen.getByTestId("board-column-done")).getByText("ALM-4")).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId("board-column-todo")).queryByText("ALM-4"),
    ).not.toBeInTheDocument();
  });

  it("제목 인라인 편집: 클릭 → 입력 → Enter로 저장하고 보드 카드에도 반영된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await user.click(within(dialog).getByRole("button", { name: "백로그 화면 구현" }));
    const field = within(dialog).getByLabelText("제목");
    await user.clear(field);
    await user.type(field, "백로그 화면 구현 (2차){Enter}");

    // 모달에 저장된 제목으로 복귀
    expect(
      await within(dialog).findByRole("button", { name: "백로그 화면 구현 (2차)" }),
    ).toBeInTheDocument();
    // 보드 카드에도 반영
    await waitFor(() => {
      expect(
        within(screen.getByTestId("board-column-todo")).getByText("백로그 화면 구현 (2차)"),
      ).toBeInTheDocument();
    });
  });

  it("보드 카드를 클릭하면 ?issue= 쿼리와 함께 모달이 열린다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board");

    const todo = await screen.findByRole("region", { name: "할 일" });
    await user.click(within(todo).getByText("백로그 화면 구현"));

    expect(await screen.findByRole("dialog", { name: "ALM-4" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/board?issue=ALM-4");
  });

  it("모달을 닫으면 ?issue 쿼리가 제거된다", async () => {
    const user = userEvent.setup();
    renderBoard("/projects/p1/board?issue=ALM-4");

    const dialog = await screen.findByRole("dialog", { name: "ALM-4" });
    await user.click(within(dialog).getByRole("button", { name: "닫기" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("location")).toHaveTextContent(/\/projects\/p1\/board$/);
  });
});
```

- [ ] **Step 2: RED 확인**

```bash
pnpm test src/features/jira/components/IssueDetailModal.test.tsx
```

Expected: FAIL 4건 — `Unable to find role="dialog"` (모달 미구현), 카드 클릭 테스트는 dialog 미출현.

- [ ] **Step 3: IssueDetailModal 구현**

`src/features/jira/components/IssueDetailModal.tsx` 전문 (신규):

```tsx
import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button, Lozenge, Modal, Select, TextArea, TextField, useToast } from "@chanho/react";
import type { Issue, IssuePriority, IssueStatus, Sprint, User } from "../store/types";
import { getIssueByKey, listSprints, listUsers, updateIssue } from "../store/jiraStore";
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
  /** 저장 성공 후 보드 재조회 (모달을 연 채 카드 반영) */
  onIssueChanged: () => void | Promise<void>;
}

export function IssueDetailModal({ issueKey, onClose, onIssueChanged }: IssueDetailModalProps) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const toast = useToast();

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
      const [userList, sprintList] = await Promise.all([listUsers(), listSprints(found.projectId)]);
      if (cancelled) return;
      setIssue(found);
      setDescriptionDraft(found.description);
      setUsers(userList);
      setSprints(sprintList);
    })();
    return () => {
      cancelled = true;
    };
    // issueKey가 바뀔 때만 재조회 (toast/onClose는 재조회 트리거가 아니다)
  }, [issueKey]);

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
    if (!next || next === issue.title) return; // 빈 제목·변경 없음 → 저장 안 함
    await applyPatch({ title: next }, "제목을 저장했습니다");
  };

  const handleDescriptionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await applyPatch({ description: descriptionDraft }, "설명을 저장했습니다");
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
    </Modal>
  );
}
```

- [ ] **Step 4: 보드 배선 (카드 클릭 열기 + 모달 렌더) + CSS**

`src/features/jira/components/IssueCard.tsx` 전문 (onOpen 추가):

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, Lozenge } from "@chanho/react";
import type { Issue } from "../store/types";
import { PRIORITY_APPEARANCE, PRIORITY_LABELS } from "./labels";

export interface IssueCardProps {
  issue: Issue;
  /** 담당자 이름. 미지정이면 undefined → Avatar 생략 */
  assigneeName?: string;
  /** 카드 클릭 시 (이슈 상세 열기). PointerSensor distance 5로 드래그와 구분된다 */
  onOpen?: () => void;
}

export function IssueCard({ issue, assigneeName, onOpen }: IssueCardProps) {
  return (
    <article className="issue-card" onClick={onOpen}>
      <p className="issue-card-title">{issue.title}</p>
      <div className="issue-card-meta">
        <span className="issue-card-key">{issue.key}</span>
        <Lozenge appearance={PRIORITY_APPEARANCE[issue.priority]}>
          {PRIORITY_LABELS[issue.priority]}
        </Lozenge>
        {assigneeName ? <Avatar name={assigneeName} size="small" /> : null}
      </div>
    </article>
  );
}

/**
 * useSortable 래퍼. DragOverlay에는 래핑 없는 IssueCard를 써야 한다
 * (같은 id로 useSortable을 두 번 등록하면 안 되기 때문).
 */
export function SortableIssueCard(props: IssueCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.issue.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <IssueCard {...props} />
    </div>
  );
}
```

`src/features/jira/components/BoardColumn.tsx` 전문 (onOpenIssue 추가):

```tsx
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@chanho/react";
import type { Issue, IssueStatus } from "../store/types";
import { SortableIssueCard } from "./IssueCard";
import { STATUS_LABELS } from "./labels";

export interface BoardColumnProps {
  status: IssueStatus;
  /** 이 컬럼의 이슈 (order 오름차순) */
  issues: Issue[];
  /** userId → 이름 (Avatar용) */
  userNames: Record<string, string>;
  /** 카드 클릭 시 이슈 상세 열기 */
  onOpenIssue?: (key: string) => void;
}

export function BoardColumn({ status, issues, userNames, onOpenIssue }: BoardColumnProps) {
  const label = STATUS_LABELS[status];
  // 컬럼 droppable id = status 문자열 → resolveMove가 컬럼 드롭을 인식한다
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <section className="board-column" aria-label={label} data-testid={`board-column-${status}`}>
      <header className="board-column-header">
        <h3>{label}</h3>
        <Badge>{issues.length}</Badge>
      </header>
      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="board-column-cards">
          {issues.map((issue) => (
            <SortableIssueCard
              key={issue.id}
              issue={issue}
              assigneeName={issue.assigneeId ? userNames[issue.assigneeId] : undefined}
              onOpen={onOpenIssue ? () => onOpenIssue(issue.key) : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
```

`src/features/jira/pages/BoardPage.tsx` 전문 (useSearchParams + 모달):

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";
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
import { IssueDetailModal } from "../components/IssueDetailModal";
import { BOARD_STATUSES } from "../components/labels";
import { resolveMove } from "./boardDnd";

export function BoardPage() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  /** ?issue=ALM-1 → 상세 모달 (URL 공유 가능) */
  const issueKey = searchParams.get("issue");

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
      {issueKey ? (
        <IssueDetailModal
          key={issueKey} // 키가 바뀌면 모달 내부 상태 초기화
          issueKey={issueKey}
          onClose={closeIssue}
          onIssueChanged={reload}
        />
      ) : null}
    </>
  );
}
```

`src/app/app.css` — 파일 끝에 추가:

```css
/* ── 이슈 상세 모달 (W2) ────────────────────────────────── */

/* Modal 기본 폭(480px) 확장 — 클래스 중복으로 명시도를 올려 모듈 CSS를 확실히 이긴다 */
.issue-detail-modal.issue-detail-modal {
  width: min(720px, calc(100vw - 32px));
}

.issue-detail-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 200px;
  gap: var(--chanho-space-300);
  margin-top: var(--chanho-space-200);
}

.issue-detail-main {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-200);
  min-width: 0;
}

.issue-title-button {
  margin: 0;
  padding: var(--chanho-space-50) var(--chanho-space-100);
  border: 1px solid transparent;
  border-radius: var(--chanho-radius-medium);
  background: transparent;
  font: inherit;
  font-size: var(--chanho-font-size-300);
  font-weight: var(--chanho-font-weight-semibold);
  color: var(--chanho-color-text-default);
  text-align: left;
  cursor: text;
}

.issue-title-button:hover {
  background: var(--chanho-color-background-neutral-hovered);
}

.issue-description-form {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-100);
}

.issue-description-form button {
  align-self: flex-start;
}

.issue-props {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--chanho-space-150);
}

.issue-props > div {
  width: 100%; /* Select 필드(div 래퍼)는 패널 폭에 맞춘다 (Lozenge는 span이라 영향 없음) */
}
```

- [ ] **Step 5: GREEN 확인**

```bash
pnpm test src/features/jira/components/IssueDetailModal.test.tsx
```

Expected: PASS 4건. (Radix Select/Dialog 상호작용 패턴은 App.test.tsx의 스위처 테스트에서 이미 검증된 방식과 동일하다. 모달이 열리면 Radix가 바깥을 aria-hidden 처리하므로 보드 단언은 반드시 `getByTestId("board-column-…")` + `getByText`로 한다 — role 조회 금지.)

- [ ] **Step 6: 게이트 전체**

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: 전부 성공. 총 43건(39 + 신규 4).

- [ ] **Step 7: 커밋**

```bash
git add src/features/jira/components/IssueDetailModal.tsx src/features/jira/components/IssueDetailModal.test.tsx src/features/jira/components/IssueCard.tsx src/features/jira/components/BoardColumn.tsx src/features/jira/pages/BoardPage.tsx src/app/app.css
git commit -m "W2: 이슈 상세 모달 — ?issue= 쿼리로 열기, 제목 인라인·설명·속성 편집, 보드 실시간 반영"
```

---

## 남은 스펙 항목 (W2 범위 밖 — 하지 않는다)

- 코멘트/활동 Tabs → W3 (스펙 §6)
- 백로그/스프린트 화면, 이슈 목록/필터 → W3
- 리다이렉트 search 보존(`Navigate to={{pathname, search}}`): W1 인계 사항이지만 "필요해지는 경우에만" 적용 조건부 — 현재 catch-all 리다이렉트는 잘못된 URL 진입 시에만 발동하고 `?issue=` 공유 URL은 정상 경로(`/projects/:id/board?issue=`)로 들어오므로 W2에서는 불필요. 적용하지 않는다.
