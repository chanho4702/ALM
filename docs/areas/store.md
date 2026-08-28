# 스토어 (도메인 데이터 계층)

**파일**: `src/features/alm/store/jiraStore.ts` (~1400줄, 현재 localStorage 구현),
`jiraApi.ts`(Project/Issue REST 어댑터, 아직 런타임 미연결), `apiClient.ts`(AuthGate와 공유하는
인증 클라이언트), `mapping.ts`(DTO 변환), `types.ts`(도메인 타입), `uiStore.ts`(내비 UI 상태),
`searchQuery.ts`(스마트 쿼리), `src/mock/seed.ts`(시드).

## 구조 원칙

- 저장 키: 도메인 `alm.jira.v1` / UI 상태 `alm.jira.ui.v1` (uiStore). 서로 섞지 않는다.
- 모든 공개 함수는 async(백엔드 대비)이며 **반환 전 `structuredClone`** — 내부 상태 유출 금지.
- `load()` → `normalize()`가 구버전 데이터에 새 필드를 `??=`로 승격한다. **새 필드를 추가하면
  반드시 normalize에도 기본값을 추가**할 것.
- uiStore 변경은 `UI_CHANGED_EVENT`를 window에 발행 — 사이드바 등이 구독한다.
- 이슈 키(`ALM-7`)는 `issueCounters`로 발번하며 삭제 시 감소시키지 않는다(지라식 키 불변).

## 연쇄 규칙 (삭제/변경 시 같이 정리해야 하는 것)

- `deleteProject`: 이슈·스프린트·코멘트·활동·알림·링크·워크로그·projectSettings·counters·보드 정리,
  화면 쪽에서 `pruneProject`(uiStore 최근/별표)도 호출해야 한다 — **스토어가 강제하지 않으므로
  새 삭제 경로를 만들면 pruneProject 호출을 잊지 말 것**.
- `deleteIssue`: 코멘트·활동·알림·링크·워크로그·자식 parentId 해제까지 정리한다.
- 상태 구성 변경(4경로: `updateScheme`/`assignScheme`/`setProjectCustom(false)`/
  `updateProjectCustomSettings`)은 반드시 **구성을 바꾸기 전에** `migrateIssueStatuses`를 호출한다
  (옛 구성에서 카테고리를 읽기 때문). 이슈와 함께 `board.columns`의 사라진 상태 컬럼도
  이 함수가 정리한다.

## 스프린트 계획 메타 (2026-08-28)

`Sprint`에 `goal`/`plannedStart`/`plannedEnd`(전부 optional, "YYYY-MM-DD")가 있다.
`updateSprint(id, patch)`가 유일한 쓰기 경로다.

- 패치 규칙: 키를 생략하면 유지, 빈 문자열·공백·null을 보내면 **그 필드를 지운다**(키 자체 삭제)
  — 화면·테스트가 "없음"을 `undefined` 하나로 판단하게 하려는 의도다.
- 기간 역전(`plannedStart > plannedEnd`)은 저장 전에 거부한다. 문구는 백엔드 도메인과 동일:
  "시작 예정일은 종료 예정일보다 늦을 수 없습니다".
- 상태와 무관하게 허용한다 — 진행 중 스프린트의 목표도 고칠 수 있다.
- REST 어댑터(`jiraApi.updateSprint`)는 서버가 전체 본문을 받으므로 `GET /api/alm/sprints/{id}`로
  최신 값을 읽어 건드리지 않은 필드를 되돌려 보내고 그때의 `version`을 `expectedVersion`으로 쓴다.
- 계획 합계는 `components/labels.ts`의 `estimateSummary(issues)` — 예상 시간(h) 합과 미입력 건수를
  돌려주고, 스프린트·백로그 머리글이 같은 `PanelEstimateSummary`로 렌더한다. 추정 단위는 시간이며
  스토리 포인트는 도입하지 않았다(roadmap 2026-08-28 §10-1).
- 표시는 `components/labels.ts`의 `formatPlannedRange`(고정 형식 "9월 1일 – 9월 12일") —
  로케일 API를 쓰지 않는다(환경별 표기 흔들림 방지).

## 스프린트 완료 시 이관 (2026-08-28)

`completeSprint(id, { moveUnfinishedTo })` — 미완료 이슈(카테고리 done 아님)를 어디로 보낼지
호출자가 정한다. 생략하거나 null이면 백로그(기존 동작).

- 거부 규칙: 완료하는 스프린트 자신, 다른 프로젝트의 스프린트, 이미 완료된 스프린트.
  검증이 실패하면 완료 자체가 일어나지 않는다(상태가 active로 남는다).
