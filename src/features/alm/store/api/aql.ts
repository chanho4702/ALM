// alm-backend REST 어댑터 — aql (jiraApi.ts에서 분할, 동작 불변)
import { AqlError, requireLength } from "../aql/types";
import { extractApiError } from "../mapping";
import type { AqlValidation } from "../aql/validate";
import { type AqlFieldsInfo, type AqlFieldInfo, baseFieldInfos, type AqlFunctionInfo, functionInfos, keywordList } from "../aql/fields";
import { sharedApiFetch, json } from "./http";
import { type IssuePage, type IssuePageDto, mapIssuePage } from "./issues";
import { listUsers } from "./members";

// ── AQL (ALM Query Language) ─────────────────────────────────

/** 서버 오류 계약 — `{ error, position, expected }`(400). position을 살려야 에디터가 밑줄을 그린다 */
export interface AqlErrorDto {
  error?: string;
  position?: number;
  expected?: string[];
}

async function aqlError(response: Response): Promise<AqlError> {
  const body = (await response.json().catch(() => null)) as AqlErrorDto | null;
  // 자리를 안 주는 오류(길이 초과 같은 요청 검증)는 null이다 — 0으로 채우면 엉뚱한 첫 글자에 밑줄이 그어진다
  return new AqlError(
    extractApiError(response.status, body),
    typeof body?.position === "number" ? body.position : null,
    Array.isArray(body?.expected) ? body.expected : [],
  );
}

async function postAql(path: string, body: unknown): Promise<Response> {
  return sharedApiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** `POST /api/alm/issues/query` — 응답은 기존 검색 페이지 shape + total */
export async function queryIssuesAql(
  aql: string,
  paging?: { page?: number; size?: number },
): Promise<IssuePage> {
  const page = Math.max(0, paging?.page ?? 0);
  const size = Math.max(1, paging?.size ?? 50);
  const response = await postAql("/api/alm/issues/query", { aql: requireLength(aql), page, size });
  if (!response.ok) throw await aqlError(response);
  const dto = (await response.json()) as IssuePageDto;
  return mapIssuePage(dto);
}

/** `POST /api/alm/issues/query/validate` — 400으로 오든 200 `{ ok:false }`로 오든 같은 모양으로 돌려준다 */
export async function validateAql(aql: string): Promise<AqlValidation> {
  // 상한 초과는 왕복하지 않는다 — 서버와 같은 문구로 여기서 막는다
  let checked: string;
  try {
    checked = requireLength(aql);
  } catch (error) {
    if (error instanceof AqlError) return { ok: false, error: error.message, expected: [] };
    throw error;
  }
  const response = await postAql("/api/alm/issues/query/validate", { aql: checked });
  if (!response.ok) {
    const error = await aqlError(response);
    const failed: AqlValidation = { ok: false, error: error.message, expected: error.expected };
    if (error.position !== null) failed.position = error.position;
    return failed;
  }
  const body = (await response.json().catch(() => null)) as
    | (AqlErrorDto & { ok?: boolean; fields?: string[] })
    | null;
  if (body?.ok === false || body?.error) {
    const failed: AqlValidation = {
      ok: false,
      error: body?.error ?? "AQL을 해석할 수 없습니다",
      expected: Array.isArray(body?.expected) ? body.expected : [],
    };
    if (typeof body?.position === "number") failed.position = body.position;
    return failed;
  }
  return { ok: true, fields: Array.isArray(body?.fields) ? body.fields : [] };
}

/**
 * `GET /api/alm/issues/query/fields` — 자동완성 사전.
 *
 * **값 후보는 서버가 진실**이다(DB에 있는 상태·타입·스프린트 이름을 프론트가 알 수 없다).
 * **문법(별칭·연산자·정렬/EMPTY 가능 여부)은 프론트 표가 진실**이다 — 실제로 입력을 거부하거나 통과시키는
 * 것이 프론트 파서라, 서버 표가 앞서 나가면 파서가 거절할 입력을 사용자에게 권하게 된다.
 * 사용자 후보는 사전에 없으므로(서버 README의 분담) `/api/org/members`로 따로 받아 채운다.
 */
export async function aqlFields(): Promise<AqlFieldsInfo> {
  const response = await sharedApiFetch("/api/alm/issues/query/fields");
  const body = await json<Partial<AqlFieldsInfo>>(response);
  const served = new Map((body.fields ?? []).map((field) => [field.name, field]));
  const users = (await listUsers()).map((u) => ({ id: u.id, name: u.name }));
  const fields: AqlFieldInfo[] = baseFieldInfos().map((skeleton) => {
    const values =
      served.get(skeleton.name)?.values ??
      (skeleton.name === "assignee" || skeleton.name === "reporter" ? users : undefined);
    return values ? { ...skeleton, values } : skeleton;
  });
  const functions: AqlFunctionInfo[] =
    body.functions && body.functions.length > 0 ? body.functions : functionInfos();
  return {
    fields,
    functions,
    keywords: body.keywords && body.keywords.length > 0 ? body.keywords : keywordList(),
  };
}
