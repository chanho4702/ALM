/**
 * AQL(ALM Query Language) — 지라 JQL 구조 + 한국어 필드 별칭.
 *
 * **AST는 서버(alm-backend `search/aql/AqlAst`·`AqlJson`)와 글자까지 같은 JSON**이어야 한다.
 * `parser.test.ts`가 서버 `AqlParserTest`의 문자열을 그대로 들고 대조한다.
 *
 * 두 가지가 규칙이다.
 * 1. **필드는 쓴 그대로** AST에 담는다 — 별칭(`상태`→`status`)·소문자 정규화는 해석 단계가 한다.
 * 2. **같은 종류의 이항 연산자는 평탄화**한다 — `a AND b AND c`는 자식 셋인 `and` 하나, 자식 하나면 안 감싼다.
 */

export type AqlOp = "=" | "!=" | "~" | "!~" | "<" | "<=" | ">" | ">=";

export const AQL_OPS: AqlOp[] = ["=", "!=", "~", "!~", "<", "<=", ">", ">="];

/**
 * 값 하나. `value`는 **언제나 문자열**이다 — 서버 `AqlAst.Value.text()`가 원문을 문자열로 들고 있고
 * JSON도 그렇게 나간다(`estimate > 3.5` → `{"type":"number","value":"3.5"}`).
 * 상대 날짜(`-7d`)와 절대 날짜(`2026-09-06`)는 낱말 전체가 수가 아니라 `ident`다.
 */
export type AqlValue =
  | { type: "string"; value: string }
  | { type: "ident"; value: string }
  | { type: "number"; value: string }
  | { type: "function"; name: string; args: AqlValue[] };

export type AqlNode =
  | { kind: "and"; children: AqlNode[] }
  | { kind: "or"; children: AqlNode[] }
  | { kind: "not"; child: AqlNode }
  | { kind: "compare"; field: string; operator: AqlOp; value: AqlValue }
  | { kind: "in"; field: string; negated: boolean; values: AqlValue[] }
  | { kind: "empty"; field: string; negated: boolean };

/** 정렬 한 항목 — 키 순서(`field` → `direction`)까지 계약이다 */
export interface AqlOrder {
  field: string;
  direction: "asc" | "desc";
}

/** 파싱 결과 — 빈 절은 `where: null`. 기본 정렬(updated DESC)은 파서가 아니라 실행부가 넣는다 */
export interface AqlQuery {
  where: AqlNode | null;
  orderBy: AqlOrder[];
}

/**
 * 파서·검증·해석 오류.
 *
 * `position`은 0-based 문자 오프셋(에디터 밑줄의 근거)이고, **가리킬 자리가 없으면 null**이다 —
 * 요청 자체가 틀린 경우(길이 초과)가 그렇다. 0으로 채우면 엉뚱한 첫 글자에 밑줄이 그어진다.
 */
export class AqlError extends Error {
  readonly position: number | null;
  readonly expected: string[];

  constructor(message: string, position: number | null, expected: string[] = []) {
    super(message);
    this.name = "AqlError";
    this.position = position;
    this.expected = expected;
  }
}

/** 서버가 거부하는 질의 문자열 길이 — 스토어 입구에서 같은 문구로 먼저 막는다 */
export const AQL_MAX_LENGTH = 4000;

/** 길이 상한 검사 — 자리를 짚을 수 없는 요청 검증이라 position이 없다 */
export function requireLength(aql: string | null | undefined): string {
  const value = aql ?? "";
  if (value.length > AQL_MAX_LENGTH) {
    throw new AqlError(`AQL은 ${AQL_MAX_LENGTH}자 이하여야 합니다`, null);
  }
  return value;
}

/** 값의 성격 — 연산자 허용과 해석 방법이 여기서 갈린다. 서버 `AqlFields.Kind`와 같은 이름이다 */
export type AqlFieldKind =
  | "ENUM"
  | "ORDERED_ENUM"
  | "USER"
  | "MULTI"
  | "DATE"
  | "NUMBER"
  | "TEXT"
  | "BOOL";

