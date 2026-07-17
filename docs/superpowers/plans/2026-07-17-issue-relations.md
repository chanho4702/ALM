# 이슈 관계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. 체크박스 트래킹.

**Goal:** 하위 작업(subtask)·에픽-자식(parentId)·이슈 링크(차단/관련)를 구현한다.

**Architecture:** 스펙 `2026-07-17-issue-relations-design.md`. 모델(parentId·links·subtask 타입) → 스토어(계층 검증·링크 CRUD·cascade) → 상세 모달(부모/하위/링크 섹션) → 카드 에픽 태그.

## Global Constraints

- 기존 테스트 유지. 계층 2단계 규칙은 스토어가 단일 진실로 검증. 커밋 컨벤션 유지.

---

### Task 1: 모델 + 스토어
- types.ts: IssueType+"subtask", Issue.parentId, IssueLink/links, Activity "parent"|"link"
- labels.ts: subtask 라벨/글리프/색, ISSUE_TYPES 확장
- jiraStore: normalize(parentId/links), setIssueParent·listChildren·addIssueLink·removeIssueLink·listIssueLinks, createIssue parentId, updateIssue 타입 전환 정합성, deleteIssue/deleteProject cascade
- Test: jiraStore.relations.test.ts — 계층 규칙(허용/거부 매트릭스), 링크 중복/자기 금지, direction, cascade, 타입 전환(자동 해제/자식 있으면 거부)
- [ ] 테스트 → 구현 → PASS → 커밋 `feat(store): 이슈 관계 — parentId 계층·subtask 타입·이슈 링크`

### Task 2: 상세 모달 관계 UI
- IssueDetailModal: 부모 Select(타입별 후보), 하위 이슈 섹션(n/m·행 클릭 모달 전환·하위 작업 인라인 추가), 링크 섹션(그룹·추가 폼·제거), 차단됨 경고 Lozenge. `useSearchParams`로 ?issue= 교체 전환
- Test: IssueDetailModal.test.tsx 추가 — 하위 작업 추가/표시, 부모 지정, 링크 추가/제거, 차단됨 경고, 모달 전환
- [ ] 테스트 → 구현 → PASS → 커밋 `feat(detail): 부모/하위 작업/이슈 링크 섹션 + 차단됨 경고`

### Task 3: 카드 에픽 태그 + 만들기 모달 정리
- IssueCard: parentId가 에픽이면 에픽 이름 Lozenge(warning) — BoardPage가 issues에서 에픽 이름 맵 전달
- CreateIssueModal: 타입 선택지에서 subtask 제외
- Test: BoardPage.test 추가(에픽 태그), AppShell 만들기 모달 선택지 확인
- [ ] 테스트 → 구현 → PASS → 커밋 `feat(board): 카드 에픽 태그 + 만들기 타입 정리`

### Task 4: 검증 + README
- [ ] typecheck/test/build PASS, README 갱신 → 커밋
