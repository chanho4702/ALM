# 2026-09-05 상태 아이콘(색) · 사용자 아바타 업로드 · 샘플(더미) 데이터

사용자 결정(2026-09-05): 1) 상태 등 구분 — 앱은 **색 있는 아이콘**(lucide), 메일은 **이모지**. 2) 아바타 — **개인 설정에서 업로드**(MinIO 저장). 3) 더미 데이터 — **목업 시드 + 실제 스택** 둘 다.
관련: `docs/areas/settings-workflow.md`(레지스트리), `docs/areas/design-system.md`(아이콘은 lucide, 글자 기호 금지 — 메일 본문은 예외: 플레인 텍스트라 이모지 허용).

## A. 상태·구분 아이콘

### A.1 모델
- `StatusDef`에 `icon: string`(lucide 키, `typeIcons.tsx` 맵) 추가 — 서버 V20 `ALTER TABLE status_def ADD COLUMN icon VARCHAR(40) NOT NULL DEFAULT ''`. 기본 3종 시드: `todo → "circle"`, `inprogress → "loader-circle"`(없으면 `refresh-cw`), `done → "check-circle-2"`(없으면 `circle-check`). 빈 문자열이면 **카테고리 기본 아이콘**(kind별: new=circle, active=refresh-cw, complete=circle-check)으로 폴백.
- `StatusCategory`에는 이미 `color`가 있다. 아이콘 색 = 카테고리 색(`--chanho-color-text-{color}` 또는 Lozenge appearance와 같은 semantic 토큰). **색만으로 구분하지 않는다** — 아이콘 모양 + 이름이 항상 함께.
- REST: `/api/alm/settings/statuses` 응답·요청에 `icon`. 워크플로 본문의 `WorkflowStatus` 캐시(`{id,name,category,order}`)에도 읽을 때 `icon` 채워서 내려준다(`SchemeQueries.enrich`).

### A.2 화면 (프론트)
- 새 컴포넌트 `components/StatusGlyph.tsx`: `<StatusGlyph statuses|status …/>` — 아이콘 + 색, `role="img"` `aria-label="상태: 진행 중"`, 크기 14/16.
- 적용 위치(전부): 이슈 목록·검색 표의 상태 셀(Lozenge 앞에 글리프), 보드 컬럼 헤더(현재 상태 점 → 글리프로 교체), 백로그 행·홈 행·요약 최근 업데이트의 상태 Lozenge 앞, 이슈 상세 상태 Select 옵션·트리거(옵션 렌더가 문자열만 받으면 트리거 왼쪽에 글리프), 상태 레지스트리·워크플로 편집기 행.
- 우선순위·타입 아이콘: 이미 있음 — 카드·목록에서 **색을 레지스트리 색으로**(회색 단색 금지) 통일, 크기 16.
- 상태 레지스트리 화면(`StatusRegistryPanel`)에 아이콘 선택(기존 이슈 타입 아이콘 선택 UI 재사용) 추가. 목업 `normalize`가 구버전 상태에 `icon: ""`를 채운다.

### A.3 메일 이모지 (서버 `EmailNotifier`)
- 제목 접두: ASSIGNED `📌`, STATUS_CHANGED `🔄`, COMMENTED `💬`, MENTIONED `📣` — `[ALM] 📌 Alice님이 …`.
- 상태 변경 본문에 `상태: 할 일 → ✅ 완료`처럼 카테고리 kind별 이모지(new `⚪`, active `🔵`, complete `✅`) — kind는 `SchemeQueries`로 해석, 모르면 생략.
- 테스트: 제목 접두와 상태 줄 검증(기존 `EmailNotificationTest` 확장).

## B. 사용자 아바타 업로드

### B.1 서버 (alm-backend)
- V20에 `user_preference.avatar_key VARCHAR(200)` 추가(사용자 행이 없으면 만들고 저장 — 기존 `rememberEmail`처럼).
- `PUT /api/alm/me/avatar` multipart(`file`), 허용 `image/png|jpeg|webp`, 2MB 이하(초과 400 `아바타는 2MB 이하 이미지여야 합니다`). 저장은 기존 첨부 저장소 추상화(`AttachmentService`의 S3/로컬 파일 경로)를 **재사용** — 키 `avatars/{userId}/{uuid}.{ext}`; 이전 키는 커밋 뒤 삭제.
- `DELETE /api/alm/me/avatar` — 제거.
- `GET /api/alm/users/{userId}/avatar` — 바이트 스트림(인증 필요, Content-Type 원본, `Cache-Control: private, max-age=300`). 없으면 404.
- `GET /api/alm/users/avatars` — `[{ userId, updatedAt }]` 아바타 있는 사용자만(목록 화면이 한 번에 받아 URL을 만든다: `/api/alm/users/{id}/avatar?v={updatedAt}`).
- 개인 설정 응답(`PreferenceView`)에 `avatarUrl`(nullable) 추가.
- 테스트: 업로드→조회 왕복, 타입/크기 거부, 삭제 후 404, 목록에 반영.

