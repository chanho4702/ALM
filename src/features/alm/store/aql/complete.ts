/**
 * AQL 자동완성 — 커서 앞 토큰을 훑어 "지금 무엇이 올 자리인가"를 정하고 후보를 낸다.
 * 필드 → 연산자 → 값 → 접속사 순으로 문맥이 넘어간다(지라 JQL 에디터와 같은 흐름).
 * 렉서를 그대로 쓰지 않는 이유: 입력 도중에는 문법이 깨져 있는 게 정상이라 관대한 스캔이 필요하다.
 */
import { AQL_KEYWORDS, findField, isReserved } from "./types";
import type { AqlFieldInfo, AqlFieldsInfo, AqlFunctionInfo } from "./fields";

export type AqlSuggestionKind = "field" | "operator" | "value" | "keyword" | "function";

export interface AqlSuggestion {
  /** 목록에 보이는 글자 */
  label: string;
  /** 실제로 넣을 문자열 */
  insert: string;
  /** 우측 회색 보조 설명(별칭·타입) */
  detail?: string;
  kind: AqlSuggestionKind;
}

export interface AqlCompletion {
  suggestions: AqlSuggestion[];
  /** 치환 구간 시작(커서까지 지우고 insert를 넣는다) */
  from: number;
  /** 앞에 공백이 필요한가 — 연산자·괄호 바로 뒤에서 이어 칠 때 */
  needsSpace: boolean;
}

interface LooseToken {
  kind: "word" | "string" | "op" | "lparen" | "rparen" | "comma";
  text: string;
  start: number;
  end: number;
}

const IDENT_RE = /[A-Za-z0-9_가-힣.+-]/;
const OP_RE = /[=!~<>]/;

/** 문법이 깨져 있어도 끝까지 훑는 스캐너 — 닫히지 않은 따옴표도 토큰 하나로 본다 */
export function scanLoose(input: string): LooseToken[] {
  const tokens: LooseToken[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === ",") {
      tokens.push({
        kind: ch === "(" ? "lparen" : ch === ")" ? "rparen" : "comma",
        text: ch,
        start: i,
        end: i + 1,
      });
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const start = i;
      const quote = ch;
      i += 1;
      let value = "";
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < input.length) {
          value += input[i + 1];
          i += 2;
          continue;
        }
        value += input[i];
        i += 1;
      }
      if (i < input.length) i += 1;
      tokens.push({ kind: "string", text: value, start, end: i });
      continue;
    }
    if (OP_RE.test(ch)) {
      const start = i;
      while (i < input.length && OP_RE.test(input[i])) i += 1;
      tokens.push({ kind: "op", text: input.slice(start, i), start, end: i });
      continue;
    }
    if (IDENT_RE.test(ch)) {
      const start = i;
      while (i < input.length && IDENT_RE.test(input[i])) i += 1;
      tokens.push({ kind: "word", text: input.slice(start, i), start, end: i });
      continue;
    }
    i += 1;
  }
  return tokens;
}

const word = (token: LooseToken | undefined): string =>
  token && token.kind === "word" ? token.text.toUpperCase() : "";

/** 지금 커서가 `field IN (…` 목록 안이면 그 필드 이름 */
function openInListField(tokens: LooseToken[]): string | null {
  let depth = 0;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (token.kind === "rparen") depth += 1;
    else if (token.kind === "lparen") {
      if (depth === 0) {
        const previous = tokens[i - 1];
        if (word(previous) === "IN") {
          const fieldToken = word(tokens[i - 2]) === "NOT" ? tokens[i - 3] : tokens[i - 2];
          return fieldToken?.kind === "word" ? fieldToken.text : null;
        }
        return null;
      }
      depth -= 1;
    }
  }
  return null;
}

