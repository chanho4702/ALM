# 워크로그(시간 추적) 설계 (2026-07-18)

설정 시스템 1차(합의 순서 C→B→A의 C). 이슈에 예상 시간을 정하고 작업 시간을 기록한다.

## ALM 특색

- 지라의 복잡한 time tracking(Original/Remaining/Logged 3값) 대신 **예상 시간 + 기록 합계**
  두 값만 — 진행률 바 하나로 즉시 읽힌다. 예상 초과 시 danger 색.
- 기록 단위는 시간(h), 소수 허용(0.5h). 포맷 문법(1d 4h) 학습 불필요.

## 데이터 모델

```ts
interface Worklog {
  id: string;
  issueId: string;
  authorId: string;
  hours: number;        // > 0, 소수 허용
  comment: string;      // 선택
  workedOn: string;     // "YYYY-MM-DD" 작업일
  at: string;           // 기록 시각(ISO)
}
// JiraData.worklogs: Worklog[] (normalize ??= [])
// Issue.estimateHours: number | null 추가 (normalize ??= null)
// Activity.type에 "worklog" 추가
```

## 스토어

- `listWorklogs(issueId)` — 작업일 내림차순, 같은 날은 기록 시각 내림차순
- `addWorklog(issueId, { hours, comment?, workedOn })` — hours > 0 검증, 활동로그
  `worklog`("2시간 기록") + 현재 사용자 명의
- `deleteWorklog(id)` — 본인 것만 (아니면 throw "본인 워크로그만 삭제할 수 있습니다")
- `updateIssue` patch에 `estimateHours`(null 또는 > 0) — 활동로그는 남기지 않는다(속성 편집)
- cascade: `deleteIssue`/`deleteProject` 시 워크로그 삭제

## 화면 (이슈 상세 모달)

- 속성 패널: **예상 시간(h)** number 입력(비우면 미지정) + **시간 진행률** —
  `기록 6h / 예상 8h` 텍스트 + ProgressBar(초과 시 danger variant, 예상 없으면 합계만 표시)
- 기록 Tabs에 **"워크로그 (n)"** 탭 추가: 기록 폼(시간 h number·작업일 date 기본 오늘·메모) +
  목록(작성자 Avatar·작업일·시간·메모, 본인 것 삭제 버튼)

## 테스트

- 스토어: 추가/검증/본인 삭제 권한/정렬/estimate patch/활동로그/cascade
- UI: 워크로그 기록 → 목록·진행률 갱신, 예상 시간 저장, 예상 초과 시 danger

## 범위 제외

남은 시간 수동 조정(지라 Remaining), 사용자별 리포트 화면, 워크로그 수정(삭제 후 재기록으로 갈음).
