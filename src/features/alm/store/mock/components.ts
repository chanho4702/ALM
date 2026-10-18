// localStorage 목업 스토어 — components (jiraMock.ts에서 분할, 동작 불변)
import type { ComponentDefaultAssignee, JiraData, Project, Component } from "../types";
import { load, clone, nextId, persist } from "./db";
import { assertCanAdmin } from "./members";

// ── 컴포넌트 (지라 Components) ──────────────────────────────

const COMPONENT_ASSIGNEE_RULES: ComponentDefaultAssignee[] = ["project", "lead", "unassigned"];

/** 이슈에 붙일 컴포넌트 검증 — 같은 프로젝트, 순서 유지·중복 제거 */
export function validateComponentIds(data: JiraData, projectId: string, ids: string[] | undefined): string[] {
  const result: string[] = [];
  for (const id of ids ?? []) {
    if (result.includes(id)) continue;
    const component = data.components.find((c) => c.id === id);
    if (!component) throw new Error("컴포넌트를 찾을 수 없습니다");
    if (component.projectId !== projectId) throw new Error(`다른 프로젝트의 컴포넌트입니다: ${component.name}`);
    result.push(id);
  }
  return result;
}

/** 담당자 없이 만든 이슈의 담당자 — 첫 컴포넌트의 규칙이 프로젝트 규칙보다 우선한다(지라) */
export function resolveDefaultAssigneeFor(data: JiraData, project: Project, componentIds: string[]): string | null {
  for (const id of componentIds) {
    const component = data.components.find((c) => c.id === id);
    if (!component) continue;
    if (component.defaultAssignee === "unassigned") return null;
    if (component.defaultAssignee === "lead" && component.leadId) return component.leadId;
  }
  return project.defaultAssignee === "lead" ? project.leadId : null;
}

function componentWithCount(data: JiraData, component: Component): Component {
  return {
    ...component,
    issueCount: data.issues.filter((i) => (i.componentIds ?? []).includes(component.id)).length,
  };
}

export async function listComponents(projectId: string): Promise<Component[]> {
  const data = load();
  return clone(
    data.components
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => componentWithCount(data, c)),
  );
}

function requireComponentName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) throw new Error("컴포넌트 이름을 입력하세요");
  if (trimmed.length > 80) throw new Error("컴포넌트 이름은 80자 이하여야 합니다");
  return trimmed;
}

function requireAssigneeRule(rule: string | undefined): ComponentDefaultAssignee {
  if (!rule) return "project";
  if (!COMPONENT_ASSIGNEE_RULES.includes(rule as ComponentDefaultAssignee)) {
    throw new Error("기본 담당자는 project/lead/unassigned 중 하나입니다");
  }
  return rule as ComponentDefaultAssignee;
}

export async function createComponent(
  projectId: string,
  input: { name: string; description?: string; leadId?: string | null; defaultAssignee?: ComponentDefaultAssignee },
): Promise<Component> {
  const data = load();
  if (!data.projects.some((p) => p.id === projectId)) throw new Error("프로젝트를 찾을 수 없습니다");
  assertCanAdmin(data, projectId);
  const name = requireComponentName(input.name);
  if (data.components.some((c) => c.projectId === projectId && c.name === name)) {
    throw new Error(`컴포넌트 이름이 중복됩니다: ${name}`);
  }
  const component: Component = {
    id: `c-${nextId()}`,
    projectId,
    name,
    description: input.description?.trim() ?? "",
    leadId: input.leadId ?? null,
    defaultAssignee: requireAssigneeRule(input.defaultAssignee),
    issueCount: 0,
    createdAt: new Date().toISOString(),
  };
  data.components.push(component);
  persist();
  return clone(component);
}

export async function updateComponent(
  id: string,
  patch: Partial<Pick<Component, "name" | "description" | "leadId" | "defaultAssignee">>,
): Promise<Component> {
  const data = load();
  const component = data.components.find((c) => c.id === id);
  if (!component) throw new Error("컴포넌트를 찾을 수 없습니다");
  assertCanAdmin(data, component.projectId);
  if (patch.name !== undefined) {
    const name = requireComponentName(patch.name);
    if (data.components.some((c) => c.id !== id && c.projectId === component.projectId && c.name === name)) {
      throw new Error(`컴포넌트 이름이 중복됩니다: ${name}`);
    }
    component.name = name;
  }
  if (patch.description !== undefined) component.description = patch.description.trim();
  if (patch.leadId !== undefined) component.leadId = patch.leadId;
  if (patch.defaultAssignee !== undefined) component.defaultAssignee = requireAssigneeRule(patch.defaultAssignee);
  persist();
  return clone(componentWithCount(data, component));
}

/** 지우면 이슈에서 떨어진다 */
export async function deleteComponent(id: string): Promise<void> {
  const data = load();
  const component = data.components.find((c) => c.id === id);
  if (!component) throw new Error("컴포넌트를 찾을 수 없습니다");
  assertCanAdmin(data, component.projectId);
  data.components = data.components.filter((c) => c.id !== id);
  for (const issue of [...data.issues, ...data.archivedIssues]) {
    if (issue.componentIds?.includes(id)) issue.componentIds = issue.componentIds.filter((c) => c !== id);
  }
  persist();
}
