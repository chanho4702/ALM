# ALM Front — 지라 클론

Chanho Design System(@chanho/react·tokens)의 첫 실전 소비 프로젝트. myFront와 분리된 독립 프론트 앱이며, 향후 MSA의 한 서비스로 게이트웨이 뒤에 배치된다. ALM(Application Lifecycle Management)은 이후 컨플루언스 클론(위키)까지 품는 우산 이름이다.

## MVP 범위 (완료)

- **프로젝트 CRUD** — `/projects` 목록 페이지(조회/생성/수정/삭제·연쇄 삭제 경고), 설명 필드, 이슈 키 접두어(`ALM-1`, 삭제돼도 번호 재사용 안 함·키 불변)
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
pnpm test        # vitest run (98 tests)
pnpm typecheck   # tsc --noEmit
pnpm build       # vite build
```

## 구조

```
src/
├── app/                # 라우터(/projects, /projects/:projectId/dashboard|board|backlog|issues), 전역 스타일
├── features/jira/
│   ├── pages/          # DashboardPage, BoardPage, BacklogPage, IssueListPage, ProjectListPage
│   ├── components/     # JiraLayout, IssueCard, IssueDetailModal, SprintPanel, useIssueModal ...
│   └── store/          # jiraStore.ts (백엔드 교체 지점) + 테스트
└── mock/               # 시드, 목업 유저
```

## 문서

- 설계: `docs/superpowers/specs/2026-07-06-jira-clone-design.md`
- 구현 계획(웨이브별): `docs/superpowers/plans/`
