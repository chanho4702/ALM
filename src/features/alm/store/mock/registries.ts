// localStorage 목업 스토어 — registries (jiraMock.ts에서 분할, 동작 불변)
import type { StatusCategory, StatusKind, StatusColor, StatusDef, IssueTypeDef, IssueTypeLevel, PriorityDef, SettingsBody, LinkTypeDef } from "../types";
import { notifyIssueTypesChanged, notifyPrioritiesChanged, notifyLinkTypesChanged } from "../shared";
import { clone, load, nextId, persist, allBodies, bodyCoversAllKinds, defaultSettingsBody } from "./db";
import { isSymmetric } from "./rules";

// ── 상태 카테고리 · 상태 레지스트리 (전역) ───────────────────

export async function listStatusCategories(): Promise<StatusCategory[]> {
  return clone([...load().statusCategories].sort((a, b) => a.order - b.order));
}

export async function createStatusCategory(input: {
  name: string;
  kind: StatusKind;
  color: StatusColor;
}): Promise<StatusCategory> {
  const data = load();
  const name = input.name.trim();
  if (!name) throw new Error("카테고리 이름을 입력하세요");
  if (data.statusCategories.some((c) => c.name === name)) {
    throw new Error(`카테고리 이름이 중복됩니다: ${name}`);
  }
  const category: StatusCategory = {
    id: `cat-${nextId().slice(0, 8)}`,
    name,
    kind: input.kind,
    color: input.color,
    order: data.statusCategories.length + 1,
    builtIn: false,
  };
  data.statusCategories.push(category);
  persist();
  return clone(category);
}

export async function updateStatusCategory(
  id: string,
  patch: Partial<Pick<StatusCategory, "name" | "kind" | "color">>,
): Promise<StatusCategory> {
  const data = load();
  const category = data.statusCategories.find((c) => c.id === id);
  if (!category) throw new Error("카테고리를 찾을 수 없습니다");
  if (patch.kind !== undefined && patch.kind !== category.kind) {
    if (category.builtIn) throw new Error("기본 카테고리의 의미는 바꿀 수 없습니다");
    // 의미를 바꾸면 이 카테고리의 상태를 쓰는 워크플로가 어떤 의미를 잃을 수 있다
    const previous = category.kind;
    category.kind = patch.kind;
    const affected = new Set(data.statusDefs.filter((d) => d.categoryId === id).map((d) => d.id));
    const broken = allBodies(data).some(
      (body) => body.statuses.some((s) => affected.has(s.id)) && !bodyCoversAllKinds(data, body),
    );
    if (broken) {
      category.kind = previous;
      throw new Error("이 카테고리를 쓰는 워크플로에서 의미(할 일/진행 중/완료)가 비게 됩니다");
    }
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("카테고리 이름을 입력하세요");
    if (data.statusCategories.some((c) => c.id !== id && c.name === name)) {
      throw new Error(`카테고리 이름이 중복됩니다: ${name}`);
    }
    category.name = name;
  }
  if (patch.color !== undefined) category.color = patch.color;
  persist();
  return clone(category);
}

/** 순서 한 칸 이동 — order는 1부터 재부여 */
export async function moveStatusCategory(id: string, delta: -1 | 1): Promise<void> {
  const data = load();
  const sorted = [...data.statusCategories].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((c) => c.id === id);
  if (index < 0) throw new Error("카테고리를 찾을 수 없습니다");
  const target = index + delta;
  if (target < 0 || target >= sorted.length) return;
  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  sorted.forEach((c, i) => {
    c.order = i + 1;
  });
  persist();
}

export async function deleteStatusCategory(id: string): Promise<void> {
  const data = load();
  const category = data.statusCategories.find((c) => c.id === id);
  if (!category) throw new Error("카테고리를 찾을 수 없습니다");
  if (category.builtIn) throw new Error("기본 카테고리는 삭제할 수 없습니다");
  if (data.statusDefs.some((d) => d.categoryId === id)) {
    throw new Error("이 카테고리를 쓰는 상태가 있습니다");
  }
  data.statusCategories = data.statusCategories.filter((c) => c.id !== id);
  [...data.statusCategories]
    .sort((a, b) => a.order - b.order)
    .forEach((c, i) => {
      c.order = i + 1;
    });
  persist();
}

