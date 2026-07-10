# ALM Front W1 — 파운데이션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지라 클론의 W1 — Vite+TS 스캐폴드, 디자인 시스템 tarball 소비, jiraStore 전체(스펙 §5의 17개 함수 + 시드 + 테스트), JiraLayout·라우팅·프로젝트 생성/전환 — 을 완성한다.

**Architecture:** 화면은 `jiraStore.ts`의 async 함수만 호출한다(백엔드 교체 지점). 저장은 localStorage 단일 키 `alm.jira.v1` + 모듈 메모리 캐시. 활동로그는 updateIssue/moveIssue의 부수효과로 자동 기록된다. W1에서 스토어를 전부 완성해 W2(보드)/W3(백로그·목록)는 순수 UI 웨이브가 된다.

**Tech Stack:** Vite 7, React 19, TypeScript strict, react-router 7(단일 패키지), @chanho/react 0.2.0 + @chanho/tokens 0.1.0 (tarball), Vitest 3 + jsdom + Testing Library, pnpm 독립 워크스페이스.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-06-jira-clone-design.md` — 스토어 시그니처는 §5를 글자 그대로 따른다
- 앱 루트: `C:\MSA_TEMPLATE\alm-front` (모든 명령은 이 디렉터리에서 실행)
- **UI는 100% 디자인 시스템** — `@chanho/react`·`@chanho/tokens`만 사용, MUI 등 타 UI 라이브러리 금지
- 라우터: `react-router` ^7 단일 패키지 — `react-router-dom` 설치 금지
- `@dnd-kit`는 W2에서 설치 — W1에서 추가 금지 (YAGNI)
- localStorage 키: `alm.jira.v1` 단일 (JSON 직렬화)
- 도메인 규칙 위반은 **한국어 메시지로 throw** — 화면은 Toast(danger)로 표시
- 이슈 키는 프로젝트별 시퀀스, 삭제돼도 번호 재사용 금지
- 활동로그는 스토어 부수효과 — 화면 코드는 기록 로직을 모른다
- 상태 라벨 매핑: todo=할 일, inprogress=진행 중, done=완료 / 우선순위: high=높음, medium=보통, low=낮음
- 게이트: `pnpm typecheck`(tsc --noEmit) + `pnpm test`(vitest run) + `pnpm build`(vite build) 전부 그린인 상태로만 커밋
- git: main 브랜치 직접 커밋, 커밋 메시지 한국어 `feat(scope): ...`. **push는 하지 않는다** (컨트롤러 담당)

---

### Task 1: 스캐폴드 + 게이트 그린

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `index.html`, `.gitignore`
- Create: `src/app/main.tsx`, `src/app/App.tsx`, `src/app/app.css`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `C:\MSA_TEMPLATE\design-system\artifacts\chanho-react-0.2.0.tgz`, `chanho-tokens-0.1.0.tgz` (존재 확인 완료)
- Produces: `pnpm dev/typecheck/test/build` 스크립트, jsdom+Radix 폴리필 테스트 환경, `App` 컴포넌트(Task 4에서 라우터 버전으로 교체)

- [ ] **Step 1: 설정 파일 8개 작성**

`package.json`:

```json
{
  "name": "alm-front",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "vite build"
  },
  "dependencies": {
    "@chanho/react": "file:../design-system/artifacts/chanho-react-0.2.0.tgz",
    "@chanho/tokens": "file:../design-system/artifacts/chanho-tokens-0.1.0.tgz",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^26.0.0",
    "typescript": "~5.7.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0"
  }
}
```

`pnpm-workspace.yaml` (examples/consumer 패턴 미러 — overrides가 @chanho/react 내부의 tokens 의존도 tarball로 강제한다):

```yaml
packages:
  - "."
allowBuilds:
  esbuild: true
overrides:
  "@chanho/tokens": "file:../design-system/artifacts/chanho-tokens-0.1.0.tgz"
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts", "vitest.setup.ts"]
}
```

`vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
```

`vitest.config.ts` (design-system `packages/react/vitest.config.ts` 미러):

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    css: true,
  },
});
```

`vitest.setup.ts` (design-system 미러 — Radix 컴포넌트가 쓰는 API 중 jsdom에 없는 것들의 폴리필):

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  window.HTMLElement.prototype.releasePointerCapture = () => {};
}
```

`index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ALM</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/app/main.tsx"></script>
  </body>
