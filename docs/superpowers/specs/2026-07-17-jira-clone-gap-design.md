# Jira Clone 요구사항 갭 구현 설계 (2026-07-17)

요구사항 명세(프로젝트 CRUD·이슈 CRUD·칸반·댓글·검색/필터·정렬·대시보드) 대비 현재 alm-front에 없는
기능만 채운다. 기존 MVP(보드 DnD, 백로그/스프린트, 이슈 목록/상세, 댓글 작성, 다크 모드)는 그대로 둔다.

## 갭 분석

| 요구사항 | 현재 | 이번 작업 |
|---|---|---|
| 프로젝트 목록/수정/삭제, 설명 필드 | 생성·전환만 (Select) | 프로젝트 목록 페이지 + 수정/삭제 + `description` |
| 이슈 마감일(Due Date) | 없음 | `Issue.dueDate` + 상세 편집 + 목록 표시/정렬 |
| 라벨(Label) | 없음 | `Issue.labels` + 상세 편집 + 카드/목록 표시 + 필터 |
| 이슈 삭제 버튼 | 스토어만 (`deleteIssue`) | 상세 모달에 삭제 버튼 + 확인 |
| 상세에 생성일/수정일 표시 | 없음 | 속성 패널에 표시 |
| 댓글 수정/삭제 | 작성만 | 본인 댓글 수정/삭제 + `updatedAt` |
| 설명 검색 | 제목·키만 | `listIssues` text 필터에 설명 포함 |
| 정렬: 생성일/수정일/마감일 | 제목/상태/우선순위/담당자만 | 목록 테이블 정렬 컬럼 추가 |
| 대시보드 | 없음 | 대시보드 페이지 (카운트 + 담당자별) |

## 데이터 모델 확장 (`store/types.ts`)

- `Project.description: string` (기본 `""`)
- `Issue.dueDate: string | null` — `YYYY-MM-DD`. null = 미지정
- `Issue.labels: string[]` — 자유 문자열, 프로젝트 내 이슈들이 쓴 라벨의 합집합이 필터 선택지
- `Comment.updatedAt?: string` — 수정된 댓글만 값 존재 ("수정됨" 표시 근거)

**마이그레이션**: 스토리지 키 `alm.jira.v1` 유지. `load()`에서 파싱 직후 누락 필드를 기본값으로
채우는 normalize 단계를 추가한다 (`description: ""`, `dueDate: null`, `labels: []`).

## 스토어 API (`jiraStore.ts` — 백엔드 교체 지점 유지)

- `updateProject(id, { name?, description? })` — **키는 불변** (이슈 키 접두어 보전)
- `deleteProject(id)` — 프로젝트의 스프린트·이슈·댓글·활동·카운터 연쇄 삭제
- `updateComment(id, body)` / `deleteComment(id)` — 작성자(`CURRENT_USER_ID`)가 아니면 throw
- `listIssues` — `text` 필터가 설명도 검색, `label` 필터 파라미터 추가
- `createIssue`/`updateIssue` — `dueDate`, `labels` 지원. 활동로그에 `duedate`/`labels` 타입 추가

## 화면

**프로젝트 목록 페이지** — 새 라우트 `/projects` (JiraLayout 밖, TopBar만 공유하는 단독 페이지).
Table로 이름/키/설명/생성일 나열. 행별 Dropdown(수정/삭제). 수정은 Modal(이름·설명, 키는 읽기 전용),
삭제는 확인 Modal("이슈 N개가 함께 삭제됩니다"). 생성은 기존 `ProjectCreateModal`에 설명 필드 추가
후 재사용. 진입점: SideNav 프로젝트 Select 아래 "프로젝트 관리" 링크. 마지막 프로젝트 삭제 시
기존 `EmptyProjects` 흐름으로 자연 복귀.

**대시보드 페이지** — 새 라우트 `/projects/:projectId/dashboard`, SideNav 첫 항목 "대시보드".
Card 4장(전체/할 일/진행 중/완료 개수) + 담당자별 이슈 개수(ProgressBar 목록, 미지정 포함).
데이터는 `listIssues(projectId)` 하나로 화면에서 집계한다 (별도 스토어 API 불필요).

**이슈 상세 모달 확장** —
- 속성 패널: 마감일 `TextField type="date"`, 라벨 편집(Tag 나열 + 추가 입력 + Tag 제거),
  생성일/수정일 읽기 전용 표시
- 하단: "이슈 삭제" 버튼(danger) → 확인 Modal → `deleteIssue` → 모달 닫고 목록 재조회
- 댓글: 본인 댓글에만 수정(TextArea 전환)/삭제(확인) 노출, 수정된 댓글은 "수정됨" 표시

**이슈 카드** — 라벨 Tag 표시 (카드 필드: 키/제목/담당자/우선순위/라벨 — 스펙 §5 충족)

**이슈 목록** — 검색 placeholder "제목·설명·키", 라벨 필터 Select(프로젝트 내 존재 라벨 합집합),
마감일 컬럼 추가, 생성일/수정일/마감일 정렬 활성화 (수정일은 컬럼 추가)

## 원칙

- UI는 100% `@chanho/react` (DatePicker가 없으므로 `TextField type="date"` 사용)
- 화면은 스토어 async 함수만 호출 — 집계·정렬은 화면, 필터는 스토어 (기존 관례 유지)
- 테스트: 스토어 확장은 vitest 단위 테스트(프로젝트 수정/삭제 연쇄, 댓글 권한, 라벨/마감일/설명 검색),
  화면은 기존 페이지 테스트 패턴(Testing Library)

## 범위 제외

첨부파일, 알림, 실시간 협업, Epic/Story 타입, 권한 관리 — 명세의 "추가 구현 아이디어"는 이번 범위 밖.
백엔드 연동 없음(localStorage 목업 유지).