export async function listStatusDefs(): Promise<StatusDef[]> {
  return clone(load().statusDefs);
}

/** 상태 id → 쓰는 워크플로(스킴+커스텀) 수 */
export async function statusDefUsage(): Promise<Record<string, number>> {
  const data = load();
  const usage: Record<string, number> = {};
  for (const def of data.statusDefs) usage[def.id] = 0;
  for (const body of allBodies(data)) {
    for (const status of body.statuses) usage[status.id] = (usage[status.id] ?? 0) + 1;
  }
  return usage;
}

export async function createStatusDef(input: {
  name: string;
  categoryId: string;
  description?: string;
  /** lucide 아이콘 키. 생략·빈 문자열이면 화면이 카테고리 의미의 기본 아이콘으로 그린다 */
  icon?: string;
}): Promise<StatusDef> {
  const data = load();
  const name = input.name.trim();
  if (!name) throw new Error("상태 이름을 입력하세요");
  if (data.statusDefs.some((d) => d.name === name)) {
    throw new Error(`상태 이름이 중복됩니다: ${name}`);
  }
  if (!data.statusCategories.some((c) => c.id === input.categoryId)) {
    throw new Error("카테고리를 찾을 수 없습니다");
  }
  const def: StatusDef = {
    id: `st-${nextId().slice(0, 8)}`,
    name,
    categoryId: input.categoryId,
    description: input.description?.trim() ?? "",
    icon: input.icon?.trim() ?? "",
  };
  data.statusDefs.push(def);
  persist();
  return clone(def);
}

/** 이름·카테고리 변경은 쓰는 곳 전부에 즉시 반영된다 (저장된 캐시도 함께 맞춘다) */
export async function updateStatusDef(
  id: string,
  patch: Partial<Pick<StatusDef, "name" | "categoryId" | "description" | "icon">>,
): Promise<StatusDef> {
  const data = load();
  const def = data.statusDefs.find((d) => d.id === id);
  if (!def) throw new Error("상태를 찾을 수 없습니다");
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("상태 이름을 입력하세요");
    if (data.statusDefs.some((d) => d.id !== id && d.name === name)) {
      throw new Error(`상태 이름이 중복됩니다: ${name}`);
    }
    def.name = name;
  }
  if (patch.categoryId !== undefined && patch.categoryId !== def.categoryId) {
    if (!data.statusCategories.some((c) => c.id === patch.categoryId)) {
      throw new Error("카테고리를 찾을 수 없습니다");
    }
    const previous = def.categoryId;
    def.categoryId = patch.categoryId;
    const broken = allBodies(data).some(
      (body) => body.statuses.some((s) => s.id === id) && !bodyCoversAllKinds(data, body),
    );
    if (broken) {
      def.categoryId = previous;
      throw new Error("이 상태를 쓰는 워크플로에서 의미(할 일/진행 중/완료)가 비게 됩니다");
    }
  }
  if (patch.description !== undefined) def.description = patch.description.trim();
  if (patch.icon !== undefined) def.icon = patch.icon.trim();
  for (const body of allBodies(data)) {
    for (const status of body.statuses) {
      if (status.id !== id) continue;
      status.name = def.name;
      status.category = def.categoryId;
    }
  }
  persist();
  return clone(def);
}

export async function deleteStatusDef(id: string): Promise<void> {
  const data = load();
  if (!data.statusDefs.some((d) => d.id === id)) throw new Error("상태를 찾을 수 없습니다");
  if (allBodies(data).some((body) => body.statuses.some((s) => s.id === id))) {
    throw new Error("워크플로에서 쓰는 상태는 삭제할 수 없습니다");
  }
  data.statusDefs = data.statusDefs.filter((d) => d.id !== id);
  persist();
}

// ── 이슈 타입 레지스트리 (전역) ───────────────────────────────

export async function listIssueTypes(): Promise<IssueTypeDef[]> {
  return clone([...load().issueTypes].sort((a, b) => a.order - b.order));
}

