# ALM Front — 지라 클론

Chanho Design System(`@chanho/react`·`@chanho/tokens`)을 100% 소비하는 독립 프론트 앱.
지라(Jira) 스타일의 **이슈·스프린트·프로젝트 관리(ALM)** 화면을 제공하며,
MSA 템플릿의 프론트 3종 중 하나로 게이트웨이(:8000) 뒤, Keycloak OIDC SSO 체제에 속한다.

- 개발: `http://localhost:5175/alm/` (Vite dev, `--strictPort`)
- 통합 배포: nginx 경로 기반 `http://localhost/alm/` (`base: "/alm/"`, 라우터 `basename="/alm"`)
- 데이터: 현재 **localStorage 목업**(`alm.jira.v1`). 백엔드(jira-service) 도입 시 store 파일만 교체하는 구조.

---

## 기술 스택 (실측)

| 항목 | 버전/내용 |
|---|---|
| 빌드 | Vite 7, `@vitejs/plugin-react` |
| 런타임 | React 19, react-dom 19 |
| 언어 | TypeScript 5.7 (`strict`, `noUnusedLocals/Parameters`) |
| 라우팅 | react-router 7 (`BrowserRouter basename="/alm"`) |
| 드래그앤드롭 | `@dnd-kit/core`·`sortable`·`utilities` (칸반 보드) |
| 디자인 시스템 | `@chanho/react` 0.3.0 + `@chanho/tokens` 0.2.0 (`file:../design-system/artifacts/*.tgz`) |
| 테스트 | Vitest 3 + Testing Library(react·user-event·jest-dom), jsdom |
| 패키지 매니저 | **pnpm** (`pnpm-lock.yaml`, `pnpm-workspace.yaml`) |

UI는 전부 디자인 시스템 컴포넌트로만 구성한다(타 UI 라이브러리 미사용).
`@chanho/tokens`는 워크스페이스 override로 tarball을 고정한다(`pnpm-workspace.yaml`).

---

## 실행 방법 (실측)

```bash
pnpm install                       # ../design-system/artifacts 의 tarball 필요
pnpm dev --port 5175 --strictPort  # http://localhost:5175/alm/
pnpm test                          # vitest run (187 test cases)
pnpm typecheck                     # tsc --noEmit
pnpm build                         # vite build (→ dist/)
```

`package.json` 스크립트는 `dev`(=`vite`)·`test`·`typecheck`·`build` 4개다. 포트·strictPort는
스크립트가 아니라 CLI 인자로 주입한다(레포 루트 `scripts/dev-up.ps1`이 `pnpm dev --port 5175 --strictPort`로 기동).

---

## 환경변수

| 변수 | 기본값 | 용도 |
|---|---|---|
| `VITE_API_BASE` | `""` (동일 오리진) | 인증 클라이언트가 백엔드를 부를 베이스 오리진. 통합 배포는 nginx same-origin이라 비워 둔다. |

`.env` 파일은 커밋돼 있지 않다 — 기본값(빈 문자열)으로 nginx 리버스 프록시 경로(`/api`, `/oauth2`)를 탄다.

---

## 인증/SSO 흐름 (실측)

인증은 `src/auth/`의 재사용 모듈이 담당하며, **최상위 `AuthGate`가 앱 전체를 감싼다**(`main.tsx`).

- **게이트는 프로덕션 빌드에서만 활성**이다(`enabled = import.meta.env.PROD`). dev/vitest에서는 게이트가 꺼져
  로그인 없이 목업 단일 사용자로 바로 렌더된다 — 인증 검증은 nginx 통합 배포 경로에서만 일어난다.
- **Access Token(AT)은 인스턴스 메모리에만** 둔다. Refresh Token(RT)은 백엔드가 심는 HttpOnly 쿠키라 프론트가 직접 다루지 않는다.

부트스트랩 시퀀스(`AuthGate`):

