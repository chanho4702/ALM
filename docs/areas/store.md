# 스토어 (도메인 데이터 계층)

## 파사드 · 목업/REST 전환 (2026-08-30)

`jiraStore.ts`는 **파사드**다 — `jiraMock.ts`(localStorage, 시그니처의 정본)와 `jiraApi.ts`(alm-backend) 중
하나를 **빌드 시점에** 고른다(2026-10-18, 감사 A-12): 파사드는 `@alm-store-impl` 별칭을 import하고
`vite.config.ts`가 `vite build` 또는 `VITE_ALM_DATA=rest`면 jiraApi, 그 밖엔 jiraMock으로 푼다(vitest는 `vitest.config.ts`가
항상 목업). 그래서 프로덕션 번들에는 목업·시드가 없다(CI가 `alm.jira.v1` 문자열로 검사). 런타임 혼합(`{...mock, ...rest}`)은
없고, REST가 목업 계약을 전부 만족하는지는 `jiraStore.ts`의 `RestConformsToStoreContract` 타입 검사가 본다.
`USE_REST`는 구현 모듈의 `STORE_MODE`로 판정한다. 두 어댑터 공용 상수·사전 검증은 `shared.ts`.

**모듈 구조(2026-10-18 분할, 감사 A-22)**: `jiraApi.ts`·`jiraMock.ts`·`types.ts`는 공개 표면만 다시 내보내는 배럴이고
구현은 `api/*.ts`(http·issues·sprints·settings·office…), `mock/*.ts`(db·rules·issues·officeRuns·aiTeam…),
`model/*.ts`(도메인 타입)에 있다. 목업 상태(localStorage 캐시)는 `mock/db.ts` 한 곳, 모듈별 목업 상태는 그 모듈의
reset 함수로 `__resetForTest`가 초기화한다. 새 함수는 해당 도메인 모듈에 두고 배럴·파사드에 export를 더한다.

코멘트·활동·보드·이슈 링크·하위/부모·워크로그는
서버 V12(`/api/alm/issues/{id}/{comments,worklogs,links,activity}`, `/api/alm/boards`)로 옮겼다.
프로젝트 멤버·역할·사용자 디렉터리는 org-service REST(`/api/org/members`, `/api/org/grants`,
`/api/org/me/permissions`)를 어댑터가 직접 부른다 — 역할 변경은 grant `PATCH`, 마지막 관리자 가드는
클라이언트에서 목업과 같은 문구로 막는다. 프로젝트 템플릿은 서버 개념이 아니라 프론트 합성이다(REST도 목업과 같은 순서: 기본 보드 갱신 → Sprint 1 → 샘플 이슈).
**REST 미구현 함수는 없다** — 새 목업 함수를 추가하면 REST도 같이 채운다(빠지면 typecheck가 깨진다).
목업에 함수를 추가하면 파사드에도 줄을 추가한다.

**파일**: `jiraStore.ts`(파사드), `jiraApi.ts`+`api/*`(REST 어댑터), `jiraMock.ts`+`mock/*`(목업),
`shared.ts`(공용 상수·검증), `concurrency.ts`(동시성 상한 병렬), `apiClient.ts`(AuthGate와 공유하는
인증 클라이언트), `mapping.ts`(DTO 변환), `types.ts`+`model/*`(도메인 타입), `uiStore.ts`(내비 UI 상태),
`searchQuery.ts`(스마트 쿼리), `src/mock/seed.ts`(시드).

**2026-10-18 계약(alm-backend)**: 상태 맵은 `GET /api/alm/projects/statuses` 한 번(+60초 세션 캐시, 설정 쓰기 시 무효화),
일괄 편집은 `POST /api/alm/issues/bulk`(행별 결과, 실패 행 키가 없으면 "볼 수 없는 이슈"), 링크 `restricted`(잠금 표시),
검색 페이지 `truncated`(하위 이슈 "N건 중 M건"), 변경 이력 `since·until·limit`+`X-Result-Truncated`(리포트는 since 필수 —
창 앞에 창설된 이슈는 `stateAt`이 현재 값에서 거꾸로 되돌린다), 댓글·워크로그 삭제는 작성자 또는 프로젝트 관리자.

## 구조 원칙

- 저장 키: 도메인 `alm.jira.v1` / UI 상태 `alm.jira.ui.v1` (uiStore). 서로 섞지 않는다.
- 모든 공개 함수는 async(백엔드 대비)이며 **반환 전 `structuredClone`** — 내부 상태 유출 금지.
- `load()` → `normalize()`가 구버전 데이터에 새 필드를 `??=`로 승격한다. **새 필드를 추가하면
  반드시 normalize에도 기본값을 추가**할 것.
