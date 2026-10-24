import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  Lozenge,
  Modal,
  Select,
  Switch,
  TextArea,
  TextField,
  useToast,
} from "@chanho/react";
import type {
  IssueFieldConfig,
  ProjectDefaultAssignee,
  ProjectRole,
  IssueType,
  Project,
  SettingsScheme,
  WorkflowStatus,
  WorkflowTransition,
  WorkflowLayout,
  TypeWorkflow,
  User,
} from "../store/types";
import type { ResolvedSettings } from "../store/jiraStore";
import {
  assignScheme,
  deleteProject,
  archiveProject,
  unarchiveProject,
  listIssuesPage,
  listProjects,
  listSchemes,
  listUsers,
  getMyProjectRole,
  resolveSettings,
  setProjectCustom,
  updateProject,
  updateProjectCustomSettings,
} from "../store/jiraStore";
import { pruneProject } from "../store/uiStore";
import { errorStatus } from "../store/mapping";
import { StatusEditor } from "../components/StatusEditor";
import { StatusGlyph } from "../components/StatusGlyph";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { PriorityGlyph } from "../components/PriorityGlyph";
import { ValueWithIcon } from "../components/ValueWithIcon";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { TypeWorkflowEditor } from "../components/TypeWorkflowEditor";
import { pruneWorkflowRefs } from "../components/workflowRules";
import { FieldConfigEditor } from "../components/FieldConfigEditor";
import {
  normalizeFields,
  normalizeFieldsByType,
  sameFields,
  sameFieldsByType,
} from "../components/fieldConfig";
import { ProjectAvatar } from "../components/ProjectAvatar";
import { ProjectMembersPanel } from "../components/ProjectMembersPanel";
import { ProjectShortcutsPanel } from "../components/ProjectShortcutsPanel";
import { ComponentsPanel } from "../components/ComponentsPanel";
import { PROJECT_COLOR_OPTIONS } from "../components/ProjectAvatar";
import { TYPE_ICON_OPTIONS } from "../components/typeIcons";
import { JiraImportPanel } from "../components/JiraImportPanel";
import { PlanningSettingsPanel } from "../components/PlanningSettingsPanel";
import { TriageSettingsPanel } from "../components/TriageSettingsPanel";
import { AutomationRulesPanel } from "../components/AutomationRulesPanel";
import { useIssueTypes } from "../components/useIssueTypes";
import { usePriorities } from "../components/usePriorities";
import {
  PROJECT_SETTINGS_SECTIONS,
  isProjectSettingsSection,
} from "../components/SettingsSideNav";
import {
  priorityAppearance,
  priorityName,
  typeAppearance,
  typeName,
} from "../components/labels";
import { PageSkeleton } from "../components/Skeletons";

/** AI 팀 구획은 사무실 초상 에셋을 끌고 오므로 따로 쪼갠다 — 그 구획을 여는 사람만 받는다 */
const AiTeamSettings = lazy(() => import("../office/AiTeamSettings"));

export interface ProjectSettingsPageProps {
  projects: Project[];
  /** 프로젝트 목록이 바뀌었을 때(수정/삭제 등) App이 다시 로드하도록 알린다 */
  onProjectsChanged: () => void | Promise<void>;
}

/**
 * 프로젝트 설정 — 프로젝트 뷰(탭) 바깥의 별도 페이지. 구획은 URL(`/settings/:section`)이 정하고
 * 메뉴는 설정 사이드바(SettingsSideNav)가 그린다. 여기서는 현재 구획 하나만 렌더한다.
 */
/** Select는 빈 문자열 value를 못 쓴다 — 센티널 */
/** 일반 설정 초안(저장 계약 값) */
interface GeneralDraft {
  name: string;
  description: string;
  category: string;
  leadId: string | null;
  defaultAssignee: ProjectDefaultAssignee;
  icon: string;
  color: string;
  url: string;
}

const NO_LEAD = "__none__";
const AUTO = "__auto__";

