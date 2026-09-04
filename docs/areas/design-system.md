# 디자인 시스템 (@chanho/react 0.7.0 / @chanho/tokens 0.3.0)

GitHub Packages(`@chanho4702/*`)에서 받고 pnpm alias로 `@chanho/*` 이름을 유지한다(S-03, 2026-09-04 — 전엔 `file:../design-system/artifacts/*.tgz`). 새 버전은 design-system에 `v*` 태그를 밀어 발행한 뒤 `package.json`과 `pnpm-workspace.yaml`의 `overrides` **두 곳**의 버전을 함께 올린다. Radix 기반. **다른 UI 라이브러리 금지**,
커스텀 마크업은 토큰(`--chanho-*`)만.

## 함정 목록 (전부 실제로 밟았던 것)

1. **Checkbox / Switch는 `onCheckedChange`** — `onChange`는 조용히 무시된다(에러 없음).
   현재 코드베이스는 0건(2026-07-19 전수 확인)이지만 새 코드에서 재발하기 쉬움.
2. **Select는 빈 문자열 value 금지**(Radix 제약) — "전체"/"미지정"/"선택" 등은 센티널
   문자열(`all`/`unassigned`/`none`/`pick`)로. `onValueChange` 사용(onChange 아님).
3. **DatePicker 없음** — `TextField type="date"` 사용.
4. **TextField의 `className`은 wrapper가 아니라 input에 붙는다** — 레이아웃 제어가 필요하면
   div로 감싸라. `label`은 필수 prop(시각 숨김 옵션 없음). ref는 input으로 전달됨.
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