- uiStore 변경은 `UI_CHANGED_EVENT`를 window에 발행 — 사이드바 등이 구독한다.
  **저장 필터는 uiStore에 저장되지만 화면이 직접 부르지 않는다** — `jiraStore`의
  `listSavedFilters`/`createSavedFilter`/`updateSavedFilter`/`deleteSavedFilter` 파사드를 거친다
  (REST는 `/api/alm/me/filters`). REST 쪽 쓰기도 같은 이벤트를 직접 발행해 사이드바 동작이 두 모드에서 같다.
- 해결 시각(`Issue.resolvedAt`)은 `setResolution()` **한 곳**에서만 바뀐다 — 해결을 대입하는 새 경로를
  만들지 말고 그 함수를 부를 것(AQL `resolved`가 이 값을 읽는다).
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
  최신 값을 읽어 건드리지 않은 필드를 되돌려 보낸다. `expectedVersion`은 **화면이 편집을 시작할 때 본
  버전**(세 번째 인자, 필수)이다 — 저장 시점에 읽은 버전을 쓰면 그 사이 남의 저장을 조용히 덮어쓴다.
  이슈(`updateIssue`·`setIssueParent`·`bulkUpdateIssues` 대상별 버전)·프로젝트(`updateProject`)도 같은
  규칙이고, 목업도 버전을 세어 어긋나면 `ApiError(409)`를 던진다. 화면은 409에서 초안을 버리지 않고
  "최신 내용 불러오기"/"내 변경 다시 적용(최신 버전 기준)" 중 하나를 사용자가 고르게 한다
  (이슈 상세 모달·스프린트 계획 모달·프로젝트 일반 설정). 보드 이동·랭크는 서버처럼 버전을 올리지 않는다.
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

## 프로젝트 멤버·역할 (2026-08-29)

`members: ProjectMember[]`가 프로젝트별 역할을 담는다. 역할 3단계(`viewer`/`editor`/`admin`)는
**org-service `GrantRole`(VIEWER/EDITOR/ADMIN)과 1:1**이다 — 권한의 단일 진실 소스는 org-service이고
목업은 같은 규칙을 흉내낼 뿐이다. 서버 전환 시 `/api/org/grants`와 `/api/org/members`로 갈아끼운다.

- 불변 규칙: **프로젝트에 관리자가 최소 한 명**. 마지막 관리자의 강등·제거는 거부한다.
- `createProject`는 만든 사람을 관리자로 넣고, `normalize`는 멤버가 없는 기존 프로젝트에
  현재 사용자를 관리자로 보정한다 — 아무도 설정을 못 고치는 프로젝트를 만들지 않는다.
- `deleteProject`가 멤버 기록도 지운다.
- 화면은 `getMyProjectRole`로 관리 UI를 보일지 정한다(관리자만 편집).
- **쓰기 가드**: `assertCanEdit`(뷰어 거부)·`assertCanAdmin`(관리자 전용)이 스토어 쓰기 경로를 막는다.
  이슈 생성·수정·보드 이동·랭크·삭제와 스프린트 수명주기는 편집 권한, 프로젝트 수정·삭제·설정 스킴·
  멤버 변경은 관리자 권한이다. 순서는 **존재 확인 → 권한 확인**(백엔드 `requireProject` → `require`와 동일).
  새 쓰기 경로를 추가하면 같은 가드를 넣는다 — 빠지면 "뷰어 = 읽기만"이 화면의 빈말이 된다.
- 이력 정렬은 `at`만으로 한다(안정 정렬로 기록 순서 유지). id가 UUID라 동률에서 id로 비교하면
  "마지막 변경"이 실행마다 달라져 테스트가 간헐 실패한다.

## 해결(Resolution) (2026-08-29)

`Issue.resolution: IssueResolution | null` — "왜 끝났는가". 값은 지라 기본 4종(`done`/`wont_do`/
`duplicate`/`cannot_reproduce`)이고 규칙은 `applyResolutionRule` 한 곳에 있다.

- 완료 카테고리로 **들어가면** `"done"`이 기본값, 완료에서 **벗어나면** `null`(다시 열기).
- 명시한 값은 기본값보다 우선하되, 완료가 아닌 이슈에 설정하면 거부한다
  ("완료된 이슈에만 해결을 설정할 수 있습니다").
