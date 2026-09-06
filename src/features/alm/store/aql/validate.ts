/**
 * DB·org 없이 할 수 있는 검사 — 필드가 있는가, 그 필드에 이 연산자를 쓸 수 있는가, 정렬할 수 있는 필드인가.
 * 서버 `search/aql/AqlValidation`과 같은 규칙이고, 에디터 실시간 검증(`POST /query/validate`)이 이것만 돈다.
 *
 * 값 해석(그 상태가 진짜 있는지, 그런 사용자가 있는지)은 **하지 않는다** — 한 글자 칠 때마다 레지스트리를
 * 두드릴 이유가 없다. 그래서 검증을 통과한 질의가 실행에서 400이 날 수 있다(서버와 같은 성질).
 */
import { nodePositions, orderPosition, parseAql } from "./parser";
import {
  AqlError,
  requireField,
  requireLength,
  requireOperator,
  sortableFields,
  type AqlNode,
  type AqlQuery,
} from "./types";

/** 검사하면서 쓰인 필드의 **정식명**을 모은다(에디터 힌트용, 서버 `validate` 응답의 `fields`) */
export function checkQuery(query: AqlQuery): string[] {
  const used: string[] = [];
  walk(query.where, used);
  for (const order of query.orderBy) {
    const at = orderPosition(order);
    const def = requireField(order.field, at);
    if (!def.sortable) {
      throw new AqlError(`정렬할 수 없는 필드입니다: ${def.name}`, at, sortableFields());
    }
    if (!used.includes(def.name)) used.push(def.name);
  }
  return used;
}

function walk(node: AqlNode | null, used: string[]): void {
  if (!node) return;
  switch (node.kind) {
    case "and":
    case "or":
      for (const child of node.children) walk(child, used);
      return;
    case "not":
      walk(node.child, used);
      return;
    case "compare":
      push(used, require(node, node.operator));
      return;
    case "in":
      push(used, require(node, node.negated ? "NOT IN" : "IN"));
      return;
    case "empty":
      push(used, require(node, node.negated ? "IS NOT EMPTY" : "IS EMPTY"));
  }
}

const push = (list: string[], name: string) => {
  if (!list.includes(name)) list.push(name);
};

/** 모르는 필드는 필드 자리, 못 쓰는 연산자는 연산자 자리를 짚는다 */
function require(node: AqlNode & { field: string }, operator: string): string {
  const at = nodePositions(node);
  const def = requireField(node.field, at.field);
  requireOperator(def, operator, at.operator);
  return def.name;
}

export interface AqlValidation {
  ok: boolean;
  /** 쓰인 필드의 정식명 — 서버 `validate`가 같은 이름으로 준다 */
  fields?: string[];
  error?: string;
  /** 밑줄을 그을 자리. 가리킬 데가 없으면 없다(길이 초과 같은 요청 검증) */
  position?: number;
  expected?: string[];
}

/** 던지지 않는 문법+필드+연산자 검증 — 에디터의 실시간 밑줄이 쓴다 */
export function validate(input: string | null | undefined): AqlValidation {
  try {
    const query = parseAql(requireLength(input));
    return { ok: true, fields: checkQuery(query) };
  } catch (error) {
    if (error instanceof AqlError) {
      const result: AqlValidation = { ok: false, error: error.message, expected: error.expected };
      if (error.position !== null) result.position = error.position;
      return result;
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 파싱 + 검증을 한 번에 — 실행 경로(`queryIssuesAql`)가 쓴다 */
export function parseAndCheck(input: string | null | undefined): AqlQuery {
  const query = parseAql(requireLength(input));
  checkQuery(query);
  return query;
}
