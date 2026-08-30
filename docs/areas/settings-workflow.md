# 설정 스킴 · 커스텀 워크플로

**파일**: `jiraStore.ts`의 설정 구획(schemes/projectSettings/resolveSettings/migrateIssueStatuses),
`types.ts`(SettingsScheme/SettingsBody/WorkflowStatus), `StatusEditor.tsx`,
`GlobalSettingsPage.tsx`(⚙ /settings/:section), `ProjectSettingsPage.tsx`(/projects/:id/settings/:section — 뷰 탭 밖 별도 페이지, 메뉴는 `SettingsSideNav`).

## 모델 (지라 구조 모방, 설계 v3)

- **스킴**(`SettingsScheme`) = 상태 목록 + 활성 이슈 타입의 묶음. 전역 관리에서 정의하고
  프로젝트가 배정받는다. `scheme-default`는 삭제 불가, 새 프로젝트 자동 배정.
- **프로젝트 커스텀**: `projectSettings.custom`이 non-null이면 스킴 대신 그 본문을 쓴다.
  커스텀 전환 = 현재 스킴 복사, 스킴 복귀 = 이슈 이관 후 custom 폐기.
- **`resolveSettings(projectId)`가 단일 진실** — 화면은 이것만 호출한다.
  파생 API: `listProjectStatuses`(order순), `statusMetaByProject`(크로스 프로젝트 화면용),
  `listAllStatuses`(스마트 검색용 합집합).

## 전역 상태 카테고리 · 상태 레지스트리 (2026-08-30)

지라처럼 **상태는 전역**이고 워크플로(스킴/커스텀)는 그중 무엇을 어떤 순서로 쓸지만 정한다.

- `StatusCategory { id, name, kind, color, order, builtIn }` — 기본 3개(`todo`/`inprogress`/`done`)는
  **의미(kind)를 바꾸거나 지울 수 없다**(이름·색은 가능). 사용자 카테고리(`cat-*`)는 추가·삭제·순서 변경
  가능하되, 쓰는 상태가 있으면 못 지운다.
- `kind: "new" | "active" | "complete"` — **완료 판정·해결 규칙·번다운·보드 정렬·요약 타일은 전부
  의미에서 파생**한다. 화면은 `labels.ts`의 `statusKind()`/`KIND_ORDER`/`KIND_LABELS`를 쓴다.
  `statusCategory()`는 이제 카테고리 **id**(string)를 돌려주며 스마트 검색의 카테고리 필터만 쓴다.
- `StatusDef { id, name, categoryId, description }` — 레지스트리. 이름은 전역 유일. 워크플로가 쓰는 동안
  못 지우고, 카테고리를 옮겨 어떤 워크플로의 의미가 비게 되면 거부한다.
- `SettingsBody.statuses`는 **참조 + 캐시**(`{ id, name, category, order }`). 읽을 때(`resolveSettings`·
  `listSchemes`·`listProjectStatuses`·`statusMetaByProject`)는 레지스트리가 이기고 `kind`/`color`가
  채워져 온다. 저장할 때 본문의 이름·카테고리는 **레지스트리로 관통**된다(`applyBodyToRegistry`) —
  커스텀 본문에서 바꾼 이름도 전역이다(지라와 같음, 프로젝트별 별명은 없다).
- 편집 UI: 전역 관리 → **상태 카테고리**(`StatusCategoriesPanel`) · **상태**(`StatusRegistryPanel`).
  워크플로 상태 편집기(`StatusEditor`)는 이름을 바꾸지 않고 **기존 상태 추가 / 새 상태 만들기(레지스트리
  즉시 등록) / 순서 / 빼기**만 한다. 새 상태는 모달을 취소해도 레지스트리에 남는다(상태 페이지에서 삭제).
- 구버전 localStorage는 `normalize`가 스킴/커스텀에 적힌 상태로 레지스트리를 채운다(무마이그레이션).

## 전역 이슈 타입 레지스트리 (2026-08-30)

- `IssueTypeDef { id, name, icon, color, level, order, builtIn }` — `IssueType`은 이제 **string id**.
  기본 5종(task/story/bug/epic/subtask)은 계층을 바꾸거나 지울 수 없다(이름·아이콘·색은 가능).
- `level: "epic" | "standard" | "subtask"`가 **부모-자식 규칙의 근거**다(`typeLevelOf`) — 상위 타입은
  부모 없음, 일반 이슈의 부모는 상위, 하위 작업의 부모는 일반. 쓰는 이슈가 있으면 계층을 못 바꾼다.
- 아이콘은 `typeIcons.tsx`의 고른 lucide 목록 키(번들에 전체를 넣지 않는다). 화면은 `useIssueTypes()`
  훅으로 레지스트리를 읽고(`ISSUE_TYPES_CHANGED_EVENT`로 갱신), 로드 전엔 `labels.ts`의
  `typeName/typeLevel/typeIcon/typeAppearance` 기본 5종 폴백으로 그린다. `TYPE_LABELS` 직접 인덱싱 금지.
- 스킴/커스텀의 `enabledTypes`는 레지스트리 id 목록. 삭제하면 활성 목록에서도 빠진다. 하위 작업 계층은
  활성 목록과 무관하게 허용(계층 기능). 편집 UI: 전역 관리 → **이슈 타입**(`IssueTypesPanel`).
