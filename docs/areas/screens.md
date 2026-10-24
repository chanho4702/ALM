# 화면 지도 (라우트 · 셸 · 페이지)

**파일**: `src/app/App.tsx`(라우트), `components/AppShell.tsx`(상단바+전역 사이드바),
`components/GlobalSideNav.tsx`, `components/ProjectLayout.tsx`(프로젝트 헤더+뷰 탭),
`pages/*`. basename은 `/alm`(vite/router), nginx SSO 뒤에 산다(AuthGate, 프로덕션 빌드에서만).

## 라우트 지도

| 라우트 | 파일 | 요지 (지라 대응) |
|---|---|---|
| `/home` | HomePage | For you 홈: 인사말 → 이어서 하기 카드 → 추천 작업/나에게 배정됨/최근 업데이트/별표 탭 |
| `/search` | SearchPage | 이슈 검색: 기본(필터 드롭다운)/스마트 2모드 → search.md |
| `/settings/org/*` | OrgAdminPage(lazy) | **조직 관리** — 공용 패키지 `@chanho/org-admin`을 통째로 마운트한다(사용자·초대·팀·전역 역할·승인 대기). 위키(`/admin/org/*`)와 **같은 화면**이라 이 리포에 복제하지 않는다. `basePath="/settings/org"`, 인증 fetch는 `store/orgApi.ts`, 프로젝트 이름은 `resolveResource`로 호스트가 준다. **초대 화면만은 프로젝트 관리자도 진입**(설계 §3.2 — 리소스 ADMIN도 초대 가능, `hasAnyProjectAdmin()`으로 판정)하고 나머지 네 화면은 전역 관리자 전용이다. 목업 모드에서는 권한 통과 뒤 "REST 모드에서만" 안내. 프로젝트 권한 화면의 "초대하기"는 `?scope=PROJECT&resourceId=&role=EDITOR` 프리셋을 달아 보낸다(패키지가 읽고 쿼리를 즉시 지운다) |
| `/settings/:section` | GlobalSettingsPage | 전역 관리(⚙): `categories`(상태 카테고리)·`statuses`(상태 레지스트리)·`issue-types`(이슈 타입 레지스트리)·`fields`(필드 구성 — 스킴별 표시/필수)·`types`(이슈 타입 스킴)·`workflows`(워크플로 스킴). `/settings`는 `types`로 redirect. 구획 메뉴는 **설정 사이드바**(SettingsSideNav) |
| `/projects` | ProjectListPage | 디렉터리: 테이블 기본(★/이름/키/이슈/생성일/⋯) + 카드 토글 + 검색 |
| `/projects/new` | ProjectCreatePage | 템플릿(빈/스크럼/칸반/버그 트래킹/**데모 프로젝트**) 미리보기 생성. "데모 프로젝트"는 `store/sampleData.ts` 공용 시더가 이슈 46·스프린트 3·릴리스 3·컴포넌트 4·코멘트 15·워크로그 12를 채운다 — 목업·REST 같은 코드, 관리자 롤 불필요, 여러 번 만들면 키만 다른 데모가 하나씩 더 생긴다 |
| `/projects/:id/board` | BoardRedirect | 기본 보드로 redirect (?issue 쿼리 보존) |
| `/projects/:id/boards/:boardId` | BoardPage | 칸반: 동적 상태 컬럼, DnD, 퀵필터, 스윔레인(담당자/에픽), WIP |
| `/projects/:id/backlog` | BacklogPage | 스프린트 패널 + 백로그, DnD 랭크/이동 |
| `/projects/:id/issues` | IssueListPage | 목록: 필터 6종 + 정렬 테이블, ?issue=키로 상세 모달 |
| `/projects/:id/triage` | TriageInboxPage(lazy) | **트리아지 인박스**(V35, Linear Triage) — 뷰 탭 "트리아지"는 프로젝트 설정 › 트리아지에서 켠 경우만(`useTriageEnabled`). 대기·보류·전체 탭, 왼쪽 목록 + 오른쪽 상세, 수락(상태·담당자·우선순위·코멘트)·중복(원본 검색)·거절(이유)·보류(프리셋), 키 j/k·1·2·3·H. 대기 이슈는 일반 전환이 막혀 있어 상태 버튼을 두지 않는다 |
| `/projects/:id/timeline` | TimelinePage(lazy) | 간트: **SVAR React Gantt**(`@svar-ui/react-gantt` 2.7, MIT) — 그리드(이슈/시작/종료) + 차트, 상위(에픽)는 요약 막대와 접힘 트리, 차단 링크는 끝→시작 의존선, 오늘 마커, 일/주/월 눈금. 읽기 전용(막대 드래그로 마감일 변경은 후속). 테마 변수(`--wx-*`)를 우리 토큰으로 덮는다. 그래픽을 못 그리는 환경(jsdom)은 이슈 목록 + 일정 표 대체본 |
| `/projects/:id/releases` | ReleasesPage(lazy) | 릴리스 허브: 버전 만들기·진행률·릴리스(미완료 이관 선택)·보관·삭제 |
| `/projects/:id/reports` | ReportsPage(lazy) | 번다운(Recharts·MIT) + 스프린트 리포트(완료/미완료/스코프 변경), 집계는 `reportMetrics.ts`. 벨로시티는 서버 속도 리포트(`getVelocity`, 단위 스토리 포인트·예상 시간·이슈 수) |
| `/projects/:id/dashboard` | DashboardPage | 요약: 지표 타일 4 + 활성 스프린트·완료 진행·상태별 분포·담당자별 작업량·마감 임박/지연·최근 업데이트 (집계는 `dashboardMetrics.ts`) |
| `/projects/:id/ai-office` | AiOfficePage(lazy) | **AI 사무실**(agent-service P3a) — 뷰 탭 맨 끝, `useAiTeamActive()`가 참일 때만 탭이 붙는다. 탑다운 픽셀 캔버스(인라인 SVG, 매트릭스 원본 `office/matrices.ts`, 팔레트 `--office-*`) + 개인 오피스 패널(비모달) + 팀 카드(`?view=team`, 캔버스의 텍스트 대안). 무효화 스트림(P4c `GET /api/agent/office/stream`, `office/useOfficeStream.ts` — fetch 스트리밍·1초 스로틀·백오프 재연결·429/401 폴백·45초 무응답 재연결·탭 숨김 시 닫음)이 살아 있으면 신호마다 즉시 재조회 + 60초 폴링, 아니면 10초 폴링(탭 숨김 시 중단). 요약 바 "마지막 갱신"에 실시간/폴링 표지. 목업은 테스트에서 스트림 없음(`__setMockOfficeStream`), 목업 dev에서는 변경마다 신호를 흉내 낸다. 갈무리11 폰트(OFL)는 이 청크에서만 로드. 디자인 스펙: 설계문서 `plans/2026-09-26-p3a-office-design.md` |
| `/projects/:id/ai-office/runs` · `/runs/:runId` · `/gates` | AgentRunsPage·AgentRunDetailPage·AgentGatesPage(lazy, 각자 청크) | **AI 팀 감독**(P3a AGP-12/13) — 사무실 밖이라 DS 표준만(픽셀 스타일·폰트 없음). 실행 기록: DS Table + 서버 페이지(P4c, 20건, id 내림차순, `?page=` 1부터)·상태(`?status=`)·페르소나(`?persona=`)·범위(`?scope=all`, 기본은 서버 `projectId`) 필터 — 구 백엔드 배열 응답도 `mapAgentRunPage`가 페이지로 접는다. 상세: 단건 API `GET /runs/{id}`(지시문·오류 로그는 관리자만, 그 밖은 "(관리자만 볼 수 있음)") — 404/405면 목록 폴백. 계보(부모·파생·같은 이슈 시도 순)는 최신 100건 기준. 승인 인박스: 결정 대기 전부 / `?archive=1` 최근 50건, `?persona=`(run→personaId). 취소·재개·승인·거절은 전역 관리자(`isGlobalAdmin`)에게만 보이고 확인 다이얼로그 → 서버 `{error}` 토스트. 30초 폴링 + 수동 새로 고침. 순수 규칙은 `office/runModel.ts` |
| `/projects/:id/settings/:section` | ProjectSettingsPage(lazy) | **프로젝트 뷰(ProjectLayout) 바깥의 별도 페이지.** 구획 `general`/`members`/`components`/`workflow`(상태·전이 캔버스 + 전환 규칙 + 이슈 타입별 워크플로)/`types`/`fields`(필드 구성 — 커스텀일 때만 편집)/`triage`(트리아지 켜기·대기 수)/`automation`(자동화 규칙 — 프로젝트 관리자 전용: 목록·편집기·감사 로그·자동 비활성 사유)/`import`(지라 CSV 이관 마법사), `/settings`는 `general`로 redirect. **진입은 사이드바 프로젝트 행의 ⋯ 메뉴** — 뷰 탭에는 설정이 없다 |
| 그 외 전부 | → `/home` | |

이슈 상세는 페이지가 아니라 **`?issue=ALM-3` 쿼리로 여는 모달**(`useIssueModal` +
`IssueDetailModal`) — 어느 화면에서든 URL 공유 가능.

## 셸 관례

- **계정 상태 게이트**: `AuthGate`(로그인) 뒤, 셸보다 바깥에 `OrgAccountGate`(`components/OrgAccountGate.tsx`)가
  있다. `/api/org/me`를 **앱 전체에서 한 번** 읽어 PENDING(승인 대기, 공용 패키지 화면)·SUSPENDED·
  DEACTIVATED면 셸 대신 안내를 그리고, 조회가 실패하면 앱을 열지 않는다(fail-closed). 통과한 값은
  `useOrgProfile()`로 내려간다 — **전역 관리자 판정의 유일한 기준은 `globalRoles`에 `"ADMIN"`이
  있는가**다(예전의 `/api/org/me/permissions` 찔러보기 없음). 프로바이더 밖에서는 관리자가 아니다.

- 관리자 전용 구획(개인 설정 두 개를 뺀 `GLOBAL_SETTINGS_SECTIONS` 전부 + `사용자·팀`)은 사이드바와
  ⚙ 메뉴에서 감춰지고, URL을 직접 쳐도 GlobalSettingsPage가 안내로 막는다(`isAdminOnlyGlobalSection`).
  **예외는 `/settings/org/invitations` 하나**다 — 프로젝트 관리자도 사람을 초대할 수 있어야 하므로
  라우트만 열어 둔다(메뉴에는 여전히 안 보이고, 링크는 프로젝트 설정의 "초대하기"뿐이다).
  패키지 내비게이션에는 다섯 탭이 다 보이므로 다른 탭으로 넘어가면 그때 안내로 막힌다.

- **설정 라우트(`/settings/*`, `/projects/:id/settings/*`)에서는 전역 사이드바 자리를 설정 사이드바
  (`SettingsSideNav`)가 차지한다** — 돌아가기 → 머리(무엇의 설정인가) → 구획 메뉴. 구획은 URL이
  진실이라 새로고침·공유가 되고, 페이지 컴포넌트는 `useParams().section`으로 한 구획만 그린다.
  판별은 `isSettingsPath`, 구획 목록은 `PROJECT_SETTINGS_SECTIONS`/`GLOBAL_SETTINGS_SECTIONS`.

- 전역 사이드바: 최근/별표/프로젝트(보드 중첩)/필터 섹션. 프로젝트 행은 호버 시 ⋯ 메뉴(설정·이슈 목록), 접기(플로팅 엣지 셰브런),
  드래그 너비 조절(role="separator"). uiStore + `UI_CHANGED_EVENT` 구독으로 갱신.
- 상단바: 전역 검색(SearchModal), 전역 만들기(CreateIssueModal, subtask 제외),
  알림 벨, 전역 관리(⚙), 다크 모드, 사용자/로그아웃.
- 크로스 프로젝트 화면(홈/검색 모달/검색 페이지)의 상태 표기는 `statusMetaByProject()` 메타로,
  프로젝트 스코프 화면은 `listProjectStatuses(projectId)`로 — labels.ts 헬퍼 경유가 원칙.

## 화면 관련 알려진 이슈 (2026-07-19 리뷰)

- 클릭 가능한 요소는 button (백로그 행만 예외적으로 내부에 Dropdown 버튼이 있어
  `role="button"`+tabIndex+Enter/Space 처리 — button-in-button 방지 패턴).
- 시간 표기는 `components/time.ts` 하나로 통일했다(2026-09-04): 날짜 `2026-09-04`, 일시 `2026-09-04 14:03`,
  상대 `3시간 전`. 새 화면도 `toLocale*`를 직접 쓰지 말고 이 헬퍼를 쓴다.
- `/projects/:projectId` 인덱스 라우트가 없어 bare URL은 빈 아울렛(수동 진입 시에만 해당).
- IssueListPage는 필터·페이지 조회와 메타데이터 갱신을 분리한다. 검색은 250ms 디바운스하며,
  이전 요청의 늦은 응답을 버린다. 갱신 중 기존 결과를 유지하고 오래된 결과의 대량 작업을 잠근다.
  메타데이터는 진입·저장 후에 갱신하고 라벨 전량 조회 중에도 첫 페이지와 상세·페이지 이동은 사용할 수 있다.

## 로딩과 좁은 화면

- 홈·프로젝트 디렉터리 외 주요 라우트는 `React.lazy`로 나누고 `LazyPage`가 본문만 기다린다.
  셸·프로젝트 탭은 계속 사용할 수 있으며 청크 실패 시 새로고침을 제공한다.
- 만들기·검색·이슈 상세 모달은 열 때만 로드한다. `LazyModal`은 로딩 중 닫기·Escape와 실패 복구를 제공한다.
- 720px 이하에서는 상단 메뉴 버튼으로 DS 모달 내비게이션을 연다. 메뉴 선택·Escape로 닫히며,
  데스크톱 사이드바 접힘 설정은 유지된다. 프로젝트 표는 좁은 화면에서 가로로 스크롤한다.
- 프로젝트 디렉터리는 보관 필터를 검색어와 무관하게 적용한다. 개수 조회 실패를 0으로 표시하지 않고
  재시도를 제공하며, 프로젝트 삭제는 실제 서버 계약대로 휴지통 이동·복원을 안내한다.

## 대시보드(가젯) · 워크로그 (2026-08-30)

`/dashboards` 목록(내 것 + 공유) → `/dashboards/:id` 2열 그리드. 가젯 배치(`DashboardGadget[]`)만 서버에 저장하고 데이터는 각
가젯이 스토어에서 읽는다(`DashboardGadgets.tsx`의 `renderGadget`). 가젯 추가는 `AddGadgetModal`(종류별로 프로젝트·기간·쿼리만 묻는다).
워크로그는 `listProjectWorklogs(projectId, {since, until})` + `worklogMetrics.worklogSummary`로 사람별·날짜별 합산 — 가젯 "기록 시간"과
리포트 종류 "워크로그"가 같은 표(`WorklogTable`)를 쓴다.

## 키보드 단축키 · 이슈 목록 열 표시 (2026-10-24, F-13·F-14)

**단축키**(지라 클라우드 기준, 우리 화면이 있는 것만): 전역 `?` 도움말(`ShortcutHelpModal`) · `/` 상단바 검색란 포커스(좁은 화면은 검색 모달) ·
`c` 이슈 만들기 · `g`+`d` 대시보드 목록 · `g`+`p` 프로젝트 목록 · `g`+`b` 현재 프로젝트 보드 · `g`+`i` 현재 프로젝트 이슈 목록(프로젝트 밖은 `/search`).
이슈 목록 `j`/`k` 행 커서(키 셀 `aria-current`) · `o` 열기. 이슈 상세 `e` 제목 편집 · `a` 담당자 선택지 펼침 · `i` 나에게 할당 · `l` 라벨 입력 · `m` 코멘트 탭+에디터.
- 규칙은 `components/keyboardShortcuts.ts`(순수 — 무시 조건·시퀀스 매처), 등록은 `useKeyboardShortcuts`(window keydown 하나씩).
  input/textarea/select/contenteditable·열린 listbox/menu·Select 트리거(combobox)에 포커스면 무시, `isComposing`/229 무시, Ctrl/Meta/Alt 무시, 시퀀스 1초.
- 화면 단축키는 **모달이 하나라도 열려 있으면 무시**한다. 이슈 상세 단축키는 `dialogRef`로 "자기 모달이 유일하게 열린 모달"일 때만 — 삭제 확인 등 중첩 모달이 뜨면 멈춘다. Esc는 DS 모달이 스스로 처리한다.
- 끄기: 개인 설정 > 일반 설정 "키보드 단축키 사용"(uiStore `keyboardShortcuts`, localStorage — 서버 개인 설정 계약은 건드리지 않았다. 바로 반영, "저장" 버튼과 무관).
- 도움말 목록(`SHORTCUT_GROUPS`)과 실제 바인딩(AppShell·IssueListPage·IssueDetailModal)은 손으로 맞춘다 — 하나를 바꾸면 둘 다.

**열 표시·숨김**: 이슈 목록 툴바 "열" 팝오버(`ColumnPicker`, FilterDropdown과 같은 패널) — 체크박스로 끄고 켜며, 키·제목(·선택)은 잠김. "기본값으로"는 표시·순서·너비를 모두 지운다.
저장은 열 순서·너비와 같은 `uiStore` `tablePrefs.issues.hidden`. 숨긴 열이 있을 때 표가 알려 주는 순서는 보이는 열뿐이라
`useTablePrefs(tableId, allKeys)`가 `mergeColumnOrder`로 숨긴 열의 자리를 지킨다(다시 켜도 원래 자리로).