- **서버가 정본**(2026-10-24 A1, `ResolutionRule`) — 목업 `applyResolutionRule`은 같은 규칙의 대역이다. 수정(PUT)은
  **현재 값과 다를 때만** 지정으로 본다(화면이 들고 있던 값을 다시 보내므로). 완료 안에서 null 지정은 기본값, 기본값은
  전환 후처리 `setResolution`이 있으면 그 값.
- 적용 지점: `createIssue`·`updateIssue`·`moveIssue`·`transitionIssue`·트리아지 처리. 새 상태 쓰기 경로를 만들면 여기도 태운다.
- `normalize`가 도입 전 데이터의 완료 이슈를 `"done"`으로 백필한다(설정 정규화 뒤에 판정).
- 활동로그 `type: "resolution"`으로 이전값 → 새값을 남긴다.
- REST 어댑터는 값만 옮긴다(`details.resolution`) — 기본값·해제 규칙은 서버가 적용한다.

## 워처 · 알림 (2026-08-30)

`watchers` + `listWatchers`/`watchIssue`/`unwatchIssue`. 보고자(생성자)·담당자는 자동 워처. 알림 대상은
**워처 ∪ 담당자 − 행위자**(`notificationRecipients`) — 상태 변경·코멘트가 그 대상에게, 배정은 새 담당자에게
간다. REST(서버 V9)는 `type + detail`만 주므로 어댑터가 문장을 만든다(사용자 이름 디렉터리가 아직 없어
행위자는 id로 표시 — 사용자 디렉터리 연동 때 이름으로 바꾼다).

## CSV · 가져오기 (2026-08-30)

`store/csv.ts`(순수): `parseCsv`/`toCsv`(RFC 4180), `issuesToCsv`(사람이 읽는 이름으로 내보냄),
`csvToIssueInputs`(우리 헤더 + 지라 영문 헤더 별칭, 행 단위 오류 분리). `importIssues(projectId, inputs)`는
행마다 `createIssue` — `key`가 있으면 보존하고 카운터를 그 번호 이상으로 앞당긴다(`{프로젝트키}-N` 형식·유일
검증). REST 어댑터는 서버 일괄 API(`POST /api/alm/projects/{id}/issues/import`)로 한 번에 보내고 서버가 키를 보존한다.

## 대량 변경 (2026-08-30)

`bulkUpdateIssues(ids, patch)` / `bulkDeleteIssues(ids)` — 이슈마다 `updateIssue`/`deleteIssue`를 거쳐
전이 규칙·권한·타입 검증이 그대로 적용되고, 막힌 이슈는 `failed[{id,key,reason}]`로 분리한다(전부
롤백 없음). 같은 값인 필드는 변경으로 세지 않는다. 라벨은 `addLabels`/`removeLabels` 합성. 화면은
이슈 목록의 체크박스 + 대량 작업 툴바(`BulkEditModal`). REST 어댑터는 서버 일괄 API가 없어 이슈마다
호출한다.

## 상태 카테고리 · 상태 레지스트리 (2026-08-30)

`statusCategories`/`statusDefs` + `listStatusCategories`/`createStatusCategory`/`updateStatusCategory`/
`moveStatusCategory`/`deleteStatusCategory`, `listStatusDefs`/`statusDefUsage`/`createStatusDef`/
`updateStatusDef`/`deleteStatusDef`. 모델·규칙은 settings-workflow.md "전역 상태 카테고리 · 상태
레지스트리" 절. 핵심: 완료 판정은 `kind === "complete"`(`statusKindOf`), 화면은 `statusKind()`.

## 첨부 (2026-08-30)

`attachments: Attachment[]`(메타)와 `uploadAttachment`/`listAttachments`/`downloadAttachment`/
`deleteAttachment`. **바이트는 목업에서 메모리(Map)에만** 있다 — localStorage는 5MB 한계와 base64
팽창 때문에 부적합하고, 새로고침하면 바이트만 사라진다(메타는 남는다). 의도된 한계.

- 내려받기 계약은 목업·REST 모두 **Blob**이다. REST는 인증 헤더가 필요해 `<a href>`로 직접 열 수
  없고, 화면이 Blob을 object URL로 저장한다.
- 올리기/삭제는 편집 권한, 삭제 연쇄는 `deleteIssue`·`deleteProject`. 활동로그 `type: "attachment"`.
- 서버는 클라이언트 Content-Type을 믿지 않고 매직 바이트로 판별한다(wiki-backend와 같은 정책).
  인라인 표시는 래스터 이미지 4종만 허용, 다운로드는 항상 attachment 처분.

## 버전(릴리스) (2026-08-30)

`versions: ProjectVersion[]`(프로젝트별, 이름 유일)와 `Issue.fixVersionId`. 상태는 지라와 같은
`unreleased`/`released`/`archived`.