- **서버(alm-backend)의 `IssueType`은 아직 enum** — 사용자 정의 타입은 목업 전용이고 REST 어댑터는
  "서버가 아직 사용자 정의 이슈 타입을 지원하지 않습니다"로 거부한다. 설정 서버 저장(카테고리·상태·타입·
  스킴)은 백엔드 후속 과제.

## 상태 모델 — 카테고리 불변 전략 (중요)

- `IssueStatus` 타입은 **기본 카테고리 id 3종**("todo"|"inprogress"|"done")이다 — 시드·템플릿·검색이 쓴다. `WorkflowStatus.category`는 임의 카테고리 id(string).
- `Issue.status: string`은 `WorkflowStatus.id`를 가리킨다. 기본 상태의 id가 카테고리 문자열과
  동일해서 구버전 데이터가 무마이그레이션 호환된다.
- **색·완료 판정·통계·정렬은 전부 카테고리에서 파생**한다. 화면은
  `components/labels.ts`의 `statusCategory/statusName/statusAppearance/CATEGORY_ORDER` 헬퍼를 쓴다
  (statuses 미로드 시 기본 3상태 폴백 내장). 직접 `STATUS_LABELS[issue.status]` 인덱싱 금지 —
  잔재가 `BoardColumn.tsx` 폴백에 남아 있다(도달 불가 코드, 정리 대상).
- 검증 규칙(`validateSettingsBody`): **의미(new/active/complete)마다** 상태 최소 1개, 이름 중복 금지(레지스트리 전체),
  카테고리 실재, subtask 타입은 항상 활성. 에러 문구는 그대로 "카테고리(할 일/진행 중/완료)마다 …".

## 전이 규칙 (2026-08-29)

`SettingsBody.transitions?: WorkflowTransition[]` — 어느 상태에서 어느 상태로 갈 수 있는가.

- **비어 있거나 없으면 모든 이동을 허용**한다. 기존 프로젝트가 갑자기 막히지 않게 하는 기본값이다.
- `from: []`은 지라의 "All statuses" 전이 — 모든 상태에서 그 상태로 갈 수 있다.
- 강제 지점은 `assertTransitionAllowed`이며 `updateIssue`·`moveIssue`(보드 드래그) 두 경로가 부른다.
  같은 상태로의 저장은 전이가 아니다. 거부 문구는 상태 **이름**으로 만든다.
- 상태를 지우면 그 상태를 쓰던 전이도 저장 시 정리된다(`pruneTransitions`) — 전역 전이(`from: []`)는
  남고, `from`을 전부 잃은 전이만 버린다.
- 편집 UI는 `WorkflowCanvas`(프로젝트 설정 → 워크플로 구획, 전역 관리 → 워크플로 스킴 편집 모달).
  캔버스는 `@xyflow/react`(MIT)가 그리고 배치는 `@dagrejs/dagre`(MIT)가 왼쪽→오른쪽 랭크로 잡는다
  (`workflowLayout.ts` `computeAutoLayout`; 전이가 없으면 의미 순서 열, 전역 전이는 가상
  `WORKFLOW_ANY_NODE`에서 출발). **캔버스에서 노드 드래그(위치는 `SettingsBody.layout`에 저장),
  손잡이 연결로 전이 추가, 선 선택 + Delete로 삭제**가 되고, 캔버스 아래 목록이 같은 데이터의 키보드
  경로다(캔버스 노드·엣지는 `nodesFocusable/edgesFocusable=false`). 빠진 상태의 위치는
  `pruneLayout`이 정리한다. "자동 배치"는 저장 위치를 비워 dagre로 되돌린다.
- **두 층 모두에서 편집한다**: 전역 관리(⚙)의 "워크플로 편집" 모달이 스킴 전이를, 프로젝트 설정의
  워크플로 탭이 커스텀 전이를 다룬다. 스킴 층이 없으면 전이를 바꾸려고 프로젝트마다 커스텀으로
  돌려야 한다.

## 이관 규칙

상태 구성이 바뀌어 특정 상태가 사라지면, 그 상태의 이슈는 **같은 카테고리의 첫 상태 → 없으면 같은
의미(kind)의 첫 상태 → 없으면 첫 상태**(order순)로 이관된다(`migrateIssueStatuses`). 호출 순서 계약:
**반드시 구성 변경 전에 호출** (4개 경로 전부 준수 중).
알려진 구멍: 보드 컬럼(`board.columns[].status`)은 이관하지 않는다 → store.md 참고.

## UI

- `StatusEditor`는 초안만 다루는 controlled 컴포넌트 — 저장은 부모가
  `updateScheme` 또는 `updateProjectCustomSettings`로 한다. order는 커밋 때 1부터 재부여.
- 마지막 남은 **의미**의 상태는 빼기 버튼 disabled (검증기와 같은 가드).
- 보드는 `listProjectStatuses`를 컬럼 원천으로 쓰므로 상태를 추가하면 컬럼이 자동으로 늘어난다.
  `BoardSettingsModal`의 컬럼 초안도 상태 목록에서 파생된다.
