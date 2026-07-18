# 설정 스킴 구현 계획 (설계 v3의 ①+②)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. 체크박스 트래킹.

**Goal:** 지라식 설정 스킴(전역 관리 → 배정 → 프로젝트 커스텀) 기반과 이슈 타입 스킴 UI를 구현한다. 워크플로 상태 치환(③)·검색 확장(④)은 다음 라운드.

**Architecture:** 스펙 `2026-07-18-workflow-design.md` v3. SettingsScheme(디폴트 1개 자동)·projectSettings(schemeId+custom)·`resolveSettings` 단일 해석. 이번 라운드 UI는 **이슈 타입만 편집 가능**, 워크플로 상태는 데이터·검증·이관 로직까지만(편집 UI는 ③).

## Global Constraints
- 기존 테스트 전부 통과가 1차 관문 (기본 스킴 상태 id = 기존 status 값 → 데이터 100% 호환)
- subtask는 항상 enabledTypes에 포함, 그 외 최소 1개
- 커밋 컨벤션 유지

### Task 1: 모델 + normalize + 스토어
- types: WorkflowStatus·SettingsBody·SettingsScheme·JiraData.schemes/projectSettings
- normalize/seed: 디폴트 스킴(기본 3상태·전 타입) + 전 프로젝트 {schemeId, custom:null}, createProject 배정·deleteProject 정리
- store: listSchemes/getScheme/createScheme(디폴트 복사)/updateScheme/deleteScheme(배정·디폴트 금지)/setDefaultScheme, resolveSettings, assignScheme(없는 상태 이슈 → 같은 카테고리 첫 상태 이관), setProjectCustom(true=복사/false=이관 후 null), updateProjectCustomSettings, validateSettingsBody(카테고리별≥1·이름 유일·subtask 고정)
- createIssue/updateIssue: type이 enabledTypes 밖이면 거부(subtask 예외), createIssue 기본 타입 = task가 비활성이면 첫 활성 타입
- Test: jiraStore.settings.test.ts
- [ ] 테스트 → 구현 → 전체 PASS → 커밋

### Task 2: 전역 관리 페이지 /settings
- AppShell ⚙ 버튼 → /settings, GlobalSettingsPage: 좌측 메뉴(워크플로 스킴/이슈 타입 스킴 — 같은 스킴의 측면), 스킴 목록(디폴트 배지·배정 N)·새 스킴·삭제·디폴트 지정, 이슈 타입 편집(체크박스), 워크플로는 읽기 전용 미리보기("다음 단계" 안내)
- [ ] 테스트 → PASS → 커밋

### Task 3: 프로젝트 설정 탭 + 생성 UI 반영
- ProjectSettingsPage: Tabs(일반/워크플로/이슈 타입), 스킴 배지·스킴 변경 Select·커스텀 스위치·스킴 복귀, 이슈 타입 편집(커스텀일 때)
- CreateIssueModal: 선택 프로젝트의 enabledTypes로 타입 옵션 필터·기본값, IssueDetailModal 타입 Select 동일(현재 값은 항상 포함)
- [ ] 테스트 → PASS → 커밋

### Task 4: 검증 + 문서
- [ ] typecheck/test/build, STATUS/README 갱신, 푸시
