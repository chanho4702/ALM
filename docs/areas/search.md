# 검색 (스마트 쿼리 + 검색 화면)

**파일**: `store/searchQuery.ts`(파서/직렬화, 진실 모델), `store/aql/`(AQL 렉서·파서·실행기·번역·자동완성),
`pages/SearchPage.tsx`, `components/AqlEditor.tsx`, `components/SearchModal.tsx`(전역 검색 모달),
`components/FilterDropdown.tsx`, `store/jiraStore.ts`의
`queryIssues`/`searchIssues`/`listAllStatuses`/`queryIssuesAql`/`validateAql`/`aqlFields`.

## 모델 — 진실은 URL의 `q` 문자열 하나

`/search?q=상태:진행중+담당:김찬호+로그인` 처럼 **한국어 스마트 문자열이 검색 상태의 전부**다
(ALM 특색: 링크가 곧 필터, 저장 필터도 이 문자열을 저장).

- `parseSmartQuery(q, ctx) → IssueQuery` / `serializeQuery(query, ctx) → q` 왕복이 계약.
  파서가 못 알아듣는 토큰은 버리지 않고 텍스트 검색어로 보존한다.
- `IssueQuery.statuses`는 **카테고리** 매치, `statusIds`는 커스텀 상태 id 직접 매치.
  `상태:X` 파싱 순서: 카테고리 라벨(할일/진행중/완료) 우선 → ctx.statuses 이름 매치
  (공백 제거 형태 허용: "코드 리뷰" ↔ `상태:코드리뷰`) → 둘 다 아니면 텍스트.
- ctx에 `statuses: await listAllStatuses()`를 넣어야 커스텀 상태 이름이 동작한다.

## 화면 — 지라 이슈 검색 모방 3모드

- **기본 모드(기본값)** = 지라 Basic: 검색어 인풋 + 프로젝트/상태/담당자/타입/우선순위
  `FilterDropdown`(체크박스 멀티선택, 트리거에 "담당자: 김찬호 외 1" 요약) + 정렬 + 필터 초기화.
  드롭다운 토글은 IssueQuery를 고쳐 `serializeQuery`로 q를 되쓴다.
- **스마트 모드** = 한국어 토큰 직접 편집: q 문자열 + 조건 칩(Tag, ×로 토큰 제거).
- **AQL 모드** = 지라 JQL 자리: `?aql=` 문자열 하나가 진실(스마트 `q`는 지워진다).
  모드 버튼 3개의 **접근 이름은 "…로 전환"** 그대로고 보이는 글자만 짧다(기존 셀렉터 유지).
- 검색어 인풋은 로컬 초안(textDraft)을 쓰고 **포커스 중이 아닐 때만** q에서 동기화한다
  (타이핑 클로버 방지). 이 패턴을 깨면 입력이 지워지는 버그가 재발한다.

## 스마트 구문의 알려진 한계 (2026-07-19 리뷰)

- **공백 포함 값**: 토큰이 `\s+` 분할이라 `라벨:my label`, `담당:홍 길동`은 깨진다.
  상태만 공백 제거 매치가 구현됨. 라벨/담당에도 같은 규칙을 넣거나 따옴표 문법이 필요.
- **센티널 충돌**: "완료"처럼 카테고리 라벨과 같은 이름의 커스텀 상태는 이름 검색이 불가하고
  카테고리로 해석된다. 직렬화 왕복도 깨진다.
- **공백 제거 이름 충돌**: "코드 리뷰"와 "코드리뷰"가 공존하면 `상태:코드리뷰`가 둘 다 매치.
- 전역 검색 모달(`searchIssues`)은 키/제목/설명 텍스트 검색만 — 토큰 문법은 /search 전용.

## AQL (ALM Query Language)

지라 JQL의 구조를 그대로 따르되 **한국어 필드 별칭**을 받는다. 설계는
`docs/superpowers/specs/2026-09-06-aql-query-language.md`.

