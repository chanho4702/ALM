// localStorage 목업 스토어 — issues (jiraMock.ts에서 분할, 동작 불변)
import type { IssuePriority, IssueType, Issue } from "../types";
import { htmlToText } from "../richText";
import type { IssueQuery } from "../searchQuery";
import { queryToCriteria } from "../issueSearch";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { ApiError } from "../mapping";
import { load, clone, assertRequiredFields, nextId, persist, defaultSettingsBody } from "./db";
import { type IssuePage, findIssues } from "./search";
import { resolvedBody, typeLevelOf, typeDefOf, typeNameOf, assertVersionAssignable, resolvePriority, assertParentAllowed, applyResolutionRule, addWatcher, logChange, recordChanges } from "./rules";
import { assertCanEdit, myProjectRole } from "./members";
import { assertNotInTriage, applyPostFunctions, assertStatusInWorkflow, assertValidators, chooseTransition, defaultResolution, defaultStatusFor, mappedStatus, workflowFor, type EvaluatedTransition } from "./workflow";
import { emitIssueEvent, snapshotForAutomation } from "./automation";
import { assertPointsInScale } from "./cycles";
import { assertPlanning, enterTriage } from "./planning";
import { validateComponentIds, resolveDefaultAssigneeFor } from "./components";
import { preferencesOf } from "./personal";

// ── issues ───────────────────────────────────────────────────

export async function listIssues(
  projectId: string,
  filter?: {
    text?: string;
    status?: string; // WorkflowStatus.id
    priority?: IssuePriority;
    assigneeId?: string;
    label?: string;
    componentId?: string;
    type?: IssueType;
  },
): Promise<Issue[]> {
  // 트리아지 대기열(V35)은 일반 워크플로 밖 — 보드·백로그가 읽는 목록에 넣지 않는다(대기열은 listTriage)
  let issues = load().issues.filter((i) => i.projectId === projectId && !i.triageState);
  if (filter?.text) {
    const text = filter.text.toLowerCase();
    issues = issues.filter(
      (i) =>
        i.title.toLowerCase().includes(text) ||
        i.key.toLowerCase().includes(text) ||
        htmlToText(i.description).toLowerCase().includes(text),
    );
  }
  if (filter?.status) issues = issues.filter((i) => i.status === filter.status);
  if (filter?.priority) issues = issues.filter((i) => i.priority === filter.priority);
  if (filter?.assigneeId) issues = issues.filter((i) => i.assigneeId === filter.assigneeId);
  if (filter?.label) issues = issues.filter((i) => i.labels.includes(filter.label!));
  if (filter?.componentId) issues = issues.filter((i) => (i.componentIds ?? []).includes(filter.componentId!));
  if (filter?.type) issues = issues.filter((i) => i.type === filter.type);
  // order 동률(보드 컬럼별 재번호로 발생 가능)은 key로 결정적으로 정렬한다
  return clone([...issues].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)));
}

/**
 * 상세 검색 — IssueQuery를 서버 검색 조건으로 바꿔 한 페이지를 돌려준다(REST와 같은 의미·같은 페이징).
 * 쿼리의 `statuses`는 상태 분류 id, `statusIds`는 상태 id다.
 */
export async function queryIssuesPage(
  query: IssueQuery,
  paging: { page: number; size: number },
): Promise<IssuePage> {
  const { criteria, sort } = queryToCriteria(query);
  return findIssues(criteria, paging, sort);
}