</html>
```

`.gitignore`:

```
node_modules/
dist/
```

- [ ] **Step 2: 의존성 설치**

Run: `pnpm install`
Expected: 에러 없이 완료. `node_modules/@chanho/react/package.json`의 version이 `0.2.0`인지 확인.

- [ ] **Step 3: 실패 스모크 테스트 작성**

`src/app/App.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App 스모크", () => {
  it("디자인 시스템 Button과 함께 렌더링된다", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "ALM" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "시작" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: RED 확인**

Run: `pnpm vitest run src/app/App.test.tsx`
Expected: FAIL — `Failed to resolve import "./App"` (App 미구현)

- [ ] **Step 5: 앱 셸 구현 (Task 1 버전 — Task 4에서 라우터 버전으로 교체)**

`src/app/App.tsx`:

```tsx
import { Button } from "@chanho/react";

export function App() {
  return (
    <main>
      <h1>ALM</h1>
      <Button>시작</Button>
    </main>
  );
}
```

`src/app/main.tsx` (CSS 로드 순서: tokens → react 스타일 → 앱 로컬):

```tsx
import "@chanho/tokens/css";
import "@chanho/react/styles.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/app/app.css` (토큰 변수 사용 — Task 4에서 레이아웃 규칙 추가):

```css
body {
  margin: 0;
  font-family: var(--chanho-font-family-sans);
  color: var(--chanho-color-text-default);
  background: var(--chanho-color-background-default);
}
```

- [ ] **Step 6: GREEN 확인**

Run: `pnpm vitest run src/app/App.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 7: 게이트 전체 확인**

Run: `pnpm typecheck` → 에러 0
Run: `pnpm test` → 1 passed
Run: `pnpm build` → `dist/` 생성, tokens css가 번들에 포함되어 빌드 성공

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(app): Vite+TS 스캐폴드 및 디자인 시스템 tarball 소비 구성"
```

---

### Task 2: jiraStore 파트 1 — 타입·저장 계층·시드·users/projects

**Files:**
- Create: `src/features/jira/store/types.ts`
- Create: `src/mock/users.ts`, `src/mock/seed.ts`
- Create: `src/features/jira/store/jiraStore.ts`
- Test: `src/features/jira/store/jiraStore.projects.test.ts`

**Interfaces:**
- Consumes: Task 1의 테스트 환경(jsdom은 localStorage를 기본 제공)
- Produces (Task 3·4가 그대로 사용):
  - 타입: `User`, `Project`, `Sprint`, `IssueStatus`, `IssuePriority`, `Issue`, `Comment`, `Activity`, `JiraData`
  - `MOCK_USERS: User[]` (4명, u1~u4), `CURRENT_USER_ID = "u1"`, `createSeedData(): JiraData`
  - `listUsers(): Promise<User[]>` / `getCurrentUser(): Promise<User>` / `listProjects(): Promise<Project[]>` / `createProject(input: { key: string; name: string }): Promise<Project>`
  - `__resetForTest(): void` (테스트 전용 — 메모리 캐시만 초기화)
  - 모듈 내부(비공개): `load()`, `persist()`, `clone()`, `nextId()` — Task 3의 함수들이 재사용

- [ ] **Step 1: 도메인 타입 작성** — `src/features/jira/store/types.ts` (스펙 §3 그대로 + 저장 루트 `JiraData`)

```ts
export interface User {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  key: string; // "ALM" 같은 대문자 접두어
  name: string;
  createdAt: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string; // "Sprint N" 자동 명명
  state: "planned" | "active" | "done";
  startedAt?: string;
  completedAt?: string;
}

export type IssueStatus = "todo" | "inprogress" | "done";
export type IssuePriority = "high" | "medium" | "low";

export interface Issue {
  id: string;
  key: string; // "ALM-1", 불변, 재사용 금지
  projectId: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  reporterId: string;
  sprintId: string | null; // null = 백로그
  order: number; // 컬럼/목록 내 정렬
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  issueId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  issueId: string;
  actorId: string;
  type: "created" | "status" | "assignee" | "priority" | "sprint";
  detail: string; // 예: "할 일 → 진행 중"
  at: string;
}

/** localStorage `alm.jira.v1`에 저장되는 루트 구조 */
export interface JiraData {
  users: User[];
  projects: Project[];
  sprints: Sprint[];
  issues: Issue[];
  comments: Comment[];
  activities: Activity[];
  /** projectId → 마지막 발급 이슈 번호 (삭제돼도 감소하지 않는다) */
  issueCounters: Record<string, number>;
}
```

- [ ] **Step 2: 목업 유저·시드 작성**

`src/mock/users.ts`:

```ts
import type { User } from "../features/jira/store/types";

export const MOCK_USERS: User[] = [
  { id: "u1", name: "김찬호" },
  { id: "u2", name: "이서연" },
  { id: "u3", name: "박준영" },
  { id: "u4", name: "최다인" },
];

/** 목업 고정 현재 유저 */
export const CURRENT_USER_ID = "u1";
```

`src/mock/seed.ts` (스펙 §5: 프로젝트 1 "ALM 플랫폼"(ALM), 활성 스프린트 1, 이슈 8, 코멘트 몇 개. order는 컬럼별 1부터):

```ts
import type { Activity, Comment, Issue, JiraData, Project, Sprint } from "../features/jira/store/types";
import { MOCK_USERS } from "./users";

export function createSeedData(): JiraData {
  const now = new Date().toISOString();

  const project: Project = { id: "p1", key: "ALM", name: "ALM 플랫폼", createdAt: now };

  const sprint: Sprint = {
    id: "s1",
    projectId: "p1",
    name: "Sprint 1",
    state: "active",
    startedAt: now,
  };

  const base = {
    projectId: "p1",
    description: "",
    reporterId: "u1",
    createdAt: now,
    updatedAt: now,
  };

  const issues: Issue[] = [
    { ...base, id: "i1", key: "ALM-1", title: "프로젝트 스캐폴드 구성", status: "done", priority: "high", assigneeId: "u1", sprintId: "s1", order: 1 },
    { ...base, id: "i2", key: "ALM-2", title: "칸반 보드 UI 구현", status: "inprogress", priority: "high", assigneeId: "u2", sprintId: "s1", order: 1 },
    { ...base, id: "i3", key: "ALM-3", title: "이슈 상세 모달 구현", status: "inprogress", priority: "medium", assigneeId: "u1", sprintId: "s1", order: 2 },
    { ...base, id: "i4", key: "ALM-4", title: "백로그 화면 구현", status: "todo", priority: "medium", assigneeId: "u3", sprintId: "s1", order: 1 },
    { ...base, id: "i5", key: "ALM-5", title: "이슈 목록 필터 구현", status: "todo", priority: "low", assigneeId: null, sprintId: "s1", order: 2 },
    { ...base, id: "i6", key: "ALM-6", title: "코멘트 기능 구현", status: "todo", priority: "medium", assigneeId: "u4", sprintId: null, order: 1 },
    { ...base, id: "i7", key: "ALM-7", title: "활동 로그 표시", status: "todo", priority: "low", assigneeId: null, sprintId: null, order: 2 },
    { ...base, id: "i8", key: "ALM-8", title: "다크 테마 점검", status: "todo", priority: "low", assigneeId: null, sprintId: null, order: 3 },
  ];

  const comments: Comment[] = [
    { id: "c1", issueId: "i2", authorId: "u1", body: "드래그 라이브러리는 @dnd-kit로 확정했습니다.", createdAt: now },
    { id: "c2", issueId: "i2", authorId: "u2", body: "컬럼 간 이동부터 붙여볼게요.", createdAt: now },
    { id: "c3", issueId: "i3", authorId: "u3", body: "속성 패널은 Select 4개로 구성합니다.", createdAt: now },
  ];

  const activities: Activity[] = issues.map((issue, index) => ({
    id: `a${index + 1}`,
    issueId: issue.id,
    actorId: issue.reporterId,
    type: "created",
    detail: "이슈 생성",
    at: now,
  }));

  return {
    users: [...MOCK_USERS],
    projects: [project],
    sprints: [sprint],
    issues,
    comments,
    activities,
    issueCounters: { p1: 8 },
  };
}
```

- [ ] **Step 3: 실패 테스트 작성** — `src/features/jira/store/jiraStore.projects.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  createProject,
  getCurrentUser,
  listProjects,
  listUsers,
} from "./jiraStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("users", () => {
  it("목업 유저 4명을 반환한다", async () => {
    const users = await listUsers();
    expect(users).toHaveLength(4);
    expect(users[0]).toEqual({ id: "u1", name: "김찬호" });
  });

  it("현재 유저는 u1 고정이다", async () => {
    await expect(getCurrentUser()).resolves.toEqual({ id: "u1", name: "김찬호" });
  });
});

describe("projects", () => {
  it("첫 실행 시 시드 프로젝트(ALM 플랫폼)가 생성되고 localStorage에 저장된다", async () => {
    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ key: "ALM", name: "ALM 플랫폼" });
    expect(localStorage.getItem("alm.jira.v1")).not.toBeNull();
  });

  it("createProject는 키를 대문자로 정규화해 저장한다", async () => {
    const project = await createProject({ key: "pay", name: "결제 서비스" });
    expect(project.key).toBe("PAY");
    const projects = await listProjects();
    expect(projects.map((p) => p.key)).toEqual(["ALM", "PAY"]);
  });

  it("키가 중복되면 한국어 메시지로 거부한다", async () => {
    await expect(createProject({ key: "alm", name: "중복" })).rejects.toThrow(
      "이미 존재하는 프로젝트 키입니다: ALM",
    );
  });

  it("키/이름이 비어 있으면 거부한다", async () => {
    await expect(createProject({ key: "  ", name: "이름" })).rejects.toThrow(
      "프로젝트 키를 입력하세요",
    );
    await expect(createProject({ key: "PAY", name: "  " })).rejects.toThrow(
      "프로젝트 이름을 입력하세요",
    );
  });

  it("생성한 프로젝트는 메모리 캐시 리셋 후에도 localStorage에서 조회된다", async () => {
    await createProject({ key: "PAY", name: "결제 서비스" });
    __resetForTest(); // 캐시만 비움 — localStorage는 유지
    const projects = await listProjects();
    expect(projects.map((p) => p.key)).toEqual(["ALM", "PAY"]);
  });
});
```

- [ ] **Step 4: RED 확인**

Run: `pnpm vitest run src/features/jira/store/jiraStore.projects.test.ts`
Expected: FAIL — `Failed to resolve import "./jiraStore"` (스토어 미구현)

- [ ] **Step 5: 스토어 파트 1 구현** — `src/features/jira/store/jiraStore.ts`

```ts
import type { JiraData, Project, User } from "./types";
import { CURRENT_USER_ID } from "../../../mock/users";
import { createSeedData } from "../../../mock/seed";

const STORAGE_KEY = "alm.jira.v1";

let cache: JiraData | null = null;

function load(): JiraData {
  if (cache) return cache;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    cache = JSON.parse(raw) as JiraData;
  } else {
    cache = createSeedData();
    persist();
  }
  return cache;
}

function persist(): void {
  if (cache) localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

/** 내부 상태 유출 방지 — 반환값은 항상 깊은 복사본 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

function nextId(): string {
  return crypto.randomUUID();
}

/** 테스트 전용: 메모리 캐시를 초기화한다 (localStorage는 건드리지 않음). */
export function __resetForTest(): void {
  cache = null;
}

export async function listUsers(): Promise<User[]> {
  return clone(load().users);
}

export async function getCurrentUser(): Promise<User> {
  const user = load().users.find((u) => u.id === CURRENT_USER_ID);
  if (!user) throw new Error("현재 사용자를 찾을 수 없습니다");
  return clone(user);
}

export async function listProjects(): Promise<Project[]> {
  return clone(load().projects);
}

export async function createProject(input: { key: string; name: string }): Promise<Project> {
  const data = load();
  const key = input.key.trim().toUpperCase();
  const name = input.name.trim();
  if (!key) throw new Error("프로젝트 키를 입력하세요");
  if (!name) throw new Error("프로젝트 이름을 입력하세요");
  if (data.projects.some((p) => p.key === key)) {
    throw new Error(`이미 존재하는 프로젝트 키입니다: ${key}`);
  }
  const project: Project = { id: nextId(), key, name, createdAt: new Date().toISOString() };
  data.projects.push(project);
  data.issueCounters[project.id] = 0;
  persist();
  return clone(project);
}
```

- [ ] **Step 6: GREEN 확인**

Run: `pnpm vitest run src/features/jira/store/jiraStore.projects.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: 게이트 전체 확인**

Run: `pnpm typecheck` → 에러 0 / `pnpm test` → 8 passed (스모크 1 + 스토어 7) / `pnpm build` → 성공

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(store): 도메인 타입·localStorage 저장 계층·시드·유저/프로젝트 함수"
```

---

### Task 3: jiraStore 파트 2 — issues/sprints/comments/activity 전 함수

**Files:**
- Modify: `src/features/jira/store/jiraStore.ts` (Task 2 파일 끝에 추가)
- Test: `src/features/jira/store/jiraStore.issues.test.ts`

**Interfaces:**
- Consumes: Task 2의 `load()/persist()/clone()/nextId()`, `CURRENT_USER_ID`, 타입 전부. 시드 고정 ID: 프로젝트 `p1`(카운터 8), 스프린트 `s1`(active), 이슈 `i1~i8`(키 ALM-1~8)
- Produces (스펙 §5 나머지 13개 함수 — W2/W3 화면이 사용):
  - `listSprints(projectId: string): Promise<Sprint[]>`
  - `createSprint(projectId: string): Promise<Sprint>` — "Sprint N" 자동 명명, planned
  - `startSprint(id: string): Promise<Sprint>` — 활성 스프린트 존재 시 throw
  - `completeSprint(id: string): Promise<Sprint>` — 미완료 이슈 백로그 이동
  - `listIssues(projectId: string, filter?: { text?: string; status?: IssueStatus; priority?: IssuePriority; assigneeId?: string }): Promise<Issue[]>` — order 오름차순 정렬
  - `getIssueByKey(key: string): Promise<Issue | null>`
  - `createIssue(input: { projectId: string; title: string; description?: string; priority?: IssuePriority; assigneeId?: string | null; sprintId?: string | null }): Promise<Issue>`
  - `updateIssue(id: string, patch: Partial<Pick<Issue, "title" | "description" | "status" | "priority" | "assigneeId" | "sprintId">>): Promise<Issue>`
  - `moveIssue(id: string, to: { status: IssueStatus; beforeId?: string }): Promise<Issue>`
  - `deleteIssue(id: string): Promise<void>`
  - `listComments(issueId: string): Promise<Comment[]>` / `addComment(issueId: string, body: string): Promise<Comment>` / `listActivity(issueId: string): Promise<Activity[]>` (둘 다 시간 오름차순)

- [ ] **Step 1: 실패 테스트 작성** — `src/features/jira/store/jiraStore.issues.test.ts`

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  addComment,
  completeSprint,
  createIssue,
  createSprint,
  deleteIssue,
  getIssueByKey,
  listActivity,
  listComments,
  listIssues,
  listSprints,
  moveIssue,
  startSprint,
  updateIssue,
} from "./jiraStore";

