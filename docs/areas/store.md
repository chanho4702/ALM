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

1. 함수 시그니처는 유지하고 내부만 fetch로 — 화면은 손대지 않는 것이 목표. Project/Issue REST
   계약과 인증 클라이언트 공유는 `jiraApi.ts`에 준비됐다. 단, 아래 필드가 서버에 생기기 전에는
   런타임 전환하지 않는다. 부모·마감일·라벨·예상 시간·정렬의 기본 저장 계약은 V2에 반영됐다.
   - 이슈: Sprint 엔티티/API와 sprintId, 상태·스프린트 그룹 내 원자적 순위 변경
   - 프로젝트: 템플릿이 만드는 보드·스프린트·샘플 이슈와 설정 스킴
   - 사용자: 현재 목업의 `u1` 형식 대신 서버 숫자 ID를 제공하는 디렉터리
2. **카운트/집계 엔드포인트 신설 필요**: 홈(`HomePage`)·디렉터리(`ProjectListPage`)가
   프로젝트마다 `listIssues`를 불러 N+1이다. `countIssuesByProject`, 전 프로젝트 이슈 조회
   (`listAllIssues`) 같은 API를 만들고 화면 호출을 교체할 것.
3. `IssueListPage`는 필터 변경마다 필터본+전체본(라벨 옵션용) 2회 조회한다 — 라벨 옵션은
   최초 1회로 분리 가능.
4. `queryIssues(IssueQuery)`는 GraphQL 인자로 1:1 매핑하도록 설계돼 있다.
5. 낙관적 업데이트·실시간은 `../BACKLOG.md` 2번 참고.