/** 전역 검색 — 전 프로젝트 이슈에서 키/제목/설명 매치, 최근 수정 순, 최대 limit건 */
export async function searchIssues(text: string, limit = 20): Promise<Issue[]> {
  const query = text.trim().toLowerCase();
  if (!query) return [];
  const matches = load()
    .issues.filter(
      (i) =>
        i.key.toLowerCase().includes(query) ||
        i.title.toLowerCase().includes(query) ||
        htmlToText(i.description).toLowerCase().includes(query),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return clone(matches.slice(0, limit));
}

export async function getIssueByKey(key: string): Promise<Issue | null> {
  const issue = load().issues.find((i) => i.key === key);
  return issue ? clone(issue) : null;
}

export async function createIssue(input: {
  projectId: string;
  title: string;
  description?: string;
  type?: IssueType;
  status?: string; // WorkflowStatus.id
  priority?: IssuePriority;
  assigneeId?: string | null;
  sprintId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
  labels?: string[];
  componentIds?: string[];
  estimateHours?: number | null;
  /** 수정 버전 — 서버도 생성 경로에서 받는다(다른 프로젝트·보관된 버전은 거부) */
  fixVersionId?: string | null;
  /** 보존할 키(이관·CSV) — `{프로젝트키}-{번호}` 형식, 유일해야 한다. 번호는 카운터를 앞당긴다 */
  key?: string;
  /** 시작일 "YYYY-MM-DD"(V30) — 마감일보다 늦으면 거부 */
  startDate?: string | null;
  /** 스토리 포인트(V30) — 0~9999, 소수 첫째 자리 */
  storyPoints?: number | null;
  /** 트리아지 대기열로 만든다(V35, 편집자) — 트리아지를 켠 프로젝트만 */
  triage?: boolean;
}): Promise<Issue> {
  const data = load();
  const project = data.projects.find((p) => p.id === input.projectId);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다");
  const title = input.title.trim();
  if (!title) throw new Error("이슈 제목을 입력하세요");
  let preservedSeq: number | null = null;
  if (input.key !== undefined) {
    const match = new RegExp(`^${project.key}-(\\d+)$`).exec(input.key.trim().toUpperCase());
    if (!match) throw new Error(`키는 ${project.key}-번호 형식이어야 합니다: ${input.key}`);
    if (data.issues.some((i) => i.key === match[0])) {
      throw new Error(`이미 있는 키입니다: ${match[0]}`);
    }
    preservedSeq = Number(match[1]);
  }
  if (input.estimateHours !== undefined && input.estimateHours !== null && !(input.estimateHours > 0)) {
    throw new Error("예상 시간은 0보다 커야 합니다");
  }
  // 프로젝트 설정 해석은 한 군데(resolvedBody)로 통일한다 — 커스텀 > 스킴 > 기본을 여기저기서 다시 풀지 않는다
  const bodyForCreate = resolvedBody(data, project.id);
  // 타입은 프로젝트 설정(enabledTypes)을 따른다 — 미지정이면 task, task가 꺼져 있으면 첫 활성 타입
  const enabledTypes = bodyForCreate.enabledTypes;
  const resolvedType =
    input.type ??
    (enabledTypes.includes("task")
      ? "task"
      : enabledTypes.find((t) => typeLevelOf(data, t) !== "subtask")!);
  if (!typeDefOf(data, resolvedType)) throw new Error(`없는 이슈 타입입니다: ${resolvedType}`);
  // 하위 작업 계층은 계층 기능이라 활성 목록과 무관하게 허용
  if (typeLevelOf(data, resolvedType) !== "subtask" && !enabledTypes.includes(resolvedType)) {
    throw new Error(`이 프로젝트에서 사용할 수 없는 타입입니다: ${typeNameOf(data, resolvedType)}`);
  }
  // 트리아지(V35): 켠 프로젝트에서 편집 권한이 없는 열람자의 생성은 대기열로(EXTERNAL), 꺼져 있으면 예전처럼 거부
  const triageOn = data.triageProjects.includes(project.id);
  const external = triageOn && myProjectRole(data, project.id) === "viewer" && !project.archivedAt;
  if (!external) assertCanEdit(data, project.id);
  if (input.triage && !triageOn) throw new Error("트리아지를 켠 프로젝트에서만 대기열로 보낼 수 있습니다");
  const toTriage = external || Boolean(input.triage);
  if (input.status !== undefined) assertStatusInWorkflow(data, project.id, resolvedType, input.status);
  assertPlanning(input.startDate, input.storyPoints, input.dueDate ?? null);
  // 추정 척도(V39) — 포인트를 줄 때만
  assertPointsInScale(data, project.id, input.storyPoints);
  const componentIdsForCreate = validateComponentIds(data, project.id, input.componentIds);
  if (input.fixVersionId) assertVersionAssignable(data, input.fixVersionId, project.id);
  // 필드 구성의 필수 검사 — 만들기에서만 한다(수정은 기존 이슈를 갑자기 막지 않으려고 검사하지 않는다).
  // 구성은 만들려는 타입으로 해석한다 — 타입별 덮어쓰기가 있으면 그쪽이 이긴다.
  assertRequiredFields(bodyForCreate, resolvedType, {
    description: input.description === undefined ? "" : htmlToText(input.description),
    assignee: input.assigneeId,
    labels: input.labels,
    components: componentIdsForCreate,
    // parent는 저장 단계에서 required 자체가 막히므로 생성 검사 대상이 아니다
    sprint: input.sprintId,
    dueDate: input.dueDate,
    fixVersion: input.fixVersionId,
    estimate: input.estimateHours,
    startDate: input.startDate,
    storyPoints: input.storyPoints,
  });
  const seq = preservedSeq ?? (data.issueCounters[project.id] ?? 0) + 1;
  // 삭제돼도 감소하지 않는다 → 키 미재사용. 보존 키는 카운터를 그 번호 이상으로 앞당긴다
  data.issueCounters[project.id] = Math.max(data.issueCounters[project.id] ?? 0, seq);
  const now = new Date().toISOString();
  const maxOrder = data.issues
    .filter((i) => i.projectId === project.id)
    .reduce((max, i) => Math.max(max, i.order), 0);
  const issue: Issue = {
    id: nextId(),
    key: `${project.key}-${seq}`,
    projectId: project.id,
    title,
    description: input.description ?? "",
    type: resolvedType,
    // 기본 상태 = 그 타입 워크플로(없으면 프로젝트)의 첫 '할 일' 의미 상태. 트리아지는 항상 첫 '할 일'
    status: toTriage
      ? defaultStatusFor(data, project.id, resolvedType)
      : (input.status ?? defaultStatusFor(data, project.id, resolvedType)),
    priority: resolvePriority(data, project.id, input.priority),
    assigneeId: input.assigneeId ?? resolveDefaultAssigneeFor(data, project, componentIdsForCreate),
    reporterId: CURRENT_USER_ID,
    // 대기열 이슈는 스프린트에 들어가지 않는다
    sprintId: toTriage ? null : (input.sprintId ?? null),
    parentId: null, // 계층 검증 후 아래에서 지정
    dueDate: input.dueDate ?? null,
    estimateHours: input.estimateHours ?? null,
    resolution: null,
    resolvedAt: null,
    fixVersionId: input.fixVersionId ?? null,
    labels: input.labels ?? [],
    componentIds: componentIdsForCreate,
    startDate: input.startDate ?? null,
    storyPoints: input.storyPoints ?? null,
    flagged: false,
    triageState: null,
    order: maxOrder + 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  if (input.parentId) {
    assertParentAllowed(data, issue, input.parentId);
    issue.parentId = input.parentId;
  }
  applyResolutionRule(data, issue, "todo", undefined);
  data.issues.push(issue);
  // 보고자(생성자)와 담당자는 자동 워처 — 지라 기본 동작
  if (preferencesOf(data, CURRENT_USER_ID).autoWatch.created) addWatcher(data, issue.id, CURRENT_USER_ID, now);
  if (issue.assigneeId) addWatcher(data, issue.id, issue.assigneeId, now);
  data.activities.push({
    id: nextId(),
    issueId: issue.id,
    actorId: CURRENT_USER_ID,
    type: "created",
    detail: "이슈 생성",
    at: now,
  });
  logChange(data, issue, "status", null, issue.status, now);
  if (issue.sprintId !== null) logChange(data, issue, "sprint", null, issue.sprintId, now);
  if (toTriage) enterTriage(data, issue, external ? "EXTERNAL" : "MANUAL", now);
  persist();
  await emitIssueEvent(issue.id, null);
  return clone(load().issues.find((i) => i.id === issue.id) ?? issue);
}

export async function updateIssue(
  id: string,
  patch: Partial<
    Pick<
      Issue,
      | "title"
      | "description"
      | "type"
      | "status"
      | "priority"
      | "assigneeId"
      | "sprintId"
      | "dueDate"
      | "labels"
      | "componentIds"
      | "estimateHours"
      | "resolution"
      | "fixVersionId"
      | "startDate"
      | "storyPoints"
    >
  >,
  expectedVersion: number,
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  assertIssueVersion(issue, expectedVersion);
  assertPlanning(
    patch.startDate === undefined ? issue.startDate : patch.startDate,
    patch.storyPoints === undefined ? issue.storyPoints : patch.storyPoints,
    patch.dueDate === undefined ? issue.dueDate : patch.dueDate,
  );
  // 추정 척도(V39) — 포인트가 **바뀔 때만** 본다(척도를 바꿔도 손대지 않은 옛 값은 그대로 저장된다)
  if (patch.storyPoints !== undefined && patch.storyPoints !== issue.storyPoints) {
    assertPointsInScale(data, issue.projectId, patch.storyPoints);
  }
  if (patch.estimateHours !== undefined && patch.estimateHours !== null && !(patch.estimateHours > 0)) {
    throw new Error("예상 시간은 0보다 커야 합니다");
  }
  assertCanEdit(data, issue.projectId);
  if (patch.fixVersionId !== undefined && patch.fixVersionId !== null) {
    assertVersionAssignable(data, patch.fixVersionId, issue.projectId);
  }
  const nextType = patch.type ?? issue.type;
  const flow = workflowFor(data, issue.projectId, nextType);
  const inFlow = flow.statuses.some((s) => s.id === issue.status);
  const requested = patch.status ?? issue.status;
  let nextStatus = requested;
  let used: EvaluatedTransition | null = null;
  if (!inFlow && requested === issue.status) {
    // 타입을 바꿨더니 새 타입 워크플로(C5)에 지금 상태가 없다 — 설정 변경 이관과 같은 규칙(전환 규칙 없음)
    nextStatus = mappedStatus(data, issue.projectId, issue.status, flow.statuses);
  } else if (patch.status !== undefined) {
    if (patch.status !== issue.status) assertNotInTriage(issue);
    assertStatusInWorkflow(data, issue.projectId, nextType, patch.status);
    // 전환 규칙(조건 포함)은 지금 상태가 그 워크플로 안에 있을 때만 — 밖이면 타입 변경에 따른 이관이다
    if (patch.status !== issue.status && inFlow) used = chooseTransition(data, issue, flow, patch.status);
  }
  const before = { ...issue, labels: [...issue.labels] };
  const automationBefore = snapshotForAutomation(issue);
  // 타입 전환 — 프로젝트 설정(enabledTypes) 검증. 계층은 타입과 무관하므로 부모·자식은 그대로 둔다
  if (patch.type !== undefined && patch.type !== issue.type) {
    // 프로젝트 설정(enabledTypes) 검증 — subtask는 계층 기능이라 예외
    const entry = data.projectSettings.find((e) => e.projectId === issue.projectId);
    const enabled =
      entry?.custom?.enabledTypes ??
      data.schemes.find((s) => s.id === entry?.schemeId)?.body.enabledTypes ??
      defaultSettingsBody().enabledTypes;
    if (!typeDefOf(data, patch.type)) throw new Error(`없는 이슈 타입입니다: ${patch.type}`);
    const nextLevel = typeLevelOf(data, patch.type);
    if (nextLevel !== "subtask" && !enabled.includes(patch.type)) {
      throw new Error(`이 프로젝트에서 사용할 수 없는 타입입니다: ${typeNameOf(data, patch.type)}`);
    }
  }
  const { resolution: requestedResolution, ...rest } = patch;
  if (rest.priority !== undefined) rest.priority = resolvePriority(data, issue.projectId, rest.priority);
  if (rest.componentIds !== undefined) rest.componentIds = validateComponentIds(data, issue.projectId, rest.componentIds);
  // 해결(A1, 서버 정본과 같은 판정): 화면이 들고 있던 값을 다시 보내므로 **현재 값과 다를 때만** 지정으로 본다
  const explicitResolution =
    requestedResolution !== undefined && requestedResolution !== before.resolution ? requestedResolution : undefined;
  // 검증 실패 시 아무것도 남지 않게 작업 사본에 먼저 반영한다
  const draft: Issue = {
    ...issue,
    ...rest,
    labels: rest.labels ? [...rest.labels] : [...issue.labels],
    status: nextStatus,
  };
  applyResolutionRule(data, draft, before.status, explicitResolution, defaultResolution(used));
  // 전환 검증은 요청 값을 반영한 뒤, 후처리는 검증 뒤(지라와 같은 순서)
  assertValidators(used, draft);
  applyPostFunctions(used, draft);
  Object.assign(issue, draft);
  if (patch.type !== undefined && issue.parentId !== null) {
    try {
      assertParentAllowed(data, issue, issue.parentId);
    } catch {
      // 새 타입과 기존 부모가 양립 불가 → 부모 자동 해제 (활동로그)
      const parentKey = data.issues.find((i) => i.id === issue.parentId)?.key ?? "없음";
      issue.parentId = null;
      data.activities.push({
        id: nextId(),
        issueId: issue.id,
        actorId: CURRENT_USER_ID,
        type: "parent",
        detail: `${parentKey} → 없음`,
        at: new Date().toISOString(),
      });
    }
  }
  // 상태/스프린트가 바뀌면 대상 그룹(같은 프로젝트·스프린트·상태) 맨 뒤로 order 재부여
  // (moveIssue는 beforeId로 정밀 배치, updateIssue는 항상 맨 뒤 — W2 인계)
  if (before.status !== issue.status || before.sprintId !== issue.sprintId) {
    const maxOrder = data.issues
      .filter(
        (i) =>
          i.id !== id &&
          i.projectId === issue.projectId &&
          i.sprintId === issue.sprintId &&
          i.status === issue.status,
      )
      .reduce((max, i) => Math.max(max, i.order), 0);
    issue.order = maxOrder + 1;
  }
  issue.version += 1;
  issue.updatedAt = new Date().toISOString();
  recordChanges(data, before, issue, issue.updatedAt);
  persist();
  await emitIssueEvent(issue.id, automationBefore, used?.transition ? used.id : null);
  return clone(load().issues.find((i) => i.id === id) ?? issue);
}

/** 서버 PUT과 같은 낙관적 락 — 편집을 시작할 때 본 버전이 아니면 409로 막는다(남의 저장을 덮지 않는다) */
export const ISSUE_CONFLICT_MESSAGE = "다른 사용자가 먼저 이 이슈를 수정했습니다";

/** 프로젝트·스프린트 편집 충돌(409) — 서버 문구와 같은 뜻 */
export const STALE_EDIT_MESSAGE = "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.";

export function assertIssueVersion(issue: Issue, expectedVersion: number): void {
  if (issue.version !== expectedVersion) throw new ApiError(409, ISSUE_CONFLICT_MESSAGE);
}

export async function moveIssue(
  id: string,
  to: { status: string; beforeId?: string },
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  assertCanEdit(data, issue.projectId);
  if (to.status !== issue.status) assertNotInTriage(issue);
  assertStatusInWorkflow(data, issue.projectId, issue.type, to.status);
  const flow = workflowFor(data, issue.projectId, issue.type);
  // 같은 열 안 순서 변경은 전환이 아니다. 지금 상태가 워크플로 밖(옛 데이터)이면 규칙 없이 옮긴다(이관)
  const used =
    to.status === issue.status || !flow.statuses.some((s) => s.id === issue.status)
      ? null
      : chooseTransition(data, issue, flow, to.status);
  const before = { ...issue };
  const automationBefore = snapshotForAutomation(issue);
  const draft: Issue = { ...issue, labels: [...issue.labels], status: to.status };
  // 해결(A1): 보드 이동은 해결을 지정하지 않는다 — 완료로 들어가면 기본값, 나가면 비움
  applyResolutionRule(data, draft, before.status, undefined, defaultResolution(used));
  assertValidators(used, draft);
  // 후처리가 담당자를 바꾸면 편집 폼이 보는 값이 바뀐 것이라 버전을 올린다
  if (applyPostFunctions(used, draft)) draft.version += 1;
  Object.assign(issue, draft);
  // 대상 컬럼: 같은 프로젝트·같은 스프린트·대상 상태 (이동 이슈 제외, order 순)
  const column = data.issues
    .filter(
      (i) =>
        i.id !== id &&
        i.projectId === issue.projectId &&
        i.sprintId === issue.sprintId &&
        i.status === to.status,
    )
    .sort((a, b) => a.order - b.order);
  const insertAt = to.beforeId ? column.findIndex((i) => i.id === to.beforeId) : -1;
  // beforeId가 대상 컬럼에 없으면(드래그 중 다른 곳에서 옮겨진 stale 참조 등) 조용히 맨 끝에
  // 추가한다 — 의도된 동작. 화면은 이동 후 항상 재조회하므로 최종 상태는 일관된다. (W1 리뷰 인계)
  if (insertAt === -1) column.push(issue);
  else column.splice(insertAt, 0, issue);
  column.forEach((entry, index) => {
    entry.order = index + 1; // 컬럼 전체 order 재계산 (1부터)
  });
  issue.updatedAt = new Date().toISOString();
  recordChanges(data, before, issue, issue.updatedAt);
  persist();
  await emitIssueEvent(issue.id, automationBefore, used?.transition ? used.id : null);
  return clone(load().issues.find((i) => i.id === id) ?? issue);
}
