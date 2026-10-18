// localStorage 목업 스토어 — dashboards (jiraMock.ts에서 분할, 동작 불변)
import type { Dashboard, DashboardGadget, ProjectWorklogRow } from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { clone, load, nextId, persist } from "./db";

// ── 대시보드 (지라 Dashboards) ──────────────────────────────

function requireDashboardName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) throw new Error("대시보드 이름을 입력하세요");
  if (trimmed.length > 120) throw new Error("대시보드 이름은 120자 이하여야 합니다");
  return trimmed;
}

/** 내 것 + 공유된 것, 만든 순 */
export async function listDashboards(): Promise<Dashboard[]> {
  return clone(
    load()
      .dashboards.filter((d) => d.ownerId === CURRENT_USER_ID || d.shared)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export async function getDashboard(id: string): Promise<Dashboard | null> {
  const dashboard = load().dashboards.find((d) => d.id === id);
  if (!dashboard || (!dashboard.shared && dashboard.ownerId !== CURRENT_USER_ID)) return null;
  return clone(dashboard);
}

export async function createDashboard(input: { name: string; shared?: boolean; gadgets?: DashboardGadget[] }): Promise<Dashboard> {
  const data = load();
  const now = new Date().toISOString();
  const dashboard: Dashboard = {
    id: `d-${nextId()}`,
    ownerId: CURRENT_USER_ID,
    name: requireDashboardName(input.name),
    shared: input.shared ?? false,
    gadgets: input.gadgets ? clone(input.gadgets) : [],
    createdAt: now,
    updatedAt: now,
  };
  data.dashboards.push(dashboard);
  persist();
  return clone(dashboard);
}

export async function updateDashboard(
  id: string,
  patch: { name?: string; shared?: boolean; gadgets?: DashboardGadget[] },
): Promise<Dashboard> {
  const data = load();
  const dashboard = data.dashboards.find((d) => d.id === id);
  if (!dashboard) throw new Error("대시보드를 찾을 수 없습니다");
  if (dashboard.ownerId !== CURRENT_USER_ID) throw new Error("본인 대시보드만 수정할 수 있습니다");
  if (patch.name !== undefined) dashboard.name = requireDashboardName(patch.name);
  if (patch.shared !== undefined) dashboard.shared = patch.shared;
  if (patch.gadgets !== undefined) {
    if (patch.gadgets.length > 24) throw new Error("가젯은 최대 24개까지 놓을 수 있습니다");
    dashboard.gadgets = clone(patch.gadgets);
  }
  dashboard.updatedAt = new Date().toISOString();
  persist();
  return clone(dashboard);
}

export async function deleteDashboard(id: string): Promise<void> {
  const data = load();
  const dashboard = data.dashboards.find((d) => d.id === id);
  if (!dashboard) throw new Error("대시보드를 찾을 수 없습니다");
  if (dashboard.ownerId !== CURRENT_USER_ID) throw new Error("본인 대시보드만 수정할 수 있습니다");
  data.dashboards = data.dashboards.filter((d) => d.id !== id);
  persist();
}

/** 프로젝트 워크로그(가젯·리포트) — 활성 이슈의 기록만, 작업일 오름차순 */
export async function listProjectWorklogs(
  projectId: string,
  range: { since?: string; until?: string } = {},
): Promise<ProjectWorklogRow[]> {
  const data = load();
  const keys = new Map(data.issues.filter((i) => i.projectId === projectId).map((i) => [i.id, i.key]));
  return data.worklogs
    .filter((w) => keys.has(w.issueId))
    .filter((w) => (!range.since || w.workedOn >= range.since) && (!range.until || w.workedOn <= range.until))
    .sort((a, b) => a.workedOn.localeCompare(b.workedOn) || a.at.localeCompare(b.at))
    .map((w) => ({
      id: w.id,
      issueId: w.issueId,
      issueKey: keys.get(w.issueId)!,
      authorId: w.authorId,
      hours: w.hours,
      comment: w.comment,
      workedOn: w.workedOn,
    }));
}
