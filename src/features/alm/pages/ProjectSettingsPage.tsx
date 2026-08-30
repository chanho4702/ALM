import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import {
  Badge,
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
  ProjectDefaultAssignee,
  ProjectRole,
  IssueType,
  Project,
  SettingsScheme,
  WorkflowStatus,
  WorkflowTransition,
  WorkflowLayout,
  User,
} from "../store/types";
import type { ResolvedSettings } from "../store/jiraStore";
import {
  assignScheme,
  deleteProject,
  archiveProject,
  unarchiveProject,
  listIssues,
  listSchemes,
  listUsers,
  getMyProjectRole,
  resolveSettings,
  setProjectCustom,
  updateProject,
  updateProjectCustomSettings,
} from "../store/jiraStore";
import { pruneProject } from "../store/uiStore";
import { StatusEditor } from "../components/StatusEditor";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { ProjectAvatar } from "../components/ProjectAvatar";
import { ProjectMembersPanel } from "../components/ProjectMembersPanel";
import { ProjectShortcutsPanel } from "../components/ProjectShortcutsPanel";
import { PROJECT_COLOR_OPTIONS } from "../components/ProjectAvatar";
import { TYPE_ICON_OPTIONS } from "../components/typeIcons";
import { JiraImportPanel } from "../components/JiraImportPanel";
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
  const [descriptionDraft, setDescriptionDraft] = useState(project?.description ?? "");
  const [categoryDraft, setCategoryDraft] = useState(project?.category ?? "");
  const [leadDraft, setLeadDraft] = useState(project?.leadId ?? NO_LEAD);
  const [defaultAssigneeDraft, setDefaultAssigneeDraft] = useState<ProjectDefaultAssignee>(
    project?.defaultAssignee ?? "unassigned",
  );
  const [iconDraft, setIconDraft] = useState(project?.icon || AUTO);
  const [colorDraft, setColorDraft] = useState(project?.color || AUTO);
  const [urlDraft, setUrlDraft] = useState(project?.url ?? "");
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
  }, [currentProjectId]);

  useEffect(() => {
    if (!project) return;
    setNameDraft(project.name);
    setDescriptionDraft(project.description);
    setCategoryDraft(project.category);
    setLeadDraft(project.leadId ?? NO_LEAD);
    setDefaultAssigneeDraft(project.defaultAssignee);
    setIconDraft(project.icon || AUTO);
    setColorDraft(project.color || AUTO);
    setUrlDraft(project.url);
    void getMyProjectRole(project.id).then(setMyRole).catch(() => setMyRole(null));
    let cancelled = false;
    void listIssues(project.id).then((issues) => {
      if (!cancelled) setIssueCount(issues.length);
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

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await updateProject(project.id, {
        name: nameDraft,
        description: descriptionDraft,
        category: categoryDraft,
        leadId: leadDraft === NO_LEAD ? null : leadDraft,
        defaultAssignee: defaultAssigneeDraft,
        icon: iconDraft === AUTO ? "" : iconDraft,
        color: colorDraft === AUTO ? "" : colorDraft,
        url: urlDraft,
      });
      await onProjectsChanged();
      toast({ title: "프로젝트를 수정했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "수정 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
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
                await updateProjectCustomSettings(project.id, {
                  ...resolved.body,
                  statuses: statusesDraft,
                  transitions: transitionsDraft,
                  layout: layoutDraft,
                });
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
                  <Lozenge key={status.id} appearance={status.color ?? "neutral"}>
                    {status.name}
                  </Lozenge>
                ))}
            </div>
            <WorkflowCanvas
              statuses={resolved.body.statuses}
              transitions={resolved.body.transitions ?? []}
              layout={resolved.body.layout}
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
                  label={name}
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
                  label={name}
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
              options={prioritiesDraft.map((id) => ({ value: id, label: priorityName(priorities, id) }))}
              onValueChange={setDefaultPriorityDraft}
            />
            <Button type="submit" size="small">
              저장
            </Button>
          </form>
        ) : (
          <div className="admin-scheme-preview" data-testid="types-readonly">
            {resolved.body.enabledTypes.map((type) => (
              <Lozenge key={type} appearance={typeAppearance(issueTypes, type)}>
                {typeName(issueTypes, type)}
              </Lozenge>
            ))}
            <span className="admin-scheme-sep" aria-hidden>·</span>
            {resolved.body.enabledPriorities.map((id) => (
              <Lozenge key={id} appearance={priorityAppearance(priorities, id)}>
                {priorityName(priorities, id)}
                {id === resolved.body.defaultPriority ? " (기본)" : ""}
              </Lozenge>
            ))}
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
        {section === "workflow" ? workflow : null}
        {section === "types" ? types : null}
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