/** 타입 id → 쓰는 이슈 수 */
export async function issueTypeUsage(): Promise<Record<string, number>> {
  const data = load();
  const usage: Record<string, number> = {};
  for (const type of data.issueTypes) usage[type.id] = 0;
  for (const issue of data.issues) usage[issue.type] = (usage[issue.type] ?? 0) + 1;
  return usage;
}

export async function createIssueType(input: {
  name: string;
  level: IssueTypeLevel;
  icon: string;
  color: IssueTypeDef["color"];
  description?: string;
}): Promise<IssueTypeDef> {
  const data = load();
  const name = input.name.trim();
  if (!name) throw new Error("이슈 타입 이름을 입력하세요");
  if (data.issueTypes.some((t) => t.name === name)) {
    throw new Error(`이슈 타입 이름이 중복됩니다: ${name}`);
  }
  const def: IssueTypeDef = {
    id: `it-${nextId().slice(0, 8)}`,
    name,
    icon: input.icon,
    color: input.color,
    level: input.level,
    description: input.description?.trim() ?? "",
    order: data.issueTypes.length + 1,
    builtIn: false,
  };
  data.issueTypes.push(def);
  persist();
  notifyIssueTypesChanged();
  return clone(def);
}

export async function updateIssueType(
  id: string,
  patch: Partial<Pick<IssueTypeDef, "name" | "icon" | "color" | "level" | "description">>,
): Promise<IssueTypeDef> {
  const data = load();
  const def = data.issueTypes.find((t) => t.id === id);
  if (!def) throw new Error("이슈 타입을 찾을 수 없습니다");
  if (patch.level !== undefined && patch.level !== def.level) {
    if (def.builtIn) throw new Error("기본 이슈 타입의 계층은 바꿀 수 없습니다");
    // 계층은 부모-자식 규칙의 근거 — 쓰는 이슈가 있으면 기존 계층이 깨진다
    if (data.issues.some((i) => i.type === id)) {
      throw new Error("이 타입을 쓰는 이슈가 있어 계층을 바꿀 수 없습니다");
    }
    def.level = patch.level;
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("이슈 타입 이름을 입력하세요");
    if (data.issueTypes.some((t) => t.id !== id && t.name === name)) {
      throw new Error(`이슈 타입 이름이 중복됩니다: ${name}`);
    }
    def.name = name;
  }
  if (patch.icon !== undefined) def.icon = patch.icon;
  if (patch.color !== undefined) def.color = patch.color;
  if (patch.description !== undefined) def.description = patch.description.trim();
  persist();
  notifyIssueTypesChanged();
  return clone(def);
}

export async function moveIssueType(id: string, delta: -1 | 1): Promise<void> {
  const data = load();
  const sorted = [...data.issueTypes].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((t) => t.id === id);
  if (index < 0) throw new Error("이슈 타입을 찾을 수 없습니다");
  const target = index + delta;
  if (target < 0 || target >= sorted.length) return;
  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  sorted.forEach((t, i) => {
    t.order = i + 1;
  });
  persist();
  notifyIssueTypesChanged();
}

/** 삭제 — 쓰는 이슈가 없어야 하고, 스킴/커스텀의 활성 목록에서도 함께 빠진다 */
export async function deleteIssueType(id: string): Promise<void> {
  const data = load();
  const def = data.issueTypes.find((t) => t.id === id);
  if (!def) throw new Error("이슈 타입을 찾을 수 없습니다");
  if (def.builtIn) throw new Error("기본 이슈 타입은 삭제할 수 없습니다");
  if (data.issues.some((i) => i.type === id)) throw new Error("이 타입을 쓰는 이슈가 있습니다");
  data.issueTypes = data.issueTypes.filter((t) => t.id !== id);
  [...data.issueTypes]
    .sort((a, b) => a.order - b.order)
    .forEach((t, i) => {
      t.order = i + 1;
    });
  for (const body of allBodies(data)) {
    body.enabledTypes = body.enabledTypes.filter((t) => t !== id);
    // 그 타입의 필드 덮어쓰기도 함께 사라진다 — 남으면 저장할 때마다 "없는 이슈 타입" 400이 된다.
    // 비활성화만 한 타입의 덮어쓰기는 건드리지 않는다(다시 켜면 살아난다 — 서버와 같다)
    if (body.fieldsByType) delete body.fieldsByType[id];
  }
  persist();
  notifyIssueTypesChanged();
}

