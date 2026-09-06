# 2026-09-06 AQL — JQL처럼 조건을 조합하는 이슈 질의어

사용자 요청: "jql처럼 조합해서 검색할 수 있는 시스템". 지라 JQL의 구조(필드 연산자 값, AND/OR/NOT, 괄호, IN, ~, 상대 날짜, ORDER BY)를 그대로 따르되
**한국어 필드 별칭**을 허용한다(ALM 특색). 이름은 **AQL**(ALM Query Language). 실행은 DB(alm-backend JPA)로 — OpenSearch 불필요.
GraphQL 전송은 쓰지 않는다(플랫폼 GraphQL은 search-service/위키 전용, ALM 통합 검색은 보류 결정). REST `POST /api/alm/issues/query`에 문자열을 보낸다.

기존 한국어 스마트 구문(`상태:진행중 담당:김찬호 로그인`, `store/searchQuery.ts`)은 **유지**하고 AQL로 번역 가능하게 한다(기본 모드 ↔ AQL 모드 전환은 지라 Basic↔JQL과 같다).

## 1. 문법 (서버·프론트 파서가 동일해야 한다 — §6 테스트 벡터로 고정)

```
query      := clause? ("ORDER BY" order ("," order)*)?
clause     := term (("AND"|"OR") term)*          -- AND가 OR보다 우선(JQL과 같음)
term       := "NOT" term | "(" clause ")" | cond
cond       := field op value
            | field ("IN"|"NOT IN") "(" value ("," value)* ")"
            | field ("IS"|"IS NOT") "EMPTY"
op         := "=" | "!=" | "~" | "!~" | "<" | "<=" | ">" | ">="
value      := string | number | ident | function
string     := '"' ... '"' | "'" ... "'"           -- 공백·특수문자는 따옴표
ident      := [A-Za-z0-9_가-힣.-]+                  -- 따옴표 없는 단순 값(예: done, ALM, 김찬호)
function   := currentUser() | now() | startOfDay(±n) | startOfWeek(±n) | startOfMonth(±n) | endOfDay(±n)…
order      := field ("ASC"|"DESC")?
```
- 키워드(AND/OR/NOT/IN/IS/EMPTY/ORDER BY/ASC/DESC)는 대소문자 무시. 필드명·별칭도 대소문자 무시.
- 날짜 값: `2026-09-06`, `"2026-09-06 14:00"`, 상대 `-7d`, `-2w`, `+1M`(d/w/M/y), 함수. 비교(`<` `>=`)는 날짜·숫자 필드에만.
- `~`는 텍스트 포함(대소문자 무시). `text ~ "결제"`는 요약+설명. `=`는 정확 일치(텍스트 필드에 `=`는 요약 정확 일치).
- 빈 절(`""`)은 전체 + 기본 정렬(`updated DESC`).

## 2. 필드 (영문 정식명 · 한국어 별칭 · 타입 · 값)

| 필드 | 별칭 | 타입 | 값 |
|---|---|---|---|
| `project` | 프로젝트 | enum | 키(`ALM`) 또는 이름 |
| `key` | 키 | text | `ALM-12` |
| `type` | 타입, 유형 | enum | 레지스트리 id 또는 이름(작업/스토리/버그/에픽/하위 작업) |
| `status` | 상태 | enum | 상태 id 또는 이름 |
| `statusCategory` | 상태분류 | enum | `new`/`active`/`complete` 또는 할 일/진행 중/완료 |
| `priority` | 우선순위 | enum(순서 있음) | id 또는 이름 — `<`,`>` 는 order 비교(`priority >= high`) |
| `assignee` | 담당자, 담당 | user | 이름, 이메일, 숫자 id, `currentUser()`, `EMPTY` |
| `reporter` | 보고자 | user | 위와 같음 |
| `labels` | 라벨 | multi | `labels IN ("a","b")`, `labels = a`(포함), `IS EMPTY` |
| `component` | 컴포넌트 | multi | 이름 또는 id |
| `sprint` | 스프린트 | enum | 이름 또는 id, `EMPTY`(백로그), `openSprints()`(활성) |
| `fixVersion` | 수정버전, 버전 | enum | 이름 또는 id, `EMPTY` |
| `resolution` | 해결 | enum | id/이름, `EMPTY`(미해결) |
| `parent` | 상위, 상위항목 | key | `ALM-3`, `EMPTY` |
| `created` / `updated` / `due` / `resolved` | 생성일 / 수정일 / 마감일 / 해결일 | date | 절대·상대·함수 |
| `estimate` | 예상시간 | number | 시간(h) |
| `text` | 텍스트, 내용 | text | `~`만: 요약+설명 |
| `summary` | 요약, 제목 | text | `~` 포함, `=` 정확 |
| `archived` | 보관 | bool | 기본 false(보관 제외). `archived = true`로 보관함 검색 |

정렬 가능: created, updated, due, priority, key, status, summary, assignee, estimate. 기본 `updated DESC`.

