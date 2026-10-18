// alm-backend REST 어댑터 — projects (jiraApi.ts에서 분할, 동작 불변)
import type { Project } from "../types";
import { type ProjectDto, mapProject, toBackendId } from "../mapping";
import { type ProjectTemplateId, getTemplate } from "../projectTemplates";
import { type SeedDemoOptions, seedDemoProject, type SampleDataApi } from "../sampleData";
import type { ProjectPatch } from "../jiraMock";
import { json, sharedApiFetch, projectDto } from "./http";
import { listUsers } from "./members";
import { createComponent } from "./components";
import { createVersion, releaseVersion } from "./versions";
import { createSprint, updateSprint, startSprint, completeSprint } from "./sprints";
import { createIssue } from "./issues";
import { addIssueLink, addComment, addWorklog, listBoards, updateBoard } from "./collab";
import { archiveIssue } from "./archive";
import { createDashboard } from "./dashboards";

export async function listProjects(): Promise<Project[]> {
  const rows = await json<ProjectDto[]>(await sharedApiFetch("/api/alm/projects"));
  return rows.map(mapProject);
}

export async function createProject(
  input: {
    key: string;
    name: string;
    description?: string;
    templateId?: ProjectTemplateId;
  },
  options: SeedDemoOptions = {},
): Promise<Project> {
  const template = getTemplate(input.templateId ?? "blank");
  const response = await sharedApiFetch("/api/alm/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: input.key.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
    }),
  });
  const project = mapProject(await json(response));
  await applyTemplate(project.id, template);
  // 데모 템플릿은 공용 시더(목업과 같은 코드)가 채운다 — 낙관적 락 충돌을 피하려 전부 순차다
  if (template.richSeed) await seedDemoProject(project, sampleDataApi(), options);
  return project;
}

/**
 * 공용 시더(`sampleData.ts`)에 넘길 REST 함수 묶음. 이 객체가 타입 체크를 통과한다는 것이
 * "시더가 부르는 스토어 함수를 REST 어댑터가 전부 갖고 있다"는 계약 검증이다.
 */
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

/**
 * 템플릿은 서버 개념이 아니라 프론트 합성이다(목업과 같은 순서): 서버가 만든 기본 보드를 템플릿 보드로
 * 바꾸고 → Sprint 1 → 샘플 이슈를 정상 경로(createIssue)로 만든다. 도중 실패하면 프로젝트는 남고
 * 에러가 화면에 오른다 — 반쯤 적용된 템플릿은 설정 화면에서 손볼 수 있다.
 */
async function applyTemplate(projectId: string, template: ReturnType<typeof getTemplate>): Promise<void> {
  if (template.board) {
    const boards = await listBoards(projectId);
    const target = boards.find((b) => b.isDefault) ?? boards[0];
    if (target) {
      await updateBoard(target.id, {
        name: template.board.name,
        type: template.board.type,
        columns: template.board.columns.map((c) => ({ ...c })),
        filter: {
          assigneeIds: [...template.board.filter.assigneeIds],
          types: [...template.board.filter.types],
          labels: [...template.board.filter.labels],
        },
      });
    }
  }
  if (template.withSprint) await createSprint(projectId);
  for (const sample of template.samples) {
    await createIssue({
      projectId,
      title: sample.title,
      type: sample.type,
      status: sample.status,
      labels: sample.labels,
    });
  }
}

/** 건드리지 않은 필드는 최신 값으로 채우되, 낙관적 락 기준은 설정 화면이 편집을 시작할 때 본 버전이다 */
export async function updateProject(id: string, patch: ProjectPatch, expectedVersion: number): Promise<Project> {
  const current = await projectDto(id);
  const response = await sharedApiFetch(`/api/alm/projects/${toBackendId(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: (patch.name ?? current.name).trim(),
      description: (patch.description ?? current.description ?? "").trim(),
      category: patch.category,
      leadId: patch.leadId ? toBackendId(patch.leadId) : undefined,
      clearLead: patch.leadId === null ? true : undefined,
      defaultAssignee: patch.defaultAssignee,
      icon: patch.icon,
      color: patch.color,
      url: patch.url,
      expectedVersion,
    }),
  });
  return mapProject(await json(response));
}

export async function deleteProject(id: string): Promise<void> {
  await json(
    await sharedApiFetch(`/api/alm/projects/${toBackendId(id)}`, { method: "DELETE" }),
  );
}