// ── boards ───────────────────────────────────────────────────

/** 기본 보드 우선, 이후 생성순 */
// ── 우선순위 레지스트리 (전역 관리 > 우선순위) ──────────────────────

export async function listPriorities(): Promise<PriorityDef[]> {
  return clone([...load().priorities].sort((a, b) => a.order - b.order));
}

export async function priorityUsage(): Promise<Record<string, number>> {
  const data = load();
  return Object.fromEntries(
    data.priorities.map((p) => [p.id, data.issues.filter((i) => i.priority === p.id).length]),
  );
}

export async function createPriority(input: {
  name: string;
  icon: string;
  color: PriorityDef["color"];
  description?: string;
}): Promise<PriorityDef> {
  const data = load();
  const name = input.name.trim();
  if (!name) throw new Error("우선순위 이름을 입력하세요");
  if (data.priorities.some((p) => p.name === name)) throw new Error(`우선순위 이름이 중복됩니다: ${name}`);
  if (!input.icon) throw new Error("아이콘을 고르세요");
  const def: PriorityDef = {
    id: `pr-${nextId()}`,
    name,
    icon: input.icon,
    color: input.color,
    description: input.description?.trim() ?? "",
    order: data.priorities.length + 1,
    builtIn: false,
  };
  data.priorities.push(def);
  persist();
  notifyPrioritiesChanged();
  return clone(def);
}

export async function updatePriority(
  id: string,
  patch: Partial<Pick<PriorityDef, "name" | "icon" | "color" | "description">>,
): Promise<PriorityDef> {
  const data = load();
  const def = data.priorities.find((p) => p.id === id);
  if (!def) throw new Error("우선순위를 찾을 수 없습니다");
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("우선순위 이름을 입력하세요");
    if (data.priorities.some((p) => p.id !== id && p.name === name)) {
      throw new Error(`우선순위 이름이 중복됩니다: ${name}`);
    }
    def.name = name;
  }
  if (patch.icon !== undefined) def.icon = patch.icon;
  if (patch.color !== undefined) def.color = patch.color;
  if (patch.description !== undefined) def.description = patch.description.trim();
  persist();
  notifyPrioritiesChanged();
  return clone(def);
}

export async function movePriority(id: string, delta: -1 | 1): Promise<void> {
  const data = load();
  const sorted = [...data.priorities].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((p) => p.id === id);
  if (index < 0) throw new Error("우선순위를 찾을 수 없습니다");
  const target = index + delta;
  if (target < 0 || target >= sorted.length) return;
  const a = sorted[index];
  const b = sorted[target];
  [a.order, b.order] = [b.order, a.order];
  persist();
  notifyPrioritiesChanged();
}

export async function deletePriority(id: string): Promise<void> {
  const data = load();
  const def = data.priorities.find((p) => p.id === id);
  if (!def) throw new Error("우선순위를 찾을 수 없습니다");
  if (def.builtIn) throw new Error("기본 우선순위는 삭제할 수 없습니다");
  if (data.issues.some((i) => i.priority === id)) throw new Error("이 우선순위를 쓰는 이슈가 있습니다");
  data.priorities = data.priorities.filter((p) => p.id !== id);
  // 모든 본문의 활성 목록에서 빼고, 기본값이었다면 보통(없으면 첫 항목)으로
  const fix = (body: SettingsBody) => {
    body.enabledPriorities = (body.enabledPriorities ?? defaultSettingsBody().enabledPriorities).filter((p) => p !== id);
    if (body.defaultPriority === id) {
      body.defaultPriority = body.enabledPriorities.includes("medium") ? "medium" : (body.enabledPriorities[0] ?? "medium");
    }
  };
  for (const scheme of data.schemes) fix(scheme.body);
  for (const entry of data.projectSettings) if (entry.custom) fix(entry.custom);
  [...data.priorities].sort((a, b) => a.order - b.order).forEach((p, i) => (p.order = i + 1));
  persist();
  notifyPrioritiesChanged();
}

