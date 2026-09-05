# 디자인 시스템 (@chanho/react 0.7.0 / @chanho/tokens 0.3.0)

GitHub Packages(`@chanho4702/*`)에서 받고 pnpm alias로 `@chanho/*` 이름을 유지한다(S-03, 2026-09-04 — 전엔 `file:../design-system/artifacts/*.tgz`). 새 버전은 design-system에 `v*` 태그를 밀어 발행한 뒤 `package.json`과 `pnpm-workspace.yaml`의 `overrides` **두 곳**의 버전을 함께 올린다. Radix 기반. **다른 UI 라이브러리 금지**,
커스텀 마크업은 토큰(`--chanho-*`)만.

## 함정 목록 (전부 실제로 밟았던 것)

1. **Checkbox / Switch는 `onCheckedChange`** — `onChange`는 조용히 무시된다(에러 없음).
   현재 코드베이스는 0건(2026-07-19 전수 확인)이지만 새 코드에서 재발하기 쉬움.
2. **Select는 빈 문자열 value 금지**(Radix 제약) — "전체"/"미지정"/"선택" 등은 센티널
   문자열(`all`/`unassigned`/`none`/`pick`)로. `onValueChange` 사용(onChange 아님).
3. **DatePicker 없음** — `TextField type="date"` 사용.
4. **TextField/Select의 `className`은 필드 래퍼 div에 붙는다**(0.9.0 실측 — 예전 메모의 "input에
   붙는다"는 틀렸다). 그래서 `.visually-hidden-label`을 컨트롤에 바로 걸 수 있다. `label`은 필수
   prop이고 **문자열만** 받는다(시각 숨김 옵션·노드 라벨 없음). ref는 input으로 전달됨.
5. **Dropdown은 항목 선택 시 닫히는 단일선택 메뉴** — 멀티선택 필터가 필요하면
   `components/FilterDropdown.tsx`(커스텀, 체크박스+바깥클릭/Esc 닫기)를 재사용.
6. **Tag 제거 버튼의 접근성 이름은 `"{label} 태그 제거"`** — 테스트 셀렉터에서 사용.
7. **TopBar onSearch는 입력마다 발화** — 디바운스/모달 오픈 로직은 소비 측 책임.
8. **Modal 열림 중 배경은 aria-hidden** — 테스트에서 배경 요소를 질의하려면 먼저 모달을 닫아라.
9. Card에 flex/grid를 덮어쓰면 내부 레이아웃과 충돌해 겹침이 난다 — 카드형 커스텀 UI는
   자체 타일 마크업(`.project-card`, `.home-resume-card` 패턴) 권장.

## 토큰 사용 규칙

- 존재하는 토큰만 쓸 것. **`var(--chanho-color-border)`는 존재하지 않는다**(bare) —
  `--chanho-color-border-default` 등 변형만 있다. 잘못 쓰면 그 선언 전체가 조용히 무효화된다.
- 색은 semantic 토큰(text-subtle, background-neutral-hovered, border-brand…), 흰색은
  `--chanho-color-text-inverse`(`#fff` 하드코딩 금지), 간격은 `--chanho-space-*`,
  폰트 크기는 `--chanho-font-size-*`(50/75/100/200/300/400/500/600).
- 토큰 실존 확인: `node_modules/@chanho/tokens/dist/*.css`를 grep.

## 상태 표기 규칙

상태 Lozenge/이름/정렬은 반드시 `components/labels.ts`의
`statusCategory/statusName/statusAppearance/CATEGORY_ORDER`를 경유한다(기본 3상태 폴백 내장).
`STATUS_LABELS`/`STATUS_APPEARANCE` 직접 인덱싱은 카테고리 값에만 허용(예: 대시보드 타일 라벨).

## 필드 라벨에 아이콘 (2026-09-06)

DS `Select`/`TextField`의 `label`이 문자열이라 아이콘을 넣을 수 없다. 그래서 이슈 모달 3종
(상세 속성 패널·만들기·대량 변경)은 **컨트롤에 `.visually-hidden-label`을 걸어 접근 이름만 남기고**,
보이는 라벨은 `components/FieldLabel.tsx`가 아이콘 + 텍스트로 그린다.

- 아이콘 원천은 `components/fieldConfig.ts`의 `FIELD_ICONS`(lucide) — 13종 구성 필드에 더해
  `type`/`status`/`project`/`summary`까지 키를 가진다. 새 필드를 만들면 여기에도 한 줄 추가한다.
- 라벨 + 컨트롤 세로 스택은 `.alm-field`(DS 필드와 같은 `space-50` 간격).
- **접근 이름은 DS `label` 문자열이 원천이다.** `getByRole("combobox", { name: "담당자" })`,
  `getByLabelText("예상 시간 (h) *")` 같은 셀렉터가 그대로 살아 있는 이유가 이것이다.
  `FieldLabel`은 기본이 `aria-hidden`이라 같은 말이 두 번 읽히지 않는다 — `legend`처럼 그 라벨
  자체가 이름을 만드는 자리에서만 `ariaHidden={false}`.
- 필수 `*`는 **텍스트 노드 안에** 넣는다(`withRequiredMark`). 아이콘과 글자를 갈라 놓으면
  `getByText("연결 이슈 *")`가 무너진다.

## 2026-09-04 추가 함정

- **모달 안 Select/Dropdown은 DS 0.8.0 이상에서만 마우스로 고를 수 있다.** 0.7.0까지는 팝업 z(400)가 모달 블랭킷(500)보다
  낮아 옵션 클릭이 오버레이에 막혔다(jsdom 테스트는 포인터 가림을 모르므로 통과했다 — 실제 브라우저로 확인할 것).
  0.8.0은 `--chanho-z-popover`(550)를 쓴다.

## 2026-08-30 추가 함정

- **Card는 border-box가 아니다.** `width:100%`에 padding이 더해져 그리드 셀을 넘친다. alm-front는
  `app.css` 전역 `*{box-sizing:border-box}`로 흡수 중 — DS에서 고치면 이 리셋은 남겨도 무해하다.
- **SVG 속성에는 토큰을 쓸 수 없다.** Recharts처럼 `stroke="..."` 속성으로 색을 받는 라이브러리에는
  `useTokenColors`(components/useTokenColors.ts)로 계산된 값을 넘긴다. CSS 클래스로 칠할 수 있는
  것(SVAR Gantt의 `--wx-*` 테마 변수)은 CSS에서 `var()`를 그대로 쓴다.
- **RadioGroup 기본은 세로.** 가로로 두려면 같은 클래스를 두 번 써 우선순위를 올린다
  (`.reports-units.reports-units`).
- **아이콘은 lucide-react.** 글자 기호(⋯ ☾ ⚙ 🔔)를 버튼 본문에 넣지 않는다 — 크기·정렬·다크모드가
  제각각이 된다.

## 0.9.0에서 메운 갭 (2026-09-05)

`@chanho/react` 0.9.0이 노드 라벨과 숨은 라벨을 받으면서 ALM의 임시방편 두 개가 없어졌다.

- **표 머리글의 "모두 선택"**: `TableColumn.header`가 `ReactNode`라 이슈 목록 select 열 머리글에
  `<Checkbox label="모두 선택" labelHidden>`을 넣는다. 헤더가 노드면 정렬 버튼·너비 조절 핸들이
  쓸 이름이 없어지므로 **`column.ariaLabel`을 함께 준다**(여기서는 `"선택"`). 툴바에 있던 날
  `<input type="checkbox">`와 `.issue-toolbar-check` CSS는 지웠다. 중간 상태는 DOM `indeterminate`
  속성이 아니라 `checked="indeterminate"`로 준다 — 다만 **DS Checkbox에는 중간 상태 그림이 없어**
  일부 선택이 미선택과 같아 보인다(`aria-checked="mixed"`는 맞다). 날 input이 그리던 대시가
  사라진 것이라 `@chanho/react`에 표시를 추가하는 것이 남은 갭이다.
  **행 체크박스는 날 `<input>` 그대로 둔다.** `labelHidden`은 시각만 숨기고 라벨 텍스트를 DOM에
  남기므로, 행마다 "ALM-2 선택"이 생겨 이슈 행을 `/ALM-\d+/`로 찾는 질의가 두 개를 문다(마감일
  정렬 테스트에서 실증). 텍스트를 남기지 않는 체크박스가 DS에 생기면 그때 옮긴다. 그래서 CSS는
  `.issue-select > input`으로 **행만** 겨냥한다 — 머리글의 DS Checkbox에 닿으면 안 된다.
- **탭 라벨의 배지**: `TabItem.label`도 `ReactNode`다. 필드 구성 편집기는 덮어쓴 이슈 타입을
  `<>버그 <Badge appearance="brand">덮어씀</Badge></>`로 그리고 **`ariaLabel: "버그 (덮어씀)"`**로
  읽히는 이름을 고정한다 — 노드 라벨은 스크린리더가 안쪽 텍스트를 이어붙여 이름이 흔들린다.
  기존 테스트 셀렉터(`"버그 (덮어씀)"`)가 그대로 사는 이유가 이 `ariaLabel`이다.
