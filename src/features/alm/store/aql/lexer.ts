/**
 * AQL 토크나이저 — 손으로 짠다(외부 파서 라이브러리 금지).
 * 서버 `search/aql/AqlLexer`와 **같은 규칙**이어야 한다: 같은 토큰 종류, 같은 오류 문구, 같은 위치.
 *
 * 키워드(AND/OR/NOT/IN/IS/EMPTY/ORDER/BY/ASC/DESC)는 별도 토큰이 아니라 `ident`다 —
 * 대소문자 무시 판정은 파서가 한다. 그래야 `labels = and` 같은 값도 자연스럽게 쓸 수 있다.
 */
import { AqlError } from "./types";

export type AqlTokenType =
  | "ident"
  | "string"
  | "number"
  | "op"
  | "lparen"
  | "rparen"
  | "comma"
  | "eof";

export interface AqlToken {
  type: AqlTokenType;
  /** 원문 조각. string 토큰은 따옴표를 벗기고 이스케이프를 푼 값이다 */
  text: string;
  /** 0부터 세는 입력 오프셋 — 오류 밑줄의 근거 */
  position: number;
}

/** 낱말 문자 — 한글·한자도 유니코드 letter라 별도 범위를 두지 않는다(서버 `isWordChar`와 같다) */
const WORD_RE = /[\p{L}\p{N}_.\-+@/]/u;
/** 낱말 전체가 수일 때만 number — `-7d`·`2026-09-06`은 여기서 걸러져 ident가 된다 */
const NUMBER_RE = /^[+-]?\d+(\.\d+)?$/;

export function isNumberWord(word: string): boolean {
  return NUMBER_RE.test(word);
}

export function tokenize(input: string | null | undefined): AqlToken[] {
  const source = input ?? "";
  const tokens: AqlToken[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen", text: "(", position: i });
      i += 1;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen", text: ")", position: i });
      i += 1;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma", text: ",", position: i });
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      i = readString(source, i, tokens);
      continue;
    }
    if (c === "=") {
      // `==`는 JQL에도 AQL에도 없다 — 시작 위치를 짚어 준다
      if (source[i + 1] === "=") throw new AqlError("연산자를 모릅니다: ==", i, ["=", "!="]);
      tokens.push({ type: "op", text: "=", position: i });
      i += 1;
      continue;
    }
    if (c === "!") {
      if (source[i + 1] === "=") {
        tokens.push({ type: "op", text: "!=", position: i });
        i += 2;
      } else if (source[i + 1] === "~") {
        tokens.push({ type: "op", text: "!~", position: i });
        i += 2;
      } else {
        throw new AqlError("연산자를 모릅니다: !", i, ["!=", "!~"]);
      }
      continue;
    }
    if (c === "~") {
      tokens.push({ type: "op", text: "~", position: i });
      i += 1;
      continue;
    }
    if (c === "<" || c === ">") {
      if (source[i + 1] === "=") {
        tokens.push({ type: "op", text: `${c}=`, position: i });
        i += 2;
      } else {
        tokens.push({ type: "op", text: c, position: i });
        i += 1;
      }
      continue;
    }
    if (!WORD_RE.test(c)) throw new AqlError(`알 수 없는 문자입니다: ${c}`, i);
    const start = i;
    while (i < source.length && WORD_RE.test(source[i])) i += 1;
    const word = source.slice(start, i);
    tokens.push({ type: isNumberWord(word) ? "number" : "ident", text: word, position: start });
  }
  tokens.push({ type: "eof", text: "", position: source.length });
  return tokens;
}

function readString(source: string, start: number, tokens: AqlToken[]): number {
  const quote = source[start];
  let text = "";
  let i = start + 1;
  while (i < source.length) {
    const c = source[i];
    if (c === "\\" && i + 1 < source.length) {
      text += source[i + 1];
      i += 2;
      continue;
    }
    if (c === quote) {
      tokens.push({ type: "string", text, position: start });
      return i + 1;
    }
    text += c;
    i += 1;
  }
  throw new AqlError("따옴표를 닫아야 합니다", start, [quote]);
}
