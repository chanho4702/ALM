# 2026-09-04 이슈 필드 구성 — 전역 스킴 + 프로젝트별 커스텀

사용자 요청(원문): "이슈 생성 모달에 우측에 있는 것 … 해당 항목들 전역 및 프로젝트 별 커스텀 기능 있어야해".
→ 이슈 만들기 모달·상세 모달 속성 패널의 **필드**(담당자·우선순위·라벨·컴포넌트·상위 항목·스프린트·마감일·수정 버전·해결·예상 시간·설명·첨부·링크)를
지라의 **필드 구성 스킴**처럼 전역에서 정의하고 프로젝트가 배정받되, "이 프로젝트만 커스텀"으로 덮어쓸 수 있어야 한다.

기존 설정 모델(`docs/areas/settings-workflow.md`)을 그대로 탄다: `SettingsBody`에 `fields`를 얹는다 →
스킴(`SettingsScheme.body`) / 프로젝트 커스텀(`ProjectSettingsEntry.custom`) / `resolveSettings(projectId)` 단일 진실.
서버 V11 `settings_scheme.body`·`project_settings.custom_body`가 JSON TEXT라 **마이그레이션 없음**.

## 1. 모델 (프론트 `types.ts` · 서버 `SettingsBody.java` 동일 shape)

```ts
/** 구성 가능한 필드 — 프로젝트·타입·요약·상태는 항상 있으므로 목록에 없다 */
export type IssueFieldId =
  | "description" | "assignee" | "priority" | "labels" | "components" | "parent"
  | "sprint" | "dueDate" | "fixVersion" | "resolution" | "estimate" | "attachments" | "links";
export interface IssueFieldConfig {
  id: IssueFieldId;
  /** false면 만들기 모달·상세 속성 패널·대량 변경에서 숨긴다 */
  visible: boolean;
  /** true면 만들기 모달에서 필수(값 없으면 만들기 불가) — 서버도 생성 시 검사 */
  required: boolean;
}
// SettingsBody.fields?: IssueFieldConfig[]  — 없거나 비면 전부 visible:true, required:false
```

규칙(프론트 목업·서버 공통, 위반 시 서버 400 `{"error": …}`):
- id는 위 13종 안에서 **유일**. 모르는 id는 거부.
- `visible:false && required:true`는 모순이라 거부.
- `resolution`은 완료 상태에서만 의미가 있으므로 `required`를 허용하지 않는다(거부).
- `parent`도 `required`를 허용하지 않는다(거부) — 구성이 프로젝트 단위라 필수로 걸면 최상위 이슈를 만들 수 없다. 타입별 구성은 후속(리뷰 2026-09-04).
- `fields: []`(빈 목록)는 "기본값으로 되돌리기"다 — 화면은 항상 정규화된 13개를 보낸다.
- `attachments`·`links`는 `required`로 저장되지만 생성 시 서버가 강제하지 않는다(생성 뒤 붙는 값) — 만들기 모달은 `*`만 표시.
- `priority`는 기본값(`defaultPriority`)이 항상 있으므로 required여도 만들기에서 막히지 않는다(표시만 `*`).
- 순서 변경은 이번 범위 밖(모달의 지라 필드 순서 고정).

기본값(`DEFAULT_FIELDS`): 13종 전부 `visible:true, required:false`. `normalize`/서버 읽기에서 없는 id는 기본값으로 채운다(구버전 호환).

## 2. 서버 (alm-backend)

- `SettingsBody`에 `List<FieldConfig> fields` 추가(`record FieldConfig(String id, boolean visible, boolean required)`), 읽을 때 null → 기본 13종으로 채워 응답. 스킴/커스텀 저장(`SchemeService`)에서 §1 규칙 검증.
- 이슈 생성(`POST /api/alm/projects/{id}/issues` 등 생성 경로 전부)에서 프로젝트의 resolved settings로 **required 검사**:
  `assignee`(assigneeId null 거부) · `labels`(빈 목록 거부) · `components` · `parent` · `sprint` · `dueDate` · `fixVersion` · `estimate` · `description`(공백 거부). 메시지 예: `"담당자는 필수입니다"`.
  수정(PUT)에서는 검사하지 않는다(기존 이슈를 갑자기 막지 않기 위해 — 지라도 편집 화면 필수는 별도).
