# 2026-09-05 아바타·프로필을 org-service로 이관 (플랫폼 공통)

사용자 결정(2026-09-05): 후속 1번 "아바타 org-service 이관(위키·보드에도 보이게)" 착수.
분담(다른 세션 msa-template-65와 합의): org-service의 member/team/grant 도메인·초대·Keycloak 연동은 그쪽 — 이 작업은 **별도 테이블 `member_profile`** 만 추가하고 member 테이블은 건드리지 않는다. org-service Flyway는 **V7**을 쓴다(V4~V6은 그쪽 예약).

현재: 아바타는 alm-backend V20(`user_preference.avatar_key`)에 있고 ALM에서만 보인다. 사용자 디렉터리는 org-service `GET /api/org/members`(member PK = auth-server user id = JWT `sub`).

## 1. org-service (platform-backend/org-service)

### 1.1 스키마 V7 `member_profile`
```sql
CREATE TABLE member_profile (
    member_id BIGINT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
    avatar_key VARCHAR(200),
    avatar_content_type VARCHAR(80),
    avatar_updated_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
행은 첫 업로드 때 만든다(member가 없으면 404 — member는 JIT 미러링으로 이미 있다).

### 1.2 저장소
- alm-backend `attachment/AttachmentStorage`(S3 + 로컬 파일 폴백, `requireSafeKey`, 매직 바이트 판별 `AttachmentMediaTypes`)와 **같은 구조**를 org-service에 최소 복제(`profile/AvatarStorage`, `S3AvatarStorage`, `LocalAvatarStorage`). 공통화(common-starter)는 하지 않는다 — 두 곳뿐이고 의존이 커진다(후속 후보로 기록).
- 설정: `platform.org.avatar.s3.enabled`(기본 false → 로컬 `ORG_FILES_DIR`), `ORG_S3_ENDPOINT/BUCKET/REGION/PATH_STYLE_ACCESS/ACCESS_KEY/SECRET_KEY` — alm-backend `ALM_S3_*`와 같은 이름 규칙. 버킷 `member-avatars`(infra minio-init에 추가).
- 키 `avatars/{memberId}/{uuid}.{ext}`, 허용 PNG/JPG/WebP(매직 바이트, SVG 거부), 2MB, 이전 오브젝트는 커밋 뒤 삭제, 실패는 warn.

### 1.3 REST
| 메서드 | 경로 | 인가 | 응답 |
|---|---|---|---|
| PUT | `/api/org/me/avatar` (multipart `file`) | 본인 | 200 `{ memberId, avatarUrl, updatedAt }` |
| DELETE | `/api/org/me/avatar` | 본인 | 204 |
| GET | `/api/org/members/{id}/avatar` | 인증 | 바이트, 원본 Content-Type, `Cache-Control: private, max-age=300`, `X-Content-Type-Options: nosniff`; 없으면 404 |
| GET | `/api/org/members` | (기존) | 각 항목에 `avatarUrl`(nullable)·`avatarUpdatedAt`(nullable) 추가 — 기존 필드 불변 |
| GET | `/api/org/me` (없으면 신설) | 본인 | `{ id, displayName, email, avatarUrl, avatarUpdatedAt }` |

`avatarUrl` = `/api/org/members/{id}/avatar?v={epochMillis}`. 오류 문구(`{"error"}`, 400): `아바타는 2MB 이하 이미지여야 합니다`, `아바타는 PNG·JPG·WebP 이미지만 올릴 수 있습니다`, `빈 파일은 올릴 수 없습니다`; 404 `아바타가 없습니다`. AGENT 멤버도 업로드 가능(관리자가 `PUT /api/org/members/{id}/avatar`로 — ADMIN 전용, 선택 구현; 없으면 문서에 후속으로).
- 테스트: 업로드→목록 반영→바이트 조회→재업로드 시 이전 키 삭제→DELETE 후 404, 타입/크기 거부, 로컬·S3 키 검증.

## 2. alm-backend
- V21: `user_preference`의 `avatar_key`·`avatar_updated_at` 컬럼 **제거**, `AvatarService/AvatarController/AvatarControllerTest` 삭제, `PreferenceView.avatarUrl` 제거, README 아바타 절을 org-service 참조로. `AttachmentStorage`의 `store(...,key)`·`requireSafeKey`·`defaultBucket()`은 남긴다(무해).
- 기존 alm 아바타 오브젝트(`avatars/...` in `alm-attachments`)는 마이그레이션하지 않는다(개발 단계, 사용자 재업로드).

## 3. alm-front
- `listUsers`(REST): `/api/org/members`가 이제 `avatarUrl`을 주므로 **`/api/alm/users/avatars` 병합 제거**. 바이트는 여전히 Bearer 필요 → 기존 fetch + object URL 캐시 유지, 경로만 org.
- `uploadMyAvatar`/`removeMyAvatar` → `PUT/DELETE /api/org/me/avatar`. `getMyPreferences().avatarUrl`은 `/api/org/me`(또는 members 목록에서 본인)로.
- 목업 동작 불변. 테스트: REST 계약 경로 갱신.

## 4. wiki-front / myFront (표시만, 후속)
- `/api/org/members` 소비처에서 `avatarUrl`을 DS `Avatar src`로 — wiki-front는 다른 세션이 작업 중이라 **이번 범위 밖**(API만 준비). 문서에 한 줄.

## 5. infra
- compose `org-service` 환경변수 `ORG_S3_*`(alm과 같은 MinIO 자격증명), `minio-init`에 `mc mb --ignore-existing local/member-avatars`, `.env.example` 주석.
- 로컬 dev(오프셋 클러스터)는 `platform.org.avatar.s3.enabled=false` 기본이라 파일 폴백.

## 6. 검증
- org-service·alm-backend `gradlew cleanTest test bootJar`, alm-front 게이트. 실측: 목업 dev에서는 변화 없음, REST 경로는 계약 테스트.