1. 마운트 → `POST /api/auth/refresh`(RT 쿠키)로 silent refresh 시도.
2. 성공 → `GET /api/me`로 사용자(`AppUser`)를 받아 children 렌더.
3. 실패 → 되돌아올 경로를 `post_login_redirect` 쿠키(5분, SameSite=Lax)에 심고
   `GET {base}/oauth2/authorization/keycloak`로 리다이렉트. KC SSO 세션이 살아 있으면 무프롬프트로 왕복한다.
   (auth-server `LoginSuccessHandler`가 returnTo 쿠키를 읽어 원래 경로로 복귀)

그 밖의 계약:

- **구글 바로 로그인**: `/oauth2/authorization/keycloak?kc_idp_hint=google`
- **`apiFetch`**: 요청에 `Authorization: Bearer` 자동 첨부, 401이면 refresh 1회 후 재시도.
- **로그아웃**: `POST /api/auth/logout`(백채널로 KC 세션 종료 + RT 쿠키 삭제) 후 메모리 AT를 비우고 `/`로 이동.
- 클라이언트는 `createAuthClient({ baseUrl })` 팩토리라 다른 백엔드는 `VITE_API_BASE`만 바꿔 끼운다.

---

## 주요 기능/화면 (실측)

- **전역 셸(`AppShell`)** — 상단바(브랜드·전역 검색·"만들기" 이슈 생성 모달·알림 벨·테마 토글) + 상주 전역 사이드바(`GlobalSideNav`: 홈/프로젝트·최근·별표). UI 상태는 `alm.jira.ui.v1`에 저장.
- **홈 `HomePage`(For you)** — 내 담당 이슈 + 최근 업데이트 모음.
- **프로젝트 셸(`ProjectLayout`)** — 브레드크럼 + 프로젝트 헤더(해시 색 아바타 `ProjectAvatar` + ★별표) + 가로 뷰 탭(요약·타임라인·보드·백로그·이슈·설정). 이슈 키 접두어(`ALM-1`).
- **대시보드 `DashboardPage`** — 상태별 이슈 카운트 + 담당자별 분포.
- **타임라인 `TimelinePage`** — 간트형 막대(생성일→마감일, 상태 색), 오늘 마커.
- **다중 보드 `BoardPage`** — 프로젝트당 여러 보드(**스크럼**=활성 스프린트 / **칸반**=전체 흐름). 보드는 "보는 방법"만 저장하는 필터 뷰(저장 필터: 담당자/타입/라벨). 퀵 필터바(검색·담당자 아바타 토글·타입/라벨), 담당자 **스윔레인**(그룹 전환), 컬럼 이름/**WIP 제한**(초과 danger 강조), 보드 설정 모달(`BoardSettingsModal`), 사이드바 보드 중첩+`BoardCreateModal`. `@dnd-kit` 드래그·컬럼 하단 인라인 생성(`BoardColumn`).
- **백로그/스프린트 `BacklogPage`** — 스프린트 생성·시작·완료, 인라인 이슈 생성, **드래그로 스프린트↔백로그 이동·패널 내 순서(랭크) 변경**(`rankIssue`·`resolveBacklogMove`, Dropdown 이동 병행)(`SprintPanel`).
- **이슈 목록 `IssueListPage`** — 테이블 + 필터(검색/상태/우선순위/담당자/라벨) + 정렬.
- **이슈 상세 `IssueDetailModal`** — `?issue=ALM-1` 쿼리로 열리는 공유 가능 모달(`useIssueModal`). 인라인 편집·속성 패널·코멘트·활동로그.
- **이슈 타입** — 작업/스토리/버그/에픽/하위 작업 색 글리프(`IssueTypeGlyph`).
- **이슈 관계** — 단일 `parentId` 2단계 계층(에픽→일반 이슈→하위 작업, 스토어가 규칙 검증)·상세 모달의 부모 Select/하위 이슈 섹션(진행 n/m·인라인 하위 작업 추가·클릭 시 모달 전환)·**이슈 링크**(차단함/차단됨/관련, 미완료 차단자 있으면 "차단됨" 경고)·칸반 카드 에픽 태그.
- **알림 `NotificationsModal`** — 상단 벨 미읽음 Badge, 개별/전체 읽음.
- **검색 `SearchModal`** · **만들기 `CreateIssueModal`** — 전역 상단바에서 호출.
- **프로젝트 디렉터리** — `ProjectListPage`(카드) · `ProjectCreatePage`(영문 이름→키 자동 제안) · `ProjectSettingsPage`(수정·삭제).

목업 사용자는 4명 고정(`김찬호`/`이서연`/`박준영`/`최다인`), 현재 사용자는 `u1`(김찬호).

---

## 라우트 목록 (실측)

모든 라우트는 `AppShell` 레이아웃 아래에 놓인다(`src/app/App.tsx`, `basename="/alm"`).

| 경로 | 화면 |
|---|---|
| `/home` | `HomePage` (For you) |
| `/projects` | `ProjectListPage` |
| `/projects/new` | `ProjectCreatePage` |
| `/projects/:projectId/dashboard` | `DashboardPage` |
| `/projects/:projectId/timeline` | `TimelinePage` |
| `/projects/:projectId/board` | 기본 보드로 redirect (`BoardRedirect`, `?issue` 보존) |
| `/projects/:projectId/boards/:boardId` | `BoardPage` |
| `/projects/:projectId/backlog` | `BacklogPage` |
| `/projects/:projectId/issues` | `IssueListPage` |
| `/projects/:projectId/settings` | `ProjectSettingsPage` |
| `*` (`/` 포함) | `/home`으로 리다이렉트 |

`?issue=<키>` 쿼리는 위 어느 경로에서든 이슈 상세 모달을 연다(라우트 아님).

---

## 디렉터리 구조

```
alm-front/
├─ index.html               #root + /src/app/main.tsx, <title>ALM</title>
├─ vite.config.ts           # base: "/alm/"
├─ pnpm-workspace.yaml       # @chanho/tokens tarball override
├─ src/
│  ├─ app/                  # main.tsx(AuthGate→BrowserRouter→App)·App.tsx(라우팅)·app.css
│  ├─ auth/                 # 인증 모듈(다른 백엔드로 복사 가능)
│  │  ├─ client.ts          #   createAuthClient 팩토리(refresh/me/logout/apiFetch)
│  │  ├─ AuthGate.tsx       #   프로덕션 전용 로그인 게이트 + useAuth
│  │  ├─ returnTo.ts        #   post_login_redirect 쿠키
│  │  └─ types.ts           #   AppUser / AuthClient 계약
│  ├─ features/jira/
│  │  ├─ pages/             # Home·ProjectList·ProjectCreate·ProjectSettings·Dashboard·Timeline·Board·Backlog·IssueList
│  │  ├─ components/        # AppShell·GlobalSideNav·ProjectLayout·CreateIssueModal·SearchModal·NotificationsModal·IssueCard·IssueDetailModal·SprintPanel·ThemeToggle ...
│  │  └─ store/             # jiraStore.ts(백엔드 교체 지점, `alm.jira.v1`) · uiStore.ts(`alm.jira.ui.v1`) · types.ts
│  └─ mock/                 # seed.ts(시드 데이터) · users.ts(목업 4명)
└─ docs/                    # 설계 spec·웨이브별 plan·BACKLOG(백엔드 의존 기능)
```

---

## 문서

- 설계: `docs/superpowers/specs/` (지라 클론 디자인·셸 리디자인·gap 설계)
- 구현 계획(웨이브별): `docs/superpowers/plans/`
- 백엔드 의존 기능 백로그: `docs/BACKLOG.md` (첨부·실시간 협업·알림 푸시·권한 — jira-service 도입 시)
