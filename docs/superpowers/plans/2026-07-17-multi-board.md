# 다중 보드 + 보드 고도화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트당 여러 보드(스크럼/칸반 필터 뷰)와 퀵 필터바·담당자 스윔레인·컬럼 WIP 제한을 구현한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-17-multi-board-design.md`. 보드는 "보는 방법"만 저장하는 필터 뷰 엔티티 — 이슈/스프린트 소속은 불변. 스토어(`jiraStore.ts`)에 Board CRUD + `listBoardIssues`를 얹고, `BoardPage`를 boardId 기반으로 전환한 뒤 위에 퀵 필터·스윔레인·WIP를 화면 상태로 쌓는다. normalize가 보드 없는 프로젝트에 기본 보드를 만들어 기존 데이터·URL과 호환한다.

**Tech Stack:** 기존 그대로 — React 19·TS strict·react-router 7·@dnd-kit·@chanho/react(100%)·Vitest.

## Global Constraints

- UI는 `@chanho/react`만 사용. 화면은 스토어 async 함수만 호출 (필터는 스토어/화면 규칙: 저장 필터=스토어, 퀵 필터=화면)
- 상태는 todo/inprogress/done 3개 고정 — 컬럼은 이름/WIP만 커스텀
- Radix Select 빈 문자열 value 금지 → 센티널 사용 (`"all"`, `"unassigned"`, `"none"`)
- 기존 `/projects/:id/board` URL과 기존 보드 DnD 테스트는 깨지지 않아야 한다 (기본 보드 redirect)
- 스토리지 키 `alm.jira.v1` 유지, normalize로 마이그레이션
- 커밋 컨벤션 유지 + Co-Authored-By 트레일러

---

### Task 1: Board 데이터 모델 + normalize + 시드

**Files:**
- Modify: `src/features/jira/store/types.ts`
- Modify: `src/features/jira/store/jiraStore.ts` (normalize·기본 보드 생성 헬퍼)
- Modify: `src/mock/seed.ts`
- Test: `src/features/jira/store/jiraStore.migration.test.ts` (추가)

**Interfaces (Produces):**
- `BoardType = "scrum" | "kanban"`, `BoardSwimlane = "none" | "assignee"`
- `BoardColumn { status; name; wipLimit: number | null }`
- `BoardFilter { assigneeIds: string[]; types: IssueType[]; labels: string[] }` — 빈 배열 = 전체, assigneeIds에 `"unassigned"` 센티널 허용
- `Board { id; projectId; name; type; filter; columns; swimlane; isDefault; createdAt }`
- `JiraData.boards: Board[]`
- 내부 헬퍼 `defaultBoard(projectId, name?, type?): Board` — 기본 3컬럼(할 일/진행 중/완료, wip null)

- [ ] types.ts에 위 타입 추가, JiraData.boards
- [ ] jiraStore normalize: `data.boards ??= []`; 보드 없는 프로젝트마다 `defaultBoard(p.id, "메인 보드")`(isDefault) push
- [ ] seed: p1에 기본 스크럼 보드(b1 "메인 보드") + 칸반 보드(b2 "백엔드 팀", filter.labels=["backend"], 진행 중 wipLimit 2)
- [ ] 마이그레이션 테스트: 구버전 JSON(보드 없음) 로드 → listBoards가 "메인 보드" 1개(isDefault, scrum) 반환
- [ ] `pnpm test` PASS → 커밋 `feat(store): Board 모델 + 기본 보드 normalize/시드`

### Task 2: 스토어 — Board CRUD + listBoardIssues

**Files:**
- Modify: `src/features/jira/store/jiraStore.ts`
- Test: `src/features/jira/store/jiraStore.boards.test.ts` (신규)

**Interfaces (Produces):**
- `listBoards(projectId): Promise<Board[]>` — isDefault 우선, 생성순
- `getBoard(id): Promise<Board | null>`
- `createBoard(input: { projectId; name; type: BoardType }): Promise<Board>` — 이름 공백/프로젝트 없음 throw
- `updateBoard(id, patch: { name?; filter?; columns?; swimlane?; isDefault? }): Promise<Board>`
  - 이름 공백 throw. columns: 길이 3·status 3종 각 1개 검증, wipLimit은 null 또는 1 이상 정수. isDefault true면 같은 프로젝트 나머지 보드 false로
