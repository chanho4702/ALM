# 검색 (스마트 쿼리 + 검색 화면)

**파일**: `store/searchQuery.ts`(파서/직렬화, 진실 모델), `pages/SearchPage.tsx`,
`components/SearchModal.tsx`(전역 검색 모달), `components/FilterDropdown.tsx`,
`store/jiraStore.ts`의 `queryIssues`/`searchIssues`/`listAllStatuses`.

## 모델 — 진실은 URL의 `q` 문자열 하나

`/search?q=상태:진행중+담당:김찬호+로그인` 처럼 **한국어 스마트 문자열이 검색 상태의 전부**다
(ALM 특색: 링크가 곧 필터, 저장 필터도 이 문자열을 저장).

- `parseSmartQuery(q, ctx) → IssueQuery` / `serializeQuery(query, ctx) → q` 왕복이 계약.
  파서가 못 알아듣는 토큰은 버리지 않고 텍스트 검색어로 보존한다.
- `IssueQuery.statuses`는 **카테고리** 매치, `statusIds`는 커스텀 상태 id 직접 매치.
  `상태:X` 파싱 순서: 카테고리 라벨(할일/진행중/완료) 우선 → ctx.statuses 이름 매치
  (공백 제거 형태 허용: "코드 리뷰" ↔ `상태:코드리뷰`) → 둘 다 아니면 텍스트.
- ctx에 `statuses: await listAllStatuses()`를 넣어야 커스텀 상태 이름이 동작한다.

## 화면 — 지라 이슈 검색 모방 2모드

- **기본 모드(기본값)** = 지라 Basic: 검색어 인풋 + 프로젝트/상태/담당자/타입/우선순위
  `FilterDropdown`(체크박스 멀티선택, 트리거에 "담당자: 김찬호 외 1" 요약) + 정렬 + 필터 초기화.
  드롭다운 토글은 IssueQuery를 고쳐 `serializeQuery`로 q를 되쓴다.
- **스마트 모드** = 지라 JQL 전환 대응: q 문자열 직접 편집 + 조건 칩(Tag, ×로 토큰 제거).
- 검색어 인풋은 로컬 초안(textDraft)을 쓰고 **포커스 중이 아닐 때만** q에서 동기화한다
  (타이핑 클로버 방지). 이 패턴을 깨면 입력이 지워지는 버그가 재발한다.

## 알려진 한계 (2026-07-19 리뷰)

- **공백 포함 값**: 토큰이 `\s+` 분할이라 `라벨:my label`, `담당:홍 길동`은 깨진다.
  상태만 공백 제거 매치가 구현됨. 라벨/담당에도 같은 규칙을 넣거나 따옴표 문법이 필요.
- **센티널 충돌**: "완료"처럼 카테고리 라벨과 같은 이름의 커스텀 상태는 이름 검색이 불가하고
  카테고리로 해석된다. 직렬화 왕복도 깨진다.
- **공백 제거 이름 충돌**: "코드 리뷰"와 "코드리뷰"가 공존하면 `상태:코드리뷰`가 둘 다 매치.
- 전역 검색 모달(`searchIssues`)은 키/제목/설명 텍스트 검색만 — 토큰 문법은 /search 전용.