- `GET /api/alm/settings/schemes`·`/api/alm/projects/{id}/settings` 응답에 `fields`가 실린다. 기존 필드 계약 불변.
- 테스트: 기본 채움, 규칙 위반 400 3종, required 생성 거부/통과, 커스텀 프로젝트가 스킴과 다르게 동작.

## 3. 프론트 (alm-front)

### 3.1 스토어
- `types.ts`: §1 타입 + `SettingsBody.fields?`. `labels.ts` 또는 신규 `components/fieldConfig.ts`: `FIELD_IDS`, `FIELD_LABELS`(한국어), `DEFAULT_FIELDS`, `resolveFields(body): Record<IssueFieldId, IssueFieldConfig>`.
- `jiraMock.ts`: `normalize`가 스킴/커스텀 body에 fields 기본값을 채움. `saveScheme`/`saveProjectCustom`류에서 §1 검증. `createIssue`에서 required 검사(서버와 같은 메시지). 파사드 export 추가.
- `jiraApi.ts`: body 매핑에 fields 통과(REST는 서버가 검증).

### 3.2 전역 관리 — 새 구획 `fields` "필드 구성" (`GLOBAL_SETTINGS_SECTIONS`, `SettingsSideNav` "이슈 항목" 그룹, 우선순위 옆)
- 스킴 카드 목록(기존 이슈 타입 스킴 화면 패턴). 카드마다 표: 필드 이름 · 표시(Switch) · 필수(Switch, 표시 꺼지면 disabled+off). 저장 버튼(dirty 시 활성). 배정 프로젝트 수 표시.
- `resolution` 행의 필수 Switch는 disabled + 툴팁/도움말 "완료 상태에서만 입력".

### 3.3 프로젝트 설정 — 새 구획 `fields` "필드" (`PROJECT_SETTINGS_SECTIONS`, 이슈 타입 옆)
- 기존 이슈 타입 탭과 같은 패턴: 상단에 "스킴 사용 중: {스킴명}" / "이 프로젝트만 커스텀" 전환(커스텀 전환 = 현재 스킴 body 복사, 스킴 복귀 = custom 폐기 — **기존 커스텀 전환 로직을 재사용**, 필드만 따로 커스텀하는 게 아니라 body 전체가 커스텀됨을 도움말로 명시). 표는 3.2와 같은 컴포넌트(`FieldConfigEditor`) 재사용.

### 3.4 소비
- `CreateIssueModal`: `resolveSettings(projectId).fields`로 필드별 표시/필수. 숨김 필드는 렌더하지 않고 값도 보내지 않는다. 필수는 라벨 `*` + 제출 검증(요약처럼). 프로젝트 바꾸면 재해석.
- `IssueDetailModal` 속성 패널·첨부·링크·하위 이슈 섹션: `visible:false`면 숨김(`parent`는 상위 경로 브레드크럼도 숨김). required는 상세에서 강제하지 않는다.
- `BulkEditModal`: 숨김 필드는 선택지에서 제외.
- 보드 카드·목록 열은 영향 없음(데이터는 그대로 있으므로).

### 3.5 테스트
- 스토어: 기본 채움, 검증 3종, createIssue required 거부.
- 화면: 전역 필드 구성에서 `dueDate` 숨김 저장 → 만들기 모달에 마감일 없음; `assignee` 필수 → 담당자 없이 만들기 비활성/오류; 프로젝트 커스텀으로 다시 켜면 그 프로젝트에만 보임.
- REST 계약: body에 fields 왕복.

## 4. 문서
- `docs/areas/settings-workflow.md`에 "필드 구성" 절 추가, `docs/areas/screens.md` 라우트 표 갱신(`/settings/fields`, `/projects/:id/settings/fields`).