/** 커서 앞에서 가장 가까운 필드 이름(연산자 왼쪽) */
function fieldBefore(tokens: LooseToken[]): string | null {
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (token.kind === "word" && !isReserved(token.text) && findField(token.text)) return token.text;
    if (token.kind === "word" && isReserved(token.text) && word(token) !== "NOT" && word(token) !== "IN") {
      return null;
    }
  }
  return null;
}

const startsWith = (candidate: string, prefix: string) =>
  candidate.toLowerCase().startsWith(prefix.toLowerCase());

function fieldSuggestions(info: AqlFieldsInfo, prefix: string): AqlSuggestion[] {
  const out: AqlSuggestion[] = [];
  for (const field of info.fields) {
    const matched =
      prefix === "" || startsWith(field.name, prefix) || field.aliases.some((a) => startsWith(a, prefix));
    if (!matched) continue;
    out.push({
      label: field.name,
      insert: field.name,
      detail: field.aliases.join(", "),
      kind: "field",
    });
  }
  return out;
}

function valueSuggestions(
  field: AqlFieldInfo | undefined,
  info: AqlFieldsInfo,
  prefix: string,
): AqlSuggestion[] {
  const out: AqlSuggestion[] = [];
  for (const value of field?.values ?? []) {
    if (prefix !== "" && !startsWith(value.name, prefix) && !startsWith(value.id, prefix)) continue;
    out.push({
      label: value.name,
      insert: quoteValue(value.name),
      detail: value.id === value.name ? undefined : value.id,
      kind: "value",
    });
  }
  for (const fn of info.functions) {
    if (!allowsFunction(field, fn)) continue;
    if (prefix !== "" && !startsWith(fn.signature, prefix)) continue;
    out.push({ label: fn.signature, insert: fn.signature, detail: fn.description, kind: "function" });
  }
  if (field?.kind === "DATE") {
    for (const rel of ["-7d", "-1w", "-1M", "+3d"]) {
      if (prefix !== "" && !startsWith(rel, prefix)) continue;
      out.push({ label: rel, insert: rel, detail: "상대 날짜", kind: "value" });
    }
  }
  if (field?.kind === "BOOL") {
    for (const literal of ["true", "false"]) {
      if (prefix !== "" && !startsWith(literal, prefix)) continue;
      out.push({ label: literal, insert: literal, kind: "value" });
    }
  }
  return out;
}

/** 함수 사전의 `fields`가 비어 있으면 날짜 함수다 — 날짜 필드 전부에 쓸 수 있다 */
function allowsFunction(field: AqlFieldInfo | undefined, fn: AqlFunctionInfo): boolean {
  if (!field) return false;
  if (fn.fields.length === 0) return field.kind === "DATE";
  return fn.fields.includes(field.name);
}

/** 공백·키워드가 든 값은 따옴표로 감싼다 */
export function quoteValue(raw: string): string {
  if (/^[A-Za-z0-9_가-힣.-]+$/.test(raw) && !AQL_KEYWORDS.includes(raw.toUpperCase())) return raw;
  return `"${raw.replace(/(["\\])/g, "\\$1")}"`;
}

function keywordSuggestions(words: { label: string; detail?: string }[], prefix: string): AqlSuggestion[] {
  return words
    .filter((w) => prefix === "" || startsWith(w.label, prefix))
    .map((w) => ({ label: w.label, insert: w.label, detail: w.detail, kind: "keyword" as const }));
}

/**
 * 커서 위치의 후보 목록.
 * `input`은 편집 중 원문, `cursor`는 caret 오프셋.
 */
