# Jira Clone 요구사항 갭 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 요구사항 명세 대비 갭 7가지(프로젝트 수정/삭제·설명, 이슈 마감일, 라벨, 이슈 삭제 UI, 댓글 수정/삭제, 설명 검색+정렬 확장, 대시보드)를 채운다.

**Architecture:** 데이터 모델(`types.ts`)과 스토어(`jiraStore.ts`, 백엔드 교체 지점)를 먼저 확장하고 vitest로 고정한 뒤, 화면(프로젝트 목록·이슈 상세·이슈 목록·카드·대시보드)을 위에 얹는다. 기존 localStorage 데이터는 `load()`의 normalize 단계로 마이그레이션한다.

**Tech Stack:** Vite 7 · React 19 · TS strict · react-router 7 · @chanho/react 0.3.0(100% 디자인 시스템, DatePicker 없음 → `TextField type="date"`) · Vitest + Testing Library

## Global Constraints

- UI 컴포넌트는 `@chanho/react`만 사용 (타 UI 라이브러리 금지)
- 화면은 `jiraStore.ts`의 async 함수만 호출 — 필터는 스토어, 정렬/집계는 화면
- 프로젝트 키는 불변 (이슈 키 접두어 보전)
- 스토리지 키 `alm.jira.v1` 유지, 기존 데이터는 normalize로 승격
- Radix Select는 빈 문자열 value 금지 → 센티널(`"all"`, `"unassigned"` 등) 사용
- 커밋 메시지: 기존 컨벤션(`feat(store): …`, `feat(pages): …`) + Co-Authored-By 트레일러

---

### Task 1: 데이터 모델 확장 + 마이그레이션

**Files:**
- Modify: `src/features/jira/store/types.ts`
- Modify: `src/mock/seed.ts`
- Modify: `src/features/jira/store/jiraStore.ts` (load에 normalize)
- Test: `src/features/jira/store/jiraStore.migration.test.ts` (신규)

**Interfaces (Produces):**
- `Project.description: string`
- `Issue.dueDate: string | null` (`YYYY-MM-DD`)
- `Issue.labels: string[]`
- `Comment.updatedAt?: string`
- `Activity.type`에 `"duedate" | "labels"` 추가

- [ ] types.ts에 위 필드 추가 (Issue의 dueDate/labels는 필수 필드)
- [ ] seed.ts: project에 `description: "스틸 블루 디자인 시스템 기반 ALM 데모"`, issue `base`에 `dueDate: null, labels: []`, 시드 이슈 2~3개에 라벨(`["backend"]`, `["design","frontend"]`)과 dueDate 부여 (필터/대시보드 수동 확인용)
- [ ] jiraStore.ts `load()`: JSON 파싱 성공 시 normalize — `projects[].description ??= ""`, `issues[].dueDate ??= null`, `issues[].labels ??= []`
- [ ] 마이그레이션 테스트: 구버전 형태 JSON을 localStorage에 심고 `__resetForTest()` 후 `listProjects()/listIssues()`가 기본값 채워 반환하는지 확인
- [ ] `pnpm test` PASS 확인 (기존 61개 + 신규) 후 커밋 `feat(store): 데이터 모델 확장(description·dueDate·labels) + v1 normalize`

### Task 2: 스토어 — 프로젝트 수정/삭제

**Files:**
- Modify: `src/features/jira/store/jiraStore.ts`
- Test: `src/features/jira/store/jiraStore.projects.test.ts` (기존에 추가)

**Interfaces (Produces):**
- `updateProject(id: string, patch: { name?: string; description?: string }): Promise<Project>` — name 공백이면 throw
- `deleteProject(id: string): Promise<void>` — 스프린트·이슈·해당 이슈의 댓글·활동·issueCounters 연쇄 삭제
- `createProject` input에 `description?: string` 추가

- [ ] 테스트 먼저: 수정(이름/설명 반영, 키 불변), 빈 이름 throw, 삭제 후 `listProjects`/`listIssues`/`listSprints` 빈 결과 + 다른 프로젝트 무영향
- [ ] 구현 → `pnpm test` PASS → 커밋 `feat(store): 프로젝트 수정/삭제(연쇄 삭제 포함)`

### Task 3: 스토어 — 댓글 수정/삭제 + 이슈 필드 확장

**Files:**
- Modify: `src/features/jira/store/jiraStore.ts`
- Test: `src/features/jira/store/jiraStore.issues.test.ts` (기존에 추가)

**Interfaces (Produces):**
- `updateComment(id: string, body: string): Promise<Comment>` — 작성자 ≠ CURRENT_USER_ID면 throw("본인 댓글만 수정할 수 있습니다"), `updatedAt` 세팅
- `deleteComment(id: string): Promise<void>` — 동일 권한 검사
- `createIssue` input에 `dueDate?: string | null; labels?: string[]` / `updateIssue` patch에 `dueDate`, `labels` 허용
- `listIssues` filter에 `label?: string` 추가, `text`는 설명도 검색
- `recordChanges`: dueDate 변경 → `type:"duedate"` `"미지정 → 2026-08-01"`, labels 변경 → `type:"labels"` `"backend, api"` 형태

- [ ] 테스트 먼저: 댓글 수정/삭제 정상 + 타인 댓글 throw(u2 작성 시드 활용), 설명 검색 매치, label 필터, dueDate/labels 패치 반영 + 활동로그 기록
- [ ] 구현 → `pnpm test` PASS → 커밋 `feat(store): 댓글 수정/삭제 + 이슈 dueDate·labels + 설명 검색·라벨 필터`

