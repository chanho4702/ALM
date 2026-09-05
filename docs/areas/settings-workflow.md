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
- `StatusDef { id, name, categoryId, description, icon }` — 레지스트리. 이름은 전역 유일. 워크플로가 쓰는 동안
  못 지우고, 카테고리를 옮겨 어떤 워크플로의 의미가 비게 되면 거부한다.
- `SettingsBody.statuses`는 **참조 + 캐시**(`{ id, name, category, order }`). 읽을 때(`resolveSettings`·
  `listSchemes`·`listProjectStatuses`·`statusMetaByProject`)는 레지스트리가 이기고 `kind`/`color`/`icon`이
  채워져 온다. 저장할 때 본문의 이름·카테고리는 **레지스트리로 관통**된다(`applyBodyToRegistry`) —
  커스텀 본문에서 바꾼 이름도 전역이다(지라와 같음, 프로젝트별 별명은 없다).
- 편집 UI: 전역 관리 → **상태 카테고리**(`StatusCategoriesPanel`) · **상태**(`StatusRegistryPanel`).
  워크플로 상태 편집기(`StatusEditor`)는 이름을 바꾸지 않고 **기존 상태 추가 / 새 상태 만들기(레지스트리
  즉시 등록) / 순서 / 빼기**만 한다. 새 상태는 모달을 취소해도 레지스트리에 남는다(상태 페이지에서 삭제).
- 구버전 localStorage는 `normalize`가 스킴/커스텀에 적힌 상태로 레지스트리를 채운다(무마이그레이션).

## 상태 아이콘 (2026-09-05)

`StatusDef.icon` — lucide 키(`typeIcons.tsx`의 `TYPE_ICONS`)를 저장한다. 서버는 V20
`status_def.icon VARCHAR(40) NOT NULL DEFAULT ''`이고, REST 어댑터는 매핑 없이 통과시킨다.
**기본 3상태 시드는 서버·목업이 같다**: `todo → circle` · `inprogress → loader-circle` ·
`done → circle-check`. 미지정(`""`)은 카테고리 의미(kind)의 기본으로 폴백한다 —
`new → circle` · `active → refresh-cw` · `complete → circle-check`.

**두 엔드포인트의 `icon` 의미가 다르다(2026-09-05 백엔드와 확정).** 이걸 섞으면 편집기가
"미지정"을 못 보여 준다.

| 출처 | `icon` 값 | 쓰는 곳 |
|------|-----------|---------|
| `GET/POST /settings/statuses`, `PUT /settings/statuses/{id}` (`listStatusDefs` 등) | **저장 원본** — `""`가 그대로 온다 | 레지스트리 편집기(“카테고리 기본” 표시) |
| 워크플로 본문 `body.statuses[].icon` (`resolveSettings`·`listProjectStatuses`·`listSchemes`) | **해석된 값** — 서버·목업이 kind 기본으로 채워 `""`가 오지 않는다 | 모든 화면 |

- 폴백 표는 세 곳에 같은 값으로 있다: 서버, 목업 `jiraMock.ts`의 `KIND_STATUS_ICON`
  (`enrichStatuses`가 본문을 해석할 때), 화면 `labels.ts`의 `KIND_DEFAULT_STATUS_ICON`
  (`statusIcon()`). 화면 폴백은 죽은 코드가 아니다 — **레지스트리에서 만든 목록**
  (`StatusRegistryPanel`의 미리보기, `StatusEditor`의 `toEntry`)은 저장 원본을 쓰므로 `""`가 온다.
- **쓰기 계약**: `PUT /settings/statuses/{id}`에서 `icon`을 **생략하면 유지**, `""`를 보내면
  미지정으로 되돌린다. 그래서 아이콘 Select의 "카테고리 기본"은 반드시 `""`를 **명시적으로** 보낸다
  (`undefined`/`null` 아님). 키가 40자를 넘으면 서버가 400 `아이콘 키가 너무 깁니다`를 준다.
- 화면은 **`components/StatusGlyph.tsx`만** 쓴다 — `<StatusGlyph status={id} statuses={list} size={14|16} />`.
  모양은 `labels.ts`의 `statusIcon()`, 색은 `statusAppearance()`(카테고리 색)에서 오고 아이콘 자체는 색을
  모른다. **색만으로 구분하지 않는다** — 모양이 다르고, 옆에 늘 이름(Lozenge·머리글)이 있으며
  `role="img"` + `aria-label="상태: 진행 중"`을 갖는다. 색은 `--chanho-color-text-*` 토큰뿐(하드코딩 금지).
