# ALM Front 현황 (2026-08-16 기준)

한눈에 보는 "어디까지 했고, 무엇이 남았나". 상세 설계는 `superpowers/specs/`, 태스크별
계획은 `superpowers/plans/`, 백엔드 의존 항목은 `BACKLOG.md`, **부위별 개발 가이드·알려진
이슈 목록은 `areas/README.md`** 참고 (전역 규칙은 리포 루트 `CLAUDE.md`).

## 정체성

**지라 클론이 아니라 자체 ALM 제품.** 지라의 검증된 구조(전역 사이드바·프로젝트 뷰 탭·
보드/백로그 모델)를 따르되, ALM 고유 편의를 얹는다. 코드도 `src/features/alm`.

### ALM 특색 (지라 대비 개선)

| 특색 | 위치 | 요지 |
|---|---|---|
| 한국어 스마트 검색 | `/search` | JQL 대신 `상태:진행중 담당:김찬호 버그` — 칩 빌더와 양방향, 못 알아듣는 입력은 검색어로 보존 |
| 필터 URL 공유 | `/search?q=…` | 검색 상태 전체가 읽을 수 있는 URL — 링크가 곧 필터 |
| 저장 필터 사이드바 상주 | 전역 사이드바 "필터" | 저장 즉시 노출, 원클릭 적용, hover × 삭제 |
| 정직한 템플릿 미리보기 | `/projects/new` | 카드 미리보기 데이터 = 실제 적용 로직과 같은 파일 |
| 샘플 온보딩 | 생성 템플릿 | 첫 화면이 비지 않게 삭제 가능한 더미 이슈 자동 세팅 |
| 단순한 시간 추적 | 이슈 상세 | 지라 3값 대신 예상+기록 2값 — 진행률 바 하나, 초과는 danger |

## 완료된 로드맵 (2026-07-17 합의 분해안 5개 전부)

1. **다중 보드 + 보드 고도화** — 보드=필터 뷰(스크럼/칸반), `/boards/:boardId`,
   사이드바 중첩, 퀵 필터바(담당자 아바타 토글), 담당자 스윔레인, 컬럼 이름/WIP 초과 강조,
   보드 설정 모달. 기존 `/board` URL은 기본 보드 redirect(?issue 보존)
2. **백로그 DnD** — 스프린트↔백로그 드래그 이동·패널 내 랭크 변경(`rankIssue`), Dropdown 병행
3. **이슈 관계** — 단일 parentId 2단계 계층(에픽→이슈→하위 작업), subtask 타입,
   이슈 링크(차단/관련)·차단됨 경고, 카드 에픽 태그
4. **상세 검색 + 필터 저장** — 위 특색 표 참고. 쿼리 모델 `IssueQuery`는 GraphQL 인자로 1:1 매핑 예정
5. **프로젝트 생성 템플릿** — 빈/스크럼/칸반/버그 트래킹

그 이전 완료분: 전역 셸(상단바+상주 사이드바·최근/별표/접기/너비 조절), For you 홈,
프로젝트 셸(디렉터리·생성·설정·헤더+뷰 탭·컬러 아바타), 요약(대시보드), 타임라인(간트),
이슈 목록/상세, 코멘트 편집, 이슈 타입, 알림 벨, 다크 모드.

## 설정 시스템 (설계 v3 — 지라 스킴 구조 모방, 전부 완료)

- **스킴 모델**: 전역 관리(⚙ `/settings`)에서 스킴 정의 → 프로젝트 배정 →
  "이 프로젝트만 커스텀" 전환. `resolveSettings(projectId)`가 단일 진실
- **워크로그(C)**: 예상+기록 2값, 이슈 상세 진행률/탭
- **이슈 타입(B)**: 스킴/커스텀별 활성 타입 — 생성·전환 제약, subtask 항상 활성
- **커스텀 워크플로(A)**: `Issue.status` = `WorkflowStatus.id`, `IssueStatus`는
  카테고리(todo/inprogress/done)로 축소. 기본 상태 id=카테고리 문자열이라 기존 데이터
  무마이그레이션 호환. StatusEditor(추가/이름/카테고리/순서/삭제)를 전역 스킴 모달과
  프로젝트 커스텀 탭이 공유. 구성 변경 시 없어진 상태의 이슈는 같은 카테고리 첫 상태로
  자동 이관. 보드 컬럼·상태 Select·Lozenge·통계·스마트 검색(`상태:커스텀이름`,
  공백 제거 매치) 전부 동적 상태 기반

## 백엔드 연결 상태

- `store/apiClient.ts`: AuthGate와 REST 어댑터가 같은 메모리 access token·refresh 요청을 공유
- `store/mapping.ts`: alm-backend 숫자 ID와 대문자 enum을 화면 모델로 변환
- `store/jiraApi.ts`: 프로젝트·이슈 CRUD, 최신 version 조회 후 `expectedVersion`을 보내는 REST 어댑터
- alm-backend V2의 부모·마감일·라벨·예상 시간·정렬 응답을 매핑하고 `details` 요청으로 보존
- **아직 `jiraStore.ts` 런타임 전환은 하지 않았다.** 스프린트 엔티티/API, 프로젝트 템플릿·
  설정, 사용자 디렉터리와 서버 순위 변경 API가 남아 있다. 어댑터는 `sprintId`를 조용히 버리지
  않고 명시적 오류로 차단한다.

## 품질 상태

- 테스트 **258 케이스 / 28 파일** — 스토어 단위 + REST 계약 + Testing Library 통합(App 전체 마운트)
- 플레이키 대책: vitest `testTimeout` 15s, RTL `asyncUtilTimeout` 5s (병렬 워커 경합 대응)
- `pnpm typecheck` / `pnpm build` 통과. dev는 `pnpm dev --port 5175 --strictPort`

## 아키텍처 요점 (바뀌지 않은 원칙)

- 화면은 `store/jiraStore.ts`의 async 함수만 호출 — **백엔드(jira-service) 교체 지점은 이 파일 하나**
- 도메인 데이터 `alm.jira.v1`(normalize가 스키마 승격) / UI 상태 `alm.jira.ui.v1`(uiStore)
- UI는 100% `@chanho/react` — 커스텀 마크업도 토큰만 사용

## 다음 후보

1. **스프린트·순위 변경 API 후 store 전환** — Sprint CRUD/시작/완료와 이슈 이동·재정렬을
   서버 트랜잭션으로 만들고, 프로젝트 템플릿/설정·사용자 디렉터리 계약을 채운다. 이후
   `jiraStore.ts`를 `jiraApi.ts`로 전환하고 `queryIssues`를 통합 검색 GraphQL로 교체한다.
2. 디자인 폴리시 잔여 — 빈 상태 일러스트, 로딩 스켈레톤 (반응형은 2026-07-18 완료)
3. 컨플루언스(위키) 클론 — ALM 우산의 다음 조각
