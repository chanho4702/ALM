# 2026-09-04 화면 전반 UI/UX 손질 (지라 기준 밀도·헤더 정리)

`docs/BACKLOG.md` §7 "페이지 손질 이어서"(보드·홈·리포트) + 사용자 요청 "프론트 화면단 전반 UI/UX 수정".
근거는 2026-09-04 목업 모드 전 화면 캡처(1440×900, 라이트)와 지라 클라우드 구조. 캡처 없이 "예쁘게"는 하지 않는다.

캡처 위치(세션 스크래치): `…/scratchpad/shots/{home,board,backlog,issues,issue-modal,dashboard,reports,search,projects,…}.png`
재캡처: `node shot.mjs <outdir>` (Playwright, dev 서버 `pnpm dev --port 5186 --host 0.0.0.0`).

## 0. 공통 원칙 (전 항목)

- 100% `@chanho/react` + 토큰. 새 색·간격 하드코딩 금지. 아이콘은 lucide-react.
- 기존 테스트 셀렉터(접근성 이름·data-testid)는 유지한다. 라벨을 시각적으로 숨길 때도 `label`/`aria-label`은 남긴다.
- **시간 표기 통일**: `components/time.ts` 신설 — `relTime(iso)`("방금 전/3시간 전/어제/n일 전/그 이후 날짜"), `formatDate(iso|yyyy-mm-dd)` → `2026. 9. 4.`이 아니라 **`2026-09-04`**, `formatDateTime(iso)` → `2026-09-04 14:03`. HomePage 로컬 `relTime`을 여기로 옮기고 IssueList·Search·Dashboard·Backlog·Modal·Archive·Trash·Notifications가 같은 함수를 쓴다(알려진 이슈 #3 해소).
- 다크모드에서 각 화면 재캡처로 확인(`colorScheme:"dark"`, 앱 테마 토글은 `data-theme`).

## 1. 프로젝트 헤더 크롬 축소 (ProjectLayout, app.css `.project-header`, `.breadcrumbs`, `.project-tabs`)

현재: 브레드크럼(20) + 헤더(아바타 lg + 28px 제목, 상하 12) + 탭 = 콘텐츠가 y≈180에서 시작.
지라: 브레드크럼 + 아바타 24 + 제목 20px 굵게 + 탭, 콘텐츠 y≈130.

- 아바타 `size="md"`, 제목 `--chanho-font-size-300`, 헤더 padding 상 `space-100`.
- 브레드크럼 padding 상 `space-150`.
- 탭 padding 상 `space-50`. 탭 글자 `font-size-100` 유지.
- 별표 버튼은 lucide `Star`(채움은 `fill="currentColor"`)로 — 글자 ★☆ 제거(DS 규약).

## 2. 보드 (BoardPage, BoardColumn, IssueCard, BoardFilterBar, app.css 1306~1540)

### 2.1 툴바를 한 줄로 (지라 보드 상단)
```
[메인 보드]  [스크럼] [SPRINT 1 · 9일 남음]                    [그룹 ▾] [스프린트 완료] [⋯]
[검색 ▢]  (아바타 4 + 미지정)  [타입 ▾] [라벨 ▾]
```
- 제목 행: 보드 이름 + 타입 Lozenge + (스크럼) 활성 스프린트 Lozenge **뒤에 남은 일수** `n일 남음`(`sprint.plannedEnd` 기준, 없으면 생략) — `dashboardMetrics`의 남은 일수 계산이 있으면 재사용.
- 제목 행 오른쪽: 그룹 Select(라벨 시각 숨김 — `aria-label="그룹"` 유지, 폭 140), 스크럼+활성 스프린트면 **`스프린트 완료` 버튼(secondary, small)** → 기존 `SprintCompleteModal` 재사용(백로그와 동일 동작), 그다음 ⋯.
- 필터 행: 검색 TextField 라벨 시각 숨김(placeholder "보드 검색", `label`은 유지) 폭 220, 아바타 스택, 타입/라벨 Select 라벨 시각 숨김(`aria-label` 유지). `align-items:center`로 한 줄 정렬. 라벨 숨김은 공통 유틸 클래스 `.visually-hidden-label`(DS TextField/Select에 label 숨김 옵션이 없으므로 래퍼 div에 클래스, 내부 `label` 요소를 시각적으로 숨긴다 — 첫 자식 label 셀렉터를 실측해 적용).

### 2.2 컬럼
- 컬럼 폭 `minmax(260px, 1fr)`, 최대 `max-width: 420px`가 아니라 grid 자동(3컬럼이면 화면을 나눠 씀 — 현재와 같음). 컬럼 padding `space-100`.
- 헤더: Lozenge 대신 **지라식 플레인 텍스트** — 상태명 `font-size-75` 굵게 대문자 아님(한국어), `text-subtle` 색, 옆에 개수는 Badge 유지(WIP `n/limit`). 상태 색은 헤더 왼쪽 6px 점(`.board-column-dot`, 카테고리 색 토큰 `--chanho-color-background-{color}-bold` 실존 확인 후, 없으면 Lozenge appearance 색과 같은 semantic 토큰)으로만 표현 — 색만으로 구분하지 않도록 텍스트가 이름이다.
- 헤더 접근성 이름(`aria-label={label}`)과 `data-testid="board-column-{status}"` 유지.

### 2.3 카드
- 제목 `font-size-100`, 줄 수 제한 없음(현재 유지).
- 메타 행: 타입 글리프 · 키 · **우선순위는 Lozenge 대신 아이콘**(`PriorityDef.icon` → `typeIcons.tsx`의 lucide 맵, 색은 `PriorityDef.color` 토큰) + `aria-label="우선순위: 높음"` + `title`. 오른쪽 끝 담당자 Avatar(small). 우선순위 def가 로드 전이거나 icon 없는 커스텀은 기존 Lozenge 폴백.
- 카드 padding: DS Card `padding="sm"` 유지.

### 2.4 컬럼 "+ 이슈 만들기"
- 유지. 아이콘 lucide `Plus` 14로 교체(글자 + 제거).

## 3. 백로그 (BacklogPage, SprintPanel, app.css 1915~2100)

- 상단 `view-actions` 행: 왼쪽에 **h2 "백로그"**(`font-size-200` 600) + 총 이슈 수 subtle, 오른쪽 `스프린트 만들기`.
- 스프린트 패널 헤더: `[Sprint 1] [기간] [n] [예상 8h] [미입력 4건]  ……  [계획 수정] [스프린트 완료]` — 우측 버튼 둘을 한 그룹(`margin-left:auto` 컨테이너)으로. 스프린트명 `font-size-100` 600 `text-default`(현재 subtle).
- **행을 플랫 리스트로**: `.backlog-row` border·radius·배경 제거, 행 높이 36~40px, 행 사이 `border-top: 1px solid border-default`(첫 행 제외), hover는 `background-neutral-hovered`. 키는 mono subtle 유지. 상태·우선순위 Lozenge, 아바타, ⋯ 유지.
- 백로그 하단 생성: 항상 열린 `새 이슈 제목` TextField+큰 버튼 대신 **ghost `+ 이슈 만들기`(Plus 아이콘) 클릭 → 인라인 TextField(자동 포커스, Enter 생성, Esc 닫기)** — 보드 컬럼 인라인 생성과 같은 패턴. 테스트가 "새 이슈 제목" 라벨을 쓰면 인라인 필드의 label로 유지.

## 4. 이슈 목록 (IssueListPage, app.css `.issue-filter-bar`, `.bulk-bar`)

- 필터 바를 **검색 페이지와 같은 칩 드롭다운 한 줄**로: `[제목·설명·키 검색 ▢] [상태 ▾] [우선순위 ▾] [담당자 ▾] [라벨 ▾] [타입 ▾]` — `FilterDropdown` 재사용(다중 선택). 기존 쿼리 파라미터·필터 로직 유지; Select가 단일 선택이었으면 다중 선택으로 확장하되 스토어 `listIssues` 필터 계약이 단일이면 화면에서 후처리하지 말고 **단일 선택 유지 + 칩 트리거 모양만** 적용(FilterDropdown에 `multiple=false` 모드가 없으면 추가).
- 대량 작업 바: 선택 0건이면 **숨김**(`selected.size > 0`일 때만 표시, 지라). "모두 선택"은 표 헤더 체크박스로.
- CSV 내보내기/가져오기 + 페이지 표시(`1–8 / 8건 이전 다음`)를 **표 위 한 줄 툴바**로: 왼쪽 `n건`, 오른쪽 `[CSV 내보내기] [CSV 가져오기] | 이전 다음`.
- 표: 제목 열 `minWidth 260` → 남는 폭을 제목이 먹도록(`width: auto` + 나머지 열 고정폭). 날짜 열 `formatDate`.

## 5. 검색 (SearchPage, app.css `.search-page`)

- 가운데 고정폭(≈900) → 이슈 목록과 같은 **전체 폭**(`max-width: none`, 좌우 padding `space-400`). 제목 줄바꿈 해소.
- 제목 h1 `font-size-400`으로 프로젝트 목록과 통일.

## 6. 홈 (HomePage, app.css 2136~)

- `.home-page` max-width 880 → **1040**. 이어서 하기 카드 `minmax(220px,1fr)` → 4개까지 한 줄.
- 이어서 하기는 최대 **4장**(최근 프로젝트 1~2 + 최근 이슈)으로 제한 — 두 줄 방지. 프로젝트 최대 2, 나머지 이슈로 채워 4장.
- 탭 행(`.home-row`) hover `background-neutral-hovered`, 오른쪽 Lozenge 정렬 유지. 행 padding 상하 `space-100`.
- 인사말 아래 **오늘 요약 한 줄**(subtle): `나에게 배정 n · 기한 지남 n · 이번 주 마감 n` — 이미 계산한 값 재사용, 클릭하면 해당 탭으로.

## 7. 이슈 상세 모달 (IssueDetailModal, app.css 1650~1915)

- 헤더 한 줄: `[상위 경로 › ALM-1]` ……… `[관찰 👁 0] [×]` — WatchButton을 닫기 옆(`.issue-detail-toolbar`를 모달 헤더 오른쪽으로). 제목은 헤더 바로 아래 `font-size-400`.
- 하위 이슈 추가 폼·링크 추가 폼은 **기본 접힘**: 섹션 제목 오른쪽 ghost `+ 하위 이슈` / `+ 링크` 버튼 클릭 시 폼 노출(자동 포커스, Esc/취소로 닫기). 기존 테스트가 폼 필드를 바로 찾는다면 테스트에서 버튼을 먼저 누르도록 갱신.
- 첨부 섹션 헤더 `첨부 n`은 유지.
- 오른쪽 속성 패널: 각 필드 라벨 `font-size-75` subtle, 필드 사이 `space-100`(현재 space-150 추정) — 세로 밀도 15% 축소. 상단 상태 Lozenge는 **Select 위 "상태" 필드로 통합**(Lozenge 단독 표시 제거; 상태 Select의 값 표시가 곧 상태).
- 생성/수정 시각 `formatDateTime`.

## 8. 요약(대시보드) · 리포트 · 릴리스 · 대시보드 목록

- 요약: 카드 그리드 `align-items: stretch`로 같은 행 높이 통일(현재 두 번째 행 높이 제각각). 최근 업데이트 시간 `relTime`.
- 리포트: `리포트`/`스프린트` Select 라벨 시각 숨김 + 스프린트 메타 문장을 같은 줄에(`align-items:center`).
- 릴리스: "버전 만들기" 카드 → 상단 오른쪽 `버전 만들기` 버튼 + 인라인 폼 토글(백로그와 같은 패턴). 빈 상태 유지.
- 대시보드 목록: 동일 패턴(`대시보드 만들기` 버튼 → 폼 토글).

## 9. 프로젝트 목록

- 별표 셀 옆 `·` 잔상 확인(캡처 `projects.png` — "☆ · A ALM 플랫폼")해 제거. 별표는 lucide `Star`.

## 10. 검증

- `pnpm typecheck && pnpm test && pnpm build` 그린. 테스트 수 변하면 `docs/STATUS.md`·README 카운트 갱신.
- 라이트/다크 재캡처로 §1~§9 대조. 키보드: 새 토글(인라인 생성·폼 접힘)은 Enter/Esc, 포커스 이동 확인.
- BACKLOG §7 "페이지 손질 이어서" 세 항목 체크, STATUS "UX 정비" 절에 요약 추가.
