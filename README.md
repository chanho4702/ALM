# ALM Front — 지라 클론

Chanho Design System(@chanho/react·tokens)의 첫 실전 소비 프로젝트. myFront와 분리된 독립 프론트 앱이며, 향후 MSA의 한 서비스로 게이트웨이 뒤에 배치된다. ALM(Application Lifecycle Management)은 이후 컨플루언스 클론(위키)까지 품는 우산 이름이다.

## MVP 범위 (완료)

- **전역 셸(AppShell, 새 지라 나비)** — 상단바(브랜드→홈 · 전역 **검색** · 전역 **"만들기"** 이슈 생성 모달 · 테마/사용자) + **상주 전역 사이드바**(홈/프로젝트 + **최근**(방문 5개)·**별표**(디렉터리 카드 ☆ 토글)·프로젝트 섹션, 현재 프로젝트는 대시보드/타임라인/보드/백로그/이슈/설정 중첩 확장, **접기** 시 아이콘 레일, **드래그로 너비 조절**(180~400px, ←/→ 키보드·더블클릭 리셋) — 상태는 `alm.jira.ui.v1`에 저장)
- **홈(For you)** — `/home`이 앱 홈: 내 담당 이슈(전 프로젝트) + 최근 업데이트, 클릭 시 상세로
- **이슈 타입** — 작업/스토리/버그/에픽. 카드·백로그 행·목록에 색 글리프(지라 색 언어), 상세/전역 만들기에서 변경, 목록 타입 필터, 활동로그 기록
- **알림** — 상단 벨(미읽음 Badge). 담당자에게 할당/상태 변경/코멘트 알림(본인 액션 제외 — 목업은 단일 사용자라 시드 알림이 데모), 클릭 시 해당 이슈 상세로, 개별/전체 읽음
- **보드 인라인 생성** — 각 컬럼 하단 "+ 이슈 만들기"로 해당 상태·활성 스프린트에 바로 생성
- **타임라인(간트)** — 이슈별 막대(생성일→마감일, 상태 색), 월/주 눈금, 오늘 마커, 막대 클릭 시 상세
- **프로젝트 셸** — `/projects` 카드 디렉터리, `/projects/new` 생성 페이지(영문 이름 → 키 이니셜 자동 제안), `/projects/:id/settings` 설정(이름/설명 수정 + 삭제 위험 구역). 프로젝트 내부는 지라식 상단: 브레드크럼(프로젝트/이름) → **프로젝트 헤더**(키 해시 색 그라데이션 아바타 + 이름 + ★별표) → **가로 뷰 탭**(요약·타임라인·보드·백로그·이슈·설정, 밑줄 액티브). 이슈 키 접두어(`ALM-1`, 번호 재사용 안 함·키 불변)
- **칸반 보드** — 할 일/진행 중/완료 3컬럼, @dnd-kit 드래그 이동 (활성 스프린트 이슈만 표시), 카드에 라벨 Tag
- **백로그/스프린트** — 생성·시작·완료(미완료 이슈 백로그 복귀), 인라인 이슈 생성, Dropdown으로 스프린트 이동/삭제
- **이슈 목록** — 테이블 + 필터(검색 제목·설명·키 / 상태 / 우선순위 / 담당자 / 라벨) + 정렬(제목·상태·우선순위·담당자·마감일·생성일·수정일)
- **이슈 상세** — `?issue=ALM-1` URL 공유 모달: 제목 인라인 편집, 설명, 속성 패널(Select 4종 + 마감일 + 라벨), 생성/수정일, 이슈 삭제(확인), 코멘트 작성·수정·삭제(본인만)/활동로그 Tabs
- **대시보드** — 상태별 이슈 카운트 타일 + 담당자별 분포(미지정 포함)

데이터는 localStorage 목업(`alm.jira.v1`), 유저는 목업 4명 고정. 화면은 `src/features/jira/store/jiraStore.ts`의 async 함수만 호출하므로 백엔드(jira-service)가 생기면 이 파일 내부만 fetch로 교체한다.

## 스택

Vite 7 · React 19 · TypeScript(strict) · react-router 7 · @chanho/react 0.2.0 + @chanho/tokens 0.1.0(tarball, `file:../design-system/artifacts/*.tgz`) · @dnd-kit · Vitest + Testing Library. **UI는 100% 디자인 시스템 — 타 UI 라이브러리 금지.**

## 개발

```bash
pnpm install     # ../design-system/artifacts 의 tarball 필요
pnpm dev         # http://localhost:5173
pnpm test        # vitest run (138 tests)
pnpm typecheck   # tsc --noEmit
pnpm build       # vite build
```

## 구조

```
src/
├── app/                # 라우터(/home, /projects[/new], /projects/:projectId/dashboard|board|backlog|issues|settings), 전역 스타일
├── features/jira/
│   ├── pages/          # HomePage(For you)·ProjectListPage·ProjectCreatePage·ProjectSettingsPage·DashboardPage·BoardPage·BacklogPage·IssueListPage
│   ├── components/     # AppShell(전역 셸)·GlobalSideNav(상주 사이드바)·ProjectLayout·CreateIssueModal·SearchModal·IssueCard·IssueDetailModal ...
│   └── store/          # jiraStore.ts (백엔드 교체 지점) · uiStore.ts (최근/별표/접힘) + 테스트
└── mock/               # 시드, 목업 유저
```

## 문서

- 설계: `docs/superpowers/specs/2026-07-06-jira-clone-design.md`
- 구현 계획(웨이브별): `docs/superpowers/plans/`
- **백엔드 의존 기능 백로그**: `docs/BACKLOG.md` — 첨부파일·실시간 협업·알림 푸시·권한 등 jira-service 도입 시 진행