- `createVersion`·`updateVersion`(이름 중복·날짜 역전 거부)·`releaseVersion`·`archiveVersion`·
  `deleteVersion`(달린 이슈의 수정 버전을 비운다)·`versionProgress`(카테고리 done 기준).
- **릴리스 규칙**: 미완료 이슈는 `moveUnresolvedTo`가 있으면 그 버전(같은 프로젝트·미릴리스만)으로,
  없으면 **그대로 둔다**(지라 기본). 대상 검증 실패 시 릴리스 자체가 일어나지 않는다.
- 이슈에 달 수 있는 버전: 같은 프로젝트이고 보관되지 않은 것(`assertVersionAssignable`).
- REST 어댑터의 `releaseVersion(id, doneStatuses, {moveUnresolvedTo})`는 스프린트 완료와 같은 규칙으로
  완료 상태 목록을 프론트가 보낸다(서버 V7, `moveUnresolvedToVersionId`).
- 활동로그 `type: "fixversion"`.

## 변경 이력 (2026-08-29)

`changes: IssueChange[]`가 상태·스프린트 소속 변경을 남긴다. 서버 `issue_change_log`와 같은 모양이라
REST 전환 때 계약이 바뀌지 않는다. `listProjectChanges(projectId, {field, sprintId, since})`로 읽는다.

- 기록 지점: `createIssue`(최초 상태·편입), `recordChanges`(수정·보드 이동·랭크 이동),
  `completeSprint`(이관), `migrateIssueStatuses`(구성 변경 이관). **새 상태 쓰기 경로를 만들면
  여기도 남긴다** — 빠지면 리포트 재생이 사라진 상태를 계속 되살린다.
- 삭제 연쇄: `deleteIssue`·`deleteProject`가 `changes`도 지운다.
- **완료 이관 식별 규칙**: 스프린트 완료로 한꺼번에 옮긴 이력은 `at === sprint.completedAt`이다.
  리포트가 이 동일성으로 "완료로 옮긴 것"과 "사람이 도중에 뺀 것"을 구분한다. 서버도 같은 규칙이며
  한 트랜잭션이 한 시각을 공유하도록 맞춰져 있다(백엔드 `SprintService.complete`).
- 날짜 경계는 **로컬 달력** 기준이다(`reportMetrics`). 시드의 기간 문자열도 로컬 기준으로 만든다 —
  UTC로 섞으면 자정 근처에서 계단이 하루 밀린다.

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
2. **서버 검색·집계 계약(2026-10-16, `store/issueSearch.ts`)**: `findIssues(조건, 페이지, 정렬)`·
   `aggregateIssues(조건, groupBy)`·`listProjectLabels(projectId)`를 목업·REST가 같은 의미로 구현한다.
   홈은 목적별 상위 N건 검색(최근 15·내 미완료 50·기한 지남/마감 임박 8 + total·담당자 필요)으로,
   대시보드 상태/담당자/우선순위 가젯은 집계 한 번씩으로, 목록의 라벨 선택지는 라벨 엔드포인트로 받는다 —
   이슈 전량을 읽지 않는다. 상태 조건은 `statuses`(상태 id)와 `statusCategories`(분류 id, 커스텀 상태도
   소속 분류로 걸림)를 나눠 보낸다. REST 어댑터는 같은 URL의 동시 GET을 응답 전까지만 하나로 묶는다(캐시 아님).
   스프린트 번업 가젯은 스프린트에 들어왔다 나간 이슈까지 범위에 넣어야 해 아직 프로젝트 전량을 읽는다.
3. `IssueListPage`는 검색을 250ms 묶고 필터·정렬·페이지 변경 시 해당 페이지만 서버에 묻는다(정렬도 서버 —
   담당자 열은 서버 정렬이 없어 정렬 버튼을 내지 않는다). 사용자·상태 등 메타데이터는 프로젝트 진입·저장 후에만
   갱신하며, 라벨 조회가 첫 페이지 표시를 막지 않는다. CSV 내보내기는 현재 페이지(또는 선택)만이며 버튼·알림이 그렇게 말한다.
4. `queryIssuesPage(IssueQuery, 페이지)`는 서버 페이징이며 `total`이 검색 화면의 건수다.
5. 낙관적 업데이트·실시간은 `../BACKLOG.md` 2번 참고.

## 데모 데이터 시더 · 목업 시드 (2026-09-05)