export function ProjectSettingsPage({ projects, onProjectsChanged }: ProjectSettingsPageProps) {
  const { projectId, section = "general" } = useParams();
  const issueTypes = useIssueTypes();
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);
  const navigate = useNavigate();
  const toast = useToast();

  const project = projects.find((p) => p.id === projectId);
  const [nameDraft, setNameDraft] = useState(project?.name ?? "");
  /**
   * 초안을 채운 시점의 프로젝트(편집 시작 스냅샷) — 저장은 그 버전으로 보내 남의 수정을 덮지 않고(409),
   * 충돌 뒤 "다시 적용"은 이 스냅샷과 달라진 필드만 최신 값 위에 얹는다.
   */
  const [baseProject, setBaseProject] = useState<Project | null>(project ?? null);
  const [descriptionDraft, setDescriptionDraft] = useState(project?.description ?? "");
  const [categoryDraft, setCategoryDraft] = useState(project?.category ?? "");
  const [leadDraft, setLeadDraft] = useState(project?.leadId ?? NO_LEAD);
  const [defaultAssigneeDraft, setDefaultAssigneeDraft] = useState<ProjectDefaultAssignee>(
    project?.defaultAssignee ?? "unassigned",
  );
  const [iconDraft, setIconDraft] = useState(project?.icon || AUTO);
  const [colorDraft, setColorDraft] = useState(project?.color || AUTO);
  const [urlDraft, setUrlDraft] = useState(project?.url ?? "");
  /** 일반 설정 저장 충돌(409) — 초안은 그대로 두고 사용자가 불러오기/다시 적용을 고른다 */
  const [projectConflict, setProjectConflict] = useState(false);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  /** 지금 화면의 일반 설정 초안 — 저장이 끝난 순간(await 뒤) 사용자가 그 사이 더 고친 값을 알아보는 데 쓴다 */
  const generalDraftRef = useRef<GeneralDraft | null>(null);
  const [myRole, setMyRole] = useState<ProjectRole | null>(null);
  const [issueCount, setIssueCount] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [resolved, setResolved] = useState<ResolvedSettings | null>(null);
  const [schemes, setSchemes] = useState<SettingsScheme[]>([]);
  const [typesDraft, setTypesDraft] = useState<IssueType[]>([]);
  const [prioritiesDraft, setPrioritiesDraft] = useState<string[]>([]);
  const [defaultPriorityDraft, setDefaultPriorityDraft] = useState("medium");
  const priorities = usePriorities();
  const [statusesDraft, setStatusesDraft] = useState<WorkflowStatus[]>([]);
  const [transitionsDraft, setTransitionsDraft] = useState<WorkflowTransition[]>([]);
  const [layoutDraft, setLayoutDraft] = useState<WorkflowLayout>({});
  /** 이슈 타입별 워크플로(C5) 초안 — 키가 없는 타입은 프로젝트 기본 워크플로를 따른다 */
  const [workflowsByTypeDraft, setWorkflowsByTypeDraft] = useState<Record<string, TypeWorkflow>>({});
  const [fieldsDraft, setFieldsDraft] = useState<IssueFieldConfig[]>(() => normalizeFields(null));
  /** 이슈 타입별 덮어쓰기 초안 — 키가 없는 타입은 기본 구성을 따른다 */
  const [fieldsByTypeDraft, setFieldsByTypeDraft] = useState<Record<string, IssueFieldConfig[]>>({});

  const currentProjectId = project?.id;

  const reloadSettings = useCallback(async () => {
    if (!currentProjectId) return;
    const [resolvedSettings, schemeList] = await Promise.all([
      resolveSettings(currentProjectId),
      listSchemes(),
    ]);
    setResolved(resolvedSettings);
    setSchemes(schemeList);
    setTypesDraft([...resolvedSettings.body.enabledTypes]);
    setPrioritiesDraft([...resolvedSettings.body.enabledPriorities]);
    setDefaultPriorityDraft(resolvedSettings.body.defaultPriority);
    setStatusesDraft([...resolvedSettings.body.statuses].sort((a, b) => a.order - b.order));
    setTransitionsDraft(resolvedSettings.body.transitions ?? []);
    setLayoutDraft(resolvedSettings.body.layout ?? {});
    setWorkflowsByTypeDraft(resolvedSettings.body.workflowsByType ?? {});
    setFieldsDraft(normalizeFields(resolvedSettings.body));
    setFieldsByTypeDraft(normalizeFieldsByType(resolvedSettings.body));
  }, [currentProjectId]);

  /** 일반 설정 초안을 프로젝트 값으로 채운다 — 이때의 버전이 다음 저장의 기준이다 */
  const resetGeneralDrafts = (source: Project) => {
    setNameDraft(source.name);
    setBaseProject(source);
    setDescriptionDraft(source.description);
    setCategoryDraft(source.category);
    setLeadDraft(source.leadId ?? NO_LEAD);
    setDefaultAssigneeDraft(source.defaultAssignee);
    setIconDraft(source.icon || AUTO);
    setColorDraft(source.color || AUTO);
    setUrlDraft(source.url);
    setProjectConflict(false);
  };

  useEffect(() => {
    if (!project) return;
    resetGeneralDrafts(project);
    void getMyProjectRole(project.id).then(setMyRole).catch(() => setMyRole(null));
    let cancelled = false;
    // 개수만 필요하다 — 본문 전량 대신 1건 페이지의 total을 쓴다
    void listIssuesPage(project.id, undefined, { page: 0, size: 1 }).then((page) => {
      if (!cancelled) setIssueCount(page.total);
    });
    void reloadSettings();
    return () => {
      cancelled = true;
    };
    // 프로젝트 전환 시에만 초안 리셋 (projects 재로드로 초안이 날아가면 안 된다)
  }, [currentProjectId, reloadSettings]);

  // 없는 프로젝트 → 디렉터리, 모르는 구획 → 일반
  if (!project) return <Navigate to="/projects" replace />;
  if (!isProjectSettingsSection(section)) {
    return <Navigate to={`/projects/${project.id}/settings/general`} replace />;
  }

  const dirty =
    nameDraft !== project.name ||
    descriptionDraft !== project.description ||
    categoryDraft !== project.category ||
    leadDraft !== (project.leadId ?? NO_LEAD) ||
    defaultAssigneeDraft !== project.defaultAssignee ||
    (iconDraft === AUTO ? "" : iconDraft) !== project.icon ||
    (colorDraft === AUTO ? "" : colorDraft) !== project.color ||
    urlDraft !== project.url;
  const sectionLabel = PROJECT_SETTINGS_SECTIONS.find((s) => s.id === section)?.label ?? "";

  /** 설정 액션 공통 래퍼 — 실패 toast, 끝나면 설정 재조회 */
  const run = async (failTitle: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast({
        title: failTitle,
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reloadSettings();
  };

  /** 지금 초안 — 화면 값(센티널 포함)을 저장 계약 값으로 옮긴 것 */
  const generalDraft: GeneralDraft = {
    name: nameDraft,
    description: descriptionDraft,
    category: categoryDraft,
    leadId: leadDraft === NO_LEAD ? null : leadDraft,
    defaultAssignee: defaultAssigneeDraft,
    icon: iconDraft === AUTO ? "" : iconDraft,
    color: colorDraft === AUTO ? "" : colorDraft,
    url: urlDraft,
  };
  generalDraftRef.current = generalDraft;

  /** 저장된 프로젝트의 한 필드를 초안 입력에 되돌려 넣는다(센티널 포함) */
  const setGeneralFieldFrom = (key: keyof GeneralDraft, source: Project) => {
    switch (key) {
      case "name": return setNameDraft(source.name);
      case "description": return setDescriptionDraft(source.description);
      case "category": return setCategoryDraft(source.category);
      case "leadId": return setLeadDraft(source.leadId ?? NO_LEAD);
      case "defaultAssignee": return setDefaultAssigneeDraft(source.defaultAssignee);
      case "icon": return setIconDraft(source.icon || AUTO);
      case "color": return setColorDraft(source.color || AUTO);
      case "url": return setUrlDraft(source.url);
    }
  };

  /** 편집 시작 스냅샷과 달라진(=내가 손댄) 필드만 */
  const touchedGeneral = () => {
    const base = baseProject ?? project;
    return Object.fromEntries(
      (Object.keys(generalDraft) as (keyof typeof generalDraft)[])
        .filter((key) => generalDraft[key] !== (key === "leadId" ? (base.leadId ?? null) : base[key]))
        .map((key) => [key, generalDraft[key]]),
    ) as Partial<typeof generalDraft>;
  };

  /**
   * 저장 완료 — 스냅샷은 저장된 프로젝트(내 변경 + 남이 바꾼 나머지)가 된다. 초안은 **보낸 값 그대로인 필드만**
   * 저장 값으로 맞추고, 저장을 기다리는 동안 사용자가 더 고친 필드는 그대로 둔다(새 스냅샷 대비 여전히 변경됨).
   */
  const afterGeneralSaved = async (saved: Project, submitted: GeneralDraft) => {
    const current = generalDraftRef.current ?? submitted;
    setBaseProject(saved);
    for (const key of Object.keys(submitted) as (keyof GeneralDraft)[]) {
      if (current[key] === submitted[key]) setGeneralFieldFrom(key, saved);
    }
    setProjectConflict(false);
    await onProjectsChanged();
    toast({ title: "프로젝트를 수정했습니다", appearance: "success" });
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const submitted = generalDraft;
      await afterGeneralSaved(await updateProject(project.id, submitted, (baseProject ?? project).version), submitted);
    } catch (error) {
      if (errorStatus(error) === 409) {
        setProjectConflict(true);
        return;
      }
      toast({
        title: "수정 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  /** 충돌 해소 — 최신 프로젝트를 다시 읽어 초안을 버리거나(불러오기) 최신 버전 기준으로 다시 저장한다 */
  const resolveGeneralConflict = async (mode: "reload" | "reapply") => {
    setResolvingConflict(true);
    try {
      const latest = (await listProjects()).find((p) => p.id === project.id);
      if (!latest) throw new Error("프로젝트를 찾을 수 없습니다");
      if (mode === "reload") {
        resetGeneralDrafts(latest);
        await onProjectsChanged();
      } else {
        // 내가 손댄 필드만 최신 값 위에 얹는다 — 동료가 바꾼 다른 필드(예: 이름)를 되돌리지 않는다
        // 비교 기준은 누른 순간의 초안 전체 — 손대지 않은 필드도 그 사이 안 바뀌었으면 동료 값으로 맞춘다
        const submitted = generalDraftRef.current ?? generalDraft;
        await afterGeneralSaved(await updateProject(project.id, touchedGeneral(), latest.version), submitted);
      }
    } catch (error) {
      if (errorStatus(error) !== 409) {
        toast({
          title: mode === "reload" ? "최신 내용을 불러오지 못했습니다" : "다시 적용하지 못했습니다",
          description: error instanceof Error ? error.message : String(error),
          appearance: "danger",
        });
      }
    } finally {
      setResolvingConflict(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject(project.id);
      await pruneProject(project.id); // 최근/별표에서도 제거
      toast({ title: `프로젝트 ${project.key}를 삭제했습니다`, appearance: "success" });
      await onProjectsChanged();
      navigate("/projects");
    } catch (error) {
      toast({
        title: "삭제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  /** 스킴/커스텀 배지 + 전환 컨트롤 — 워크플로·이슈 타입 구획 공용 */
  const schemeHeader = resolved ? (
    <div className="settings-scheme-header" data-testid="settings-scheme-header">
      {resolved.source === "scheme" ? (
        <>
          <Badge appearance="brand">스킴: {resolved.scheme.name}</Badge>
          <Select
            label="스킴 변경"
            value={resolved.scheme.id}
            options={schemes.map((s) => ({ value: s.id, label: s.name }))}
            onValueChange={(v) =>
              void run("스킴 변경 실패", async () => {
                if (v === resolved.scheme.id) return;
                await assignScheme(project.id, v);
                toast({ title: "스킴을 변경했습니다", appearance: "success" });
              })
            }
          />
        </>
      ) : (
        <Badge>이 프로젝트만 커스텀</Badge>
      )}
      <Switch
        label="이 프로젝트만 커스텀"
        checked={resolved.source === "custom"}
        onCheckedChange={(next) =>
          void run(next ? "커스텀 전환 실패" : "스킴 복귀 실패", async () => {
            await setProjectCustom(project.id, next);
            toast({
              title: next ? "커스텀 설정으로 전환했습니다" : "스킴 설정으로 복귀했습니다",
              appearance: "success",
            });
          })
        }
      />
    </div>
  ) : null;

  const general = (
    <div className="project-settings">
      <Card padding="lg" title="일반">
        <form className="project-create-form" onSubmit={handleSave}>
          {projectConflict ? (
            <Banner variant="warning">
              <div className="issue-conflict">
                <p className="issue-conflict-text">
                  다른 사용자가 이 프로젝트를 먼저 수정해 저장하지 않았습니다. 입력한 내용은 그대로 남아 있습니다.
                </p>
                <div className="issue-conflict-actions">
                  <Button size="small" variant="secondary" disabled={resolvingConflict} onClick={() => void resolveGeneralConflict("reload")}>
                    최신 내용 불러오기
                  </Button>
                  <Button size="small" variant="primary" disabled={resolvingConflict} onClick={() => void resolveGeneralConflict("reapply")}>
                    내 변경 다시 적용(최신 버전 기준)
                  </Button>
                </div>
              </div>
            </Banner>
          ) : null}
          <div className="project-key-readonly">
            <span className="project-key-readonly-label">키</span>
            <span className="issue-key-cell">{project.key}</span>
          </div>
          <TextField label="이름" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
          <TextArea
            label="설명"
            rows={3}
            placeholder="프로젝트 설명을 입력하세요"
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
          />
          <div className="project-details-grid">
            <TextField
              label="범주"
              placeholder="예: 플랫폼, 고객 지원"
              value={categoryDraft}
              onChange={(e) => setCategoryDraft(e.target.value)}
            />
            <TextField
              label="URL"
              placeholder="https://"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
            />
            <Select
              label="프로젝트 리더"
              searchable
              value={leadDraft}
              options={[
                { value: NO_LEAD, label: "없음" },
                ...users.map((user) => ({ value: user.id, label: user.name })),
              ]}
              onValueChange={setLeadDraft}
            />
            <Select
              label="기본 담당자"
              value={defaultAssigneeDraft}
              options={[
                { value: "unassigned", label: "미지정" },
                { value: "lead", label: "프로젝트 리더" },
              ]}
              onValueChange={(next) => setDefaultAssigneeDraft(next as ProjectDefaultAssignee)}
            />
            <Select
              label="아이콘"
              value={iconDraft}
              options={[{ value: AUTO, label: "키 이니셜" }, ...TYPE_ICON_OPTIONS]}
              onValueChange={setIconDraft}
            />
            <Select
              label="색"
              value={colorDraft}
              options={[
                { value: AUTO, label: "자동(키 기준)" },
                ...PROJECT_COLOR_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
              ]}
              onValueChange={setColorDraft}
            />
          </div>
          <div className="project-form-actions">
            <Button type="submit" disabled={!dirty || !nameDraft.trim()}>
              저장
            </Button>
          </div>
        </form>
      </Card>
      <ProjectShortcutsPanel projectId={project.id} canManage={myRole === "admin"} />
      <Card padding="lg" title="보관" className="project-archive-zone">
        <p className="project-danger-desc">
          {project.archivedAt
            ? "보관된 프로젝트는 읽기만 할 수 있습니다. 해제하면 다시 편집할 수 있습니다."
            : "끝난 프로젝트를 보관하면 읽기 전용이 되고 목록에 \"보관됨\"으로 남습니다. 언제든 해제할 수 있습니다."}
        </p>
        <Button
          variant="secondary"
          onClick={() =>
            void run(project.archivedAt ? "보관 해제 실패" : "보관 실패", async () => {
              if (project.archivedAt) await unarchiveProject(project.id);
              else await archiveProject(project.id);
              await onProjectsChanged();
              toast({ title: project.archivedAt ? "보관을 해제했습니다" : "프로젝트를 보관했습니다", appearance: "success" });
            })
          }
        >
          {project.archivedAt ? "보관 해제" : "프로젝트 보관"}
        </Button>
      </Card>
      <Card padding="lg" title="위험 구역" className="project-danger-zone">
        <p className="project-danger-desc">
          프로젝트를 삭제하면 이슈 {issueCount}개와 함께 휴지통으로 옮겨집니다. 휴지통에서 복원하거나
          영구 삭제할 수 있습니다.
        </p>
        <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
          프로젝트 삭제
        </Button>
      </Card>
    </div>
  );

  const workflow = resolved ? (
    <div className="project-settings">
      <Card padding="lg" title="워크플로 상태">
        {schemeHeader}
        {resolved.source === "custom" ? (
          <form
            className="project-create-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run("저장 실패", async () => {
                // 상태를 뺐으면 그 상태를 가리키던 전이·타입 워크플로 참조를 덜어 보낸다(서버는 깨진 참조를 400으로 거부)
                await updateProjectCustomSettings(
                  project.id,
                  pruneWorkflowRefs({
                    ...resolved.body,
                    statuses: statusesDraft,
                    transitions: transitionsDraft,
                    layout: layoutDraft,
                    workflowsByType: workflowsByTypeDraft,
                  }),
                );
                toast({ title: "워크플로를 저장했습니다", appearance: "success" });
              });
            }}
          >
            <StatusEditor value={statusesDraft} onChange={setStatusesDraft} />
            <WorkflowCanvas
              statuses={statusesDraft}
              transitions={transitionsDraft}
              layout={layoutDraft}
              onChange={setTransitionsDraft}
              onLayoutChange={setLayoutDraft}
            />
            <TypeWorkflowEditor
              statuses={statusesDraft}
              transitions={transitionsDraft}
              types={issueTypes.filter((t) => resolved.body.enabledTypes.includes(t.id))}
              value={workflowsByTypeDraft}
              onChange={setWorkflowsByTypeDraft}
            />
            <Button type="submit" size="small">
              저장
            </Button>
          </form>
        ) : (
          <>
            <div className="admin-scheme-preview" data-testid="statuses-readonly">
              {[...resolved.body.statuses]
                .sort((a, b) => a.order - b.order)
                .map((status) => (
                  <span key={status.id} className="status-cell">
                    <StatusGlyph status={status.id} statuses={resolved.body.statuses} variant="icon" />
                    <Lozenge appearance={status.color ?? "neutral"}>{status.name}</Lozenge>
                  </span>
                ))}
            </div>
            <WorkflowCanvas
              statuses={resolved.body.statuses}
              transitions={resolved.body.transitions ?? []}
              layout={resolved.body.layout}
              readOnly
            />
            <TypeWorkflowEditor
              statuses={resolved.body.statuses}
              transitions={resolved.body.transitions ?? []}
              types={issueTypes.filter((t) => resolved.body.enabledTypes.includes(t.id))}
              value={resolved.body.workflowsByType ?? {}}
              readOnly
            />
            <p className="admin-scheme-note">
              스킴 자체 편집은 전역 관리(⚙), 이 프로젝트만 바꾸려면 커스텀으로 전환하세요.
            </p>
          </>
        )}
      </Card>
    </div>
  ) : null;

  const types = resolved ? (
    <div className="project-settings">
      <Card padding="lg" title="이슈 타입">
        {schemeHeader}
        {resolved.source === "custom" ? (
          <form
            className="project-create-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run("저장 실패", async () => {
                await updateProjectCustomSettings(project.id, {
                  ...resolved.body,
                  enabledTypes: typesDraft,
                  enabledPriorities: prioritiesDraft,
                  defaultPriority: defaultPriorityDraft,
                });
                toast({ title: "이슈 타입 구성을 저장했습니다", appearance: "success" });
              });
            }}
          >
            <div className="board-settings-checks" role="group" aria-label="이슈 타입">
              {issueTypes.map(({ id: type, name }) => (
                <Checkbox
                  key={type}
                  // 노드 라벨(react 0.11.0) — 글리프는 장식이라 접근 이름은 이름 텍스트가 갖는다
                  label={
                    <ValueWithIcon
                      icon={<IssueTypeGlyph type={type} types={issueTypes} variant="icon" />}
                    >
                      {name}
                    </ValueWithIcon>
                  }
                  checked={typesDraft.includes(type)}
                  disabled={type === "subtask"} // 계층 기능 의존 — 항상 활성
                  onCheckedChange={() =>
                    setTypesDraft((prev) =>
                      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
                    )
                  }
                />
              ))}
            </div>
            <div className="board-settings-checks" role="group" aria-label="우선순위">
              {priorities.map(({ id, name }) => (
                <Checkbox
                  key={id}
                  label={
                    <ValueWithIcon
                      icon={<PriorityGlyph defs={priorities} priority={id} size={14} variant="icon" />}
                    >
                      {name}
                    </ValueWithIcon>
                  }
                  checked={prioritiesDraft.includes(id)}
                  onCheckedChange={() =>
                    setPrioritiesDraft((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
                  }
                />
              ))}
            </div>
            <Select
              label="기본 우선순위"
              value={defaultPriorityDraft}
              options={prioritiesDraft.map((id) => ({
                value: id,
                label: priorityName(priorities, id),
                icon: <PriorityGlyph defs={priorities} priority={id} size={14} variant="icon" />,
              }))}
              onValueChange={setDefaultPriorityDraft}
            />
            <Button type="submit" size="small">
              저장
            </Button>
          </form>
        ) : (
          <div className="admin-scheme-preview" data-testid="types-readonly">
            {resolved.body.enabledTypes.map((type) => (
              <ValueWithIcon
                key={type}
                icon={<IssueTypeGlyph type={type} types={issueTypes} variant="icon" />}
              >
                <Lozenge appearance={typeAppearance(issueTypes, type)}>
                  {typeName(issueTypes, type)}
                </Lozenge>
              </ValueWithIcon>
            ))}
            <span className="admin-scheme-sep" aria-hidden>·</span>
            {resolved.body.enabledPriorities.map((id) => (
              <ValueWithIcon
                key={id}
                icon={<PriorityGlyph defs={priorities} priority={id} size={14} variant="icon" />}
              >
                <Lozenge appearance={priorityAppearance(priorities, id)}>
                  {priorityName(priorities, id)}
                  {id === resolved.body.defaultPriority ? " (기본)" : ""}
                </Lozenge>
              </ValueWithIcon>
            ))}
          </div>
        )}
      </Card>
    </div>
  ) : null;

  /** 필드 구성 탭에 세울 이슈 타입 — 이 프로젝트의 활성 타입을 레지스트리 순서로(하위 작업 포함) */
  const fieldTabTypes = issueTypes.filter((type) =>
    (resolved?.body.enabledTypes ?? []).includes(type.id),
  );

  const fields = resolved ? (
    <div className="project-settings">
      <Card padding="lg" title="필드">
        {schemeHeader}
        <p className="admin-scheme-note">
          끈 필드는 이 프로젝트의 이슈 만들기·상세 속성 패널·대량 변경에서 사라집니다(데이터는
          남습니다). 첨부·링크는 만든 뒤에 붙는 값이라 필수로 켜도 만들기를 막지 않습니다.
          커스텀으로 전환하면 필드만이 아니라 워크플로·이슈 타입까지 포함한 설정 본문
          전체가 이 프로젝트만의 것이 됩니다. 이슈 타입 탭에서 그 타입만 다르게 구성할 수 있습니다.
        </p>
        {resolved.source === "custom" ? (
          <form
            className="project-create-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run("저장 실패", async () => {
                await updateProjectCustomSettings(project.id, {
                  ...resolved.body,
                  fields: fieldsDraft,
                  fieldsByType: fieldsByTypeDraft,
                });
                toast({ title: "필드 구성을 저장했습니다", appearance: "success" });
              });
            }}
          >
            <FieldConfigEditor
              value={fieldsDraft}
              onChange={setFieldsDraft}
              byType={fieldsByTypeDraft}
              onByTypeChange={setFieldsByTypeDraft}
              types={fieldTabTypes}
            />
            <Button
              type="submit"
              size="small"
              disabled={
                sameFields(fieldsDraft, normalizeFields(resolved.body)) &&
                sameFieldsByType(fieldsByTypeDraft, normalizeFieldsByType(resolved.body))
              }
            >
              저장
            </Button>
          </form>
        ) : (
          <div data-testid="fields-readonly">
            <FieldConfigEditor
              value={normalizeFields(resolved.body)}
              onChange={() => {}}
              byType={normalizeFieldsByType(resolved.body)}
              types={fieldTabTypes}
              readOnly
            />
            <p className="admin-scheme-note">
              스킴 자체 편집은 전역 관리(⚙), 이 프로젝트만 바꾸려면 커스텀으로 전환하세요.
            </p>
          </div>
        )}
      </Card>
    </div>
  ) : null;

  return (
    <div className="jira-main settings-main">
      <nav aria-label="브레드크럼" className="breadcrumbs">
        <button type="button" onClick={() => navigate("/projects")}>
          프로젝트
        </button>
        <span aria-hidden>/</span>
        <button type="button" onClick={() => navigate(`/projects/${project.id}/board`)}>
          {project.name}
        </button>
        <span aria-hidden>/</span>
        <span aria-current="page">설정</span>
      </nav>

      <header className="project-header settings-header">
        <ProjectAvatar project={project} size="lg" />
        <div className="settings-header-text">
          <h1 className="project-header-name">프로젝트 설정</h1>
          <span className="settings-header-sub">{sectionLabel}</span>
        </div>
      </header>

      <main className="jira-content">
        {section === "general" ? general : null}
        {section === "members" ? <ProjectMembersPanel projectId={project.id} /> : null}
        {section === "components" ? <ComponentsPanel projectId={project.id} canManage={myRole === "admin"} /> : null}
        {section === "workflow" ? workflow : null}
        {section === "types" ? types : null}
        {section === "fields" ? fields : null}
        {section === "planning" ? <PlanningSettingsPanel projectId={project.id} canManage={myRole === "admin"} /> : null}
        {section === "triage" ? <TriageSettingsPanel projectId={project.id} canManage={myRole === "admin"} /> : null}
        {section === "automation" ? <AutomationRulesPanel projectId={project.id} canManage={myRole === "admin"} /> : null}
        {section === "ai-team" ? (
          <Suspense
            fallback={
              <PageSkeleton label="AI 팀 불러오는 중" />
            }
          >
            <AiTeamSettings projectId={project.id} users={users} />
          </Suspense>
        ) : null}
        {section === "import" && resolved ? (
          <JiraImportPanel
            projectId={project.id}
            ctx={{ statuses: resolved.body.statuses, users, types: issueTypes }}
            onImported={() => void reloadSettings()}
          />
        ) : null}
      </main>

      {confirmingDelete ? (
        <Modal
          trigger={<span hidden />}
          title="프로젝트 삭제"
          open
          onOpenChange={(next) => {
            if (!next) setConfirmingDelete(false);
          }}
        >
          <div className="project-delete-confirm">
            <p>
              <strong>{project.name}</strong> ({project.key}) 프로젝트를 삭제하면 이슈 {issueCount}
              개와 함께 휴지통으로 옮겨집니다. 휴지통에서 복원하거나 영구 삭제할 수 있습니다.
            </p>
            <div className="project-delete-actions">
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                취소
              </Button>
              <Button variant="danger" onClick={() => void handleDelete()}>
                삭제
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
