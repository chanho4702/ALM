// alm-backend REST 어댑터 — 워크플로 엔진(가용 전환·전환 실행, 2026-10-24 웨이브 A·C)
import type { Issue, IssueTransitionOption, IssueTransitions, StatusKind, TransitionRequest, TransitionScreenField } from "../types";
import { type IssueDto, mapIssue, toApiResolution, toBackendId } from "../mapping";
import { json, postJson, sharedApiFetch, sharedGet } from "./http";

interface TransitionItemDto {
  id: string;
  name: string;
  to: string;
  toName: string | null;
  toKind: string | null;
  toIcon: string | null;
  isGlobal: boolean;
  available: boolean;
  unavailableReason: string | null;
  hasScreen: boolean;
  screenFields: string[] | null;
  requiredFields: string[] | null;
  missingFields: string[] | null;
}

interface TransitionsDto {
  issueId: number;
  status: string;
  version: number;
  typeWorkflow: boolean;
  transitions: TransitionItemDto[] | null;
}

const KINDS: StatusKind[] = ["new", "active", "complete"];

function mapOption(dto: TransitionItemDto): IssueTransitionOption {
  const screenFields = (dto.screenFields ?? []) as TransitionScreenField[];
  return {
    id: dto.id,
    name: dto.name || dto.toName || dto.to,
    to: dto.to,
    toName: dto.toName ?? dto.to,
    toKind: KINDS.includes(dto.toKind as StatusKind) ? (dto.toKind as StatusKind) : null,
    toIcon: dto.toIcon ?? null,
    isGlobal: Boolean(dto.isGlobal),
    available: Boolean(dto.available),
    unavailableReason: dto.available ? null : (dto.unavailableReason ?? null),
    hasScreen: dto.hasScreen ?? screenFields.length > 0,
    screenFields,
    requiredFields: [...(dto.requiredFields ?? [])],
    missingFields: [...(dto.missingFields ?? [])],
  };
}

/** 가용 전환 — `GET /api/alm/issues/{id}/transitions`(VIEW). 같은 이슈 동시 조회는 요청 하나를 나눠 쓴다 */
export async function listIssueTransitions(issueId: string): Promise<IssueTransitions> {
  const dto = await sharedGet<TransitionsDto>(`/api/alm/issues/${toBackendId(issueId)}/transitions`);
  return {
    issueId: String(dto.issueId),
    status: dto.status,
    version: dto.version,
    typeWorkflow: Boolean(dto.typeWorkflow),
    transitions: (dto.transitions ?? []).map(mapOption),
  };
}

/**
 * 전환 실행 — `POST /api/alm/issues/{id}/transitions`(EDIT). 화면 값은 **보낸 키만** 서버가 본다 — 그 전환의
 * screenFields에 없는 칸을 실으면 400이므로 정의된 키만 옮긴다. 거부 400 `{error}`·권한 403·버전 409·org 불능 503.
 */
export async function transitionIssue(issueId: string, request: TransitionRequest): Promise<Issue> {
  const fields: Record<string, unknown> = {};
  const given = request.fields ?? {};
  if ("resolution" in given) fields.resolution = toApiResolution(given.resolution ?? null);
  if ("assigneeId" in given) fields.assigneeId = given.assigneeId == null ? null : toBackendId(given.assigneeId);
  if ("fixVersionId" in given) fields.fixVersionId = given.fixVersionId == null ? null : toBackendId(given.fixVersionId);
  if ("dueDate" in given) fields.dueDate = given.dueDate ?? null;
  const comment = request.comment?.trim();
  const body = {
    transitionId: request.transitionId,
    ...(request.expectedVersion !== undefined ? { expectedVersion: request.expectedVersion } : {}),
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    ...(comment ? { comment } : {}),
  };
  const response = await sharedApiFetch(`/api/alm/issues/${toBackendId(issueId)}/transitions`, postJson(body));
  return mapIssue(await json<IssueDto>(response));
}