// ── 링크 타입 레지스트리 (전역 관리 > 링크 타입) ──────────────────────

export async function listLinkTypes(): Promise<LinkTypeDef[]> {
  return clone([...load().linkTypes].sort((a, b) => a.order - b.order));
}

export async function linkTypeUsage(): Promise<Record<string, number>> {
  const data = load();
  return Object.fromEntries(data.linkTypes.map((t) => [t.id, data.links.filter((l) => l.type === t.id).length]));
}

function requireLabel(value: string | undefined, message: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new Error(message);
  return trimmed;
}

export async function createLinkType(input: { name: string; outward: string; inward: string }): Promise<LinkTypeDef> {
  const data = load();
  const name = requireLabel(input.name, "링크 타입 이름을 입력하세요");
  if (data.linkTypes.some((t) => t.name === name)) throw new Error(`링크 타입 이름이 중복됩니다: ${name}`);
  const def: LinkTypeDef = {
    id: `lt-${nextId()}`,
    name,
    outward: requireLabel(input.outward, "나가는 문구(예: 차단함)를 입력하세요"),
    inward: requireLabel(input.inward, "들어오는 문구(예: 차단됨)를 입력하세요"),
    order: data.linkTypes.length + 1,
    builtIn: false,
  };
  data.linkTypes.push(def);
  persist();
  notifyLinkTypesChanged();
  return clone(def);
}

export async function updateLinkType(
  id: string,
  patch: Partial<Pick<LinkTypeDef, "name" | "outward" | "inward">>,
): Promise<LinkTypeDef> {
  const data = load();
  const def = data.linkTypes.find((t) => t.id === id);
  if (!def) throw new Error("링크 타입을 찾을 수 없습니다");
  if (patch.name !== undefined) {
    const name = requireLabel(patch.name, "링크 타입 이름을 입력하세요");
    if (data.linkTypes.some((t) => t.id !== id && t.name === name)) throw new Error(`링크 타입 이름이 중복됩니다: ${name}`);
    def.name = name;
  }
  const outward = patch.outward === undefined ? undefined : requireLabel(patch.outward, "나가는 문구(예: 차단함)를 입력하세요");
  const inward = patch.inward === undefined ? undefined : requireLabel(patch.inward, "들어오는 문구(예: 차단됨)를 입력하세요");
  if ((outward !== undefined || inward !== undefined) && data.links.some((l) => l.type === id)) {
    const nextOut = outward ?? def.outward;
    const nextIn = inward ?? def.inward;
    if (isSymmetric(def) !== (nextOut === nextIn)) {
      throw new Error("이 타입을 쓰는 링크가 있어 방향성(대칭 여부)을 바꿀 수 없습니다");
    }
  }
  if (outward !== undefined) def.outward = outward;
  if (inward !== undefined) def.inward = inward;
  persist();
  notifyLinkTypesChanged();
  return clone(def);
}

export async function moveLinkType(id: string, delta: -1 | 1): Promise<void> {
  const data = load();
  const sorted = [...data.linkTypes].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((t) => t.id === id);
  if (index < 0) throw new Error("링크 타입을 찾을 수 없습니다");
  const target = index + delta;
  if (target < 0 || target >= sorted.length) return;
  const a = sorted[index];
  const b = sorted[target];
  [a.order, b.order] = [b.order, a.order];
  persist();
  notifyLinkTypesChanged();
}

export async function deleteLinkType(id: string): Promise<void> {
  const data = load();
  const def = data.linkTypes.find((t) => t.id === id);
  if (!def) throw new Error("링크 타입을 찾을 수 없습니다");
  if (def.builtIn) throw new Error("기본 링크 타입은 삭제할 수 없습니다");
  if (data.links.some((l) => l.type === id)) throw new Error("이 타입을 쓰는 링크가 있습니다");
  data.linkTypes = data.linkTypes.filter((t) => t.id !== id);
  [...data.linkTypes].sort((a, b) => a.order - b.order).forEach((t, i) => (t.order = i + 1));
  persist();
  notifyLinkTypesChanged();
}