- 문구는 백엔드와 동일하다: "완료하는 스프린트로는 이관할 수 없습니다",
  "완료된 스프린트로는 이관할 수 없습니다", "다른 프로젝트의 스프린트입니다".
- REST 어댑터는 대상이 없으면 `moveUnfinishedToSprintId` 필드를 아예 보내지 않는다
  (서버 기본값 = 백로그).

## 요약 화면 집계는 왜 store가 아니라 pages에 있나 (2026-08-28 판단)

`pages/dashboardMetrics.ts`는 이슈·사용자 배열을 받아 분포·마감 위험·완료율을 계산하는 **순수
함수 모듈**이다. 저장소 접근이 없고 스토어가 이미 돌려준 데이터만 다룬다 — `pages/backlogDnd.ts`·
`boardDnd.ts`와 같은 자리다. 불변 규칙 1이 막는 것은 화면에서의 **localStorage 접근과 도메인
데이터 가공**이며, 스토어가 백엔드 교체 지점이라는 성질은 그대로다.

교차 리뷰(Codex)가 이 배치를 스토어로 옮기라고 지적했고 받지 않았다. 근거: 스토어 공개 API를
화면 전용 집계 6개로 넓히면 교체 지점이 오히려 커지고, 목록 카드가 이슈 배열 자체를 필요로 해
집계만 옮겨도 조회량이 줄지 않는다.

**대신 남는 과제**: 서버 전환 시 프로젝트 요약은 한 번의 집계 조회로 받아야 한다. 지금은 전체
이슈를 받아 화면에서 세므로, `BACKLOG.md` 5번(서버 검색·페이징)과 이 문서 아래 "카운트/집계
엔드포인트 신설 필요" 항목에 요약 집계 API가 함께 들어간다.

## 알려진 이슈 (2026-07-19 리뷰)

- 상태 쓰기(create/update/moveIssue)는 `assertValidStatus`로 검증된다 — 새 쓰기 경로를
  추가하면 같은 가드를 넣을 것.
- `statusCategoryOf`의 폴백(`jiraStore.ts` 내부)은 "상태 id == 카테고리 문자열" 가정의 잔재 —
  못 찾은 커스텀 상태는 todo로 오분류된다. labels.ts의 `statusCategory`도 같은 폴백.
  (쓰기 검증이 생겨 실사용에선 도달하기 어려움)
- `countSchemeProjects`(공유만 카운트)와 `deleteScheme`(커스텀 포함 전체로 차단)의 기준이 달라
  "배정 0개"인데 삭제가 막힐 수 있다.
- `updateIssue`의 estimateHours 검증이 이슈 존재 확인보다 먼저라 에러 메시지가 어긋날 수 있다.

## 백엔드 교체 체크리스트 (jira-service 착수 시)

1. 함수 시그니처는 유지하고 내부만 fetch로 — 화면은 손대지 않는 것이 목표. Project/Issue/Sprint
   REST 계약과 인증 클라이언트 공유는 `jiraApi.ts`에 준비됐다. 부모·마감일·라벨·예상 시간·정렬은
   V2, Sprint 수명주기와 `move`/`rank` 원자적 순위 변경은 V3에 반영됐다. 아래가 서버에 생기기
   전에는 런타임 전환하지 않는다.
   - 프로젝트: 템플릿이 만드는 보드·샘플 이슈와 설정 스킴(워크플로 상태·카테고리)
   - 사용자: 현재 목업의 `u1` 형식 대신 서버 숫자 ID를 제공하는 디렉터리
   - 워크플로 스킴이 서버로 갈 때까지 `completeSprint`는 완료로 볼 상태 목록을 프론트가 보낸다.
2. **카운트/집계 엔드포인트 신설 필요**: 홈(`HomePage`)·디렉터리(`ProjectListPage`)가
   프로젝트마다 `listIssues`를 불러 N+1이다. `countIssuesByProject`, 전 프로젝트 이슈 조회
   (`listAllIssues`) 같은 API를 만들고 화면 호출을 교체할 것.
3. `IssueListPage`는 필터 변경마다 필터본+전체본(라벨 옵션용) 2회 조회한다 — 라벨 옵션은
   최초 1회로 분리 가능.
4. `queryIssues(IssueQuery)`는 GraphQL 인자로 1:1 매핑하도록 설계돼 있다.
5. 낙관적 업데이트·실시간은 `../BACKLOG.md` 2번 참고.