## 3. 오류 계약
파서/해석 오류는 400 `{"error": "…", "position": <0-based 오프셋>, "expected": ["…"]}` — 문구 한국어(예: `필드를 모릅니다: statuss`, `'>'는 날짜·숫자 필드에만 쓸 수 있습니다 (status)`, `값이 필요합니다`). 프론트는 `position`으로 에디터에 밑줄.

## 4. 서버 (alm-backend)
- `search/aql/` 패키지: `AqlLexer`·`AqlParser`(AST)·`AqlResolver`(이름→id: 상태·타입·우선순위 레지스트리, 프로젝트 키, 사용자 이름은 org `LookupMembers`/`GetMembers`, 컴포넌트·스프린트·버전은 프로젝트별 이름 — 프로젝트 조건이 없으면 전 프로젝트에서 이름 매치)·`AqlSpecification`(JPA Specification → `Issue`, 라벨·컴포넌트는 서브쿼리/조인, 접근 가능 프로젝트 범위(`accessibleProjects`)를 항상 AND).
- `POST /api/alm/issues/query` `{ aql, page, size }` → 기존 검색 응답 shape(`IssuePage`) + `{ total, echoedAql }`. `POST /api/alm/issues/query/validate` `{ aql }` → `{ ok, error?, position?, fields?: [...] }`(에디터 실시간 검증). `GET /api/alm/issues/query/fields` → 필드·별칭·연산자·값 후보(자동완성용: 상태·타입·우선순위·프로젝트 목록, 사용자는 `/api/org/members`로).
- 저장 필터(`saved_filter` 있으면 `aql` 컬럼 추가, 없으면 프론트 uiStore 그대로).
- 테스트: §6 벡터 전부(파싱·오류 위치), 해석(이름→id, 프로젝트 없이 이름 충돌 시 IN 확장), Specification 통합(H2에서 AND/OR/NOT/IN/~/날짜/EMPTY/ORDER BY), 접근 범위, 보관 제외 기본.

## 5. 프론트 (alm-front)
- `store/aql/`: `lexer.ts`·`parser.ts`(같은 AST)·`evaluate.ts`(목업용 — 메모리 이슈 배열에 AST 적용, 서버와 같은 의미)·`toAql.ts`(`IssueQuery` → AQL 문자열, 기본 모드 필터를 AQL로 번역)·`fromSmart.ts`(기존 스마트 구문 → AQL). 파사드 `queryIssuesAql(aql, {page,size})`·`validateAql(aql)`·`aqlFields()`(목업·REST).
- 검색 페이지: 모드 3개 — **기본**(기존 칩) / **스마트**(기존 한국어) / **AQL**(신규). AQL 에디터: 한 줄 입력 + 자동완성 팝업(필드 → 연산자 → 값 순으로 문맥 제안, 상태·타입·우선순위·프로젝트·사용자·라벨 후보, 함수), 실시간 검증(밑줄+메시지, 300ms 디바운스), Enter 실행, 예시 힌트("예: project = ALM AND status != 완료 AND assignee = currentUser() ORDER BY due ASC"). 기본→AQL 전환 시 현재 필터를 AQL로 채워 넣고, AQL→기본은 단순 조건(AND로만 연결된 `=`/IN)만 역변환, 아니면 "AQL 그대로 유지" 안내. URL은 `?aql=`(스마트는 기존 `?q=` 유지). 저장 필터는 AQL 문자열 저장(기존 q 필터는 그대로 동작).
- 상단바 전역 검색 모달: 입력이 AQL 문법(필드 연산자)으로 보이면 "AQL로 검색" 항목을 띄워 `/search?aql=`로 보낸다.
- 결과 표는 기존 검색 표 재사용. 테스트: 파서 벡터(§6), evaluate(목업 이슈 20개로 AND/OR/NOT/IN/~/날짜/EMPTY/ORDER), 화면(자동완성·오류 밑줄·실행·저장 필터·URL).

## 6. 테스트 벡터 (양쪽 공통 — 같은 입력에 같은 AST/결과)
1. `status = "진행 중" AND assignee = currentUser()`
2. `project = ALM AND (priority >= high OR due <= +3d) ORDER BY due ASC, priority DESC`
3. `labels IN (backend, "api v2") AND NOT type = 버그`
4. `sprint IS EMPTY AND statusCategory != complete`
5. `text ~ 결제 AND created >= startOfMonth() AND assignee IS NOT EMPTY`
6. `상태 = 완료 AND 담당자 = 김찬호` (별칭)
7. `resolution IS EMPTY AND updated < -14d ORDER BY updated`
8. 오류: `status == done`(position 7, `연산자를 모릅니다`), `priority ~ high`(`~`는 텍스트만), `due > yesterday`(값 형식), `status = `(값 필요), `(status = done`(괄호 안 닫힘).

## 7. 문서
`docs/areas/search.md`에 AQL 절(문법 표·별칭·예시·한계), 서버 README 검색 절, `docs/STATUS.md` 특색 표에 "AQL" 추가.