const PROJECT = "p1"; // 시드 프로젝트
const SPRINT = "s1"; // 시드 활성 스프린트

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("이슈 키 시퀀스", () => {
  it("프로젝트별 시퀀스로 발급하고 삭제 후에도 번호를 재사용하지 않는다", async () => {
    const nine = await createIssue({ projectId: PROJECT, title: "아홉 번째" });
    expect(nine.key).toBe("ALM-9");
    await deleteIssue(nine.id);
    const ten = await createIssue({ projectId: PROJECT, title: "열 번째" });
    expect(ten.key).toBe("ALM-10");
  });
});

describe("createIssue / getIssueByKey / listIssues", () => {
  it("createIssue는 기본값(todo/medium/백로그/현재 유저)과 created 활동을 기록한다", async () => {
    const issue = await createIssue({ projectId: PROJECT, title: "새 이슈" });
    expect(issue).toMatchObject({
      key: "ALM-9",
      status: "todo",
      priority: "medium",
      assigneeId: null,
      sprintId: null,
      reporterId: "u1",
      description: "",
    });
    const acts = await listActivity(issue.id);
    expect(acts).toEqual([
      expect.objectContaining({ type: "created", actorId: "u1", detail: "이슈 생성" }),
    ]);
  });

  it("없는 프로젝트/빈 제목은 거부한다", async () => {
    await expect(createIssue({ projectId: "없음", title: "x" })).rejects.toThrow(
      "프로젝트를 찾을 수 없습니다",
    );
    await expect(createIssue({ projectId: PROJECT, title: "  " })).rejects.toThrow(
      "이슈 제목을 입력하세요",
    );
  });

  it("getIssueByKey는 키로 찾고 없으면 null을 반환한다", async () => {
    const issue = await getIssueByKey("ALM-1");
    expect(issue?.title).toBe("프로젝트 스캐폴드 구성");
    await expect(getIssueByKey("ALM-999")).resolves.toBeNull();
  });

  it("listIssues는 텍스트(제목·키)·상태·우선순위·담당자 필터를 지원한다", async () => {
    const byText = await listIssues(PROJECT, { text: "칸반" });
    expect(byText.map((i) => i.key)).toEqual(["ALM-2"]);
    const byKeyText = await listIssues(PROJECT, { text: "alm-7" });
    expect(byKeyText.map((i) => i.key)).toEqual(["ALM-7"]);
    const byStatus = await listIssues(PROJECT, { status: "inprogress" });
    expect(byStatus.map((i) => i.key).sort()).toEqual(["ALM-2", "ALM-3"]);
    const byPriority = await listIssues(PROJECT, { priority: "high" });
    expect(byPriority).toHaveLength(2);
    const byAssignee = await listIssues(PROJECT, { assigneeId: "u1" });
    expect(byAssignee.map((i) => i.key).sort()).toEqual(["ALM-1", "ALM-3"]);
  });
});

