# 2026-09-12 ALM 후속 배치 — 해결일(resolved)·저장 필터 서버 저장·소소한 정리 4건

AQL 도입(09-06) 때 미룬 것과 리뷰 잔여를 한 배치로. 서버·프론트 계약은 이 문서가 정본.

## 1. 해결일 `resolvedAt` (AQL `resolved` 필드)
- **규칙**: `resolution`이 null→non-null이 되는 순간 `resolvedAt = now`, non-null→null이면 `resolvedAt = null`. 상태 전이로 resolution이 자동 설정되는 기존 경로가 있으면 그 경로도 같은 규칙을 탄다(직접 대입 금지 — 한 곳의 setter/도메인 메서드로).
- **alm-backend**: V22 `ALTER TABLE issue ADD COLUMN resolved_at TIMESTAMPTZ NULL` + 백필 `UPDATE issue SET resolved_at = updated_at WHERE resolution IS NOT NULL`. `IssueResponse.resolvedAt`(ISO, nullable) 추가 — 다른 필드 불변. AQL: `resolved`(별칭 해결일)를 date 필드로 **지원**(지금의 400 "아직 지원하지 않는 필드" 제거), `IS EMPTY`/`IS NOT EMPTY`·비교·정렬 가능. `AqlIssueRow`에 열 추가. `/query/fields`에 노출. 테스트: 규칙(설정·해제·재설정), 백필, AQL `resolved >= -7d`·`resolved IS EMPTY`·`ORDER BY resolved DESC`.
- **alm-front**: `Issue.resolvedAt: string | null`, 목업이 같은 규칙으로 채움(기존 시드는 resolution 있으면 updatedAt), `evaluate.ts`가 `resolvedAt` 사용(근사치 제거), 필드 레지스트리 `resolved` supported, 이슈 상세 속성 패널에 "해결일"(있을 때만, `FieldLabel` 아이콘 규칙), `docs/areas/search.md` 한계 항목 삭제. 테스트: 파서/실행기 벡터 `resolution IS EMPTY AND updated < -14d`는 그대로, `resolved` 3건.

## 2. 저장 필터 서버 저장
- **alm-backend** V23:
  ```sql
  CREATE TABLE saved_filter (
    id BIGSERIAL PRIMARY KEY, owner_id BIGINT NOT NULL, name VARCHAR(60) NOT NULL,
    kind VARCHAR(8) NOT NULL, query VARCHAR(4000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (owner_id, name));
  ```
  REST(본인 소유만): `GET /api/alm/me/filters` → `[{id, name, kind, query, createdAt, updatedAt}]`(name 순), `POST` `{name, kind, query}` → 201, `PUT /{id}` `{name?, kind?, query?}` → 200, `DELETE /{id}` → 204, 남의 것은 404. 검증: name 1~60·중복 409 `{"error":"같은 이름의 필터가 있습니다"}`, kind `smart|aql`, query 1~4000, `kind=aql`이면 `AqlParser`+`AqlValidation`으로 문법 검사 → 400 `{error, position, expected}`(기존 계약). 테스트: CRUD·소유 격리·중복·AQL 문법 400.
- **alm-front**: `SavedFilter`는 그대로(`id: string`). 파사드 `listSavedFilters/createSavedFilter/updateSavedFilter/deleteSavedFilter`(목업: 기존 uiStore localStorage 키 그대로 사용해 호환; REST: 위 API). `GlobalSideNav`·검색 페이지 "필터로 저장"이 파사드를 쓴다(uiStore 직접 접근 제거). **REST 모드 1회 이관**: 첫 목록 조회 때 localStorage에 옛 필터가 있으면 서버에 POST(중복 이름은 건너뜀) 후 로컬 키 삭제. 테스트: 목업 CRUD·사이드바 반영·REST 계약(fetch 모킹)·이관 1건.

## 3. 소소한 정리
- **alm-backend** `PreferenceService`: `mailConfigured` 계산의 `OrgMailClient.enabled()` HTTP를 읽기 트랜잭션 밖으로(컨트롤러 또는 `@Transactional` 없는 메서드) — 테스트 1건(트랜잭션 안 호출 0회, 기존 `FakeOrgMailClient.enabledCalls()` 활용).
- **alm-front** 미정의 토큰 4개 치환(`docs/areas/design-system.md` 대응표대로): `--chanho-color-text`→`text-default`, `text-muted`/`text-subtlest`→`text-subtle`, `--chanho-shadow-raised`→ tokens 0.4.0에 실존하는 shadow 토큰(확인 후). 치환 후 문서의 "미정의 토큰" 절을 "해소됨(09-12)"로.
- **alm-front** 데모 시더 진행 표시: `seedDemoProject(api, { onProgress?: (done, total, label) => void })`, 전역 관리 데모 카드에서 DS `ProgressBar`(없으면 텍스트 `n/total · 라벨`)·완료 토스트, 실행 중 버튼 비활성. 테스트 1건.

## 4. 검증·커밋
- 백엔드 `cleanTest test bootJar`(스크래치패드 사본), 프론트 `typecheck`+바뀐 파일 테스트(전체 스위트·build는 리드). 커밋은 리드가 파일 지정으로. 문서: alm-backend README(AQL resolved·saved filter API), alm-front `docs/areas/search.md`·`docs/STATUS.md` 특색 표.
