# 백로그 DnD 설계 (2026-07-17)

지라 클론 고도화 2차(합의된 분해안의 2번). 백로그 화면에서 이슈를 **드래그로**
스프린트↔백로그 간 이동하고 패널 안에서 순서(랭크)를 바꾼다. 지금은 Dropdown 메뉴로만
이동 가능하고 순서 변경은 불가능하다.

## 원칙

- `order` 필드 재사용 — 백로그 랭크와 보드 컬럼 순서가 한 필드를 공유한다.
  보드 `moveIssue`는 (프로젝트·스프린트·상태) 컬럼 안에서 1..n 재번호하므로 상태가 다른
  이슈끼리 order가 충돌할 수 있다 → **정렬 tiebreaker(key)** 를 두어 항상 결정적으로 보이게 한다.
- Dropdown 이동 메뉴는 유지한다 (키보드/보조 수단).
- 다중 선택 드래그는 범위 제외 (후속 라운드).

## 스토어 (`jiraStore.ts`)

- **신규 `rankIssue(id, to: { sprintId: string | null; beforeId?: string }): Promise<Issue>`**
  - 대상 그룹 = 같은 프로젝트 + `to.sprintId`의 이슈 전체(상태 무관, 이동 이슈 제외), order↑(동률 key) 정렬
  - `beforeId` 앞에 삽입, 없거나 그룹에 없으면 맨 뒤 (moveIssue와 같은 관용 — 화면은 이후 재조회)
  - 그룹 전체 order를 1..n로 재부여, `sprintId` 변경 시 활동로그(sprint)·updatedAt 기록
- `listIssues`·`listBoardIssues` 정렬을 `order↑, key↑`로 통일 (결정적 표시)

## DnD 변환기 (`pages/backlogDnd.ts` 신규)

`resolveBacklogMove(activeId, overId, panels): { sprintId, beforeId? } | null`

- `panels`: 패널 키(`"backlog"` 또는 sprintId) → order순 이슈 id 배열
- overId가 패널 키면 그 패널 맨 뒤 (이미 그 패널 맨 뒤면 null)
- overId가 행이면 소속 패널을 찾아 boardDnd.resolveMove와 같은 삽입 규칙:
  같은 패널에서 아래로 = over 다음 행 앞, 그 외 = over 행 앞
- 패널 키 `"backlog"` ↔ `sprintId: null` 매핑은 이 모듈이 담당

## 화면 (`BacklogPage` + `SprintPanel`)

- `DndContext`(PointerSensor distance 5 — 행 클릭=상세 유지) + `DragOverlay`(행 프리뷰)
- 각 패널(`SprintPanel` 본문·백로그 목록)이 droppable — id는 `"backlog"` 또는 sprintId,
  패널별 `SortableContext` + 행 sortable 래퍼(`SortableBacklogRow`, SortableIssueCard 패턴)
- 드래그 중 드롭 대상 패널 강조(`.is-over`) — 보드 컬럼과 동일한 시각 언어
- DragEnd → `resolveBacklogMove` → `rankIssue` → toast 없이 재조회(빈번한 조작이라 조용히),
  실패 시에만 danger toast

## 테스트

- 스토어: rankIssue 패널 간 이동(맨 뒤/beforeId 정밀 삽입/재번호 1..n), 활동로그, stale beforeId 관용
- `backlogDnd.test.ts`: 변환 규칙 단위 테스트 (boardDnd.test 패턴)
- 화면 DnD는 jsdom 포인터 시뮬레이션 한계로 변환기+스토어 단위로 커버 (보드 DnD와 동일 접근),
  기존 BacklogPage 테스트(Dropdown 이동 포함)는 그대로 통과

## 범위 제외

다중 선택 드래그, 스프린트 패널 순서 변경, 보드↔백로그 크로스 화면 DnD.