describe("moveIssue", () => {
  it("beforeId 앞에 끼워 넣고 대상 컬럼 order를 1부터 재계산한다", async () => {
    // 시드 s1 todo 컬럼: ALM-4(1), ALM-5(2)
    const two = await getIssueByKey("ALM-2"); // inprogress → todo로 이동
    const four = await getIssueByKey("ALM-4");
    await moveIssue(two!.id, { status: "todo", beforeId: four!.id });
    const todos = (await listIssues(PROJECT, { status: "todo" })).filter(
      (i) => i.sprintId === SPRINT,
    );
    expect(todos.map((i) => [i.key, i.order])).toEqual([
      ["ALM-2", 1],
      ["ALM-4", 2],
      ["ALM-5", 3],
    ]);
    // 상태 변경은 활동로그로 자동 기록된다
    const acts = await listActivity(two!.id);
    expect(acts.at(-1)).toMatchObject({ type: "status", detail: "진행 중 → 할 일" });
  });

  it("beforeId가 없으면 컬럼 맨 뒤로 이동한다", async () => {
    const four = await getIssueByKey("ALM-4");
    await moveIssue(four!.id, { status: "inprogress" });
    const col = (await listIssues(PROJECT, { status: "inprogress" })).filter(
      (i) => i.sprintId === SPRINT,
    );
    expect(col.map((i) => [i.key, i.order])).toEqual([
      ["ALM-2", 1],
      ["ALM-3", 2],
      ["ALM-4", 3],
    ]);
  });
});

describe("sprints", () => {
  it("createSprint는 'Sprint N'으로 자동 명명하고 planned로 만든다", async () => {
    const sprint = await createSprint(PROJECT);
    expect(sprint).toMatchObject({ name: "Sprint 2", state: "planned", projectId: PROJECT });
    expect(await listSprints(PROJECT)).toHaveLength(2);
  });

  it("활성 스프린트가 이미 있으면 startSprint를 거부한다", async () => {
    const sprint = await createSprint(PROJECT);
    await expect(startSprint(sprint.id)).rejects.toThrow("이미 진행 중인 스프린트가 있습니다");
  });

  it("활성 스프린트가 없으면 planned 스프린트를 시작할 수 있다", async () => {
    await completeSprint(SPRINT);
    const sprint = await createSprint(PROJECT);
    const started = await startSprint(sprint.id);
    expect(started.state).toBe("active");
    expect(started.startedAt).toBeDefined();
  });

  it("completeSprint는 미완료 이슈를 백로그로 옮기고 done 이슈는 스프린트에 남긴다", async () => {
    const done = await completeSprint(SPRINT);
    expect(done.state).toBe("done");
    expect(done.completedAt).toBeDefined();
    const first = await getIssueByKey("ALM-1"); // done → 유지
    expect(first!.sprintId).toBe(SPRINT);
    for (const key of ["ALM-2", "ALM-3", "ALM-4", "ALM-5"]) {
      const issue = await getIssueByKey(key);
      expect(issue!.sprintId).toBeNull();
    }
  });
});

describe("updateIssue 활동로그", () => {
  it("상태/담당자/우선순위/스프린트 변경을 자동 기록한다", async () => {
    const issue = await getIssueByKey("ALM-4"); // todo / u3 / medium / s1
    await updateIssue(issue!.id, {
      status: "inprogress",
      assigneeId: "u1",
      priority: "high",
      sprintId: null,
    });
    const acts = await listActivity(issue!.id);
    const byType = Object.fromEntries(acts.map((a) => [a.type, a.detail]));
    expect(byType.status).toBe("할 일 → 진행 중");
    expect(byType.assignee).toBe("박준영 → 김찬호");
    expect(byType.priority).toBe("보통 → 높음");
    expect(byType.sprint).toBe("Sprint 1 → 백로그");
  });

  it("제목/설명만 바꾸면 활동로그를 남기지 않는다", async () => {
    const issue = await getIssueByKey("ALM-4");
    const before = (await listActivity(issue!.id)).length;
    const updated = await updateIssue(issue!.id, { title: "수정된 제목", description: "상세" });
    expect(updated.title).toBe("수정된 제목");
    expect(await listActivity(issue!.id)).toHaveLength(before);
  });

  it("없는 이슈는 거부한다", async () => {
    await expect(updateIssue("없음", { title: "x" })).rejects.toThrow("이슈를 찾을 수 없습니다");
  });
});