- 적용 위치: 보드 컬럼 머리글(옛 색 점 `.board-column-dot`을 대체·삭제), 이슈 목록·검색 표의 상태 셀,
  백로그/스프린트 행, 홈 행, 요약 최근 업데이트, 이슈 상세의 상태 Select 트리거 왼쪽과 하위 이슈·링크 행,
  상태 레지스트리·워크플로 편집기 행, 스킴 미리보기 스트립.
  **DS Select의 옵션 렌더는 문자열만 받는다** — 그래서 옵션이 아니라 트리거 왼쪽에 세운다
  (`.issue-status-field`).
- `WorkflowStatus.icon`은 `kind`/`color`처럼 **읽을 때만 채워지는 파생**이다(목업 `enrichStatuses`,
  서버 `SchemeQueries.enrich`). 저장 본문에는 넣지 않는다.
- 편집 UI는 `StatusRegistryPanel`의 아이콘 Select(`STATUS_ICON_OPTIONS`). Radix 제약으로 "카테고리 기본"은
  빈 문자열이 아니라 센티널(`__category__`)이다.
- 같은 규칙으로 우선순위 아이콘은 `components/PriorityGlyph.tsx`가 그린다. `variant="icon"`은 호출부가
  이름을 따로 그리는 자리용이고(중복 낭독 방지), 기본 `auto`는 아이콘을 못 그릴 때 이름이 보이는
  Lozenge로 폴백한다.

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
- **서버 저장(V11, 2026-08-30)**: 레지스트리·스킴·프로젝트 설정이 alm-backend에 있고(`/api/alm/settings/*`,
  `/api/alm/projects/{id}/settings*`) 같은 규칙(기본값 고정·이름 유일·사용 중 삭제 금지·의미별 최소 1개·이슈 이관)을
  서버가 강제한다. 이슈 타입은 enum이 아니라 레지스트리 id이고, 상태 실재·전이·활성 타입·계층도 서버가 검사한다.
  전역 쓰기는 전역 관리자, 프로젝트 설정 쓰기는 프로젝트 관리자다. REST 어댑터(`jiraApi.ts`)가 같은 시그니처로 미러한다.
  **판정은 org-service gRPC 하나로 한다(2026-09-05)** — Keycloak realm 역할 `ADMIN`을 보던 것을 걷어냈고,
  전역 관리자는 org의 `GLOBAL/ADMIN` grant다(화면의 `/api/org/me.globalRoles`와 같은 원장). 거부는 403
  `{"error"}`이고 계정 상태로 막힌 것이면 문구가 다르다(`승인 대기 중인 계정입니다`·`정지된 계정입니다`·
  `비활성된 계정입니다`), 권한만 모자라면 `전역 관리자만 할 수 있습니다`다. **org-service가 불능이면 403이
  아니라 503 `권한 서비스에 연결할 수 없습니다`** — 화면은 이걸 "권한 없음"으로 그리면 안 된다.

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

## 우선순위 레지스트리 (2026-08-30)

이슈 타입과 같은 구조다: 전역 `PriorityDef`(id·name·icon·color·order·builtIn, 기본 5종 `highest/high/medium/low/lowest`는
삭제 불가·순서가 곧 위계) + `SettingsBody.enabledPriorities`/`defaultPriority`(스킴·프로젝트 커스텀). 이슈의
`priority`는 레지스트리 id(소문자). 생성 시 없으면 기본값, 비활성이면 거부(서버·목업 같은 문구). 화면은
`usePriorities()` + `priorityName/priorityAppearance/priorityRank`(labels.ts)로 그린다 — `PRIORITY_LABELS`는 폴백.

## 링크 타입 레지스트리 (2026-08-30)

전역 `LinkTypeDef`(id·name·outward·inward·order·builtIn, 기본 5종 `blocks/relates/duplicates/causes/clones`).
`outward === inward`면 대칭(양방향) — 역방향도 중복으로 막고 방향 없이(outward) 보인다. 쓰이는 타입은 대칭 여부를
못 바꾸고 삭제 불가. 이슈 상세의 링크 종류 Select는 타입마다 `id:out`(+비대칭이면 `id:in`) 옵션을 `useLinkTypes()`로 만든다.
타임라인 의존선은 여전히 `blocks` id를 본다.

## 필드 구성 (2026-09-04)

지라의 **필드 구성 스킴**을 설정 본문에 얹은 것 — `SettingsBody.fields?: IssueFieldConfig[]`.
스킴(전역)이 정의하고 프로젝트가 배정받으며, "이 프로젝트만 커스텀"으로 덮어쓴다. 서버 V11의
`settings_scheme.body`·`project_settings.custom_body`가 JSON TEXT라 **마이그레이션이 없다**.

