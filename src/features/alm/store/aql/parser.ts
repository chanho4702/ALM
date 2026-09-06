/**
 * AQL 재귀 하강 파서 — 서버 `search/aql/AqlParser`와 같은 문법·같은 AST·같은 오류.
 *
 * **순수 문법만 본다.** 필드가 존재하는지·그 연산자를 쓸 수 있는지는 `validate.ts`(해석 단계)가 본다.
 * 그래서 AST에는 위치가 실리지 않는다(JSON 계약을 더럽히지 않기 위해) — 대신 위치를 곁 테이블
 * (`WeakMap`)에 두고 검증기가 꺼내 쓴다. 서버는 record 필드로 들고 JSON에서 뺀다.
 *
 * ```
 * query   := clause? ("ORDER BY" order ("," order)*)?
 * clause  := or
 * or      := and ("OR" and)*
 * and     := term ("AND" term)*          -- AND가 OR보다 강하게 묶인다
 * term    := "NOT" term | "(" clause ")" | cond
 * cond    := field op value
 *          | field ("IN" | "NOT" "IN") "(" value ("," value)* ")"
 *          | field ("IS" | "IS" "NOT") "EMPTY"
 * value   := string | number | ident | ident "(" arg? ("," arg)* ")"
 * order   := field ("ASC" | "DESC")?
 * ```
 */
import { tokenize, type AqlToken } from "./lexer";
import {
  AQL_OPS,
  AqlError,
  isReserved,
  type AqlNode,
  type AqlOp,
  type AqlOrder,
  type AqlQuery,
  type AqlValue,
} from "./types";

/** 잎 노드의 필드·연산자 자리 — 검증기가 밑줄을 어디에 그을지 정하는 근거 */
export interface NodePositions {
  field: number;
  operator: number;
}

const NODE_POSITIONS = new WeakMap<object, NodePositions>();
const VALUE_POSITIONS = new WeakMap<object, number>();
const ORDER_POSITIONS = new WeakMap<object, number>();

export function nodePositions(node: AqlNode): NodePositions {
  return NODE_POSITIONS.get(node) ?? { field: 0, operator: 0 };
}

export function valuePosition(value: AqlValue): number {
  return VALUE_POSITIONS.get(value) ?? 0;
}

export function orderPosition(order: AqlOrder): number {
  return ORDER_POSITIONS.get(order) ?? 0;
}

const describe = (token: AqlToken) => (token.type === "eof" ? "입력이 끝났습니다" : token.text);

/**
 * 괄호·NOT 중첩 상한 — 서버와 같은 값·같은 문구다.
 * 없으면 깊은 입력이 재귀 하강에서 `Maximum call stack size exceeded`로 터진다(목업 실행에서 특히).
 */
export const MAX_DEPTH = 50;

class Parser {
  private readonly tokens: AqlToken[];
  private index = 0;
  private depth = 0;

  constructor(input: string | null | undefined) {
    this.tokens = tokenize(input);
  }