`store/sampleData.ts`의 `seedDemoProject(project, api)`는 "데모 프로젝트(풍부한 샘플)" 템플릿이
만드는 데이터를 채운다. **스토어 함수만 부른다** — localStorage도 fetch도 직접 만지지 않고,
목업(`jiraMock`)과 REST(`jiraApi`)가 각자 `SampleDataApi`를 채워 넘긴다(의존성 주입). 그래서 같은
코드가 두 모드에서 그대로 돈다. 만드는 것: 이슈 46(에픽 4·표준 36·하위 작업 6, 그중 2건 보관),
스프린트 3(완료·활성·계획), 릴리스 3(1.0 릴리스됨), 컴포넌트 4, 라벨 8종, 링크 5, 코멘트 15(멘션 2),
워크로그 12, 가젯 5개 대시보드 1.

- **전부 순차 호출**이다. REST는 낙관적 락(`expectedVersion`)이라 병렬로 부르면 409가 난다.
  `Promise.all`을 넣지 말 것.
- `completeSprint(id, options)`·`releaseVersion(id, options)`는 목업과 REST가 **같은 시그니처**다.
  완료 판정은 서버가 워크플로 의미(`complete`)로 하므로 프론트가 `doneStatuses`를 보내지 않는다 —
  화면도 시더도 어댑터를 구분하지 않는다. 되살리면 시더 계약 테스트가 컴파일에서 막는다.
- 시더가 부르는 함수를 늘리면 `SampleDataApi`·`SAMPLE_DATA_API_FUNCTIONS` 둘 다에 넣는다 —
  목록이 빠지면 컴파일이 깨지고, 어댑터에 함수가 없으면 계약 테스트가 잡는다.
- 기존 4개 템플릿(빈/스크럼/칸반/버그)의 동작은 그대로다. 데모만 `richSeed: true`로 시더를 탄다.

목업 기본 시드(`src/mock/seed.ts`)의 `createSeedData({ rich })`: `rich`는 **dev 서버에서만** 켜져
(`import.meta.env.MODE === "development"`) 두 번째 프로젝트(위키 제품, WIKI-1~8)와 ALM-9~17을
얹는다(총 이슈 25·스프린트 2·버전 1·컴포넌트 3·코멘트 6·워크로그 4). 테스트는 항상 `rich: false`라
ALM-1~8 그대로다 — 시드 개수를 하드코딩한 단언이 여럿이라(testing.md) 기본 시드를 키울 수 없다.

## 보관·휴지통 (2026-08-30)

목업은 보관된 이슈를 `data.archivedIssues`로, 휴지통 프로젝트를 `data.trashedProjects`로 **옮긴다** — 그래서 기존 조회
(`data.issues`/`data.projects`)는 손대지 않고도 자동으로 빠진다. 서버는 같은 효과를 `@SQLRestriction`(issue.archived_at,
project.deleted_at)으로 낸다. 프로젝트 보관(`archivedAt`)은 읽기 전용 가드(`assertCanEdit/assertCanAdmin`)로 막고,
보관 해제·휴지통 이동만 `assertAdminIgnoringArchive`로 우회한다. `deleteProject`는 이제 휴지통 이동이며 실제 삭제는 `purgeProject`.

## 프로필 사진 (아바타) (2026-09-05)

`User.avatarUrl`은 **화면이 `<Avatar src>`에 그대로 넣을 수 있는 URL**이다. 사람을 그리는 자리는 전부
`components/UserAvatar.tsx`를 쓴다(`<Avatar name>` 직접 사용 금지 — 사진이 있어도 이니셜로 나온다).
프로젝트 아이콘은 별개다(`ProjectAvatar`).

- 쓰기 경로는 `uploadMyAvatar(file)` / `removeMyAvatar()` 둘뿐이고, 자기 사진만 바꾼다. 상한은
  `AVATAR_MAX_BYTES`(목업 200KB, REST 2MB)이며 **화면 안내 문구가 이 값을 읽는다** — 숫자를 화면에
  하드코딩하지 말 것. 타입·크기 검증은 `assertAvatarFile`(목업 정본)을 REST도 함께 쓴다.
- 목업은 `data.avatars[userId] = dataURL`로 localStorage에 넣는다(첨부 바이트와 달리 새로고침해도
  남아야 하기 때문). base64가 약 1.37배로 부풀고 localStorage가 5MB라 상한이 서버보다 훨씬 작다.