**AST는 서버(alm-backend `search/aql/`)와 글자까지 같은 JSON이 계약이다.** 정본은 alm-backend의
`AqlParserTest`와 README AQL 절이고, `store/aql/parser.test.ts`가 그 문자열을 그대로 들고 대조한다.
두 구현이 갈라지면 이 테스트가 먼저 깨진다.

### 파일

| 파일 | 하는 일 |
|---|---|
| `store/aql/lexer.ts` | 토크나이저. 낱말 전체가 수일 때만 `number` — `-7d`·`2026-09-06`은 `ident`다 |
| `store/aql/parser.ts` | 재귀 하강 파서. **문법만** 본다. 위치는 AST가 아니라 곁 `WeakMap`에 둔다 |
| `store/aql/validate.ts` | 필드·연산자·정렬 검증(해석 단계). 값이 실재하는지는 보지 않는다 |
| `store/aql/evaluate.ts` | 목업 실행기. 서버 `AqlResolver`+`AqlSpecification`과 같은 의미 |
| `store/aql/toAql.ts` · `fromSmart.ts` | 기본/스마트 모드 ↔ AQL 번역 |
| `store/aql/complete.ts` · `fields.ts` | 자동완성 엔진과 사전 계약 |
| `components/AqlEditor.tsx` | 한 줄 에디터 — 자동완성 팝업·실시간 검증 밑줄 |

### AST

```jsonc
{ "where": { "kind": "and", "children": [ … ] } | null,
  "orderBy": [ { "field": "due", "direction": "asc" } ] }
```

- 노드는 `and`/`or`(`children`) · `not`(`child`) · `compare`(`field`,`operator`,`value`) ·
  `in`(`field`,`negated`,`values`) · `empty`(`field`,`negated`).
- 값은 `{"type":"string"|"ident"|"number","value":…}` 또는 `{"type":"function","name":…,"args":[…]}`.
  **`value`는 언제나 문자열**이다(`estimate > 3.5` → `{"type":"number","value":"3.5"}`).
- **필드는 쓴 그대로** 담는다 — 별칭(`상태`)·대소문자 정규화는 해석 단계가 한다.
- **같은 종류의 이항 연산자는 평탄화**한다. 자식이 하나면 감싸지 않는다.
- 함수는 낱말에 괄호가 **붙어** 있을 때만이다 — `status = done (x)`는 함수가 아니라 오류다.
- 키 순서까지 계약이라 테스트는 `toEqual`이 아니라 `JSON.stringify`로 대조한다.

### 문법

```
query   := clause? ("ORDER BY" order ("," order)*)?
clause  := term (("AND"|"OR") term)*        -- AND가 OR보다 강하다
term    := "NOT" term | "(" clause ")" | cond
cond    := field op value
         | field ("IN"|"NOT IN") "(" value ("," value)* ")"
         | field ("IS"|"IS NOT") "EMPTY"
op      := "=" | "!=" | "~" | "!~" | "<" | "<=" | ">" | ">="
```

키워드·필드명·별칭은 대소문자를 가리지 않는다. 방향을 안 쓰면 `ASC`. 빈 질의는 전체 + `updated DESC`.

날짜 값: `2026-09-06`, `"2026-09-06 14:00"`, 상대 `-7d`/`-2w`/`+1M`/`+1y`,
함수 `now()` `startOfDay(±n)` `endOfDay(±n)` `startOfWeek(±n)` `endOfWeek(±n)`
`startOfMonth(±n)` `endOfMonth(±n)` `startOfYear(±n)` `endOfYear(±n)`.
`endOf*`는 **다음 구간의 시작**(열린 위끝)이고 주의 시작은 월요일이다.
날짜 경계는 목업도 **Asia/Seoul 고정**이다(서버 `AqlResolver.ZONE`과 같다). 브라우저·CI 러너 시간대를
쓰면 KST 자정 근처에서 하루가 밀려 CI(대개 UTC)에서만 빨강/초록이 흔들린다 — `evaluate.ts`의
`KST_OFFSET_MS`가 그 고정값이고, 고정 시각 테스트가 경계를 지킨다. 상대 날짜(`-7d`)는 경계가 아니라
지금 기준 정확한 순간이다.

