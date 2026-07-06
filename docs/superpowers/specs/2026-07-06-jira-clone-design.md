# ALM Front — 지라 클론 설계 문서

- 작성일: 2026-07-06
- 상태: 승인됨 (구현 계획 수립 전)
- 위치: `C:\MSA_TEMPLATE\alm-front` (독립 repo → github.com/chanho4702/alm-front)

## 1. 목적과 배경

Chanho Design System(@chanho/react·tokens)의 첫 실전 소비 프로젝트로 **지라 클론**을 만든다. myFront(이력/블로그 관리용으로 유지)와 분리된 **독립 프론트 앱**이며, 향후 MSA의 한 서비스로 게이트웨이 뒤에 배치된다. ALM(Application Lifecycle Management)이라는 이름은 이후 컨플루언스 클론(features/wiki)까지 품는 우산이다.

### 범위 (풀코스 MVP)

- 프로젝트 다중 (생성/전환, 이슈 키 접두어)
- 칸반 보드 (할 일/진행 중/완료, 드래그 이동)
- 백로그/스프린트 (생성·시작·완료, 이슈 배치)
- 이슈 목록 (필터: 검색/상태/우선순위/담당자)
- 이슈 상세 (제목 인라인 편집, 설명, 속성 패널, 코멘트, 활동로그)

### 범위 제외 (MVP)

- 실제 백엔드·인증: 데이터는 localStorage 목업, 유저는 목업 4명 고정. 백엔드(jira-service) 연동과 Keycloak OIDC 통합은 후속 단계 — 스토어 계층이 교체 지점
- 컨플루언스 클론(위키): 지라 완성 후 별도 스펙
- 백로그 화면의 드래그 정렬 (Dropdown 액션으로 대체), 에픽/라벨/워치어 등 지라 고급 기능

## 2. 아키텍처

### 2.1 스택

Vite 7 + React 19 + TypeScript(strict) + react-router 7 + **@chanho/react·@chanho/tokens(tarball 설치, `file:../design-system/artifacts/*.tgz` + overrides)** + **@dnd-kit**(칸반 드래그) + Vitest/Testing Library. **MUI 등 타 UI 라이브러리 금지 — UI는 100% 디자인 시스템.**

### 2.2 구조

```
src/
├── app/                # 앱 셸: 라우터, 전역 스타일 로드, 목업 유저 컨텍스트
├── features/jira/
│   ├── pages/          # BoardPage, BacklogPage, IssueListPage
│   ├── components/     # JiraLayout, IssueCard, IssueDetailModal, SprintPanel, ProjectCreateModal ...
│   └── store/          # jiraStore.ts (+ 테스트)
└── mock/               # 시드 데이터, 목업 유저
```

### 2.3 핵심 규칙

1. **스토어 교체 가능성** — 화면은 `jiraStore.ts`의 async 함수만 호출한다. 백엔드가 생기면 이 파일 내부만 fetch로 교체 (myFront designsStore→boardStore 전환과 동일 철학)
2. **디자인 시스템 역성장** — 부족한 공용 컴포넌트는 앱에 만들지 않고 design-system에 추가 후 tarball 재생성해 소비한다. 확정 1호: **TextArea** (설명·코멘트용, 선행 작업)
3. **활동로그는 스토어의 부수효과** — updateIssue가 상태/담당자/우선순위/스프린트 변경을 감지해 자동 기록. 화면 코드는 기록 로직을 모른다

## 3. 도메인 모델

```ts
interface User { id: string; name: string }                    // 목업 4명

interface Project { id: string; key: string; name: string; createdAt: string }
// key: "ALM" 같은 대문자 접두어. 이슈 키 발급용 프로젝트별 카운터 보유

interface Sprint {
  id: string; projectId: string; name: string;                 // "Sprint N" 자동 명명
  state: "planned" | "active" | "done";
  startedAt?: string; completedAt?: string;
}

type IssueStatus = "todo" | "inprogress" | "done";
type IssuePriority = "high" | "medium" | "low";

interface Issue {
  id: string; key: string;                                     // "ALM-1", 불변, 재사용 금지
  projectId: string; title: string; description: string;
  status: IssueStatus;                                         // 칸반 컬럼
  priority: IssuePriority;
  assigneeId: string | null; reporterId: string;
  sprintId: string | null;                                     // null = 백로그
  order: number;                                               // 컬럼/목록 내 정렬
  createdAt: string; updatedAt: string;
}

interface Comment { id: string; issueId: string; authorId: string; body: string; createdAt: string }

interface Activity {
  id: string; issueId: string; actorId: string;
  type: "created" | "status" | "assignee" | "priority" | "sprint";
  detail: string;                                              // "할 일 → 진행 중"
  at: string;
}
```

### 도메인 규칙

- 이슈 키: 프로젝트별 시퀀스로 발급, 삭제돼도 번호 재사용 안 함
- 활성 스프린트는 프로젝트당 최대 1개. `startSprint`는 planned→active, 이미 active가 있으면 거부
- `completeSprint`: 미완료(todo/inprogress) 이슈는 sprintId=null(백로그)로 자동 이동, done 이슈는 스프린트에 남김
- 보드는 **활성 스프린트의 이슈만** 표시. 활성 스프린트가 없으면 백로그로 유도하는 EmptyState
- 디자인 시스템 매핑: status→Lozenge(neutral/info/success), assignee→Avatar, 액션 피드백→Toast

