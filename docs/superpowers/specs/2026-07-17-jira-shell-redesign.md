# 지라 셸 구조 분석 → ALM 레이아웃 재설계 (2026-07-17)

## 1. 실제 Jira Cloud 셸 구조 분석

Jira의 화면은 세 개의 고정 레이어로 구성된다.

**① 전역 상단 내비게이션 (모든 화면 공통, 항상 존재)**
- 좌측: 제품 로고(클릭 → 홈), 주 내비게이션 — **"프로젝트" 드롭다운**(최근 프로젝트 목록 +
  "모든 프로젝트 보기" + "프로젝트 만들기"), Filters, Dashboards …
- 중앙/우측: **전역 "만들기(Create)" 버튼** — 어느 화면에서든 이슈 생성 모달을 연다
- 우측: **전역 검색**(모든 프로젝트의 이슈 검색), 알림, 설정, 프로필 아바타

**② 프로젝트 사이드바 (프로젝트 내부에서만)**
- 상단: **프로젝트 아이덴티티** — 아바타 + 이름 + 유형("Software project").
  ※ 스위처가 아니다. 프로젝트 전환은 전역 나비의 "프로젝트" 드롭다운이 담당한다.
- 본문: 계획 그룹(보드/백로그/타임라인/리포트 …)
- 하단: 프로젝트 설정

**③ 콘텐츠 영역**
- 상단에 **브레드크럼**(프로젝트 / 프로젝트명 / 페이지), 그 아래 페이지 본문

## 2. 현재 구조의 문제

| 문제 | 지라와의 차이 |
|---|---|
| TopBar가 레이아웃마다 별도 렌더 (ProjectLayout·디렉터리·생성 페이지 각각) | 전역 셸이 없다 — 화면 간 이동 시 상단바가 리마운트되고 구성이 다르다 |
| 프로젝트 전환이 사이드바 안 Select | 지라는 전역 "프로젝트" 드롭다운. 사이드바는 정체성 표시 |
| 전역 "만들기" 없음 (백로그 인라인 생성만) | 지라 UX의 핵심 — 어디서든 이슈 생성 |
| 전역 검색 없음 (이슈 목록 페이지 내 필터만) | 지라는 전 프로젝트 이슈 검색이 상단에 상주 |
| 사이드바에 프로젝트 아이덴티티 없음 | 아바타/이름/유형 헤더 부재 |
| 브레드크럼 없음 | 위치 감각 부재 |

## 3. 재설계

### 레이아웃 트리

```
AppShell ─ 전역 TopBar + <Outlet/>          ← 새로 도입, 모든 라우트를 감싼다
├─ /projects            ProjectListPage     (콘텐츠만 — 자체 TopBar 제거)
├─ /projects/new        ProjectCreatePage   (콘텐츠만)
└─ /projects/:id        ProjectLayout       (사이드바 + 브레드크럼 + <Outlet/>)
   ├─ dashboard · board · backlog · issues · settings
└─ *                    → /projects
```

### 전역 TopBar (AppShell)

- **브랜드 "ALM"** → `/projects`
- **"프로젝트" Dropdown** — 프로젝트 목록(이동) + 구분 + "모든 프로젝트 보기" + "프로젝트 만들기"
- **"만들기" primary Button** — 전역 이슈 생성 모달 (아래)
- **전역 검색** — TopBar 내장 `onSearch` 인풋 → 검색 결과 모달 (아래)
- ThemeToggle · SSO 사용자/로그아웃 · Avatar (기존 ProjectLayout TopBar에서 이관)

### 전역 이슈 생성 모달 (CreateIssueModal)

- 필드: 프로젝트 Select(현재 URL의 프로젝트를 기본값으로), 제목(필수), 설명, 우선순위,
  담당자, 마감일, 라벨(콤마 구분)
- 생성 위치: 백로그(sprintId=null) — 지라 기본과 동일
- 성공 시: toast + 해당 프로젝트 `이슈` 페이지로 이동해 `?issue=KEY` 상세 모달 오픈

### 전역 검색 (SearchModal + store)

- 스토어에 `searchIssues(text)` 추가 — **전 프로젝트** 대상, 키/제목/설명 매치, 최대 20건
- TopBar 검색 인풋 제출 → 결과 모달: `[KEY] 제목 — 프로젝트명` 목록 → 클릭 시 이슈 상세로

### ProjectLayout (구 JiraLayout 개편)

- TopBar 제거 (AppShell로 이관)
- SideNav header: **프로젝트 아이덴티티** — 키 이니셜 아바타 + 이름 + `KEY · 소프트웨어 프로젝트`
- SideNav items: 대시보드 / 보드 / 백로그 / 이슈 / 설정 (기존 유지)
- SideNav footer 버튼 제거 (전역 나비로 이동)
- 콘텐츠 상단 **브레드크럼**: `프로젝트 / {이름} / {페이지}` — react-router 내비게이션(풀 리로드 없음)

## 4. 구현 원칙

- UI는 100% @chanho/react — TopBar의 내장 `onSearch`, Dropdown, Modal, Select 활용
- 화면은 jiraStore async 함수만 호출 — `searchIssues`만 스토어에 신규
- 기존 페이지(보드/백로그/이슈/대시보드/설정) 내부는 변경 없음 — 셸만 재배치
- 테스트: App 셸 테스트 재작성 + CreateIssueModal/SearchModal/searchIssues 신규 테스트

## 5. 범위 제외

알림, Filters/Dashboards 전역 나비 항목(해당 기능 자체가 없음), 최근 방문 프로젝트 추적,
타임라인/리포트, 모바일 햄버거 — 이후 단계.