export interface AqlFieldDef {
  name: string;
  aliases: string[];
  kind: AqlFieldKind;
  /** 쓸 수 있는 연산자(IN·IS EMPTY 포함) — 표시용이자 검증용 */
  operators: string[];
  sortable: boolean;
  emptyAllowed: boolean;
  /** 구현되어 있는가 — false면 "아직 지원하지 않는 필드입니다"로 거절한다 */
  supported: boolean;
}

const EQ = ["=", "!=", "IN", "NOT IN"];
const EQ_EMPTY = ["=", "!=", "IN", "NOT IN", "IS EMPTY", "IS NOT EMPTY"];
const ORDERED = ["=", "!=", "<", "<=", ">", ">=", "IN", "NOT IN"];
const DATE_OPS = ["=", "!=", "<", "<=", ">", ">=", "IS EMPTY", "IS NOT EMPTY"];
const NUMBER_OPS = ["=", "!=", "<", "<=", ">", ">=", "IS EMPTY", "IS NOT EMPTY"];
const TEXT_OPS = ["~", "!~", "=", "!="];
const MATCH_ONLY = ["~", "!~"];

/** §2 필드 표 — 서버 `AqlFields.ALL`과 한 줄씩 같아야 한다 */
export const AQL_FIELDS: AqlFieldDef[] = [
  f("project", ["프로젝트"], "ENUM", EQ, false, false),
  f("key", ["키"], "TEXT", ["=", "!=", "~", "!~", "IN", "NOT IN"], true, false),
  f("type", ["타입", "유형"], "ENUM", EQ, false, false),
  f("status", ["상태"], "ENUM", EQ, true, false),
  f("statusCategory", ["상태분류"], "ENUM", EQ, false, false),
  f("priority", ["우선순위"], "ORDERED_ENUM", ORDERED, true, false),
  f("assignee", ["담당자", "담당"], "USER", EQ_EMPTY, true, true),
  f("reporter", ["보고자"], "USER", EQ, false, false),
  f("labels", ["라벨"], "MULTI", EQ_EMPTY, false, true),
  f("component", ["컴포넌트"], "MULTI", EQ_EMPTY, false, true),
  f("sprint", ["스프린트"], "ENUM", EQ_EMPTY, false, true),
  f("fixVersion", ["수정버전", "버전"], "ENUM", EQ_EMPTY, false, true),
  f("resolution", ["해결"], "ENUM", EQ_EMPTY, false, true),
  f("parent", ["상위", "상위항목"], "ENUM", EQ_EMPTY, false, true),
  f("created", ["생성일"], "DATE", DATE_OPS, true, false),
  f("updated", ["수정일"], "DATE", DATE_OPS, true, false),
  f("due", ["마감일"], "DATE", DATE_OPS, true, true),
  // 해결 시각을 저장하는 컬럼이 아직 없다 — 있는 척하고 다른 값으로 답하지 않는다(서버와 같은 거절)
  f("resolved", ["해결일"], "DATE", DATE_OPS, false, false, false),
  f("estimate", ["예상시간"], "NUMBER", NUMBER_OPS, true, true),
  f("text", ["텍스트", "내용"], "TEXT", MATCH_ONLY, false, false),
  f("summary", ["요약", "제목"], "TEXT", TEXT_OPS, true, false),
  f("archived", ["보관"], "BOOL", ["=", "!="], false, false),
];

function f(
  name: string,
  aliases: string[],
  kind: AqlFieldKind,
  operators: string[],
  sortable: boolean,
  emptyAllowed: boolean,
  supported = true,
): AqlFieldDef {
  return { name, aliases, kind, operators, sortable, emptyAllowed, supported };
}

const FIELD_BY_LOOKUP = new Map<string, AqlFieldDef>();
for (const def of AQL_FIELDS) {
  FIELD_BY_LOOKUP.set(def.name.toLowerCase(), def);
  for (const alias of def.aliases) FIELD_BY_LOOKUP.set(alias.toLowerCase(), def);
}

/** 이름·별칭·대소문자를 무시하고 필드를 찾는다. 모르면 null(미지원 필드도 찾아지긴 한다) */
export function findField(name: string): AqlFieldDef | null {
  return FIELD_BY_LOOKUP.get(name.trim().toLowerCase()) ?? null;
}

/** 정렬 가능한 필드의 정식명 */
export function sortableFields(): string[] {
  return AQL_FIELDS.filter((def) => def.sortable).map((def) => def.name);
}