## 4. 화면 구성

- **JiraLayout**: 좌측 사이드바(프로젝트 스위처 Select + 보드/백로그/이슈 NavLink) + 우상단 내 Avatar. 사이드바·레이아웃 스타일은 앱 로컬 CSS(토큰 변수 사용)
- **라우팅**: `/projects/:projectId/board | backlog | issues`. `/`는 첫 프로젝트 보드로 redirect, 프로젝트 0개면 EmptyState→ProjectCreateModal. 이슈 상세는 `?issue=ALM-1` 쿼리로 열림(URL 공유 가능)
- **BoardPage**: 3컬럼 칸반, @dnd-kit로 컬럼 간/내 드래그(=moveIssue). 카드: 키·제목·우선순위 아이콘·Avatar
- **BacklogPage**: 스프린트 패널(planned/active 각각: 이슈 목록, 시작/완료 Button) + 백로그 목록 + 인라인 이슈 생성(TextField+Button). 이슈의 스프린트 이동은 Dropdown 액션
- **IssueListPage**: 프로젝트 전체 이슈 테이블(키/제목/상태/우선순위/담당자/생성일) + 필터바
- **IssueDetailModal**: 제목 인라인 편집, 설명 TextArea, 우측 속성 패널(상태/담당자/우선순위/스프린트 Select), 하단 Tabs(코멘트: 목록+작성 / 활동: 자동 로그)
- **ProjectCreateModal**: 이름+키 입력(키 자동 대문자, 중복 검사)

## 5. 스토어 API 계약 (`jiraStore.ts` — 전부 async)

```ts
listUsers(): Promise<User[]>
getCurrentUser(): Promise<User>                        // 목업 고정 유저

listProjects(): Promise<Project[]>
createProject(input: { key: string; name: string }): Promise<Project>   // key 중복 시 throw

listSprints(projectId: string): Promise<Sprint[]>
createSprint(projectId: string): Promise<Sprint>       // "Sprint N" 자동 명명, planned
startSprint(id: string): Promise<Sprint>               // 활성 스프린트 존재 시 throw
completeSprint(id: string): Promise<Sprint>            // 미완료 이슈 백로그 이동

listIssues(projectId: string, filter?: {
  text?: string; status?: IssueStatus; priority?: IssuePriority; assigneeId?: string;
}): Promise<Issue[]>
getIssueByKey(key: string): Promise<Issue | null>
createIssue(input: { projectId: string; title: string; description?: string;
  priority?: IssuePriority; assigneeId?: string | null; sprintId?: string | null }): Promise<Issue>
updateIssue(id: string, patch: Partial<Pick<Issue,
  "title" | "description" | "status" | "priority" | "assigneeId" | "sprintId">>): Promise<Issue>
moveIssue(id: string, to: { status: IssueStatus; beforeId?: string }): Promise<Issue>
  // 보드 드래그 전용: 대상 컬럼에서 beforeId 앞으로 order 재계산
deleteIssue(id: string): Promise<void>                 // 코멘트·활동로그 함께 삭제, 키는 재사용 안 함

listComments(issueId: string): Promise<Comment[]>
addComment(issueId: string, body: string): Promise<Comment>
listActivity(issueId: string): Promise<Activity[]>
```

- 저장: localStorage 단일 키 `alm.jira.v1` (JSON 직렬화). 첫 실행 시 시드(샘플 프로젝트 1, 스프린트 1(active), 이슈 8, 코멘트 몇 개)
- 에러: 도메인 규칙 위반은 명확한 한국어 메시지로 throw — 화면은 Toast(danger)로 표시

## 6. 구현 단계

- **W0 (선행, design-system 작업)**: TextArea 컴포넌트 추가(TextField 패턴 미러) → 0.2.0 tarball 재생성
- **W1**: 스캐폴드(Vite+TS+라우터+디자인시스템 설치) + JiraLayout + 프로젝트 생성/전환 + jiraStore 코어(+시드+테스트)
- **W2**: 칸반 보드(@dnd-kit) + IssueDetailModal(속성 편집까지)
- **W3**: 백로그/스프린트 + 이슈 목록/필터 + 코멘트/활동로그

각 웨이브는 별도 구현 계획(Plan)으로 작성한다.

## 7. 테스트 전략

- **스토어 = 필수** (Vitest, localStorage 목업): 이슈 키 시퀀스(삭제 후 미재사용), moveIssue order 재계산, startSprint 중복 거부, completeSprint 백로그 이동, updateIssue 활동로그 자동 기록, createProject 키 중복 거부
- **화면 = 핵심 흐름** (RTL): 보드 컬럼별 렌더, 모달에서 상태 변경→Lozenge 반영, 이슈 생성 흐름, 필터 동작
- 드래그 상호작용 자체는 jsdom 검증이 비싸므로 moveIssue 로직 테스트 + 브라우저 수동 확인으로 갈음
- 게이트: `tsc --noEmit` + `vitest run` + `vite build` (design-system 관례 계승)
