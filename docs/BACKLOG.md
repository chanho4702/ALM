# 백엔드 의존 기능 백로그

프론트만으로는 목업 수준을 넘을 수 없어 **jira-service(백엔드) 도입 시** 진행하기로 기록해 둔 항목.
현재 화면은 전부 `src/features/alm/store/jiraStore.ts`(localStorage 목업)만 호출하므로,
백엔드가 생기면 이 파일 내부를 fetch로 교체하는 것이 시작점이다.

관련: `roadmap/2026-08-28-jira-parity-requirements.md` — 아래 1~6번 항목은 그 문서에서
지라 갭 인벤토리의 Should/Could 항목으로 편성돼 있다.

## 1. 첨부파일 — ✅ 해소(2026-08-30)

서버 V8 `issue_attachment` + MinIO(S3 호환)로 구현했다. 목업 모드는 메타만 localStorage에 두고
바이트는 메모리에만 둔다(새로고침 시 바이트 소실 — 의도된 한계). 아래는 당시 기록.

### (원문) 첨부파일 (요구사항 명세 "추가 아이디어")

- 필요한 것: 파일 스토리지(S3/MinIO 등) + 업로드 API(멀티파트), 다운로드 서명 URL
- localStorage는 ~5MB 한계 + base64 부풀림 때문에 목업 부적합 → 백엔드 대기
- 프론트 준비 사항: 이슈 상세에 첨부 섹션(업로드 버튼·목록·삭제), `Attachment` 타입
  (`id/issueId/filename/size/mimeType/uploadedBy/uploadedAt/url`)

## 2. 실시간 협업 (WebSocket)

- 필요한 것: WebSocket/SSE 게이트웨이, 이슈·보드 변경 이벤트 브로드캐스트
- 대상: 보드 드래그 실시간 반영, 상세 모달 동시 편집 감지, 코멘트 실시간 추가
- 프론트 준비 사항: 스토어에 구독 계층(현재 `uiStore`의 `UI_CHANGED_EVENT` 패턴을
  서버 이벤트로 확장), 낙관적 업데이트 재검토

## 3. 알림 푸시/영속 — 🔶 부분 해소(2026-08-30 서버 저장 V9, @멘션 MENTIONED 추가)

- 해소: 사용자별 알림 저장(V9 `notification`) + 코멘트/상태/배정/멘션 알림, 개인 설정으로 끄기
- 해소(2026-09-04): **이메일 알림** — 서버 V19 `EmailNotifier`(`ALM_MAIL_HOST`가 비면 발송 없이 알림함만),
  개인 설정 "이메일로도 받기"(`emailEnabled`) + 서버 구성 여부(`mailConfigured`) 안내. 주소는 JWT email 스냅샷.
- 남음: 실시간 푸시(WebSocket/Web Push), 하루 요약(digest) 모드

## 4. 사용자/권한 (Role) — ✅ 해소(2026-08-30 org-service 연동)

- 사용자 디렉터리·프로젝트 멤버십·권한은 org-service REST(`/api/org/members`·grants·me/permissions)로
  연결됨(마지막 관리자 강등 가드 포함). 남은 운영 항목은 아래 §7의 Keycloak ADMIN 롤 부여뿐.

## 5. 서버 검색/페이징 — ✅ 해소(2026-08-30, 서버 검색·페이징)

- 현재: 전역 검색·목록 필터가 전체 데이터를 메모리에서 거른다 (목업이라 가능)
- 필요한 것: 검색 인덱스(또는 DB LIKE/FTS) + 커서 페이징 API, 목록 가상 스크롤

## 6. 감사 로그/활동 스트림 고도화 — ✅ 해소(2026-08-30, 서버 감사 로그 V10)

- 현재: 이슈 단위 활동로그만 존재
- 필요한 것: 프로젝트/사용자 단위 활동 스트림 API (홈 "최근 업데이트"의 서버 버전)


## 7. 남은 작업 모음 (2026-09-04 기준)

2026-08-30 페이지 손질 배치(표 열 조절·지라식 생성·계층 무제한·에디터+@멘션·프로젝트 위저드·목록 손질)
완료 후 남은 것들. 우선순위 순.

### 페이지 손질 이어서 (프론트 단독 가능) — ✅ 2026-09-04 완료
- [x] 보드 화면 — 한 줄 툴바·남은 일수·스프린트 완료·플레인 컬럼 헤더·우선순위 아이콘
- [x] 홈 화면 — 오늘 요약 줄·이어서 하기 4장·넓은 폭
- [x] 리포트 화면 정리 — 툴바 한 줄
- 그 외 전 화면 손질 내역: `superpowers/specs/2026-09-04-ui-polish-pass.md`

### 백엔드 의존 — ✅ 2026-09-04 완료
- [x] 이메일 알림 — 서버 V19 + `ALM_MAIL_*`(선택), 개인 설정 토글
- [x] 휴지통 자동 비우기 — `ALM_TRASH_RETENTION_DAYS`(60) 지난 프로젝트를 매일 03:00 영구 삭제, 휴지통 화면에 "n일 후 영구 삭제"

### 플랫폼/운영 잔여 (타 리포)
- [ ] ALM 통합 검색 — **후속 후보로 보류(2026-09-05 결정)**: ALM 자체 검색은 DB 검색으로 동작. 위키+ALM 통합 검색이 필요해지면
      platform-backend `f92ff71`의 search-service ALM 색인기만 새 main 위에 재이식(브랜치는 8/15 기반이라 그대로 머지 불가)
- [ ] S-03 잔여 — alm-front가 design-system을 아직 tgz로 소비(GitHub Packages 전환 미완),
      board-service 이미지 푸시는 리포 시크릿 `GH_PACKAGES_TOKEN` 대기
- [ ] Keycloak ADMIN 롤 부여 — 사용자 직접 작업 (관리자 설정 화면 접근에 필요)
