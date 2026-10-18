// localStorage 목업 스토어 — projects (jiraMock.ts에서 분할, 동작 불변)
import type { Project, ProjectDefaultAssignee, JiraData } from "../types";
import { type ProjectTemplateId, getTemplate } from "../projectTemplates";
import { type SeedDemoOptions, seedDemoProject, type SampleDataApi } from "../sampleData";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { ApiError } from "../mapping";
import { clone, load, nextId, defaultBoard, persist } from "./db";
import { createIssue, STALE_EDIT_MESSAGE } from "./issues";
import { listUsers } from "./users";
import { createComponent } from "./components";
import { createVersion, releaseVersion } from "./versions";
import { createSprint, updateSprint, startSprint, completeSprint } from "./sprints";
import { addIssueLink } from "./relations";
import { addComment } from "./collab";
import { addWorklog } from "./worklogs";
import { archiveIssue } from "./archive";
import { createDashboard } from "./dashboards";
import { assertCanAdmin, assertAdminIgnoringArchive } from "./members";

export async function listProjects(): Promise<Project[]> {
  return clone(load().projects);
}

export async function createProject(
  input: {
    key: string;
    name: string;
    description?: string;
    /** 생성 템플릿 — 기본 blank(현행 기본 보드만) */
    templateId?: ProjectTemplateId;
  },
  /** 데모 템플릿 시더의 진행 알림 — 다른 템플릿에서는 불리지 않는다 */
  options: SeedDemoOptions = {},
): Promise<Project> {
  const data = load();
  const key = input.key.trim().toUpperCase();
  const name = input.name.trim();
  if (!key) throw new Error("프로젝트 키를 입력하세요");
  if (!name) throw new Error("프로젝트 이름을 입력하세요");
  if (data.projects.some((p) => p.key === key)) {
    throw new Error(`이미 존재하는 프로젝트 키입니다: ${key}`);
  }
  const project: Project = {
    id: nextId(),
    key,
    name,
    description: input.description?.trim() ?? "",
    category: "",
    leadId: CURRENT_USER_ID,
    defaultAssignee: "unassigned",
    icon: "",
    color: "",
    url: "",
    archivedAt: null,
    deletedAt: null,
    version: 1,
    createdAt: new Date().toISOString(),
  };
  data.projects.push(project);
  data.members.push({ projectId: project.id, userId: CURRENT_USER_ID, role: "admin" });
  data.issueCounters[project.id] = 0;
  // 새 프로젝트는 디폴트 스킴에 배정된다 (지라 Default Scheme)
  const defaultScheme = data.schemes.find((s) => s.isDefault)!;
  data.projectSettings.push({ projectId: project.id, schemeId: defaultScheme.id, custom: null });

  // 프로젝트는 항상 기본 보드를 갖는다 — 템플릿이 있으면 그 구성으로 교체
  const template = getTemplate(input.templateId ?? "blank");
  const board = defaultBoard(project.id);
  if (template.board) {
    board.name = template.board.name;
    board.type = template.board.type;
    board.columns = template.board.columns.map((c) => ({ ...c }));
    board.filter = {
      assigneeIds: [...template.board.filter.assigneeIds],
      types: [...template.board.filter.types],
      labels: [...template.board.filter.labels],
    };
  }
  data.boards.push(board);
  if (template.withSprint) {
    data.sprints.push({ id: nextId(), projectId: project.id, name: "Sprint 1", state: "planned", version: 1 });
  }
  persist();

  // 샘플 이슈는 createIssue 경유 — 키 시퀀스·활동로그가 정상 경로로 남는다
  for (const sample of template.samples) {
    await createIssue({
      projectId: project.id,
      title: sample.title,
      type: sample.type,
      status: sample.status,
      labels: sample.labels,
    });
  }
  // 데모 템플릿은 공용 시더(REST와 같은 코드)가 채운다
  if (template.richSeed) await seedDemoProject(project, sampleDataApi(), options);
  return clone(project);
}

/** 공용 시더(`sampleData.ts`)에 넘길 목업 함수 묶음 — REST 어댑터와 시그니처가 같다 */
function sampleDataApi(): SampleDataApi {
  return {
    listUsers,
    createComponent,
    createVersion,
    releaseVersion,
    createSprint,
    updateSprint,
    startSprint,
    completeSprint,
    createIssue,
    addIssueLink,
    addComment,
    addWorklog,
    archiveIssue,
    createDashboard,
  };
}

/** 키는 이슈 키 접두어라 불변 — 이름/설명만 수정 가능 */
export interface ProjectPatch {
  name?: string;
  description?: string;
  category?: string;
  leadId?: string | null;
  defaultAssignee?: ProjectDefaultAssignee;
  icon?: string;
  color?: string;
  url?: string;
}

function assertHttpUrl(url: string, label: string): string {
  const trimmed = url.trim();
  if (trimmed && !/^https?:\/\//.test(trimmed)) {
    throw new Error(`${label}URL은 http:// 또는 https://로 시작해야 합니다`);
  }
  return trimmed;
}