- **저장소는 org-service다**(`member_profile`, V7) — ALM이 아니다. 그래서 같은 사진을 위키·보드도
  볼 수 있다. ALM 전용 엔드포인트(`/api/alm/me/avatar`, `/api/alm/users/avatars`,
  `/api/alm/users/{id}/avatar`)와 `user_preference.avatar_key`는 없어졌다(alm-backend V21).
  경로는 `PUT`/`DELETE /api/org/me/avatar`(multipart `file`, PUT 응답 `{memberId, avatarUrl, updatedAt}`),
  바이트는 `GET /api/org/members/{id}/avatar`.
- **REST는 `<img src="/api/org/members/{id}/avatar">`를 쓸 수 없다.** 인증이 메모리 Bearer 토큰이고
  (`auth/client.ts`) 쿠키는 refresh 전용이라 브라우저가 `<img>` 요청에 Authorization 헤더를 붙이지
  않는다(첨부 내려받기와 같은 제약). 그래서 `sharedApiFetch`로 바이트를 받아 object URL로 바꾼다.
- **경로는 목록이 함께 준다 — 병합 호출이 없다.** `GET /api/org/members`의 각 행에
  `avatarUrl`(nullable)·`avatarUpdatedAt`이 실려 오고, `listUsers`는 사진이 있는 사용자만 바이트를
  받는다. 멤버 목록 조회 자체가 실패하면 **던진다**(사용자 목록은 부가 정보가 아니다).
- **바이트 경로는 서버가 준 `avatarUrl`을 그대로 쓴다 — 프론트가 조립하지 않는다.** 그 문자열에
  버전이 들어 있어 사진이 바뀌면 경로가 달라진다. object URL은 memberId별로 `{경로, url}`을 들고
  있다가 경로가 바뀌면 이전 것을 `revokeObjectURL`로 놓아준다(바이트 응답에
  `Cache-Control: private, max-age=300`이 붙어 브라우저 HTTP 캐시와 겹친다). 서버가 경로를 안 주고
  `avatarUpdatedAt`만 주면 그때만 `/api/org/members/{id}/avatar?v=…`로 조립한다(폴백).
- **`/api/org/me` 응답은 캐시하지 않는다** — 캐시하면 내가 다른 탭에서 바꾼 사진이 영원히 안 보인다.
  진행 중인 요청만 합친다(in-flight dedup). 비싼 쪽은 바이트이고 그건 경로 단위 캐시가 막는다.
- 업로드 응답 `{memberId, avatarUrl, updatedAt}`으로 **방금 올린 로컬 바이트를 새 경로에 등록**한다 —
  올린 직후 목록을 다시 불러도 바이트를 두 번 받지 않는다.
- **선검증은 서버를 대신하지 않는다.** 서버는 확장자·MIME이 아니라 **매직 바이트**로 판별하므로
  이름만 `.png`인 GIF·SVG는 통과 후 400이 난다. 화면은 서버 `{error}`를 항상 그대로 띄운다.
  `assertAvatarFile`(목업·REST 공용)의 문구는 서버와 **글자까지 같다**: `빈 파일은 올릴 수 없습니다`,
  `아바타는 PNG·JPG·WebP 이미지만 올릴 수 있습니다`, `아바타는 2MB 이하 이미지여야 합니다`.
- 목록에 있던 사용자의 바이트가 404(`아바타가 없습니다`)면 그 사이 지워진 경합이다 — 에러를 띄우지
  말고 조용히 이니셜로 떨어진다.
- `getMyPreferences().avatarUrl`은 읽기 전용이고 **`GET /api/org/me`**(`{id, displayName, email,
  avatarUrl, avatarUpdatedAt}`)에서 온다 — ALM 개인 설정 응답에는 더 이상 아바타가 없다. 사진이
  없으면 바이트 요청 없이 null이고, `saveMyPreferences`는 avatarUrl을 보내지 않는다(저장소가 다르다).
  `/api/org/me` 조회가 실패해도 개인 설정은 이니셜로 살아 있다(부가 정보).
- 사진을 바꾸면 `AVATAR_CHANGED_EVENT`를 window에 발행한다 — 이미 그려진 상단바 아바타(`AppShell`)가
  구독해 새로고침 없이 따라온다. 새 아바타 소비처가 오래 살아 있다면 같은 이벤트를 구독할 것.
- 위키·보드도 `/api/org/members`의 `avatarUrl`을 그대로 쓰면 같은 사진이 보인다(각 프론트의 표시
  적용은 별건). 목업(`jiraMock.ts`)은 이관과 무관하게 그대로다 — `data.avatars`에 dataURL을 넣는다.

## 조직 프로필 · 사용자 검색 (2026-09-05)

