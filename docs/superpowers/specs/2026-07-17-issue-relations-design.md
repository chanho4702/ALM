# 이슈 관계 설계 (2026-07-17)

지라 클론 고도화 3차(합의된 분해안의 3번). 하위 작업(subtask)·에픽-자식·이슈 링크.

## 합의된 방향

1. **단일 parentId** (지라 최신 모델): `Issue.parentId: string | null` 필드 하나.
   - 계층 규칙(2단계): 에픽은 parent 불가 / 일반 이슈(작업·스토리·버그)의 parent는 **에픽만** /
     **하위 작업(subtask, 타입 신설)** 의 parent는 일반 이슈만. 같은 프로젝트만.
2. **링크 2종**: `blocks`(방향: source가 target을 차단) + `relates`(양방향, 레코드 1개).

## 데이터 모델

- `IssueType`에 `"subtask"` 추가 — 라벨 "하위 작업", 글리프 ☑(neutral 톤)
- `Issue.parentId: string | null` (normalize `??= null`)
- `IssueLink { id; sourceId; targetId; type: "blocks" | "relates" }`, `JiraData.links` (normalize `??= []`)
- `Activity.type`에 `"parent" | "link"` 추가

## 스토어 API

- `setIssueParent(id, parentId: string | null)` — 계층 규칙·자기 자신·프로젝트 일치 검증,
  활동로그 `parent`("없음 → ALM-4" 형식)
- `listChildren(issueId): Issue[]` — order↑,key↑
- `addIssueLink({ sourceId, targetId, type })` — 자기 자신 금지, 중복 금지(blocks는 방향 포함,
  relates는 양방향 무순서 중복 검사), 활동로그 `link`(양쪽 이슈 모두 기록)
- `removeIssueLink(linkId)`
- `listIssueLinks(issueId): { link; other: Issue; direction: "outward" | "inward" }[]`
  - blocks: outward = "차단함", inward = "차단됨" / relates: 항상 "관련"
- `updateIssue` 타입 전환 정합성: 규칙 위반되는 parentId는 **자동 해제**(활동로그),
  자식이 있는 이슈를 규칙 위반 타입으로 바꾸면 **거부**("하위 이슈가 있어 타입을 변경할 수 없습니다")
- `createIssue`에 `parentId?` (같은 검증)
- cascade: `deleteIssue` → 자식 parentId 해제 + 관련 links 삭제 / `deleteProject` → links 삭제

## 화면

**이슈 상세 모달** (중심):
- 속성 패널: **부모** Select — 일반 이슈면 에픽 목록, 하위 작업이면 일반 이슈 목록, 에픽이면 비표시.
  "없음" 선택 가능. 부모가 있으면 키 클릭으로 해당 이슈 모달 전환(`?issue=` 교체)
- 본문: **하위 이슈 섹션** — 에픽/일반 이슈에 표시. `하위 이슈 (완료 n/전체 m)` 헤더 +
  행(타입 글리프·키·제목·상태 Lozenge, 클릭 → 모달 전환) + 인라인 "하위 작업 추가"
  (일반 이슈에서: subtask 타입·부모=자신·부모와 같은 sprintId로 생성. 에픽에서는 표시만)
- 본문: **링크 섹션** — 그룹별(차단함/차단됨/관련) 행 + 제거 ×. 추가 폼: 종류 Select
  (차단함/차단됨/관련) + 대상 이슈 Select(같은 프로젝트, 자기 제외) + 추가 버튼
- 속성 패널: 미완료 이슈에게 **차단됨** 경고 Lozenge(danger) — 미완료 차단자가 있을 때

**카드/목록**:
- 에픽 자식 이슈: 칸반 카드에 에픽 이름 Lozenge(warning 톤) 표시 (지라의 에픽 태그)
- 전역 만들기 모달: 타입 선택지에서 하위 작업 제외 (부모 필수라 상세에서만 생성)
- 목록/보드 타입 필터·글리프는 ISSUE_TYPES 확장으로 자동 반영

## 범위 제외

에픽 스윔레인·타임라인 에픽 그룹핑(후속), 링크 4종 확장, 크로스 프로젝트 관계, 순환 검증
(2단계 규칙상 불가능).