- `deleteBoard(id): Promise<void>` — 마지막 보드면 throw("마지막 보드는 삭제할 수 없습니다"), 기본 보드 삭제 시 첫 보드 승격
- `listBoardIssues(boardId): Promise<Issue[]>` — scrum: 활성 스프린트 이슈(없으면 []) / kanban: 프로젝트 전체. 공통: 저장 필터 적용(assigneeIds에 "unassigned"→assigneeId null 매치), order 오름차순
- `deleteProject` cascade에 boards 추가

- [ ] 테스트 먼저 (boards.test.ts): CRUD 정상/검증 throw, 마지막 보드 삭제 금지, 기본 승격, scrum vs kanban 이슈 차이(시드: 백로그 이슈 ALM-6~8은 kanban에만), 라벨 필터(b2 → backend 라벨 이슈만), unassigned 필터
- [ ] 구현 → `pnpm test` PASS → 커밋 `feat(store): 보드 CRUD + listBoardIssues(스크럼/칸반·저장 필터)`

### Task 3: 라우팅 전환 — /boards/:boardId + 기본 보드 redirect

**Files:**
- Modify: `src/app/App.tsx` (라우트), `src/features/jira/pages/BoardPage.tsx` (boardId 기반)
- Create: `src/features/jira/pages/BoardRedirect.tsx` (기본 보드로 Navigate)
- Modify: `src/features/jira/components/ProjectLayout.tsx` (탭 활성: `/boards/`도 "보드")
- Test: `src/features/jira/pages/BoardPage.test.tsx` (redirect 검증 추가 — 기존 테스트는 그대로 통과)

**Interfaces:**
- Consumes: `getBoard/listBoards/listBoardIssues` (Task 2)
- Produces: 라우트 `boards/:boardId`; `BoardRedirect`(useParams projectId → listBoards → 기본 보드 Navigate replace)

- [ ] BoardRedirect: 로딩 스피너 → `<Navigate to={"../boards/"+defaultId} replace />`
- [ ] App.tsx: `<Route path="board" element={<BoardRedirect />} />` + `<Route path="boards/:boardId" element={<BoardPage />} />`
- [ ] BoardPage: `useParams().boardId`로 `getBoard`(없으면 기본 보드로 Navigate), 이슈는 `listBoardIssues(boardId)`. 스크럼일 때만 스프린트 뱃지·"스프린트 없음" EmptyState, 칸반은 항상 컬럼 렌더. 컬럼 인라인 생성: scrum→활성 스프린트, kanban→백로그(sprintId null)
- [ ] ProjectLayout 탭 활성 판정: segment "boards"면 "board" 탭 활성 취급
- [ ] 테스트: `/projects/p1/board` 진입 → location이 `/boards/b1`로 바뀌고 기존 컬럼 렌더·DnD 테스트 전부 통과
- [ ] `pnpm test` PASS → 커밋 `feat(board): boardId 라우팅 + 기본 보드 redirect + 칸반 타입 렌더`

### Task 4: 사이드바 보드 중첩 + 새 보드 모달

**Files:**
- Modify: `src/features/jira/components/GlobalSideNav.tsx`
- Create: `src/features/jira/components/BoardCreateModal.tsx`
- Test: `src/app/App.test.tsx` (추가)

**Interfaces:**
- Consumes: `listBoards`, `createBoard`
- Produces: `BoardCreateModal { projectId; open; onOpenChange; onCreated(board) }` — 이름 TextField + 타입 Select(스크럼/칸반)

- [ ] GlobalSideNav: 현재 프로젝트 확장 시 "보드" 항목 아래 한 단계 더 중첩 — listBoards 목록(현재 boardId 강조, 클릭 → `/projects/:id/boards/:bid`) + "+ 새 보드" 버튼(모달). 보드 목록은 라우트의 projectId 바뀔 때 + 생성 후 재조회
- [ ] BoardCreateModal: 생성 성공 시 toast + onCreated → 사이드바가 해당 보드로 navigate
- [ ] 테스트: 사이드바에 "메인 보드"/"백엔드 팀" 중첩 표시, 클릭 전환, 새 보드 만들면 목록에 추가되고 그 보드로 이동
- [ ] `pnpm test` PASS → 커밋 `feat(nav): 사이드바 보드 중첩 + 새 보드 생성 모달`

### Task 5: 퀵 필터바

