# 상세 검색 + 필터 저장 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. 체크박스 트래킹.

**Goal:** 한국어 스마트 검색(`/search`)·조건 칩 빌더·저장 필터(사이드바 상주)·URL 공유를 구현한다.

**Architecture:** 스펙 `2026-07-17-advanced-search-design.md`. 진실은 스마트 문자열 하나(URL q) — `searchQuery.ts`가 파스/직렬화, `queryIssues`가 실행, 칩/Select는 문자열 편집기다.

## Global Constraints
- 기존 테스트 유지, UI 100% 디자인 시스템, 커밋 컨벤션 유지

### Task 1: searchQuery 파서/직렬화 + queryIssues
- Create `store/searchQuery.ts` (+`searchQuery.test.ts`): IssueQuery·parseSmartQuery·serializeQuery (라운드트립, 미지 값은 text 보존)
- jiraStore `queryIssues` (+ issues.test 추가): 전 프로젝트·OR/AND·정렬(due 미지정 뒤)
- [ ] 테스트 → 구현 → PASS → 커밋 `feat(search): 한국어 스마트 쿼리 파서 + queryIssues`

### Task 2: uiStore 저장 필터
- uiStore: SavedFilter CRUD + UI_CHANGED (+ uiStore.test 추가)
- [ ] PASS → 커밋 `feat(search): 저장 필터 uiStore`

### Task 3: SearchPage + 라우트
- Create `pages/SearchPage.tsx` (+test), App.tsx `/search`
- 스마트 입력(URL q 동기화, replace) · 조건 칩(Tag onRemove) · 조건 추가 Select 행 · 결과 Table(프로젝트 컬럼) · 상세 모달 · "필터로 저장" 모달
- [ ] 테스트(토큰 입력→결과 좁힘, 칩 제거, Select로 토큰 추가, 행 클릭 모달, 저장) → PASS → 커밋 `feat(search): /search 상세 검색 페이지`

### Task 4: 사이드바 필터 섹션 + 검색 모달 연결
- GlobalSideNav: "검색" 항목 + "필터" 섹션(적용/삭제), SearchModal "고급 검색으로" 버튼
- [ ] 테스트(저장 필터 사이드바 노출·적용·삭제, 모달→/search 이동) → PASS → 커밋 `feat(search): 사이드바 필터 섹션 + 고급 검색 진입`

### Task 5: 검증 + README
- [ ] typecheck/test/build, README 특색 문구 갱신 → 커밋
