# 백로그 DnD 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) 트래킹.

**Goal:** 백로그 화면에서 드래그로 스프린트↔백로그 이동·패널 내 순서 변경을 구현한다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-07-17-backlog-dnd-design.md`. 스토어에 `rankIssue`(그룹 재번호), 변환기 `resolveBacklogMove`(boardDnd 패턴), BacklogPage에 DndContext 배선. Dropdown 이동은 유지.

**Tech Stack:** 기존 그대로 (@dnd-kit·@chanho/react·Vitest).

## Global Constraints

- 기존 BacklogPage 테스트(Dropdown 이동·인라인 생성·행 클릭 상세)는 깨지지 않아야 한다
- 행 클릭=상세 모달 유지 (PointerSensor distance 5)
- 커밋 컨벤션 + Co-Authored-By 유지

---

### Task 1: 스토어 rankIssue + 정렬 tiebreaker
- Files: `store/jiraStore.ts`, Test: `store/jiraStore.issues.test.ts` 추가
- Produces: `rankIssue(id, { sprintId: string | null; beforeId?: string }): Promise<Issue>`
- [ ] 테스트: 백로그→스프린트 맨 뒤, beforeId 앞 삽입+그룹 1..n 재번호, 같은 패널 내 재배치, stale beforeId → 맨 뒤, sprint 활동로그 기록
- [ ] 구현 + `listIssues`/`listBoardIssues` 정렬 `order↑, key↑`
- [ ] `pnpm test` PASS → 커밋 `feat(store): rankIssue — 백로그/스프린트 랭크 이동`

### Task 2: resolveBacklogMove 변환기
- Files: Create `pages/backlogDnd.ts`, Test `pages/backlogDnd.test.ts`
- Produces: `resolveBacklogMove(activeId, overId, panels: Record<string, string[]>): { sprintId: string | null; beforeId?: string } | null` — 패널 키 "backlog"↔null 매핑 포함
- [ ] 테스트: 패널 드롭 맨 뒤/이미 맨 뒤 null, 행 위 드롭(위/아래/크로스 패널), 미지의 overId null
- [ ] 구현 → PASS → 커밋 `feat(backlog): resolveBacklogMove 변환기`

### Task 3: BacklogPage DnD 배선
- Files: `pages/BacklogPage.tsx`, `components/SprintPanel.tsx`(droppable 패널·SortableBacklogRow), `app.css`
- [ ] SprintPanel: 본문 div droppable(id=sprintId), 백로그 목록 droppable(id="backlog") — SprintPanel에 droppableId prop 또는 BacklogPage에서 래핑. 행은 SortableBacklogRow(useSortable 래퍼)
- [ ] BacklogPage: DndContext + sensors + DragOverlay(행 프리뷰), panels 맵 구성, DragEnd → resolveBacklogMove → rankIssue → reload (성공 무토스트/실패 danger)
- [ ] `.sprint-panel.is-over` 강조 CSS
- [ ] 기존 테스트 전부 통과 확인 → 커밋 `feat(backlog): 드래그로 스프린트↔백로그 이동·순서 변경`

### Task 4: 검증 + README
- [ ] typecheck/test/build PASS, README 백로그 항목에 DnD 문구, 테스트 수 갱신 → 커밋 `docs: README — 백로그 DnD`