- 구성 대상은 13종(`ISSUE_FIELD_IDS`, `store/types.ts`): 설명·담당자·우선순위·라벨·컴포넌트·상위 항목·
  스프린트·마감일·수정 버전·해결·예상 시간·첨부·링크. **프로젝트·타입·요약·상태는 항상 있으므로 목록에 없다.**
  순서 변경은 범위 밖(모달의 지라 필드 순서 고정).
- 각 항목은 `{ id, visible, required }`. 없거나 비면 **전부 표시·비필수**이고, 빠진 id는 읽을 때
  기본값으로 채운다(`normalizeFieldConfigs` / 화면은 `components/fieldConfig.ts`의 `resolveFields`).
  **`fields: []`는 "기본값으로 되돌리기"** 라서, 저장 요청에는 언제나 정규화된 13개를 실어야 한다
  (다른 구획 저장도 `...body` 스프레드로 fields를 보존한다 — 스킴 body PUT은 전체 교체다).
- 규칙(목업·서버 공통, 위반 시 400 — **문구가 서버와 한 글자까지 같다**):
  `없는 필드입니다: {id}` · `같은 필드를 두 번 넣을 수 없습니다: {이름}` ·
  `숨긴 필드는 필수로 지정할 수 없습니다: {이름}` ·
  `해결은 완료 상태에서만 입력하므로 필수로 지정할 수 없습니다` ·
  `상위 항목은 최상위 이슈가 있어야 하므로 필수로 지정할 수 없습니다`.
  **해결·상위 항목은 required 불가**다 — 해결은 완료 상태에서만 입력하고, 구성이 프로젝트 단위라
  상위 항목을 필수로 걸면 그 프로젝트에서 최상위 이슈를 못 만든다. 둘 다 편집기에서 스위치가 잠겨 있다.
  우선순위는 기본값이 늘 있어 required여도 만들기를 막지 않는다(표시만 `*`).
- 필수는 **만들기에서만** 강제한다(`createIssue`) — 수정(PUT)은 검사하지 않는다(기존 이슈를 갑자기 막지 않는다).
  문구는 `{이름}{은|는} 필수입니다`(`withJosa`가 받침으로 고른다). 담당자는 **명시 선택만** 인정한다 —
  프로젝트·컴포넌트 기본 담당자로는 통과하지 않는다.
- **첨부·링크는 required로 저장은 되지만 생성 시 강제하지 않는다**(만든 뒤에 붙는 값) — 만들기 모달은 `*`만
  표시하고 제출을 막지 않는다. 상위 항목은 저장 단계에서 막히므로 생성 검사가 아예 없다.
- **수정 버전은 생성 경로에서 저장된다**(서버 `details.fixVersionId`, 2026-09-04) — 만들기 모달에 Select가
  있고(마감일 다음, 보관된 버전 제외) 목업 `createIssue`도 같은 검증을 한다: 다른 프로젝트의 버전 ·
  보관된 버전 · 없는 버전 거부.
- 편집 UI는 `FieldConfigEditor`(표: 필드·표시·필수) 하나를 두 층이 공유한다 — 전역 관리 → **필드 구성**
  (스킴 카드마다 표 + 저장), 프로젝트 설정 → **필드**(커스텀일 때만 편집, 스킴일 때는 글자로 상태만).
  **비활성 Switch는 켜져 있어도 꺼진 것처럼 보인다**(DS `:disabled`가 `[data-state=checked]`를 덮는다) —
  읽기 전용은 스위치 대신 "표시/숨김"·"필수/선택" 글자를 쓴다.
- 소비: `CreateIssueModal`(숨김 필드는 그리지도 보내지도 않는다, 필수는 `*` + 제출 비활성 — 단 첨부·링크는 `*`만).
  만들기 버튼 옆에 **미충족 필수 항목 한 줄**("필수 항목 미입력: 컴포넌트, 예상 시간")을 두어 비활성 사유를 말한다.
  필수인데 고를 후보가 아예 없으면(컴포넌트 0개) 자리를 숨기지 않고 어디서 만드는지 안내한다.
  `IssueDetailModal`
  `IssueDetailModal`(속성 패널·설명·첨부·링크·하위 이슈; `parent`를 끄면 상위 경로 브레드크럼과 하위 이슈까지 숨긴다),
  `BulkEditModal`(숨긴 필드는 선택지에서 제외). 보드 카드·목록 열은 영향 없다(데이터는 그대로 있다).
  단, **하위 작업 타입을 고르면 상위 항목은 숨겨도 그린다** — 그러지 않으면 만들 수 없는 폼이 된다.

### 이슈 타입별 구성 (2026-09-05)

