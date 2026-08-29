# 화면 지도 (라우트 · 셸 · 페이지)

**파일**: `src/app/App.tsx`(라우트), `components/AppShell.tsx`(상단바+전역 사이드바),
`components/GlobalSideNav.tsx`, `components/ProjectLayout.tsx`(프로젝트 헤더+뷰 탭),
`pages/*`. basename은 `/alm`(vite/router), nginx SSO 뒤에 산다(AuthGate, 프로덕션 빌드에서만).

## 라우트 지도

| 라우트 | 파일 | 요지 (지라 대응) |
|---|---|---|
| `/home` | HomePage | For you 홈: 인사말 → 이어서 하기 카드 → 추천 작업/나에게 배정됨/최근 업데이트/별표 탭 |
| `/search` | SearchPage | 이슈 검색: 기본(필터 드롭다운)/스마트 2모드 → search.md |
| `/settings` | GlobalSettingsPage | 전역 관리(⚙): 이슈 타입 스킴·워크플로 스킴 |
| `/projects` | ProjectListPage | 디렉터리: 테이블 기본(★/이름/키/이슈/생성일/⋯) + 카드 토글 + 검색 |
| `/projects/new` | ProjectCreatePage | 템플릿(빈/스크럼/칸반/버그 트래킹) 미리보기 생성 |
| `/projects/:id/board` | BoardRedirect | 기본 보드로 redirect (?issue 쿼리 보존) |
| `/projects/:id/boards/:boardId` | BoardPage | 칸반: 동적 상태 컬럼, DnD, 퀵필터, 스윔레인(담당자/에픽), WIP |
| `/projects/:id/backlog` | BacklogPage | 스프린트 패널 + 백로그, DnD 랭크/이동 |
| `/projects/:id/issues` | IssueListPage | 목록: 필터 6종 + 정렬 테이블, ?issue=키로 상세 모달 |
| `/projects/:id/timeline` | TimelinePage | 간트: frappe-gantt(MIT) 막대 + 일/주/월 보기, 차단 링크가 의존선. 좌측 이슈 목록과 일정 표는 우리 DOM(그래픽 없이도 성립). 라우트는 지연 로딩(차트 청크 분리), Gantt 인스턴스는 하나만 만들어 갱신한다(생성자마다 document 리스너가 붙는다) |
| `/projects/:id/reports` | ReportsPage(lazy) | 번다운(Recharts·MIT) + 스프린트 리포트(완료/미완료/스코프 변경), 집계는 `reportMetrics.ts` |
| `/projects/:id/dashboard` | DashboardPage | 요약: 지표 타일 4 + 활성 스프린트·완료 진행·상태별 분포·담당자별 작업량·마감 임박/지연·최근 업데이트 (집계는 `dashboardMetrics.ts`) |
| `/projects/:id/settings` | ProjectSettingsPage | 일반/사용자·권한/워크플로/이슈 타입 탭, 스킴↔커스텀 전환 |
| 그 외 전부 | → `/home` | |

이슈 상세는 페이지가 아니라 **`?issue=ALM-3` 쿼리로 여는 모달**(`useIssueModal` +
`IssueDetailModal`) — 어느 화면에서든 URL 공유 가능.

## 셸 관례

- 전역 사이드바: 최근/별표/프로젝트(보드 중첩)/필터 섹션, 접기(플로팅 엣지 셰브런),
  드래그 너비 조절(role="separator"). uiStore + `UI_CHANGED_EVENT` 구독으로 갱신.
- 상단바: 전역 검색(SearchModal), 전역 만들기(CreateIssueModal, subtask 제외),
  알림 벨, 전역 관리(⚙), 다크 모드, 사용자/로그아웃.
- 크로스 프로젝트 화면(홈/검색 모달/검색 페이지)의 상태 표기는 `statusMetaByProject()` 메타로,
  프로젝트 스코프 화면은 `listProjectStatuses(projectId)`로 — labels.ts 헬퍼 경유가 원칙.

## 화면 관련 알려진 이슈 (2026-07-19 리뷰)

- 클릭 가능한 요소는 button (백로그 행만 예외적으로 내부에 Dropdown 버튼이 있어
  `role="button"`+tabIndex+Enter/Space 처리 — button-in-button 방지 패턴).
- 시간 표기 혼재: 상대시간 `relTime`은 HomePage 로컬 함수. 다른 화면은 toLocaleDateString/
  toLocaleString/원본 ISO 혼용 — 공용 시간 유틸로 추출 후보.
- `/projects/:projectId` 인덱스 라우트가 없어 bare URL은 빈 아울렛(수동 진입 시에만 해당).
- IssueListPage가 필터 변경마다 라벨 옵션·상태 목록까지 재조회(최초 1회면 충분).