export function completeAql(input: string, cursor: number, info: AqlFieldsInfo): AqlCompletion {
  const head = input.slice(0, cursor);
  const tokens = scanLoose(head);
  const last = tokens[tokens.length - 1];
  const typing = last && (last.kind === "word" || last.kind === "string") && last.end === cursor;
  const prefix = typing ? last.text : "";
  const from = typing ? last.start : cursor;
  const before = typing ? tokens.slice(0, -1) : tokens;
  const needsSpace =
    !typing && cursor > 0 && !/[\s(,]/.test(input[cursor - 1]) && input[cursor - 1] !== undefined;

  const suggestions = suggestFor(before, prefix, info);
  return { suggestions, from, needsSpace };
}

function suggestFor(before: LooseToken[], prefix: string, info: AqlFieldsInfo): AqlSuggestion[] {
  const last = before[before.length - 1];
  const previous = before[before.length - 2];

  // ORDER BY 뒤 — 정렬 필드 → 방향 → 쉼표
  const orderAt = before.findIndex(
    (token, index) => word(token) === "ORDER" && word(before[index + 1]) === "BY",
  );
  if (orderAt >= 0 && before.length >= orderAt + 2) {
    if (word(last) === "BY" || last?.kind === "comma") {
      return fieldSuggestions({ ...info, fields: info.fields.filter((f) => f.sortable) }, prefix);
    }
    if (last?.kind === "word" && findField(last.text)) {
      return keywordSuggestions([{ label: "ASC" }, { label: "DESC" }], prefix);
    }
    return [];
  }

  const listValues = (): AqlSuggestion[] => {
    const field = openInListField(before);
    return field
      ? valueSuggestions(info.fields.find((f) => f.name === field), info, prefix)
      : [];
  };

  if (word(last) === "IS") {
    return keywordSuggestions([{ label: "EMPTY" }, { label: "NOT EMPTY" }], prefix);
  }
  if (word(last) === "NOT") {
    if (word(previous) === "IS") return keywordSuggestions([{ label: "EMPTY" }], prefix);
    if (previous?.kind === "word" && findField(previous.text)) {
      return keywordSuggestions([{ label: "IN" }], prefix);
    }
    return fieldSuggestions(info, prefix);
  }
  if (word(last) === "IN") {
    return keywordSuggestions([{ label: "(" }], prefix);
  }
  if (last?.kind === "lparen") {
    return word(previous) === "IN" ? listValues() : fieldSuggestions(info, prefix);
  }
  if (last?.kind === "comma") {
    return listValues();
  }
  if (last?.kind === "op") {
    const name = fieldBefore(before);
    const def = name ? findField(name) : null;
    return valueSuggestions(def ? info.fields.find((f) => f.name === def.name) : undefined, info, prefix);
  }
  if (!last) {
    return [...fieldSuggestions(info, prefix), ...keywordSuggestions([{ label: "NOT" }], prefix)];
  }
  if (word(last) === "AND" || word(last) === "OR") {
    return fieldSuggestions(info, prefix);
  }
  if (last.kind === "word" && !isReserved(last.text)) {
    const def = findField(last.text);
    // 필드 자리면 연산자, 값 자리(연산자 뒤)면 접속사
    if (def && (!previous || previous.kind === "lparen" || ["AND", "OR", "NOT"].includes(word(previous)))) {
      const infoField = info.fields.find((f) => f.name === def.name);
      return keywordSuggestions(
        (infoField?.operators ?? []).map((op) => ({ label: op })),
        prefix,
      );
    }
  }
  // 값·EMPTY·`)` 뒤 — 절을 잇거나 정렬을 시작한다
  return keywordSuggestions([{ label: "AND" }, { label: "OR" }, { label: "ORDER BY" }], prefix);
}

/**
 * 전역 검색 입력이 AQL로 보이는가 — "필드 연산자" 두 토큰이면 그렇게 본다.
 * 첫 낱말이 실제 필드로 풀려야 한다(그래야 "로그인 = 실패" 같은 평문을 오인하지 않는다).
 */
export function looksLikeAql(input: string): boolean {
  const tokens = scanLoose(input);
  if (tokens.length < 2) return false;
  const [first, second] = tokens;
  if (first.kind !== "word" || !findField(first.text)) return false;
  if (second.kind === "op") return true;
  return second.kind === "word" && ["IN", "IS", "NOT"].includes(second.text.toUpperCase());
}
