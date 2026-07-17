# 상세 검색 + 필터 저장 설계 (2026-07-17)

ALM 고도화 4차(합의된 분해안의 4번). **지라 카피가 아닌 ALM 고유 편의**를 이 기능의
정체성으로 삼는다 — JQL처럼 배워야 하는 문법 대신, 한국어 스마트 검색과 URL 공유.

## ALM 특색 (지라 대비 개선)

1. **한국어 스마트 검색** — 한 줄 입력에 `상태:진행중 담당:김찬호 타입:버그 로그인` 처럼
   한국어 토큰을 섞어 치면 즉시 파싱된다. 조건 칩과 **양방향 동기화**(진실은 문자열 하나).
2. **필터 URL 공유** — 검색어 문자열이 그대로 `/search?q=...`에 실린다. 사람이 읽을 수 있는
   URL이라 링크만 보내면 같은 결과 (지라 필터 공유 대비 단순).
3. **저장 필터 사이드바 상주** — 저장하면 전역 사이드바 "필터" 섹션에 바로 떠서 원클릭 적용.

## 쿼리 모델 (GraphQL-ready — 추후 서버 쿼리로 1:1 매핑)

```ts
interface IssueQuery {
  text: string;
  projectIds: string[];   // 빈 배열 = 전체
  statuses: IssueStatus[];
  priorities: IssuePriority[];
  types: IssueType[];
  assigneeIds: string[];  // "unassigned" 센티널
  labels: string[];
  sort: "updated" | "created" | "due" | "priority";
}
```

## 스마트 구문 (`store/searchQuery.ts`)

- 토큰: `상태:` `우선순위:` `타입:` `담당:` `라벨:` `프로젝트:` `정렬:` — 값은 한국어 라벨
  (상태:할일/진행중/완료, 담당:이름 또는 미지정, 프로젝트:키, 정렬:수정/생성/마감/우선순위).
  같은 토큰 반복 = OR 누적. 토큰이 아닌 단어는 text 검색어.
- `parseSmartQuery(input, ctx: { users, projects }): IssueQuery` — 미지의 토큰 값은 무시하지
  않고 text로 취급(잃어버리지 않는다)
- `serializeQuery(query, ctx): string` — 파스와 왕복 가능(라운드트립)
- URL: `/search?q=<스마트 문자열>` 그대로

## 스토어

- `queryIssues(query: IssueQuery): Promise<Issue[]>` — **전 프로젝트** 대상, text는
  제목/키/설명, 다중 값은 OR·필드 간 AND, 정렬(due는 미지정 뒤). 조회수 상한 없음(목업).
- `uiStore`: `SavedFilter { id; name; query: string }` — `listSavedFilters` /
  `saveFilter(name, query)` / `deleteSavedFilter(id)` (UI_CHANGED_EVENT 발행)

## 화면

**SearchPage `/search?q=...`** (AppShell 아래 전역 페이지):
- 스마트 검색 TextField(진실 = URL q, replace 갱신) + 힌트 문구
- 파싱된 조건을 **Tag 칩**으로 표시(× 제거 → 문자열에서 토큰 삭제), 조건 추가 Select 행
  (상태/우선순위/타입/담당/라벨/프로젝트/정렬 — 선택 즉시 토큰 append)
- 결과: `N개` 카운트 + Table(타입 글리프·키·프로젝트·제목·상태·우선순위·담당·마감),
  행 클릭 → `?issue=` 상세 모달(다른 파라미터 보존 확인됨)
- "필터로 저장" → 이름 입력 모달 → uiStore 저장
**사이드바**: 홈/프로젝트 아래 "검색" 항목(→ /search) + "필터" 섹션(저장 필터 나열 —
클릭 적용, × 삭제)
**전역 검색 모달**: 하단 "고급 검색으로" 버튼 → `/search?q=<입력어>`

## 범위 제외

저장 필터 공유 권한(단일 사용자), 서버 페이징(BACKLOG), OR/괄호 같은 불리언 문법.
