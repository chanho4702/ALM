// localStorage 목업 스토어 — relations (jiraMock.ts에서 분할, 동작 불변)
import type { Issue, IssueLinkType, IssueLink } from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { MAX_SEARCH_PAGE_SIZE } from "../issueSearch";
import { load, clone, nextId, persist } from "./db";
import { assertIssueVersion } from "./issues";
import { assertParentAllowed, linkTypeDefOf, isSymmetric, recordChanges } from "./rules";
import type { IssuePage } from "./search";
import { assertCanEdit } from "./members";

// ── issue relations (parent / links) ─────────────────────────

/** 부모 지정/해제 — 계층 규칙은 assertParentAllowed가 단일 진실 */
/** 서버에서는 PUT(편집)이라 버전을 확인하고 올린다 — 목업도 같다 */
export async function setIssueParent(
  id: string,
  parentId: string | null,
  expectedVersion: number,
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  assertIssueVersion(issue, expectedVersion);
  assertParentAllowed(data, issue, parentId);
  if (issue.parentId === parentId) return clone(issue);
  const keyOf = (pid: string | null) =>
    pid === null ? "없음" : (data.issues.find((i) => i.id === pid)?.key ?? "없음");
  const detail = `${keyOf(issue.parentId)} → ${keyOf(parentId)}`;
  issue.parentId = parentId;
  issue.version += 1;
  issue.updatedAt = new Date().toISOString();
  data.activities.push({
    id: nextId(),
    issueId: issue.id,
    actorId: CURRENT_USER_ID,
    type: "parent",
    detail,
    at: issue.updatedAt,
  });
  persist();
  return clone(issue);
}

/** 상위 항목 경로(루트 먼저) — 계층 깊이 제한이 없어 끝까지 따라가되 순환·끊긴 부모는 거기서 멈춘다 */
export async function listIssueAncestors(issueId: string, parentId?: string | null): Promise<Issue[]> {
  const byId = new Map(load().issues.map((i) => [i.id, i]));
  const ancestors: Issue[] = [];
  const seen = new Set<string>([issueId]);
  let cursor = byId.get((parentId === undefined ? byId.get(issueId)?.parentId : parentId) ?? "");
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    ancestors.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return clone(ancestors);
}

/** 자식 한 페이지(서버와 같은 상한 200건) — `truncated`면 더 있다 */
export async function listChildrenPage(issueId: string): Promise<IssuePage> {
  const all = await listChildren(issueId);
  return {
    items: all.slice(0, MAX_SEARCH_PAGE_SIZE),
    page: 0,
    size: MAX_SEARCH_PAGE_SIZE,
    total: all.length,
    truncated: all.length > MAX_SEARCH_PAGE_SIZE,
  };
}

export async function listChildren(issueId: string): Promise<Issue[]> {
  return clone(
    load()
      .issues.filter((i) => i.parentId === issueId)
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)),
  );
}

export async function addIssueLink(input: {
  sourceId: string;
  targetId: string;
  type: IssueLinkType;
}): Promise<IssueLink> {
  const data = load();
  const source = data.issues.find((i) => i.id === input.sourceId);
  const target = data.issues.find((i) => i.id === input.targetId);
  if (!source || !target) throw new Error("이슈를 찾을 수 없습니다");
  if (source.id === target.id) throw new Error("자기 자신과는 연결할 수 없습니다");
  const def = linkTypeDefOf(data, input.type);
  if (!def) throw new Error(`없는 링크 타입입니다: ${input.type}`);
  const symmetric = isSymmetric(def);
  const duplicate = data.links.some((l) => {
    if (l.type !== input.type) return false;
    if (l.sourceId === input.sourceId && l.targetId === input.targetId) return true;
    // 대칭 타입은 양방향 — 무순서 중복도 막는다
    return symmetric && l.sourceId === input.targetId && l.targetId === input.sourceId;
  });
  if (duplicate) throw new Error("이미 연결돼 있습니다");
  const link: IssueLink = { id: nextId(), ...input };
  data.links.push(link);
  const at = new Date().toISOString();
  const label = def.name;
  for (const [issue, other] of [
    [source, target],
    [target, source],
  ] as const) {
    data.activities.push({
      id: nextId(),
      issueId: issue.id,
      actorId: CURRENT_USER_ID,
      type: "link",
      detail: `${label} 링크: ${other.key}`,
      at,
    });
  }
  persist();
  return clone(link);
}

export async function removeIssueLink(linkId: string): Promise<void> {
  const data = load();
  const index = data.links.findIndex((l) => l.id === linkId);
  if (index === -1) throw new Error("링크를 찾을 수 없습니다");
  data.links.splice(index, 1);
  persist();
}

export interface IssueLinkView {
  link: IssueLink;
  other: Issue;
  /** blocks: outward=차단함, inward=차단됨 / relates: 항상 outward(관련) */
  direction: "outward" | "inward";
  /**
   * 반대편 프로젝트를 볼 수 없다 — `other`는 키·id·타입·상태만 남은 축약본(제목은 "볼 수 없는 이슈", 나머지 비움).
   * 화면은 잠금 표시로 그리고 열지 않는다. 목업은 프로젝트 권한 경계가 없어 늘 false다.
   */
  restricted: boolean;
}

export async function listIssueLinks(issueId: string): Promise<IssueLinkView[]> {
  const data = load();
  const views: IssueLinkView[] = [];
  for (const link of data.links) {
    if (link.sourceId !== issueId && link.targetId !== issueId) continue;
    const otherId = link.sourceId === issueId ? link.targetId : link.sourceId;
    const other = data.issues.find((i) => i.id === otherId);
    if (!other) continue;
    const def = linkTypeDefOf(data, link.type);
    const direction: IssueLinkView["direction"] =
      (def && isSymmetric(def)) || link.sourceId === issueId ? "outward" : "inward";
    views.push({ link: clone(link), other: clone(other), direction, restricted: false });
  }
  return views;
}

/**
 * 백로그/스프린트 랭크 이동 — 대상 그룹(프로젝트+sprintId, 상태 무관)에서
 * beforeId 앞(없으면 맨 뒤)에 놓고 그룹 전체 order를 1..n로 재부여한다.
 * beforeId가 그룹에 없으면(드래그 중 stale 참조) 조용히 맨 뒤 — 화면은 이후 재조회한다.
 */
export async function rankIssue(
  id: string,
  to: { sprintId: string | null; beforeId?: string },
): Promise<Issue> {
  const data = load();
  const issue = data.issues.find((i) => i.id === id);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  assertCanEdit(data, issue.projectId);
  if (to.sprintId !== null && !data.sprints.some((s) => s.id === to.sprintId)) {
    throw new Error("스프린트를 찾을 수 없습니다");
  }
  const before = { ...issue, labels: [...issue.labels] };
  issue.sprintId = to.sprintId;
  const group = data.issues
    .filter((i) => i.id !== id && i.projectId === issue.projectId && i.sprintId === to.sprintId)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  const insertAt = to.beforeId ? group.findIndex((i) => i.id === to.beforeId) : -1;
  if (insertAt === -1) group.push(issue);
  else group.splice(insertAt, 0, issue);
  group.forEach((entry, index) => {
    entry.order = index + 1;
  });
  issue.updatedAt = new Date().toISOString();
  recordChanges(data, before, issue, issue.updatedAt); // sprint 변경 활동로그
  persist();
  return clone(issue);
}