describe("comments / deleteIssue", () => {
  it("addComment는 현재 유저 명의로 추가하고 listComments는 시간순으로 반환한다", async () => {
    const one = await getIssueByKey("ALM-1");
    const comment = await addComment(one!.id, "확인했습니다");
    expect(comment).toMatchObject({ issueId: one!.id, authorId: "u1", body: "확인했습니다" });
    const comments = await listComments(one!.id);
    expect(comments.at(-1)!.id).toBe(comment.id);
  });

  it("빈 코멘트/없는 이슈는 거부한다", async () => {
    const one = await getIssueByKey("ALM-1");
    await expect(addComment(one!.id, "   ")).rejects.toThrow("코멘트 내용을 입력하세요");
    await expect(addComment("없음", "본문")).rejects.toThrow("이슈를 찾을 수 없습니다");
  });

  it("deleteIssue는 코멘트·활동로그를 연쇄 삭제한다", async () => {
    const two = await getIssueByKey("ALM-2"); // 시드 코멘트 2개 보유
    expect(await listComments(two!.id)).toHaveLength(2);
    await deleteIssue(two!.id);
    await expect(getIssueByKey("ALM-2")).resolves.toBeNull();
    expect(await listComments(two!.id)).toHaveLength(0);
    expect(await listActivity(two!.id)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm vitest run src/features/jira/store/jiraStore.issues.test.ts`
Expected: FAIL — `does not provide an export named 'addComment'` 류 (미구현 함수)

- [ ] **Step 3: 스토어 파트 2 구현** — `src/features/jira/store/jiraStore.ts`에 추가

import 문을 다음으로 교체:

```ts
import type {
  Activity,
  Comment,
  Issue,
  IssuePriority,
  IssueStatus,
  JiraData,
  Project,
  Sprint,
  User,
} from "./types";
```

파일 끝에 추가:

```ts
// ── 라벨 매핑 (활동로그 detail용) ─────────────────────────────

const STATUS_LABELS: Record<IssueStatus, string> = {
  todo: "할 일",
  inprogress: "진행 중",
  done: "완료",
};

const PRIORITY_LABELS: Record<IssuePriority, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

function userLabel(data: JiraData, userId: string | null): string {
  if (!userId) return "미지정";
  return data.users.find((u) => u.id === userId)?.name ?? "미지정";
}

function sprintLabel(data: JiraData, sprintId: string | null): string {
  if (!sprintId) return "백로그";
  return data.sprints.find((s) => s.id === sprintId)?.name ?? "백로그";
}

/** 활동로그 부수효과: before/after를 비교해 변경 항목별 Activity를 쌓는다 */
function recordChanges(data: JiraData, before: Issue, after: Issue, at: string): void {
  const push = (type: Activity["type"], detail: string) => {
    data.activities.push({
      id: nextId(),
      issueId: after.id,
      actorId: CURRENT_USER_ID,
      type,
      detail,
      at,
    });
  };
  if (before.status !== after.status) {
    push("status", `${STATUS_LABELS[before.status]} → ${STATUS_LABELS[after.status]}`);
  }
  if (before.assigneeId !== after.assigneeId) {
    push("assignee", `${userLabel(data, before.assigneeId)} → ${userLabel(data, after.assigneeId)}`);
  }
  if (before.priority !== after.priority) {
    push("priority", `${PRIORITY_LABELS[before.priority]} → ${PRIORITY_LABELS[after.priority]}`);
  }
  if (before.sprintId !== after.sprintId) {
    push("sprint", `${sprintLabel(data, before.sprintId)} → ${sprintLabel(data, after.sprintId)}`);
  }
}

// ── sprints ──────────────────────────────────────────────────

export async function listSprints(projectId: string): Promise<Sprint[]> {
  return clone(load().sprints.filter((s) => s.projectId === projectId));
}

export async function createSprint(projectId: string): Promise<Sprint> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) {
    throw new Error("프로젝트를 찾을 수 없습니다");
  }
  const count = data.sprints.filter((s) => s.projectId === projectId).length;
  const sprint: Sprint = {
    id: nextId(),
    projectId,
    name: `Sprint ${count + 1}`,
    state: "planned",
  };
  data.sprints.push(sprint);
  persist();
  return clone(sprint);
}

export async function startSprint(id: string): Promise<Sprint> {
  const data = load();
  const sprint = data.sprints.find((s) => s.id === id);
  if (!sprint) throw new Error("스프린트를 찾을 수 없습니다");
  if (sprint.state !== "planned") throw new Error("계획 상태의 스프린트만 시작할 수 있습니다");
  if (data.sprints.some((s) => s.projectId === sprint.projectId && s.state === "active")) {
    throw new Error("이미 진행 중인 스프린트가 있습니다");
  }
  sprint.state = "active";
  sprint.startedAt = new Date().toISOString();
  persist();
  return clone(sprint);
}

export async function completeSprint(id: string): Promise<Sprint> {
  const data = load();
  const sprint = data.sprints.find((s) => s.id === id);
  if (!sprint) throw new Error("스프린트를 찾을 수 없습니다");
  if (sprint.state !== "active") throw new Error("진행 중인 스프린트만 완료할 수 있습니다");
  const now = new Date().toISOString();
  for (const issue of data.issues) {
    if (issue.sprintId === id && issue.status !== "done") {
      issue.sprintId = null; // 미완료 이슈는 백로그로
      issue.updatedAt = now;
    }
  }
  sprint.state = "done";
  sprint.completedAt = now;
  persist();
  return clone(sprint);
}

// ── issues ───────────────────────────────────────────────────

export async function listIssues(
  projectId: string,
  filter?: {
    text?: string;
    status?: IssueStatus;
    priority?: IssuePriority;
    assigneeId?: string;
  },
): Promise<Issue[]> {
  let issues = load().issues.filter((i) => i.projectId === projectId);
  if (filter?.text) {
    const text = filter.text.toLowerCase();
    issues = issues.filter(
      (i) => i.title.toLowerCase().includes(text) || i.key.toLowerCase().includes(text),
    );
  }
  if (filter?.status) issues = issues.filter((i) => i.status === filter.status);
  if (filter?.priority) issues = issues.filter((i) => i.priority === filter.priority);
  if (filter?.assigneeId) issues = issues.filter((i) => i.assigneeId === filter.assigneeId);
  return clone([...issues].sort((a, b) => a.order - b.order));
}

export async function getIssueByKey(key: string): Promise<Issue | null> {
  const issue = load().issues.find((i) => i.key === key);
  return issue ? clone(issue) : null;
}

export async function createIssue(input: {
  projectId: string;
  title: string;
  description?: string;
  priority?: IssuePriority;
  assigneeId?: string | null;
  sprintId?: string | null;
}): Promise<Issue> {
  const data = load();
  const project = data.projects.find((p) => p.id === input.projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다");
  const title = input.title.trim();
  if (!title) throw new Error("이슈 제목을 입력하세요");
  const seq = (data.issueCounters[project.id] ?? 0) + 1;
  data.issueCounters[project.id] = seq; // 삭제돼도 감소하지 않는다 → 키 미재사용
  const now = new Date().toISOString();
  const maxOrder = data.issues
    .filter((i) => i.projectId === project.id)
    .reduce((max, i) => Math.max(max, i.order), 0);
  const issue: Issue = {
    id: nextId(),
    key: `${project.key}-${seq}`,
    projectId: project.id,
    title,
    description: input.description ?? "",
    status: "todo",
    priority: input.priority ?? "medium",
    assigneeId: input.assigneeId ?? null,
    reporterId: CURRENT_USER_ID,
    sprintId: input.sprintId ?? null,
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  };
  data.issues.push(issue);
  data.activities.push({
    id: nextId(),
    issueId: issue.id,
    actorId: CURRENT_USER_ID,
    type: "created",
    detail: "이슈 생성",
    at: now,
  });
  persist();
  return clone(issue);
}

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
  issue.updatedAt = new Date().toISOString();
  recordChanges(data, before, issue, issue.updatedAt);
  persist();
  return clone(issue);
}

export async function moveIssue(
  id: string,
  to: { status: IssueStatus; beforeId?: string },
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  const before = { ...issue };
  issue.status = to.status;
  // 대상 컬럼: 같은 프로젝트·같은 스프린트·대상 상태 (이동 이슈 제외, order 순)
  const column = data.issues
    .filter(
      (i) =>
        i.id !== id &&
        i.projectId === issue.projectId &&
        i.sprintId === issue.sprintId &&
        i.status === to.status,
    )
    .sort((a, b) => a.order - b.order);
  const insertAt = to.beforeId ? column.findIndex((i) => i.id === to.beforeId) : -1;
  if (insertAt === -1) column.push(issue);
  else column.splice(insertAt, 0, issue);
  column.forEach((entry, index) => {
    entry.order = index + 1; // 컬럼 전체 order 재계산 (1부터)
  });
  issue.updatedAt = new Date().toISOString();
  recordChanges(data, before, issue, issue.updatedAt);
  persist();
  return clone(issue);
}

export async function deleteIssue(id: string): Promise<void> {
  const data = load();
  const index = data.issues.findIndex((i) => i.id === id);
  if (index === -1) throw new Error("이슈를 찾을 수 없습니다");
  data.issues.splice(index, 1);
  data.comments = data.comments.filter((c) => c.issueId !== id);
  data.activities = data.activities.filter((a) => a.issueId !== id);
  persist();
}

// ── comments / activity ──────────────────────────────────────

export async function listComments(issueId: string): Promise<Comment[]> {
  return clone(
    load()
      .comments.filter((c) => c.issueId === issueId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export async function addComment(issueId: string, body: string): Promise<Comment> {
  const data = load();
  if (!data.issues.some((i) => i.id === issueId)) throw new Error("이슈를 찾을 수 없습니다");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("코멘트 내용을 입력하세요");
  const comment: Comment = {
    id: nextId(),
    issueId,
    authorId: CURRENT_USER_ID,
    body: trimmed,
    createdAt: new Date().toISOString(),
  };
  data.comments.push(comment);
  persist();
  return clone(comment);
}

export async function listActivity(issueId: string): Promise<Activity[]> {
  return clone(
    load()
      .activities.filter((a) => a.issueId === issueId)
      .sort((a, b) => a.at.localeCompare(b.at)),
  );
}
```

(참고: Task 2에서 넣은 `Project`, `User` import는 위 통합 import 문에 포함된다 — 중복 선언하지 말 것.)

- [ ] **Step 4: GREEN 확인**

Run: `pnpm vitest run src/features/jira/store/jiraStore.issues.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: 게이트 전체 확인**

Run: `pnpm typecheck` → 에러 0 / `pnpm test` → 25 passed (스모크 1 + 스토어 7 + 17) / `pnpm build` → 성공

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(store): 이슈·스프린트·코멘트·활동로그 전 함수 구현"
```

---

### Task 4: 앱 셸 + JiraLayout + 라우팅 + ProjectCreateModal

**Files:**
- Modify: `src/app/main.tsx`, `src/app/App.tsx`, `src/app/app.css` (Task 1 버전 교체/확장)
- Create: `src/features/jira/components/JiraLayout.tsx`, `src/features/jira/components/ProjectCreateModal.tsx`, `src/features/jira/components/EmptyProjects.tsx`
- Create: `src/features/jira/pages/BoardPage.tsx`, `src/features/jira/pages/BacklogPage.tsx`, `src/features/jira/pages/IssueListPage.tsx` (W1은 자리표시 스텁 — 실구현은 W2/W3)
- Test: `src/app/App.test.tsx` (Task 1 스모크를 전면 교체)

**Interfaces:**
- Consumes: `listProjects`, `createProject`, `getCurrentUser`, `__resetForTest` (jiraStore) / `Project`, `User` (types) / `MOCK_USERS` (mock) / `Avatar`, `Button`, `Modal`, `Select`, `Spinner`, `TextField`, `ToastProvider`, `useToast` (@chanho/react)
- Produces:
  - `App` — 프로젝트 로드 후 라우팅 (`/projects/:projectId/board|backlog|issues`, 그 외 전부 첫 프로젝트 보드로 redirect, 0개면 EmptyProjects)
  - `JiraLayout({ projects: Project[]; onProjectsChanged: () => void | Promise<void> })` — 사이드바 + Outlet. W2/W3 페이지가 이 레이아웃의 `<Outlet />`에 꽂힌다
  - `ProjectCreateModal({ triggerLabel?: string; onCreated: (project: Project) => void | Promise<void> })`
  - `EmptyProjects({ onCreated: (project: Project) => void | Promise<void> })`
  - `BoardPage` / `BacklogPage` / `IssueListPage` — W2/W3가 내용을 교체할 스텁

- [ ] **Step 1: 실패 테스트 작성** — `src/app/App.test.tsx` 전체를 아래로 교체 (Task 1 스모크 삭제)

```tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "./App";
import { __resetForTest, createProject } from "../features/jira/store/jiraStore";
import { MOCK_USERS } from "../mock/users";

/** 현재 pathname을 노출하는 테스트 프로브 */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderApp(initialPath = "/") {
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

describe("App 라우팅과 프로젝트 흐름", () => {
  it("프로젝트가 0개면 EmptyState를 보여준다", async () => {
    // 시드를 우회해 빈 데이터를 미리 심는다
    localStorage.setItem(
      "alm.jira.v1",
      JSON.stringify({
        users: MOCK_USERS,
        projects: [],
        sprints: [],
        issues: [],
        comments: [],
        activities: [],
        issueCounters: {},
      }),
    );
    renderApp();
    expect(
      await screen.findByRole("heading", { name: "아직 프로젝트가 없습니다" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "첫 프로젝트 만들기" })).toBeInTheDocument();
  });

  it("루트 접근 시 첫 프로젝트 보드로 redirect하고, 새 프로젝트 생성이 스위처에 반영된다", async () => {
    const user = userEvent.setup();
    renderApp();
    // 시드 프로젝트(p1) 보드로 redirect
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/board");
    });
    // 모달 열기 → 입력 → 생성
    await user.click(screen.getByRole("button", { name: "새 프로젝트" }));
    await user.type(screen.getByLabelText("이름"), "결제 서비스");
    await user.type(screen.getByLabelText("키"), "pay");
    expect(screen.getByLabelText("키")).toHaveValue("PAY"); // 자동 대문자
    await user.click(screen.getByRole("button", { name: "만들기" }));
    // 스위처가 새 프로젝트로 바뀌고 새 프로젝트 보드로 이동
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "프로젝트" })).toHaveTextContent(
        "결제 서비스 (PAY)",
      );
    });
    expect(screen.getByTestId("location").textContent).toMatch(/^\/projects\/.+\/board$/);
    expect(screen.getByTestId("location")).not.toHaveTextContent("/projects/p1/board");
  });

  it("스위처로 프로젝트를 전환하면 URL이 바뀐다", async () => {
    const pay = await createProject({ key: "PAY", name: "결제 서비스" }); // 시드 + 2번째 프로젝트
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/projects/p1/board");
    });
    await user.click(screen.getByRole("combobox", { name: "프로젝트" }));
    await user.click(await screen.findByRole("option", { name: "결제 서비스 (PAY)" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(`/projects/${pay.id}/board`);
    });
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm vitest run src/app/App.test.tsx`
Expected: FAIL — App이 라우터/스토어를 모름 (`Unable to find role="heading"` 또는 import 에러)

- [ ] **Step 3: 페이지 스텁 3개 작성**

`src/features/jira/pages/BoardPage.tsx`:

```tsx
export function BoardPage() {
  return (
    <section>
      <h2>보드</h2>
      <p>칸반 보드는 W2에서 구현합니다.</p>
    </section>
  );
}
```

`src/features/jira/pages/BacklogPage.tsx`:

```tsx
export function BacklogPage() {
  return (
    <section>
      <h2>백로그</h2>
      <p>백로그/스프린트는 W3에서 구현합니다.</p>
    </section>
  );
}
```

`src/features/jira/pages/IssueListPage.tsx`:

```tsx
export function IssueListPage() {
  return (
    <section>
      <h2>이슈</h2>
      <p>이슈 목록/필터는 W3에서 구현합니다.</p>
    </section>
  );
}
```

- [ ] **Step 4: ProjectCreateModal / EmptyProjects 작성**

`src/features/jira/components/ProjectCreateModal.tsx`
(Modal은 `trigger`가 필수 prop — 모달이 자체 트리거 버튼을 렌더링한다. 에러는 스토어의 한국어 메시지를 Toast(danger)로 그대로 노출):

```tsx
import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Modal, TextField, useToast } from "@chanho/react";
import type { Project } from "../store/types";
import { createProject } from "../store/jiraStore";

export interface ProjectCreateModalProps {
  /** 트리거 버튼 문구 */
  triggerLabel?: string;
  onCreated: (project: Project) => void | Promise<void>;
}

export function ProjectCreateModal({
  triggerLabel = "새 프로젝트",
  onCreated,
}: ProjectCreateModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const toast = useToast();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setName("");
      setKey("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const project = await createProject({ key, name });
      toast({ title: `프로젝트 ${project.key}를 만들었습니다`, appearance: "success" });
      handleOpenChange(false);
      await onCreated(project);
    } catch (error) {
      toast({
        title: "프로젝트 생성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <Modal
      trigger={<Button variant="subtle">{triggerLabel}</Button>}
      title="새 프로젝트"
      description="이름과 키를 입력하세요. 키는 이슈 번호의 접두어가 됩니다."
      open={open}
      onOpenChange={handleOpenChange}
    >
      <form className="project-create-form" onSubmit={handleSubmit}>
        <TextField
          label="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 결제 서비스"
        />
        <TextField
          label="키"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          placeholder="예: PAY"
          description="대문자로 자동 변환됩니다"
        />
        <Button type="submit" disabled={!name.trim() || !key.trim()}>
          만들기
        </Button>
      </form>
    </Modal>
  );
}
```

`src/features/jira/components/EmptyProjects.tsx`:

```tsx
import type { Project } from "../store/types";
import { ProjectCreateModal } from "./ProjectCreateModal";

export interface EmptyProjectsProps {
  onCreated: (project: Project) => void | Promise<void>;
}

export function EmptyProjects({ onCreated }: EmptyProjectsProps) {
  return (
    <div className="empty-projects">
      <h1>아직 프로젝트가 없습니다</h1>
      <p>첫 프로젝트를 만들어 보드를 시작하세요.</p>
      <ProjectCreateModal triggerLabel="첫 프로젝트 만들기" onCreated={onCreated} />
    </div>
  );
}
```

- [ ] **Step 5: JiraLayout 작성** — `src/features/jira/components/JiraLayout.tsx`

```tsx
import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useNavigate, useParams } from "react-router";
import { Avatar, Select } from "@chanho/react";
import type { Project, User } from "../store/types";
import { getCurrentUser } from "../store/jiraStore";
import { ProjectCreateModal } from "./ProjectCreateModal";

export interface JiraLayoutProps {
  projects: Project[];
  /** 프로젝트 목록이 바뀌었을 때(생성 등) App이 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

export function JiraLayout({ projects, onProjectsChanged }: JiraLayoutProps) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<User | null>(null);

  useEffect(() => {
    void getCurrentUser().then(setMe);
  }, []);

  const current = projects.find((p) => p.id === projectId);
  if (!current) {
    // 존재하지 않는 프로젝트 ID → 첫 프로젝트 보드로
    return <Navigate to={`/projects/${projects[0].id}/board`} replace />;
  }

  return (
    <div className="jira-layout">
      <aside className="jira-sidebar">
        <div className="jira-sidebar-brand">ALM</div>
        <Select
          label="프로젝트"
          options={projects.map((p) => ({ value: p.id, label: `${p.name} (${p.key})` }))}
          value={current.id}
          onValueChange={(id) => navigate(`/projects/${id}/board`)}
        />
        <nav className="jira-nav">
          <NavLink to={`/projects/${current.id}/board`}>보드</NavLink>
          <NavLink to={`/projects/${current.id}/backlog`}>백로그</NavLink>
          <NavLink to={`/projects/${current.id}/issues`}>이슈</NavLink>
        </nav>
        <ProjectCreateModal
          onCreated={async (project) => {
            await onProjectsChanged();
            navigate(`/projects/${project.id}/board`);
          }}
        />
      </aside>
      <div className="jira-main">
        <header className="jira-header">{me ? <Avatar name={me.name} size="small" /> : null}</header>
        <main className="jira-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: App/main/CSS 교체**

`src/app/App.tsx` 전체 교체:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Spinner } from "@chanho/react";
import type { Project } from "../features/jira/store/types";
import { listProjects } from "../features/jira/store/jiraStore";
import { JiraLayout } from "../features/jira/components/JiraLayout";
import { EmptyProjects } from "../features/jira/components/EmptyProjects";
import { BoardPage } from "../features/jira/pages/BoardPage";
import { BacklogPage } from "../features/jira/pages/BacklogPage";
import { IssueListPage } from "../features/jira/pages/IssueListPage";

export function App() {
  const [projects, setProjects] = useState<Project[] | null>(null);

  const reload = useCallback(async () => {
    setProjects(await listProjects());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (projects === null) {
    return (
      <div className="app-loading">
        <Spinner size="large" label="불러오는 중" />
      </div>
    );
  }

  if (projects.length === 0) {
    return <EmptyProjects onCreated={reload} />;
  }

  return (
    <Routes>
      <Route
        path="/projects/:projectId"
        element={<JiraLayout projects={projects} onProjectsChanged={reload} />}
      >
        <Route path="board" element={<BoardPage />} />
        <Route path="backlog" element={<BacklogPage />} />
        <Route path="issues" element={<IssueListPage />} />
      </Route>
      {/* "/" 포함 그 외 전부 → 첫 프로젝트 보드 */}
      <Route path="*" element={<Navigate to={`/projects/${projects[0].id}/board`} replace />} />
    </Routes>
  );
}
```

`src/app/main.tsx` 전체 교체 (ToastProvider + BrowserRouter 추가):

```tsx
import "@chanho/tokens/css";
import "@chanho/react/styles.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ToastProvider } from "@chanho/react";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ToastProvider>
  </StrictMode>,
);
```

`src/app/app.css` 전체 교체 (토큰 변수만 사용 — 하드코딩 색상 금지):

```css
body {
  margin: 0;
  font-family: var(--chanho-font-family-sans);
  color: var(--chanho-color-text-default);
  background: var(--chanho-color-background-default);
}