  private peek(offset = 0): AqlToken {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)];
  }

  private next(): AqlToken {
    const token = this.tokens[this.index];
    if (this.index < this.tokens.length - 1) this.index += 1;
    return token;
  }

  private keyword(word: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token.type === "ident" && token.text.toUpperCase() === word;
  }

  query(): AqlQuery {
    let where: AqlNode | null = null;
    if (this.peek().type !== "eof" && !this.atOrderBy()) where = this.or();
    const orderBy = this.atOrderBy() ? this.orderBy() : [];
    if (this.peek().type !== "eof") {
      throw new AqlError(`여기서 끝나야 합니다: ${describe(this.peek())}`, this.peek().position, [
        "AND",
        "OR",
        "ORDER BY",
      ]);
    }
    return { where, orderBy };
  }

  // ── 조건 ──

  private or(): AqlNode {
    const first = this.and();
    if (!this.keyword("OR")) return first;
    const children = [first];
    while (this.keyword("OR")) {
      this.next();
      children.push(this.and());
    }
    return { kind: "or", children };
  }

  private and(): AqlNode {
    const first = this.term();
    if (!this.keyword("AND")) return first;
    const children = [first];
    while (this.keyword("AND")) {
      this.next();
      children.push(this.term());
    }
    return { kind: "and", children };
  }

  private term(): AqlNode {
    if (this.keyword("NOT")) {
      const at = this.next().position;
      return this.nested(at, () => ({ kind: "not", child: this.term() }));
    }
    if (this.peek().type === "lparen") {
      const at = this.peek().position;
      this.next();
      const inner = this.nested(at, () => this.or());
      if (this.peek().type !== "rparen") {
        throw new AqlError("괄호를 닫아야 합니다", this.peek().position, [")"]);
      }
      this.next();
      return inner;
    }
    return this.condition();
  }

  /** 한 단계 더 들어간다 — 상한을 넘으면 그 여는 자리를 짚는다 */
  private nested<T>(position: number, read: () => T): T {
    this.depth += 1;
    if (this.depth > MAX_DEPTH) {
      throw new AqlError(`너무 깊게 중첩됐습니다 (최대 ${MAX_DEPTH}단계)`, position);
    }
    try {
      return read();
    } finally {
      this.depth -= 1;
    }
  }

  private condition(): AqlNode {
    const field = this.next();
    if (field.type !== "ident" || isReserved(field.text)) {
      throw new AqlError(`필드가 필요합니다: ${describe(field)}`, field.position, ["필드 이름"]);
    }
    const name = field.text;
    const at = field.position;

    // field [NOT] IN (…)
    if (this.keyword("NOT") && this.keyword("IN", 1)) {
      const operatorAt = this.peek().position;
      this.next();
      this.next();
      return this.remember({ kind: "in", field: name, negated: true, values: this.valueList() }, at, operatorAt);
    }
    if (this.keyword("IN")) {
      const operatorAt = this.next().position;
      return this.remember({ kind: "in", field: name, negated: false, values: this.valueList() }, at, operatorAt);
    }

    // field IS [NOT] EMPTY
    if (this.keyword("IS")) {
      const operatorAt = this.next().position;
      let negated = false;
      if (this.keyword("NOT")) {
        this.next();
        negated = true;
      }
      if (!this.keyword("EMPTY")) {
        throw new AqlError("EMPTY가 필요합니다", this.peek().position, ["EMPTY"]);
      }
      this.next();
      return this.remember({ kind: "empty", field: name, negated }, at, operatorAt);
    }

    if (this.peek().type !== "op") {
      throw new AqlError("연산자가 필요합니다", this.peek().position, [...AQL_OPS, "IN", "IS"]);
    }
    const operatorToken = this.next();
    return this.remember(
      {
        kind: "compare",
        field: name,
        operator: operatorToken.text as AqlOp,
        value: this.value(),
      },
      at,
      operatorToken.position,
    );
  }

  private remember<T extends AqlNode>(node: T, field: number, operator: number): T {
    NODE_POSITIONS.set(node, { field, operator });
    return node;
  }

  private valueList(): AqlValue[] {
    if (this.peek().type !== "lparen") {
      throw new AqlError("여는 괄호가 필요합니다", this.peek().position, ["("]);
    }
    this.next();
    const values = [this.value()];
    while (this.peek().type === "comma") {
      this.next();
      values.push(this.value());
    }
    if (this.peek().type !== "rparen") {
      throw new AqlError("괄호를 닫아야 합니다", this.peek().position, [")", ","]);
    }
    this.next();
    return values;
  }

  private value(): AqlValue {
    const token = this.peek();
    if (token.type === "string") {
      this.next();
      return this.rememberValue({ type: "string", value: token.text }, token.position);
    }
    if (token.type === "number") {
      this.next();
      return this.rememberValue({ type: "number", value: token.text }, token.position);
    }
    if (token.type === "ident") {
      this.next();
      // 함수는 낱말에 괄호가 "붙어" 있을 때만 — `status = done (x)`를 함수로 오독하지 않는다
      const after = this.peek();
      if (after.type === "lparen" && after.position === token.position + token.text.length) {
        this.next();
        const args: AqlValue[] = [];
        if (this.peek().type !== "rparen") {
          args.push(this.value());
          while (this.peek().type === "comma") {
            this.next();
            args.push(this.value());
          }
        }
        if (this.peek().type !== "rparen") {
          throw new AqlError("괄호를 닫아야 합니다", this.peek().position, [")"]);
        }
        this.next();
        return this.rememberValue({ type: "function", name: token.text, args }, token.position);
      }
      return this.rememberValue({ type: "ident", value: token.text }, token.position);
    }
    throw new AqlError("값이 필요합니다", token.position, ["값"]);
  }

  private rememberValue(value: AqlValue, position: number): AqlValue {
    VALUE_POSITIONS.set(value, position);
    return value;
  }

  // ── 정렬 ──

  private atOrderBy(): boolean {
    return this.keyword("ORDER") && this.keyword("BY", 1);
  }

  private orderBy(): AqlOrder[] {
    this.next();
    this.next();
    const orders = [this.order()];
    while (this.peek().type === "comma") {
      this.next();
      orders.push(this.order());
    }
    return orders;
  }

  private order(): AqlOrder {
    const field = this.next();
    if (field.type !== "ident" || isReserved(field.text)) {
      throw new AqlError(`정렬할 필드가 필요합니다: ${describe(field)}`, field.position, ["필드 이름"]);
    }
    let direction: AqlOrder["direction"] = "asc";
    if (this.keyword("ASC")) this.next();
    else if (this.keyword("DESC")) {
      this.next();
      direction = "desc";
    }
    const order: AqlOrder = { field: field.text, direction };
    ORDER_POSITIONS.set(order, field.position);
    return order;
  }
}

/** AQL 문자열 → AST(문법만). 오류는 `AqlError`를 던진다 */
export function parseAql(input: string | null | undefined): AqlQuery {
  return new Parser(input).query();
}