/** 세부 필드 적용 — 이름/설명 검증은 호출자가 한다 */
function applyProjectDetails(data: JiraData, project: Project, patch: ProjectPatch): void {
  if (patch.category !== undefined) project.category = patch.category.trim().slice(0, 60);
  if (patch.leadId !== undefined) {
    if (patch.leadId !== null && !data.users.some((u) => u.id === patch.leadId)) {
      throw new Error("사용자를 찾을 수 없습니다");
    }
    project.leadId = patch.leadId;
  }
  if (patch.defaultAssignee !== undefined) {
    if (patch.defaultAssignee !== "unassigned" && patch.defaultAssignee !== "lead") {
      throw new Error("기본 담당자는 unassigned/lead 중 하나입니다");
    }
    project.defaultAssignee = patch.defaultAssignee;
  }
  if (patch.icon !== undefined) project.icon = patch.icon.trim();
  if (patch.color !== undefined) project.color = patch.color.trim();
  if (patch.url !== undefined) project.url = assertHttpUrl(patch.url, "");
}

/** 서버 PUT과 같은 낙관적 락 — 설정 화면이 편집을 시작할 때 본 버전이 아니면 409 */
export async function updateProject(id: string, patch: ProjectPatch, expectedVersion: number): Promise<Project> {
  const data = load();
  const project = data.projects.find((p) => p.id === id);
  if (!project) throw new Error("프로젝트를 찾을 수 없습니다");
  assertCanAdmin(data, id);
  if (project.version !== expectedVersion) throw new ApiError(409, STALE_EDIT_MESSAGE);
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("프로젝트 이름을 입력하세요");
    project.name = name;
  }
  if (patch.description !== undefined) {
    project.description = patch.description.trim();
  }
  applyProjectDetails(data, project, patch);
  project.version += 1;
  persist();
  return clone(project);
}

/** 프로젝트의 스프린트·이슈·댓글·활동·이슈 카운터까지 연쇄 삭제한다 */
/** 삭제 = 휴지통 이동(지라). 이슈는 archivedIssues로 옮겨 검색·홈에서 사라진다. 복원·영구 삭제는 휴지통에서 */
export async function deleteProject(id: string): Promise<void> {
  const data = load();
  const index = data.projects.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("프로젝트를 찾을 수 없습니다");
  assertAdminIgnoringArchive(data, id);
  const [project] = data.projects.splice(index, 1);
  project.deletedAt = new Date().toISOString();
  data.trashedProjects.push(project);
  const moving = data.issues.filter((i) => i.projectId === id);
  data.issues = data.issues.filter((i) => i.projectId !== id);
  data.archivedIssues.push(...moving);
  persist();
}

export async function listTrashedProjects(): Promise<Project[]> {
  return clone([...load().trashedProjects].sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")));
}

export async function restoreProject(id: string): Promise<Project> {
  const data = load();
  const index = data.trashedProjects.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("휴지통에 없는 프로젝트입니다");
  const [project] = data.trashedProjects.splice(index, 1);
  project.deletedAt = null;
  data.projects.push(project);
  // 보관(archivedAt)됐던 이슈는 보관함에 남고, 나머지는 돌아온다
  const returning = data.archivedIssues.filter((i) => i.projectId === id && !i.archivedAt);
  data.archivedIssues = data.archivedIssues.filter((i) => !(i.projectId === id && !i.archivedAt));
  data.issues.push(...returning);
  persist();
  return clone(project);
}

/** 영구 삭제 — 휴지통에 있는 프로젝트만. 되돌릴 수 없다 */
export async function purgeProject(id: string): Promise<void> {
  const data = load();
  const index = data.trashedProjects.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("휴지통에 없는 프로젝트입니다");
  const issueIds = new Set(
    [...data.issues, ...data.archivedIssues].filter((i) => i.projectId === id).map((i) => i.id),
  );
  data.trashedProjects.splice(index, 1);
  data.archivedIssues = data.archivedIssues.filter((i) => i.projectId !== id);
  data.components = data.components.filter((c) => c.projectId !== id);
  data.sprints = data.sprints.filter((s) => s.projectId !== id);
  data.issues = data.issues.filter((i) => i.projectId !== id);
  data.comments = data.comments.filter((c) => !issueIds.has(c.issueId));
  data.activities = data.activities.filter((a) => !issueIds.has(a.issueId));
  data.notifications = data.notifications.filter((n) => !issueIds.has(n.issueId));
  data.watchers = data.watchers.filter((w) => !issueIds.has(w.issueId));
  data.boards = data.boards.filter((b) => b.projectId !== id);
  data.links = data.links.filter((l) => !issueIds.has(l.sourceId) && !issueIds.has(l.targetId));
  data.webLinks = data.webLinks.filter((w) => !issueIds.has(w.issueId));
  data.worklogs = data.worklogs.filter((w) => !issueIds.has(w.issueId));
  data.changes = data.changes.filter((c) => c.projectId !== id);
  data.members = data.members.filter((m) => m.projectId !== id);
  data.versions = data.versions.filter((v) => v.projectId !== id);
  data.attachments = data.attachments.filter((a) => !issueIds.has(a.issueId));
  data.projectSettings = data.projectSettings.filter((e) => e.projectId !== id);
  delete data.issueCounters[id];
  persist();
}
