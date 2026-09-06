/**
 * 자동완성 사전의 계약 — 서버 `GET /api/alm/issues/query/fields` 응답 shape 그대로다.
 * REST는 그 응답을 거의 그대로 쓰고, 목업은 `jiraMock.aqlFields()`가 레지스트리에서 같은 모양을 만든다.
 *
 * ```jsonc
 * { "fields": [ { "name": "status", "aliases": ["상태"], "kind": "ENUM",
 *                 "operators": ["=", "!=", "IN", "NOT IN"], "sortable": true, "emptyAllowed": false,
 *                 "values": [ { "id": "inprogress", "name": "진행 중" } ] } ],
 *   "functions": [ { "name": "currentUser", "signature": "currentUser()",
 *                    "fields": ["assignee", "reporter"], "description": "지금 로그인한 사람" } ],
 *   "keywords": ["AND", "OR", …] }
 * ```
 *
 * 사용자 후보는 서버 사전에 없다 — 프론트가 `/api/org/members`로 따로 받아 채운다.
 */
import { AQL_FIELDS, AQL_FUNCTIONS, AQL_KEYWORDS, type AqlFieldKind } from "./types";

export interface AqlFieldValue {
  id: string;
  name: string;
}

export interface AqlFieldInfo {
  name: string;
  aliases: string[];
  kind: AqlFieldKind;
  operators: string[];
  sortable: boolean;
  emptyAllowed: boolean;
  /** 값 후보 — 없으면 자유 입력(텍스트·날짜·숫자)이다 */
  values?: AqlFieldValue[];
}

export interface AqlFunctionInfo {
  name: string;
  signature: string;
  /** 쓸 수 있는 필드의 정식명. 비어 있으면 날짜 필드 전부 */
  fields: string[];
  description: string;
}

export interface AqlFieldsInfo {
  fields: AqlFieldInfo[];
  functions: AqlFunctionInfo[];
  keywords: string[];
}

/** 값 후보 없는 뼈대 — 목업·REST가 `values`만 채워 넣는다. 지원하지 않는 필드는 권하지 않는다 */
export function baseFieldInfos(): AqlFieldInfo[] {
  return AQL_FIELDS.filter((def) => def.supported).map((def) => ({
    name: def.name,
    aliases: [...def.aliases],
    kind: def.kind,
    operators: [...def.operators],
    sortable: def.sortable,
    emptyAllowed: def.emptyAllowed,
  }));
}

export function functionInfos(): AqlFunctionInfo[] {
  return AQL_FUNCTIONS.map((fn) => ({ ...fn, fields: [...fn.fields] }));
}

export function keywordList(): string[] {
  return [...AQL_KEYWORDS];
}

export const EMPTY_FIELDS_INFO: AqlFieldsInfo = { fields: [], functions: [], keywords: [] };
