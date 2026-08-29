# 설정 스킴 · 커스텀 워크플로

**파일**: `jiraStore.ts`의 설정 구획(schemes/projectSettings/resolveSettings/migrateIssueStatuses),
`types.ts`(SettingsScheme/SettingsBody/WorkflowStatus), `StatusEditor.tsx`,
`GlobalSettingsPage.tsx`(⚙ /settings), `ProjectSettingsPage.tsx`(워크플로/이슈 타입 탭).

## 모델 (지라 구조 모방, 설계 v3)

- **스킴**(`SettingsScheme`) = 상태 목록 + 활성 이슈 타입의 묶음. 전역 관리에서 정의하고
  프로젝트가 배정받는다. `scheme-default`는 삭제 불가, 새 프로젝트 자동 배정.
- **프로젝트 커스텀**: `projectSettings.custom`이 non-null이면 스킴 대신 그 본문을 쓴다.
  커스텀 전환 = 현재 스킴 복사, 스킴 복귀 = 이슈 이관 후 custom 폐기.
- **`resolveSettings(projectId)`가 단일 진실** — 화면은 이것만 호출한다.
  파생 API: `listProjectStatuses`(order순), `statusMetaByProject`(크로스 프로젝트 화면용),
  `listAllStatuses`(스마트 검색용 합집합).

## 상태 모델 — 카테고리 불변 전략 (중요)

- `IssueStatus` 타입은 이제 **카테고리**("todo"|"inprogress"|"done")를 뜻한다.
- `Issue.status: string`은 `WorkflowStatus.id`를 가리킨다. 기본 상태의 id가 카테고리 문자열과
  동일해서 구버전 데이터가 무마이그레이션 호환된다.
- **색·완료 판정·통계·정렬은 전부 카테고리에서 파생**한다. 화면은
  `components/labels.ts`의 `statusCategory/statusName/statusAppearance/CATEGORY_ORDER` 헬퍼를 쓴다
  (statuses 미로드 시 기본 3상태 폴백 내장). 직접 `STATUS_LABELS[issue.status]` 인덱싱 금지 —
  잔재가 `BoardColumn.tsx` 폴백에 남아 있다(도달 불가 코드, 정리 대상).
- 검증 규칙(`validateSettingsBody`): 카테고리마다 상태 최소 1개, 이름 중복 금지,
  subtask 타입은 항상 활성.

## 전이 규칙 (2026-08-29)

`SettingsBody.transitions?: WorkflowTransition[]` — 어느 상태에서 어느 상태로 갈 수 있는가.

- **비어 있거나 없으면 모든 이동을 허용**한다. 기존 프로젝트가 갑자기 막히지 않게 하는 기본값이다.
- `from: []`은 지라의 "All statuses" 전이 — 모든 상태에서 그 상태로 갈 수 있다.
- 강제 지점은 `assertTransitionAllowed`이며 `updateIssue`·`moveIssue`(보드 드래그) 두 경로가 부른다.
  같은 상태로의 저장은 전이가 아니다. 거부 문구는 상태 **이름**으로 만든다.
- 상태를 지우면 그 상태를 쓰던 전이도 저장 시 정리된다(`pruneTransitions`) — 전역 전이(`from: []`)는
  남고, `from`을 전부 잃은 전이만 버린다.
- 편집 UI는 `WorkflowCanvas`(설정 → 워크플로 탭). 캔버스는 `@xyflow/react`(MIT)가 그리고
  **편집은 캔버스 아래 목록에서** 한다 — 드래그로만 편집하면 키보드 사용자와 테스트가 닿지 못한다.
  캔버스는 보기 전용(노드 고정 + `inert`)이라 규칙이 한 곳에만 있고 탭 순서에도 끼어들지 않는다.
- **두 층 모두에서 편집한다**: 전역 관리(⚙)의 "워크플로 편집" 모달이 스킴 전이를, 프로젝트 설정의
  워크플로 탭이 커스텀 전이를 다룬다. 스킴 층이 없으면 전이를 바꾸려고 프로젝트마다 커스텀으로
  돌려야 한다.

## 이관 규칙

상태 구성이 바뀌어 특정 상태가 사라지면, 그 상태의 이슈는 **옛 구성에서 읽은 카테고리와 같은
카테고리의 첫 상태(order순)** 로 이관된다(`migrateIssueStatuses`). 호출 순서 계약:
**반드시 구성 변경 전에 호출** (4개 경로 전부 준수 중).
알려진 구멍: 보드 컬럼(`board.columns[].status`)은 이관하지 않는다 → store.md 참고.

## UI

- `StatusEditor`는 초안만 다루는 controlled 컴포넌트 — 저장은 부모가
  `updateScheme` 또는 `updateProjectCustomSettings`로 한다. order는 커밋 때 1부터 재부여.
- 마지막 남은 카테고리 상태는 삭제 버튼 disabled (검증기와 같은 가드).
- 보드는 `listProjectStatuses`를 컬럼 원천으로 쓰므로 상태를 추가하면 컬럼이 자동으로 늘어난다.
  `BoardSettingsModal`의 컬럼 초안도 상태 목록에서 파생된다.