프로젝트 단위 `fields`가 **기본 구성**이고, 이슈 타입별 덮어쓰기를 같은 본문에 얹는다 —
`SettingsBody.fieldsByType?: Record<이슈 타입 id, IssueFieldConfig[]>`. 본문이 JSON TEXT라 **마이그레이션이 없다**.

- **해석**: `resolveFields(body, typeId)`가 기본 13개 위에 `fieldsByType[typeId]`를 **필드 단위로** 덮는다.
  덮어쓰기에 없는 id는 기본 구성을 그대로 따른다(서버 `overlay(base, override)`와 같은 규칙). 키가 없는 타입은 기본 구성이다.
- **스냅샷이다**: "기본 구성 따름"을 끄면 그 순간의 기본 구성 13개가 복사되어 그 타입의 것이 된다.
  이후 기본 구성을 바꿔도 **덮어쓴 타입에는 전파되지 않는다**(지라 필드 구성 스킴과 같다).
  다시 따르게 하려면 스위치를 켜서 키를 지운다 — 그때부터 기본 구성을 다시 읽는다.
- **응답 shape**: `fields`는 언제나 13개, `fieldsByType`은 **항상 존재**하고(덮어쓰기가 없으면 `{}`)
  덮어쓰기가 있는 타입만 키로 두며 각 목록은 13개 전부다. 목업(`enrichBody`)도 서버와 같게 `{}`를 싣는다.
  **빈 목록(`"bug": []`)은 오류가 아니라 "기본 구성 따름"** 이라 정규화에서 키째 사라진다. 저장할 때
  키를 지우든 빈 배열을 보내든 결과가 같다.
- **타입 id는 레지스트리 id 그대로**다 — `typeDefOf`가 정확히 일치하는 id만 찾으므로 **대소문자를 구분**한다.
  우선순위(`priority`)처럼 소문자로 정규화하지 않는다. `subtask`도 레지스트리 타입이라 유효한 키다
  (그 안의 `parent` 필수 금지는 그대로 적용된다 — 계층 규칙이 이미 상위를 요구한다).
- **규칙 위반은 400**, 문구는 서버와 한 글자까지 같다: 키가 레지스트리에 없으면 `없는 이슈 타입입니다: {id}`,
  각 목록은 기본 구성과 같은 규칙(빈 id는 `필드 id가 비어 있습니다`). 검사 순서는 기본 `fields` 전체 →
  `fieldsByType`을 등장 순서로이며, 잘못된 게 여럿이면 먼저 걸린 하나의 문구만 나간다.
- **비활성화와 삭제는 다르다**: 스킴의 `enabledTypes`에서 타입을 **끄기만** 하면 그 타입의 덮어쓰기는
  본문에 **보존**되어 다시 켜면 살아난다. 레지스트리에서 타입을 **삭제**할 때만(`deleteIssueType`)
  스킴·프로젝트 커스텀 본문 양쪽에서 그 키를 지운다 — 남겨 두면 저장할 때마다 "없는 이슈 타입" 400이 된다.
- **생성 검사는 요청의 타입으로 해석한 구성**을 쓴다(목업 `createIssue`, 서버 `assertRequiredFields`).
  타입을 바꾸는 수정(PUT)은 검사하지 않는다.
- **화면**: `FieldConfigEditor`가 `기본` 탭 + 스킴의 활성 타입 탭(하위 작업 포함)을 그린다. 타입 탭 맨 위의
  **"기본 구성 따름"** 스위치가 켜져 있으면 표는 기본 구성을 읽기 전용으로 보여 주고, 끄면 복사본을 편집한다.
  덮어쓴 타입 탭은 이름 뒤 **"(덮어씀)"** 으로 구분한다(기호는 접근성 이름에 섞이므로 쓰지 않는다).
  소비는 **만들기 모달 = 선택한 타입**(타입을 바꾸면 표시·필수가 즉시 갱신되고 숨긴 값은 보내지 않는다),
  **상세 모달 = `issue.type`**, **대량 변경 = 기본 구성**(여러 타입이 섞이므로)이다.

## 컴포넌트 (2026-08-30)

프로젝트별 `Component`(name·description·leadId·defaultAssignee project|lead|unassigned). 이슈는 `componentIds: string[]`(순서 유지·중복
제거·같은 프로젝트만). 담당자 없이 만든 이슈는 **첫 컴포넌트의 규칙이 프로젝트 기본 담당자보다 우선**한다(unassigned면 미지정, lead면
리더가 있을 때만). 컴포넌트를 지우면 이슈에서 떨어진다. 화면: 프로젝트 설정 > 컴포넌트, 이슈 만들기/상세 체크박스, 목록 필터.
