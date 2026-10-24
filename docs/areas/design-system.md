# 디자인 시스템 (@chanho/react 0.14.0 / @chanho/tokens 0.6.1)

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

## 미정의 토큰 — 해소됨 (2026-09-12)

`--chanho-color-text` · `--chanho-color-text-muted` · `--chanho-color-text-subtlest` ·
`--chanho-shadow-raised` 넷은 **토큰에 없었다**. 2026-09-12에 `app.css`의 사용처를 전부 실존 토큰으로
바꿨다 — `text`→`text-default`, `text-muted`/`text-subtlest`→`text-subtle`,
`shadow-raised`→**`shadow-100`**(tokens 0.4.0의 그림자는 `100`/`200`/`300`/`overlay` 넷뿐이고,
`raised`가 뜻하던 `0 1px 2px`는 `overlay`(= `300`, 12px 28px)가 아니라 `100`이다).
없는 토큰을 쓰면 그 선언 하나가 조용히 무효화될 뿐 에러가 안 나므로, 새 코드에서 되살리지 말 것.

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

## 0.13.0·0.14.0 소비 규칙 (2026-10-24 웨이브 B)

- **로딩은 스켈레톤.** 페이지·목록 로딩은 `components/Skeletons.tsx`(DS `Skeleton`·`SkeletonText`·`SkeletonAvatar`·
  `SkeletonListItem` 조합)를 쓴다. 블록은 장식이고 **영역 하나(`LoadingRegion`)가 `role="status"` + `aria-label`**로 알린다 —
  DS `label` prop은 숨김 글자를 자식으로 넣을 뿐 status의 접근 이름이 되지 않아(`getByRole("status", { name })`가 못 찾는다)
  앱이 감싼다. 자리는 실제 레이아웃과 같은 크기로(보드는 `.board-columns`/`.board-column`을 그대로 쓴다). 버튼 안·"업데이트 중"
  같은 인라인 표시는 `Spinner` 그대로. 표 첫 로딩은 `Table loading`(헤더 유지) — 다만 결과 표와 **이름을 다르게**
  둔다("이슈 목록 (불러오는 중)"). 같은 이름이면 `findByRole("table", { name })`가 사라질 자리 표를 문다.
- **CommandPalette는 앱에 하나**(`CommandPaletteHost`, AppShell). 열기 키(⌘K/Ctrl+K)는 앱이 바인딩한다(`isCommandPaletteKey`).
  하위 페이지 `items`는 들어갈 때 **스냅숏**이라 검색어로 바뀌는 항목(새 라벨)은 그 필드로 바로 연 루트 목록(`fieldPageItems`)에서만 쓴다.
  입력이 `role="combobox"`라 화면 단축키는 자동으로 멈춘다.
- **ContextMenu 트리거는 영역 하나**로 감싸고(`useIssueInteractions().withContextMenu`), 대상은 `contextmenu` 캡처 단계에서
  `data-issue-key`로 찾는다. 이슈 밖이면 캡처에서 `stopPropagation` → 브라우저 기본 메뉴. 하위 메뉴 트리거에는
  `aria-keyshortcuts`가 없다(일반 항목만 있다 — 키 글자는 `kbd`로 보인다). jsdom에서 하위 메뉴 항목은 `fireEvent.click`으로
  누른다(레이아웃이 없어 Radix 포인터 유예 영역이 메뉴를 닫는다).
- **InlineEdit 저장·취소는 포털 팝오버**(0.13.0) — 모달 안 편집이어도 버튼은 `document.body` 아래다. 테스트는 `screen`으로 찾는다.
  Esc는 편집만 취소하고 모달은 닫지 않는다.
- **Select `searchable`**은 옵션이 8개를 넘을 수 있는 자리(사람·프로젝트·스프린트·버전·이슈 후보)에 켠다.
  필터 줄의 `Select`·`TextField`는 `size="compact"`(32px)로 버튼·필터 트리거와 높이를 맞춘다. 기본 입력은 40px다.
- **Checkbox `indeterminate`**(0.14.0) — 목록 머리글 "모두 선택"의 일부 선택이 대시로 보인다(위 0.9.0 절의 "중간 상태 그림 없음" 갭 해소).
- **Popover·MultiSelect**(0.14.0) — 앱 팝오버(`usePopoverPanel` + FilterDropdown/ColumnPicker)를 대신할 DS 부품. 교체는
  아래 "남은 일"을 본다.

## 2026-10-24 UI/UX 정비에서 정한 것

- **Select 최소 폭 180px.** DS `Select` 트리거는 `min-width:180px`·높이 36px이고 루트가 `inline-flex`라
  셀 폭을 채우지 않는다. 180px보다 좁은 grid 열에 두면 옆 칸 위로 겹친다(레지스트리 설정 화면들이 이걸로
  깨져 있었다). 칸은 **최소 180px**로 잡고(`flex: 1 1 180px` 또는 `repeat(auto-fill, minmax(180px, 1fr))`),
  칸을 채우려면 `button[role="combobox"]{width:100%}`를 준다(Radix 트리거는 `aria-haspopup`이 아니라
  `role="combobox"`). 줄일 수 없는 최소 폭 자체는 DS 결함으로 보고했다.