### 필드와 별칭

| 필드 | 별칭 | 종류 | 비고 |
|---|---|---|---|
| `project` | 프로젝트 | ENUM | 키(`ALM`) 또는 이름 |
| `key` | 키 | TEXT | `~`로 부분 일치, 정렬은 프로젝트+번호 순 |
| `type` | 타입, 유형 | ENUM | 레지스트리 id 또는 이름 |
| `status` | 상태 | ENUM | 상태 id 또는 이름 |
| `statusCategory` | 상태분류 | ENUM | `new`/`active`/`complete` 또는 카테고리 이름 |
| `priority` | 우선순위 | ORDERED_ENUM | `priority >= high`는 "high 이상으로 중요" |
| `assignee` | 담당자, 담당 | USER | 이름·이메일·local-part·숫자 id·`currentUser()`·`EMPTY` |
| `reporter` | 보고자 | USER | 위와 같음. **`EMPTY`는 없다** — 보고자는 항상 있다 |
| `labels` | 라벨 | MULTI | **대소문자를 가려** 정확히 맞춘다 — `labels = Backend`는 `backend`를 못 찾는다(지라와 같다) |
| `component` | 컴포넌트 | MULTI | 이름 또는 id |
| `sprint` | 스프린트 | ENUM | 이름·id·`openSprints()`·`EMPTY`(백로그) |
| `fixVersion` | 수정버전, 버전 | ENUM | 이름 또는 id |
| `resolution` | 해결 | ENUM | `DONE`/`WONT_DO`/`DUPLICATE`/`CANNOT_REPRODUCE` 또는 완료·하지않음·중복·재현불가 |
| `parent` | 상위, 상위항목 | ENUM | `ALM-3` 또는 id |
| `created`·`updated`·`due` | 생성일·수정일·마감일 | DATE | `due`만 `IS EMPTY` 가능 |
| `resolved` | 해결일 | — | **아직 없다.** 쓰면 `아직 지원하지 않는 필드입니다: resolved` |
| `estimate` | 예상시간 | NUMBER | 시간(h) |
| `text` | 텍스트, 내용 | TEXT | **`~`·`!~`만** — 제목+설명. `%`·`_`는 글자 그대로다(와일드카드 아님) |
| `summary` | 요약, 제목 | TEXT | `~` 포함, `=` 정확(대소문자 무시) |
| `archived` | 보관 | BOOL | 기본 false. `archived = true`가 보관함 검색 |

정렬 가능: `created` `updated` `due` `priority` `key` `status` `summary` `assignee` `estimate`.

### 항상 걸리는 세 가지 (서버와 같은 의미)

1. **보관 제외 기본** — `archived`를 한 번도 안 쓴 질의는 보관 이슈를 뺀다.
2. **부정 연산자는 빈 값을 제외한다.** `assignee != 2`에 담당자 미지정 이슈는 **안 들어간다**(JQL 그대로).
   넣으려면 `OR assignee IS EMPTY`를 명시한다. `!=`·`NOT IN`·`!~`가 그렇다.
   **집합 여집합인 `NOT (…)`은 다르다** — 잎 술어가 2값이라 빈 값을 가진 이슈가 들어온다.
3. **정렬 마무리** — 요청 정렬 뒤에 언제나 `id ASC`를 붙여 페이지가 흔들리지 않게 한다.
   우선순위 정렬 키는 레지스트리 순서(1 = 최상)라 **`ORDER BY priority ASC`가 중요한 것부터**다.

`IS EMPTY`는 비어 있을 수 있는 필드에만 쓴다 — `status IS EMPTY`는 400이다.

### 상한

서버가 막는 값이다. 에디터는 길이만 미리 막고(입력 `maxLength=4000`) 나머지는 서버 문구를 그대로 보여 준다.

| 상한 | 값 | 문구 |
|---|---|---|
| AQL 문자열 | 4000자 | `AQL은 4000자 이하여야 합니다` |
| 중첩 깊이(괄호·NOT) | 50단계 | `너무 깊게 중첩됐습니다 (최대 50단계)` — 프론트 파서도 같은 자리에서 막는다 |
| 절 개수 | 200개 | `조건이 너무 많습니다 (최대 200개)` |