/** 필드를 찾거나 400 — 서버 `AqlFields.require`와 같은 문구·같은 자리 */
export function requireField(written: string, position: number): AqlFieldDef {
  const def = findField(written);
  if (!def) throw new AqlError(`필드를 모릅니다: ${written}`, position);
  if (!def.supported) throw new AqlError(`아직 지원하지 않는 필드입니다: ${written}`, position);
  return def;
}

/** 이 필드에 이 연산자를 쓸 수 있는가 — 서버 `AqlFields.requireOperator`와 같은 규칙 */
export function requireOperator(def: AqlFieldDef, operator: string, position: number): void {
  if (def.operators.includes(operator)) return;
  if (operator === "~" || operator === "!~") {
    throw new AqlError(`'${operator}'는 텍스트 필드에만 쓸 수 있습니다 (${def.name})`, position);
  }
  if (operator === "<" || operator === "<=" || operator === ">" || operator === ">=") {
    throw new AqlError(`'${operator}'는 날짜·숫자 필드에만 쓸 수 있습니다 (${def.name})`, position);
  }
  if (def.operators.length === MATCH_ONLY.length && def.operators.every((op, i) => op === MATCH_ONLY[i])) {
    throw new AqlError(
      `'${operator}'는 ${def.name} 필드에 쓸 수 없습니다 — 포함 검색은 '~'입니다`,
      position,
      ["~"],
    );
  }
  throw new AqlError(`'${operator}'는 ${def.name} 필드에 쓸 수 없습니다`, position, [...def.operators]);
}

export interface AqlFunctionDef {
  name: string;
  signature: string;
  /** 쓸 수 있는 필드의 정식명. 비어 있으면 날짜 필드 전부 */
  fields: string[];
  description: string;
}

export const AQL_FUNCTIONS: AqlFunctionDef[] = [
  { name: "currentUser", signature: "currentUser()", fields: ["assignee", "reporter"], description: "지금 로그인한 사람" },
  { name: "openSprints", signature: "openSprints()", fields: ["sprint"], description: "진행 중인 스프린트" },
  { name: "now", signature: "now()", fields: [], description: "현재 시각" },
  { name: "startOfDay", signature: "startOfDay(±n)", fields: [], description: "오늘 0시(±n일)" },
  { name: "endOfDay", signature: "endOfDay(±n)", fields: [], description: "오늘 끝(±n일)" },
  { name: "startOfWeek", signature: "startOfWeek(±n)", fields: [], description: "이번 주 월요일(±n주)" },
  { name: "endOfWeek", signature: "endOfWeek(±n)", fields: [], description: "이번 주 끝(±n주)" },
  { name: "startOfMonth", signature: "startOfMonth(±n)", fields: [], description: "이번 달 1일(±n월)" },
  { name: "endOfMonth", signature: "endOfMonth(±n)", fields: [], description: "이번 달 끝(±n월)" },
  { name: "startOfYear", signature: "startOfYear(±n)", fields: [], description: "올해 1월 1일(±n년)" },
  { name: "endOfYear", signature: "endOfYear(±n)", fields: [], description: "올해 끝(±n년)" },
];

const FUNCTION_BY_LOWER = new Map(AQL_FUNCTIONS.map((fn) => [fn.name.toLowerCase(), fn]));

export function findFunction(name: string): AqlFunctionDef | null {
  return FUNCTION_BY_LOWER.get(name.trim().toLowerCase()) ?? null;
}

/** 자동완성 사전이 내려주는 키워드 목록 — 서버 `/query/fields`의 `keywords`와 같다 */
export const AQL_KEYWORDS = [
  "AND",
  "OR",
  "NOT",
  "IN",
  "NOT IN",
  "IS",
  "IS NOT",
  "EMPTY",
  "ORDER BY",
  "ASC",
  "DESC",
];

/** 필드 자리에 올 수 없는 낱말 — 값으로는 쓸 수 있다(서버 `AqlParser.RESERVED`) */
const RESERVED = new Set(["and", "or", "not", "in", "is", "empty", "order", "by", "asc", "desc"]);

export function isReserved(word: string): boolean {
  return RESERVED.has(word.trim().toLowerCase());
}