`getMyOrgProfile()`이 `GET /api/org/me`를 **계정 상태·전역 역할의 단일 진실 소스**로 읽는다
(설계 §3.3: `{id, displayName, email, status, kind, globalRoles[], teams[], joinedVia}`). ALM이
예전에 쓰던 `/api/org/me/permissions`의 `GLOBAL/ADMIN` grant 조회는 관리자 판정에서 빠졌다 —
위키와 같은 응답을 봐야 두 앱이 같은 사람을 같게 본다. `getMyProjectRole`은 프로젝트 역할을
읽는 것이므로 그대로 `me/permissions`를 쓴다.

- 목업은 **항상 `{status: "ACTIVE", globalRoles: ["ADMIN"]}`**이다 — 목업 개발자가 승인 대기
  화면에 갇히거나 관리자 화면을 못 보면 안 된다. 상태별 화면은 유닛 테스트가 프로필을 주입한다.
- REST는 **실패하면 던진다**. 아바타가 쓰는 `myProfile()`만 따로 삼킨다(사진은 부가 정보).
  진행 중 요청은 하나로 합치고(in-flight dedup) 캐시는 하지 않는다.
- 서버가 `status`를 안 주면 `ACTIVE`로 읽는다. 모른다고 PENDING으로 가정하면 멀쩡한 사용자가
  승인 대기 화면에 갇힌다.
- `listUsers({ q })`가 사용자 검색이다. REST는 `GET /api/org/members?q=`(서버가 이름·이메일
  부분일치), 목업은 이름 부분일치다. 빈 문자열·공백만이면 필터 없이 전체.
- 프로젝트 역할 변경은 **`PATCH /api/org/grants/{id}`** 제자리 갱신이다(설계 §3.2). 삭제 후
  재생성으로 되돌리지 말 것 — 두 요청 사이에서 실패하면 멤버가 통째로 사라진다.
- `hasAnyProjectAdmin()`은 "어느 프로젝트든 관리자인가"다. 초대 화면 진입만 이 값으로 연다
  (설계 §3.2). REST는 `getMyProjectRole`과 같은 `GET /api/org/me/permissions`를 읽고, 조회가
  실패하면 화면이 닫는다. **허용 범위(자기 리소스로 제한)는 서버가 강제한다** — 화면은 진입만
  열고 거절 문구는 서버 `{error}`를 그대로 띄운다.
- `store/orgApi.ts`의 `orgApiFetch`가 `@chanho/org-admin`에 넘기는 인증 fetch다. REST 모드는
  `sharedApiFetch` 그대로, 목업 모드는 `/api/org/me`만 목업 프로필로 답하고 나머지는 501
  `{"error"}`로 거절한다(개발 서버가 index.html을 200으로 돌려주는 최악의 실패를 막는다).

## 웨이브 A·C·D·트리아지·자동화 (2026-10-24)

파사드에 더한 함수(목업·REST 둘 다, REST 계약은 alm-backend README가 정본):

| 영역 | 함수 | REST |
|---|---|---|
| 워크플로 엔진 | `listIssueTransitions`, `transitionIssue` | `GET/POST /issues/{id}/transitions` |
| 플래그 | `setIssueFlag(issueId, flagged, comment?)` — 버전 안 올림 | `PUT /issues/{id}/flag` |
| 계획 필드 | `createIssue`/`updateIssue`의 `startDate`·`storyPoints`(+ 생성 `triage`) | 요청 `planning`(보낸 키만) |
| 추정·속도 | `getEstimationSummary`, `getVelocity(projectId, unit, limit)` | `/estimation/summary`, `/reports/velocity` |
| 저장된 보기 | `listMyViews`, `listProjectViews`, `getView`, `createView`, `updateView(id, patch, expectedVersion)`, `deleteView` | `/me/views`, `/projects/{id}/views`, `/views/{id}` (filter null → `clearFilter`) |
| 트리아지 | `getTriageSettings`, `saveTriageSettings`, `listTriage`, `sendToTriage`, `acceptTriage`, `declineTriage`, `duplicateTriage`, `snoozeTriage` | `/projects/{id}/triage*`, `/issues/{id}/triage*` |
| 자동화 | `listAutomationRules`, `getAutomationRule`, `create/update/deleteAutomationRule`, `listAutomationRuleRuns`, `listProjectAutomationRuns` | `/projects/{id}/automation/*`, `/automation/rules/{id}*` |

- 이슈 응답 `startDate`·`storyPoints`(BigDecimal은 수로)·`flagged`·`triageState`(소문자) — 구 응답은 null/false.
- **트리아지 대기 이슈는 `listIssues`(보드·백로그용)에서 빠진다.** REST는 검색 API에 트리아지 조건이 없어 어댑터가
  거른다(백엔드에 `triage` 파라미터 요청). 검색·AQL(`triage = true`)에는 나온다.