.jira-layout {
  display: flex;
  min-height: 100vh;
}

.jira-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-300);
  width: 240px;
  flex-shrink: 0;
  padding: var(--chanho-space-300) var(--chanho-space-200);
  background: var(--chanho-color-background-subtle);
  border-right: 1px solid var(--chanho-color-border-default);
}

.jira-sidebar-brand {
  font-size: var(--chanho-font-size-400);
  font-weight: var(--chanho-font-weight-bold);
  color: var(--chanho-color-text-brand);
}

.jira-nav {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-50);
}

.jira-nav a {
  padding: var(--chanho-space-100) var(--chanho-space-150);
  border-radius: var(--chanho-radius-medium);
  color: var(--chanho-color-text-default);
  text-decoration: none;
  font-size: var(--chanho-font-size-200);
}

.jira-nav a:hover {
  background: var(--chanho-color-background-neutral-hovered);
}

.jira-nav a.active {
  background: var(--chanho-color-background-brand-subtle);
  color: var(--chanho-color-text-brand);
  font-weight: var(--chanho-font-weight-semibold);
}

.jira-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.jira-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-height: 48px;
  padding: var(--chanho-space-100) var(--chanho-space-300);
  border-bottom: 1px solid var(--chanho-color-border-default);
}

.jira-content {
  padding: var(--chanho-space-300);
}