- **레지스트리 편집 행·추가 폼(`.status-editor-row`/`.status-editor-add`)은 flex 줄바꿈.** 패널마다 자식 수가
  달라 grid 열 정의를 나눠 쓰면 어긋난다. 입력·선택 칸은 `> div`, 글리프·사용 수는 `> span`, 액션은
  `.status-editor-row-actions`(줄이 바뀌면 오른쪽 끝).
- **반응형은 화면 폭이 아니라 컨테이너 폭으로.** 768px 화면도 사이드바(240px)를 빼면 본문은 약 500px다.
  `@media`로 나눈 곳이 그 폭에서 겹쳤다. AI 사무실 탭 줄·백로그 행은 `container-type: inline-size` +
  `@container`를 쓴다.
- **앱 팝오버는 `components/usePopoverPanel.ts` 하나로.** FilterDropdown·ColumnPicker가 공유한다.
  바깥 클릭·Esc(트리거로 포커스 복귀), 열면 첫 항목(검색 입력)에 포커스, ↑↓·Home·End, 트리거 폭(최소 200px)을
  최소 폭으로, 화면 오른쪽·아래 가장자리에서 뒤집기(`.is-align-end`/`.is-above`)를 맡는다. 옵션이 8개를
  넘으면 FilterDropdown이 검색 입력을 띄운다. 새 멀티선택 팝오버도 이 훅을 쓴다.
- **프로젝트 뷰 목록은 `components/projectViews.ts` 하나.** 가로 탭과 사이드바 하위 목록이 같은 목록을
  그린다(예전엔 사이드바에 리포트·보관함이 없었다). 그래서 탭 이름 버튼이 두 개 있을 수 있다 —
  테스트는 `within(getByRole("navigation", { name: "프로젝트 뷰" }))`로 좁힌다.
- **뷰 탭 넘침은 "더 보기" 메뉴로.** `ProjectTabs`가 ResizeObserver로 재고, 측정 줄은 `content: attr(data-label)`
  로만 글자를 그려 텍스트 노드를 남기지 않는다(jsdom에선 전부 보임).
- **시각 숨김 텍스트(`.visually-hidden`, absolute)를 스크롤 상자 안에 둘 때는 가까운 조상에
  `position:relative`.** 안 그러면 표 스크롤 상자를 빠져나가 페이지 가로 스크롤을 만든다(이슈 목록 라벨 "+N").
- 툴바 컨트롤 높이는 32px로 맞춘다(DS 버튼 medium·필터 트리거). `size="small"`은 24px다.

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

## 0.11.0에서 메운 갭 — 값 아이콘 (2026-09-06)

이슈 타입·상태·우선순위·해결 같은 **값**은 이제 어디서든 아이콘 + 텍스트로 그린다. 두 갭이 메워졌다.

- **`SelectOption.icon?: ReactNode`** — 목록 항목과 트리거의 선택값 양쪽에 같은 아이콘이 나온다.
  DS가 `aria-hidden`으로 감싸고 접근 이름은 `label` 문자열이 그대로 갖는다. 크기는 소비자 몫이라
  ALM은 전부 14px로 넘긴다. 이것 덕에 이슈 상세 상태 필드의 **손으로 세운 트리거 왼쪽 글리프가
  없어졌다**(`.issue-status-field`는 이제 쓰는 곳이 없다 — app.css에서 지울 수 있다).
- **`Checkbox`/`Switch`/`Radio`의 `label: ReactNode`** — `aria-labelledby`가 자동 배선되므로
  `<><Glyph variant="icon" /> 이름</>` 형태로 넣어도 접근 이름은 이름 텍스트만 남는다.
  타입·우선순위 활성 체크박스 목록(전역/프로젝트 설정)과 `FilterDropdown` 멀티선택이 이걸 쓴다.

**글리프에 `variant="icon"`을 반드시 준다.** `IssueTypeGlyph`/`StatusGlyph`/`PriorityGlyph`/
`ResolutionGlyph`는 기본(`auto`)이 `role="img"` + 이름을 가지므로, 이름 텍스트가 접근 이름을
만드는 자리(Select 옵션·체크박스 라벨·라디오 항목·탭)에 그대로 넣으면 `"상태: 할 일 할 일"`처럼
이름이 두 번 붙는다. 값 표기의 공통 껍데기는 `components/ValueWithIcon.tsx`(= `.status-cell`)다.

- **`IssueTypeGlyph`의 `auto` 접근 이름만 접두어가 없다**(`"버그"`). `StatusGlyph`는 `"상태: 진행 중"`,
  `PriorityGlyph`는 `"우선순위: 높음"`, `ResolutionGlyph`는 `"해결: 중복"`으로 값 종류를 붙인다.
  타입은 이름이 홀로 서도 뜻이 통하고 기존 셀렉터(`getByRole("img", { name: "버그" })`)가 이미
  그 계약에 걸려 있다 — 기존 계약이므로 유지한다.

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