### B.2 프론트 (alm-front)
- `User`에 `avatarUrl?: string | null`. `listUsers`(REST)는 org 멤버 + `/api/alm/users/avatars`를 합쳐 채운다. 목업은 `data.avatars[userId] = dataURL`(업로드 파일을 base64로, 200KB 제한 안내).
- 파사드: `uploadMyAvatar(file)`, `removeMyAvatar()`, `getMyPreferences().avatarUrl`.
- 개인 설정 > 일반 설정 상단에 **프로필 카드**: 큰 Avatar(96) + `사진 올리기`(input file, accept 이미지) + `제거` + 안내(2MB, PNG/JPG/WebP). 업로드 직후 미리보기, 저장 버튼 없이 즉시 반영(토스트).
- 모든 `Avatar` 사용처에 `src={user.avatarUrl ?? undefined}` — 공용 헬퍼 `<UserAvatar user size/>`를 만들어 카드·목록·상세·보드 필터·상단바 사용자 메뉴·코멘트에서 교체. `userNames` 맵을 쓰는 곳은 `usersById` 맵으로 확장.
- 테스트: 업로드 후 개인 설정·이슈 목록 담당자 셀에 이미지가 뜬다(목업), REST 계약(multipart 전송·avatars 병합).
- 한계(문서에 명시): 아바타는 ALM 서비스 저장이라 위키·보드에는 아직 안 보인다 — org-service 이관은 후속.

## C. 샘플(더미) 데이터

### C.1 데모 프로젝트 템플릿 (한 코드 경로로 목업·REST 둘 다)
- `store/templates.ts`에 템플릿 `demo` "데모 프로젝트 (풍부한 샘플)" 추가 — 프로젝트 만들기 위저드 카드로 노출(설명: "스프린트·릴리스·컴포넌트·코멘트·워크로그까지 채워진 데모용").
- `applyTemplate`(목업·REST 공통 로직으로 — 현재 REST 어댑터 안의 applyTemplate과 목업의 적용이 갈라져 있으면 **스토어 함수만 부르는 공용 시더** `store/sampleData.ts`로 뽑아 둘이 공유): 생성 순서
  1. 컴포넌트 4(프론트엔드·백엔드·인프라·디자인, 리더 배정), 버전 3(1.0 릴리스됨·1.1 진행·2.0 계획), 라벨 풀 8.
  2. 스프린트 3: 완료된 스프린트(2주 전, 완료 처리), 활성 스프린트(목표 문장 포함), 미래 스프린트.
  3. 에픽 4 → 각 에픽 아래 이슈 5~7(타입 작업/스토리/버그 섞기, 우선순위 5단계 분포, 담당자는 `listUsers()` 순환·일부 미지정, 라벨 1~2, 컴포넌트 1, 마감일: 지난 것·이번 주·다음 달 섞기, 예상 시간 일부), 하위 작업 6, 이슈 링크(차단·관련) 5.
  4. 상태 분포: 완료 스프린트 이슈는 전부 완료(해결 지정), 활성 스프린트는 할 일/진행 중/완료 섞기, 백로그 10건.
  5. 코멘트 15(멘션 2 포함), 워크로그 12(최근 3주 날짜 분산), 이슈 보관 2, 대시보드 1(가젯 5).
- 총 이슈 ≈ 45. 키 접두는 사용자가 위저드에서 정한 키. **한 번 더 만들면 또 하나의 데모 프로젝트**(키만 다르게) — 여러 프로젝트가 필요하면 반복.
- 제목·코멘트 문안은 한국어 실제 업무처럼(`샘플`이라는 단어를 넣지 말 것 — 캡처·데모용). 시더는 `Promise.all` 남발 없이 순차(REST `expectedVersion` 충돌 방지).
- 테스트: 목업에서 `createProject({templateId:"demo"})` 후 개수·분포 단언(이슈 ≥ 40, 스프린트 3, 버전 3, 컴포넌트 4, 코멘트 ≥ 15). REST 계약: 시더가 부르는 스토어 함수 목록이 어댑터에 전부 있는지(타입으로 강제).

### C.2 목업 기본 시드
- `jiraMock.ts` 기본 시드(현재 프로젝트 1·이슈 8)는 **첫 방문 화면이 비어 보이지 않을 만큼만** 키운다: 프로젝트 2(ALM 플랫폼 + 위키 제품), 이슈 ≈ 25, 스프린트 2, 버전 1, 컴포넌트 3, 코멘트 6, 워크로그 4. 기존 테스트가 기대하는 ALM-1~8의 제목·상태·담당자는 **그대로 유지**(추가는 ALM-9부터, 두 번째 프로젝트는 별도 키).
- `__resetForTest`가 같은 시드를 쓰므로 테스트 카운트 단언(`toHaveLength(8)` 등)이 깨지면 **시드 확장분을 `seedRich` 옵션으로 분리**해 테스트 기본은 종전 8건 유지, dev 기본만 확장한다.

### C.3 실제 스택 넣기
- 사용자가 브라우저에서 프로젝트 만들기 → "데모 프로젝트" 템플릿을 고르면 REST로 들어간다(관리자 롤 불필요). 문서 `docs/areas/screens.md` 프로젝트 만들기 행에 한 줄.

## D. 검증·문서
- 프론트 `pnpm typecheck && pnpm test && pnpm build`, 백엔드 `gradlew cleanTest test bootJar`.
- `docs/STATUS.md`·`areas/settings-workflow.md`(상태 아이콘)·`areas/store.md`(아바타·시더) 갱신. 테스트 카운트 갱신.