길이(4000자)와 깊이(50단계)는 **프론트에서도 먼저 막는다** — 길이는 스토어 입구
(`queryIssuesAql`/`validateAql`)에서 서버와 같은 문구로, 깊이는 파서에서 스택이 터지기 전에.
길이 초과는 요청 검증이라 **`position`이 없다** — 없으면 밑줄 없이 메시지만 보여 준다(0으로 채우면
엉뚱한 첫 글자에 줄이 그어진다).

### 오류 계약

`AqlError(message, position, expected)`, 서버는 400 `{"error", "position", "expected"}`.
`position`은 0부터 세는 오프셋이고 **틀린 것을 가리킨다** — 모르는 필드는 필드 자리(`statuss = done` → 0),
못 쓰는 연산자는 연산자 자리(`priority ~ high` → 9), 값 형식 오류는 값 자리(`due > yesterday` → 6).
화면은 그 자리의 토큰에 물결 밑줄(`.aql-underline`)을 긋고 문구를 아래에 쓴다.

검증 단계는 **값을 해석하지 않는다** — `status = 없는상태`는 실시간 검증을 통과하고 실행에서
`상태를 모릅니다: 없는상태`로 400이 난다.

그래서 **에디터는 검증 통과를 "성공"으로 표시하지 않는다** — 체크 아이콘도, "올바른 질의" 문구도 없다.
통과하면 예시 힌트가 그대로 있을 뿐이고, 실행이 낸 400도 실시간 오류와 **같은 밑줄·같은 문구 자리**로 온다.
서버 `POST /query/validate`는 문법 오류에도 **200 + `{ok:false, …}`**를 낸다(400은 `/query`와 요청 검증뿐).

### 모드 전환

- **기본/스마트 → AQL**: 지금 필터를 `toAql`로 옮겨 채운다(항상 성립한다).
- **AQL → 기본/스마트**: `fromAql`이 **AND로만 이은 `=`/`IN`/`assignee IS EMPTY`** 만 되돌린다.
  OR·NOT·비교·`currentUser()`가 섞이면 되돌리지 않고 "AQL 그대로 유지" 토스트를 띄운다.
- 저장 필터는 `SavedFilter.kind`("smart" | "aql")로 어느 파라미터로 열지 정한다.
  kind가 없는 옛 저장분은 스마트(`?q=`)다.
- 전역 검색 모달은 입력이 "필드 연산자"로 보이면(`looksLikeAql`) "AQL로 검색"을 띄운다.

### 자동완성 사전의 분담

`GET /api/alm/issues/query/fields`가 `{fields, functions, keywords}`를 준다.

- **값 후보는 서버가 진실**이다 — DB에 있는 상태·스프린트·버전 이름을 프론트가 알 수 없다.
- **문법(별칭·연산자·정렬/EMPTY 가능 여부)은 프론트 표가 진실**이다. 실제로 입력을 거절하는 것이
  프론트 파서라, 서버 표가 앞서 나가면 파서가 거절할 입력을 사용자에게 권하게 된다.
- **사용자 후보는 사전에 없다** — 프론트가 `/api/org/members`로 따로 받아 담당자·보고자에 채운다.

### 목업 한계 (서버와 다를 수 있는 지점)

- AQL 결과는 서버가 자른 **한 페이지(50건)**만 그리고 머리글이 `1–50 / 234개 이슈`처럼 범위를 쓴다.
  기본·스마트 모드는 서버 페이지가 없어 종전대로 `N개 이슈`다.
- 목업 사용자에는 이메일이 없어 이메일·local-part 매칭은 REST 모드에서만 걸린다.
- 서버는 표시 이름을 **이슈에 등장한 참가자 1000명** 안에서만 찾는다. 목업은 전체 사용자에서 찾는다.
- 서버는 못 보는 프로젝트를 처음부터 없는 것으로 보고 org를 못 읽으면 **503**이다. 목업에는 그 경계가 없다.