- 목업 자동화 엔진(`mock/automation.ts`)은 같은 호출 안에서 동기로 돈다 — 사람 경로가 **저장 뒤** `emitIssueEvent`를
  부르고, 액션은 같은 스토어 함수를 탄다. 안전장치(규칙 변경은 allowRuleTrigger만 깨움·깊이 3·핑퐁 LOOP_BLOCKED·분당 30회
  RATE_LIMITED 자동 비활성·연속 5회 실패 자동 비활성·액션 묶음 원자성 = 캐시 스냅숏 되돌리기)는 서버와 같다. 예약
  트리거는 목업에 스케줄러가 없어 돌지 않는다. 되돌리기가 캐시를 바꿔 끼우므로 **emit 뒤에는 `load()`로 다시 읽는다**.
- 필드 구성은 15종(`startDate`·`storyPoints` 추가). AQL 새 필드 `startDate`·`storyPoints`·`flagged`·`triage`(목업 평가기 포함).


## Linear 강점 반영 계약 (2026-10-24, alm-backend README "실시간 동기화·사이클·추정 척도·알림 인박스")

- **실시간 스트림** `streamProject(projectId, {signal, lastEventId, onOpen, onActivity, onEvent})` — REST는 `GET /projects/{id}/stream`을
  fetch 스트리밍(`Accept: text/event-stream`, `Last-Event-ID`), 프레임 → `ProjectStreamEvent`(`realtimeMapping.ts`, id는 문자열, 낯선 issue/sprint
  프레임은 reset으로 접는다). 오류 종류는 `eventStream.ts`의 `StreamError`(401·403 unauthorized / 404·405 unsupported / 429 rate-limited / 그 밖 network).
  목업은 같은 계약의 대역이고 신호는 테스트·개발 훅(`__emitProjectStreamEvent`·`__simulateRemoteIssueChange`)으로만 흐른다(MockOnly — REST 빌드에서 undefined).
  재연결·판정은 화면 쪽(`components/useReconnectingStream.ts`, `components/realtime/ProjectRealtime.tsx`).
- **알림 인박스** `listNotificationInbox({filter, cursor, limit})` → `{items, nextCursor, unreadCount}`, `snoozeNotification`/`unsnoozeNotification`,
  `archiveNotification`/`unarchiveNotification`, `bulkNotifications(ids, read|unread|archive|unarchive)`. 알림에 `snoozedUntil`·`archivedAt`(옛 서버는 null).
  목업은 서버 규칙을 흉내 낸다 — 미뤄 둔 동안 배지·전체에서 빠지고, 해제 시각이 지나면 그 시각 자리(맨 위)에 읽지 않음으로 돌아온다(`sortAt`).
  목업 알림 생성(`pushNotification`)도 이제 `type`을 싣는다(멘션·할당 필터).
- **계획 설정** `getPlanningSettings`/`updatePlanningSettings(projectId, patch, expectedVersion)` — 보낸 항목만, 409. 목업 저장은 `data.planningSettings`
  (normalize `??= {}`). 척도 검사(`assertPointsInScale`)는 포인트가 **바뀔 때만**(서버와 같은 문구). 타입·순수 함수는 `model/cycles.ts`(`allowedPointsOf`·`formatPoints`).
- **스프린트 완료** `completeSprint(id, {moveUnfinishedTo?, carryOver?: "next"|"backlog"})` → `SprintCompletion`(= Sprint + `carryOver | null`).
  우선순위: 스프린트 id > carryOver > 설정 기본값(REST는 아무것도 안 보내면 서버가 설정을 쓴다). 목업은 서버처럼 다음 스프린트 자동 생성(끝 숫자 +1, 서울 날짜 + 쿨다운·길이).
- **검색 `triage`** — `IssueSearchCriteria.triage`(true 대기열만 / false 제외 / 생략 둘 다). REST `listIssues`(보드·백로그)는 `triage=false`로 묻고 total로 끝까지 읽는다.
- **uiStore 사용자별 자리** — 즐겨찾기(`favoritesByUser`)·이슈 만들기 초안(`createDraftsByUser`)은 `setUiUser(id)`(AppShell이 현재 사용자를 읽으면)로 주인을
  정한다. 그 전 값은 익명 자리에 있다가 물려받는다. 옛 `starredProjectIds`는 프로젝트 즐겨찾기로 읽히고 첫 쓰기 때 옮겨 적힌다. 테스트는 `vitest.setup.ts`가 매번 익명으로 되돌린다.