**Files:**
- Create: `src/features/jira/components/BoardFilterBar.tsx`
- Modify: `src/features/jira/pages/BoardPage.tsx`, `src/app/app.css`
- Test: `src/features/jira/pages/BoardPage.test.tsx` (추가)

**Interfaces:**
- Produces: `BoardFilterBar { users; quick: QuickFilter; onChange(next) }`,
  `QuickFilter { text: string; assigneeIds: string[]; type: IssueType | null; label: string | null }`
- BoardPage가 `listBoardIssues` 결과 위에 퀵 필터를 **화면에서** 적용 (저장 필터=스토어, 퀵=화면 규칙)

- [ ] 필터바: 검색 TextField(제목·키 includes) · 담당자 아바타 스택(Avatar 버튼, aria-pressed 토글, "미지정" 포함) · 타입 Select · 라벨 Select(보드 이슈 라벨 합집합) · "필터 초기화"(활성 필터 있을 때만)
- [ ] 테스트: 아바타 토글 → 해당 담당자 카드만, 검색 좁힘, 초기화 복원
- [ ] `pnpm test` PASS → 커밋 `feat(board): 퀵 필터바 — 검색·담당자 아바타 토글·타입/라벨`

### Task 6: 컬럼 이름/WIP + 보드 설정 모달

**Files:**
- Modify: `src/features/jira/components/BoardColumn.tsx` (name/wipLimit props, 초과 강조)
- Create: `src/features/jira/components/BoardSettingsModal.tsx`
- Modify: `src/features/jira/pages/BoardPage.tsx` (헤더 ⋯ 메뉴), `src/app/app.css`
- Test: `src/features/jira/pages/BoardPage.test.tsx` (추가)

**Interfaces:**
- BoardColumn 신규 props: `columnName: string`, `wipLimit: number | null` — 헤더 `이름 N/limit`, 초과 시 `.is-over-wip` (헤더·테두리 danger)
- `BoardSettingsModal { board; users; onSaved(board); onDeleted(); open; onOpenChange }` — 이름, 저장 필터(담당자/타입/라벨 다중 Checkbox 목록), 컬럼별 이름 TextField·WIP number TextField, 기본 스윔레인 Select, "기본 보드로 지정" Switch, 삭제(확인, 마지막 보드면 스토어 throw를 toast로)

- [ ] 테스트: 시드 b2(진행 중 WIP 2)에 이슈 3개 몰아넣으면 컬럼 `is-over-wip` + "3/2" 표시, 설정 모달에서 이름 변경 반영, 삭제 → 기본 보드로 이동
- [ ] `pnpm test` PASS → 커밋 `feat(board): 컬럼 이름/WIP 초과 강조 + 보드 설정 모달`

### Task 7: 담당자 스윔레인

**Files:**
- Modify: `src/features/jira/pages/BoardPage.tsx`, `src/app/app.css`
- Test: `src/features/jira/pages/BoardPage.test.tsx` (추가)

**Interfaces:**
- BoardPage 화면 상태 `groupBy: BoardSwimlane` (초기값 board.swimlane, 우측 "그룹" Select로 전환)
- 담당자별: 담당자마다 `.board-swimlane` 밴드(헤더: Avatar+이름+개수) 안에 기존 3컬럼 렌더. "미지정" 밴드 마지막. DnD 컬럼 droppable id가 밴드별로 유니크해야 함 → `${assigneeKey}:${status}` 형식으로 확장하고 resolveMove 입력 columnIds도 밴드 스코프로 구성 (드롭 시 상태만 변경 — 담당자 변경 없음)
- `boardDnd.ts` resolveMove는 수정하지 않고, BoardPage가 밴드별 columnIds를 만들어 재사용한다. BoardColumn droppable id prop화

- [ ] 테스트: 그룹=담당자 전환 → 담당자 밴드 렌더(미지정 마지막), 밴드 안 컬럼에 해당 담당자 카드만
- [ ] `pnpm test` PASS → 커밋 `feat(board): 담당자 스윔레인 (그룹 전환)`

### Task 8: 최종 검증 + 문서

- [ ] `pnpm typecheck` / `pnpm test` / `pnpm build` 전부 PASS
- [ ] README 주요 기능·라우트 표에 다중 보드 반영, 테스트 개수 갱신
- [ ] 커밋 `docs: README — 다중 보드/퀵 필터/스윔레인/WIP 반영`
