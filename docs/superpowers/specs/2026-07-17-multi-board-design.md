# 다중 보드 + 보드 고도화 설계 (2026-07-17)

지라 클론 프론트 고도화 1차. 사용자와 합의한 분해안(1 다중 보드+보드 고도화 → 2 백로그 DnD →
3 이슈 관계 → 4 상세 검색/필터 저장 → 5 프로젝트 템플릿) 중 **1번**의 스펙이다.

## 합의된 방향 (브레인스토밍 결정)

1. **보드 = 필터 뷰**: 이슈는 계속 프로젝트 소속. 보드는 "보는 방법"(저장 필터·컬럼 이름/WIP·
   스윔레인)만 저장한다. 상태는 todo/inprogress/done 3개 유지 — 컬럼 추가/삭제는 범위 밖.
2. **보드 타입**: `scrum`(활성 스프린트 이슈만 — 현행 보드 동작) | `kanban`(스프린트 무관,
   필터에 걸리는 프로젝트 전체 이슈).
3. **내비게이션**: 전역 사이드바의 프로젝트 하위 "보드" 항목 아래 **보드 목록을 중첩**.
   라우트 `/projects/:projectId/boards/:boardId` 신설, 기존 `/board`는 기본 보드로 redirect.

## 데이터 모델 (`store/types.ts`)

```ts
export type BoardType = "scrum" | "kanban";
export type BoardSwimlane = "none" | "assignee";

export interface BoardColumn {
  status: IssueStatus;      // 3개 고정 (todo/inprogress/done 각 1개)
  name: string;             // 표시 이름 (기본: 할 일/진행 중/완료)
  wipLimit: number | null;  // null = 제한 없음
}

export interface BoardFilter {
  assigneeIds: string[];    // 빈 배열 = 전체 (요소 "unassigned" = 미지정 포함)
  types: IssueType[];       // 빈 배열 = 전체
  labels: string[];         // 빈 배열 = 전체
}

export interface Board {
  id: string;
  projectId: string;
  name: string;
  type: BoardType;
  filter: BoardFilter;
  columns: BoardColumn[];   // 항상 길이 3, status 순서 고정
  swimlane: BoardSwimlane;  // 기본 스윔레인 (화면에서 임시 전환 가능)
  isDefault: boolean;       // 뷰 탭 "보드"가 여는 보드
  createdAt: string;
}

// JiraData에 boards: Board[] 추가
```

**마이그레이션(normalize)**: `data.boards ??= []` 후, 보드가 하나도 없는 프로젝트마다
기본 스크럼 보드를 만든다 — `{ name: "메인 보드", type: "scrum", filter: 전체,
columns: 기본 3컬럼(wipLimit null), swimlane: "none", isDefault: true }`.
`createProject`도 동일한 기본 보드를 함께 생성한다. 시드에는 기본 보드 + 칸반 보드
1개("백엔드 팀", 라벨 backend 필터, 진행 중 WIP 2)를 넣어 데모를 돕는다.

## 스토어 API (`jiraStore.ts`)

- `listBoards(projectId): Board[]` — isDefault 우선, 생성순
- `getBoard(id): Board | null`
- `createBoard({ projectId, name, type }): Board` — 필터 전체/기본 컬럼/스윔레인 none으로 생성
- `updateBoard(id, patch: { name?, filter?, columns?, swimlane? }): Board`
  - 이름 공백 거부. columns는 status 3종 1개씩인지 검증. wipLimit은 1 이상 정수 또는 null.
- `deleteBoard(id): void`
  - 프로젝트의 **마지막 보드는 삭제 금지**(throw "마지막 보드는 삭제할 수 없습니다").
  - 기본 보드를 삭제하면 남은 보드 중 첫 번째가 `isDefault`로 승격.
- `listBoardIssues(boardId): Issue[]`
  - scrum: 활성 스프린트 이슈 (활성 스프린트 없으면 빈 배열)
  - kanban: 프로젝트 전체 이슈 (백로그 포함)
  - 공통: 보드 저장 필터(assigneeIds/types/labels) 적용, order 오름차순
- `deleteProject` 연쇄 삭제에 boards 포함

## 라우팅 (`App.tsx`)

| 경로 | 동작 |
|---|---|
| `/projects/:projectId/boards/:boardId` | `BoardPage` (해당 보드) |
| `/projects/:projectId/board` | 기본 보드로 `<Navigate replace>` (기존 URL·테스트 호환) |

존재하지 않는 boardId → 기본 보드로 redirect.

## 내비게이션

- **GlobalSideNav**: 현재 프로젝트 확장 시 "보드" 항목이 다시 한 단계 중첩 —
  보드 목록(활성 보드 강조) + "+ 새 보드"(생성 모달: 이름/타입).
- **ProjectLayout 뷰 탭 "보드"**: 기본 보드로 이동. 탭 활성 판정은 `/boards/` 경로도 보드 탭으로 인식.
- **브레드크럼**: 변화 없음 (프로젝트/이름).

## 보드 화면 (`BoardPage` 개편)

상단(탭 아래) 한 줄 — 좌측부터:
1. **보드 이름 + 타입 Lozenge**(스크럼/칸반) + 스크럼이면 활성 스프린트 뱃지
2. **퀵 필터바**(저장 필터와 별개, 화면 상태): 검색 TextField(제목·키),
   **담당자 아바타 스택**(클릭 토글, 다중, "미지정" 포함), 타입 Select, 라벨 Select, 초기화 버튼
3. 우측: **그룹 Select**(없음/담당자 — 보드 `swimlane`이 초기값, 화면에서 임시 전환),
   **⋯ 메뉴**(보드 설정 모달, 보드 삭제)

**컬럼**: 커스텀 이름 표시 + `이름 N` 카운트. `wipLimit`이 있으면 `이름 N/limit`으로 표시하고
**초과 시 헤더와 컬럼 테두리를 danger로 강조**(이동 자체는 허용 — 지라와 동일).
컬럼 하단 인라인 생성은 유지(스크럼: 활성 스프린트로, 칸반: 백로그로 생성).

**스윔레인(담당자별)**: 그룹=담당자일 때 담당자마다 가로 밴드(이름+개수 헤더, 그 아래 3컬럼).
"미지정" 밴드는 마지막. DnD는 밴드 안에서 동작하며 상태 변경만 반영(담당자 변경은 범위 밖).

**보드 설정 모달**: 이름, 저장 필터(담당자/타입/라벨 다중 선택), 컬럼별 이름·WIP 입력,
기본 스윔레인, "기본 보드로 지정", 삭제(확인 모달, 마지막 보드면 비활성).

## 테스트

- 스토어: 보드 CRUD·검증(이름/WIP/마지막 보드 삭제 금지·기본 승격), scrum/kanban
  `listBoardIssues` 차이, 저장 필터 적용, normalize가 기본 보드를 만드는 마이그레이션
- UI: `/board` → 기본 보드 redirect, 사이드바 보드 중첩·전환, 퀵 필터바(아바타 토글·검색),
  스윔레인 렌더(담당자 밴드·미지정 마지막), WIP 초과 강조, 새 보드 생성 흐름
- 기존 보드 DnD 테스트는 기본 보드 경로에서 그대로 통과해야 한다

## 범위 제외

에픽 스윔레인(서브 프로젝트 3 이후), 컬럼 추가/삭제(상태 모델 확장 필요), 보드별 백로그,
퀵 필터 저장(서브 프로젝트 4에서 "내 필터"로), 보드 순서 변경.
