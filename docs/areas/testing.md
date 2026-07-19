# 테스트

**구성**: Vitest 3 + Testing Library(jsdom), 26파일/242케이스(2026-07-19 기준).
스토어 단위 테스트(`store/*.test.ts`) + 화면 통합 테스트(App 전체 마운트, `pages/components/*.test.tsx`).

## 안정화 설정 (건드리기 전에 이유를 알 것)

- `vitest.config.ts`: `testTimeout: 15000` / `vitest.setup.ts`: RTL `asyncUtilTimeout: 5000` —
  24+ jsdom 파일 병렬 실행 시 워커 경합을 시간으로 흡수한 것. 근본 원인은 모든 화면 테스트가
  `render(<App/>)` 풀 마운트라는 점(아래 개선 후보).
- pool 기본값(forks) + isolate=true라 파일마다 독립 jsdom — **`isolate: false`로 바꾸면
  26개 파일이 localStorage를 공유해 대량 파손된다. 바꾸지 말 것.**

## 관례

- 각 테스트 파일: `beforeEach`에서 `localStorage.clear()` + `__resetForTest()`.
- 비동기 로드 요소는 `findBy*` / `waitFor` (sync getBy는 초기 렌더 요소에만).
- 이름 충돌은 스코프로 해결: `within(screen.getByTestId(...))`, selector 옵션(".board-name" 등).
  사이드바에도 프로젝트/보드 이름이 있어서 **전역 getByText는 곧잘 중복 매치**된다.
- Radix Modal 열림 중 배경은 aria-hidden — 배경 질의 전에 모달을 닫는다.
- "디렉터리 로드됨" 대기는 `findByRole("table", { name: "프로젝트 목록" })` 기준.

## 알려진 취약점 (2026-07-19 리뷰)

- **시드 개수 하드코딩**: `toHaveLength(9)`(IssueList), `toHaveLength(8)`(Timeline),
  밴드 4개(Board), 마감 임박 2건(Home), users 4명(store) 등 — **시드에 이슈/유저를 추가하면
  이 단언들이 우수수 깨진다**. 시드 수정 시 grep: `toHaveLength\(|개 이슈|length\).toBe`.
- 한글 카피 정확 일치 의존("마감 임박", "안녕하세요, 김찬호님" 등) — 문구 바꾸면 테스트도 함께.
- 날짜: 시드 `dueSoon = now+7일`과 홈 추천 창(7일)이 같은 상대식이라 특정 날짜 파손은 없음.
  자정 경계 밀리초 창의 이론적 위험만 존재.
- 컴포넌트 전용 테스트는 AppShell·IssueDetailModal뿐 — StatusEditor/SprintPanel/
  BoardSettingsModal/FilterDropdown 등은 페이지 테스트 간접 커버리지.

## 개선 후보 (요청 시)

1. 페이지 경량 렌더 헬퍼 도입(App 풀 마운트 대신 페이지+필요 프로바이더만) — 속도·안정 동시 개선.
2. renderApp/LocationProbe 중복 정의를 공용 test-util로 추출.
3. 시드 개수 단언을 시드 파생값 기반으로 치환.