### Task 4: 프로젝트 목록 페이지 (CRUD UI)

**Files:**
- Create: `src/features/jira/pages/ProjectListPage.tsx`
- Modify: `src/features/jira/components/ProjectCreateModal.tsx` (설명 TextField 추가)
- Modify: `src/app/App.tsx` (`/projects` 라우트 — JiraLayout 밖 단독)
- Modify: `src/features/jira/components/JiraLayout.tsx` (SideNav footer에 "프로젝트 관리" 진입 버튼)
- Modify: `src/app/app.css`
- Test: `src/features/jira/pages/ProjectListPage.test.tsx`

**UI:** PageHeader("프로젝트") + 생성 버튼(ProjectCreateModal 재사용). Table 컬럼: 이름(클릭 → 보드 이동)/키/설명/생성일/관리(Dropdown: 수정·삭제). 수정 Modal — 이름·설명 TextField, 키는 읽기 전용 표시. 삭제 확인 Modal — "이슈 N개가 함께 삭제됩니다" (listIssues로 개수 조회), danger Button. 삭제 후 목록 재조회, 0개면 App의 EmptyProjects 흐름.

- [ ] 테스트 먼저: 목록 렌더, 수정 저장 → 이름 갱신, 삭제 확인 → 행 제거
- [ ] 구현 (App.tsx: `<Route path="/projects" element={<ProjectListPage …/>} />` — projects/reload props 전달) → 테스트 PASS → 커밋 `feat(pages): 프로젝트 목록 페이지 — 조회/생성/수정/삭제`

### Task 5: 이슈 상세 모달 확장

**Files:**
- Modify: `src/features/jira/components/IssueDetailModal.tsx`
- Modify: `src/app/app.css`
- Test: `src/features/jira/components/IssueDetailModal.test.tsx` (기존에 추가)

**UI:**
- 속성 패널: 마감일 `TextField type="date"`(onChange 즉시 applyPatch, 빈 값 → null), 라벨 — `Tag`(removable) 나열 + TextField Enter로 추가, 생성일/수정일 읽기 전용(`formatDateTime`)
- 모달 하단: "이슈 삭제" danger Button → 확인 Modal → `deleteIssue` → onClose + onIssueChanged
- 댓글: `comment.authorId === 현재 유저`일 때만 수정/삭제 버튼. 수정 → TextArea 인라인 전환 + 저장/취소, `updatedAt` 있으면 "(수정됨)" 표시. 삭제는 confirm Modal 없이 2-step(삭제 → 정말 삭제) 대신 확인 Modal 재사용

- [ ] 테스트 먼저: 마감일 저장, 라벨 추가/제거, 생성/수정일 표시, 이슈 삭제 흐름(확인 → onClose 호출), 본인 댓글에만 수정/삭제 노출, 댓글 수정 반영
- [ ] 구현 → 테스트 PASS → 커밋 `feat(detail): 마감일·라벨 편집, 생성/수정일, 이슈 삭제, 댓글 수정/삭제`

### Task 6: 카드 라벨 + 이슈 목록 필터·정렬 확장

**Files:**
- Modify: `src/features/jira/components/IssueCard.tsx` (labels → Tag 나열)
- Modify: `src/features/jira/pages/IssueListPage.tsx`
- Test: `src/features/jira/pages/IssueListPage.test.tsx` (기존에 추가)

**UI:** 검색 placeholder "제목·설명·키 검색". 라벨 필터 Select(전체 + 프로젝트 이슈 라벨 합집합 — 필터 없이 조회한 전체 목록에서 계산). 컬럼 추가: 마감일(sortable)/수정일(sortable), 생성일 sortable 전환. 정렬 비교: 날짜는 ISO 문자열 비교, null dueDate는 항상 뒤.

- [ ] 테스트 먼저: 설명 검색 히트, 라벨 필터 적용, 마감일 정렬(null 뒤)
- [ ] 구현 → 테스트 PASS → 커밋 `feat(list): 설명 검색·라벨 필터·마감일/수정일 정렬 + 카드 라벨`

### Task 7: 대시보드

**Files:**
- Create: `src/features/jira/pages/DashboardPage.tsx`
- Modify: `src/features/jira/components/JiraLayout.tsx` (NAV_ITEMS 첫 항목 "대시보드")
- Modify: `src/app/App.tsx` (라우트 `dashboard`)
- Modify: `src/app/app.css`
- Test: `src/features/jira/pages/DashboardPage.test.tsx`

**UI:** PageHeader("대시보드") + Card 4장(전체/할 일/진행 중/완료 — 숫자 크게) + "담당자별 이슈" Card(유저별 ProgressBar `value=담당 이슈/전체`, 미지정 포함, 0건 유저도 표시). 데이터: `listIssues(projectId)` 1회 호출 후 화면 집계.

- [ ] 테스트 먼저: 카운트 4종 표시, 담당자별 개수 렌더
- [ ] 구현 → 테스트 PASS → 커밋 `feat(pages): 프로젝트 대시보드 — 상태 카운트·담당자별 분포`

### Task 8: 최종 검증 + 문서

- [ ] `pnpm typecheck` / `pnpm test` / `pnpm build` 전부 PASS
- [ ] README MVP 범위 갱신 (프로젝트 CRUD 완성·마감일·라벨·댓글 편집·대시보드) — 테스트 개수 갱신
- [ ] 커밋 `docs: README — 요구사항 갭 구현 반영`