.app-loading,
.empty-projects {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--chanho-space-200);
  min-height: 100vh;
}

.empty-projects p {
  color: var(--chanho-color-text-subtle);
}

.project-create-form {
  display: flex;
  flex-direction: column;
  gap: var(--chanho-space-200);
}
```

- [ ] **Step 7: GREEN 확인**

Run: `pnpm vitest run src/app/App.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 8: 게이트 전체 확인**

Run: `pnpm typecheck` → 에러 0 / `pnpm test` → 27 passed (스토어 24 + 화면 3 — Task 1 스모크는 화면 테스트로 교체됨) / `pnpm build` → 성공

- [ ] **Step 9: 브라우저 수동 확인 (스모크)**

Run: `pnpm dev` 후 브라우저에서 확인:
- `/` → `/projects/p1/board` redirect, 사이드바에 스위처·보드/백로그/이슈 링크·새 프로젝트 버튼, 우상단 김찬호 Avatar
- 새 프로젝트 생성(키 소문자 입력 시 대문자 변환, 중복 키 "ALM" 입력 시 danger Toast) 확인 후 종료

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat(app): JiraLayout·라우팅·프로젝트 생성/전환 흐름 구현"
```

---

## 스펙 커버리지 (W1 범위)

| 스펙 항목 | 태스크 |
|---|---|
| §2.1 스택 (Vite7/React19/TS strict/react-router7/tarball 소비) | Task 1 |
| §2.2 구조 (app / features/jira / mock) | Task 1·2·4 |
| §2.3 스토어 교체 가능성·활동로그 부수효과 | Task 2·3 |
| §3 도메인 모델 + 도메인 규칙(키 시퀀스·활성 스프린트 1개·completeSprint 백로그 이동) | Task 2·3 |
| §4 JiraLayout·라우팅·redirect·EmptyState·ProjectCreateModal | Task 4 |
| §5 스토어 API 17개 전부 + `alm.jira.v1` + 시드 + 한국어 에러 | Task 2(4개)·3(13개) |
| §7 스토어 필수 테스트 6종 + 화면 핵심 흐름 + 게이트 3종 | Task 2·3·4 |
| §4 보드/백로그/이슈목록/이슈상세 실구현, §2.1 @dnd-kit | W2/W3 (본 계획 범위 외) |
