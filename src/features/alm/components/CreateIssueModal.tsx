import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Button, Checkbox, Modal, Select, TextField, useToast } from "@chanho/react";
import { RichTextEditor } from "./editor/RichTextEditor";
import type {
  Component,
  Issue,
  IssueFieldId,
  IssuePriority,
  IssueType,
  Project,
  ProjectVersion,
  SettingsBody,
  Sprint,
  User,
} from "../store/types";
import {
  addIssueLink,
  createIssue,
  getCurrentUser,
  listComponents,
  listIssues,
  listSprints,
  listUsers,
  listVersions,
  resolveSettings,
} from "../store/jiraStore";
import { priorityName, ISSUE_TYPES, typeLevel, typeName } from "./labels";
import { FIELD_LABELS, resolveFields, withRequiredMark } from "./fieldConfig";
import { isEmptyHtml } from "../store/richText";
import { usePriorities } from "./usePriorities";
import { useIssueTypes } from "./useIssueTypes";
import { useLinkTypes } from "./useLinkTypes";
import { LINK_KIND_DEFAULT, linkKindOptions, parseLinkKind, type LinkKind } from "./linkKinds";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → null은 센티널로 표현
const UNASSIGNED = "unassigned";
const NO_PARENT = "__none__";
const BACKLOG = "__backlog__";
const NO_VERSION = "__no_version__";

interface LinkDraft {
  kind: LinkKind;
  targetId: string;
}

export interface CreateIssueModalProps {
  projects: Project[];
  /** 현재 보고 있는 프로젝트 — 프로젝트 Select 기본값 */
  defaultProjectId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 생성 성공 후 호출 — 셸이 상세 화면으로 이동시킨다 */
  onCreated: (issue: Issue) => void | Promise<void>;
}

/**
 * 지라의 전역 "만들기" 대화상자 — 프로젝트·타입을 고른 뒤 요약부터 연결 이슈까지 한 열로 내려간다.
 * 계층 깊이 제한이 없으므로 어떤 이슈든 상위 항목이 될 수 있다(하위 작업 타입만 상위 항목 필수).
 */
export function CreateIssueModal({
  projects,
  defaultProjectId,
  open,
  onOpenChange,
  onCreated,
}: CreateIssueModalProps) {
  const toast = useToast();
  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<IssueType>("task");
  const issueTypes = useIssueTypes();
  const priorities = usePriorities();
  const linkTypes = useLinkTypes();
  const PRIORITIES = priorities.map((d) => d.id);
  /** 선택한 프로젝트의 활성 타입 (설정 스킴) + 하위 작업 계층 타입 */
  const [enabledTypes, setEnabledTypes] = useState<IssueType[]>([...ISSUE_TYPES]);
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [assigneeId, setAssigneeId] = useState(UNASSIGNED);
  const [dueDate, setDueDate] = useState("");
  const [labelsText, setLabelsText] = useState("");
  const [components, setComponents] = useState<Component[]>([]);
  const [componentIds, setComponentIds] = useState<string[]>([]);
  const [projectIssues, setProjectIssues] = useState<Issue[]>([]);
  const [parentId, setParentId] = useState(NO_PARENT);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [sprintId, setSprintId] = useState(BACKLOG);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [fixVersionId, setFixVersionId] = useState(NO_VERSION);
  const [estimateHours, setEstimateHours] = useState("");
  const [linkKind, setLinkKind] = useState<LinkKind>(LINK_KIND_DEFAULT);
  const [linkTargetId, setLinkTargetId] = useState(NO_PARENT);
  const [linkDrafts, setLinkDrafts] = useState<LinkDraft[]>([]);
  const [createAnother, setCreateAnother] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** 프로젝트 설정 본문 — 필드 구성은 아래에서 **선택한 이슈 타입으로** 해석한다 */
  const [settingsBody, setSettingsBody] = useState<SettingsBody | null>(null);

  useEffect(() => {
    void listUsers().then(setUsers);
    void getCurrentUser().then(setMe);
  }, []);

  // 프로젝트가 바뀌면 그 프로젝트의 컴포넌트·이슈(상위 항목/연결 후보)·스프린트를 읽는다
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void listComponents(projectId)
      .then((list) => {
        if (!cancelled) setComponents(list);
      })
      .catch(() => {
        if (!cancelled) setComponents([]);
      });
    void listIssues(projectId)
      .then((list) => {
        if (!cancelled) setProjectIssues(list);
      })
      .catch(() => {
        if (!cancelled) setProjectIssues([]);
      });
    void listSprints(projectId)
      .then((list) => {
        if (!cancelled) setSprints(list.filter((s) => s.state !== "done"));
      })
      .catch(() => {
        if (!cancelled) setSprints([]);
      });
    // 보관된 버전은 이슈를 달 수 없다(서버가 거부) — 선택지에서 뺀다
    void listVersions(projectId)
      .then((list) => {
        if (!cancelled) setVersions(list.filter((v) => v.status !== "archived"));
      })
      .catch(() => {
        if (!cancelled) setVersions([]);
      });
    setComponentIds([]);
    setParentId(NO_PARENT);
    setSprintId(BACKLOG);
    setFixVersionId(NO_VERSION);
    setEstimateHours("");
    setLinkDrafts([]);
    setLinkTargetId(NO_PARENT);
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // 열릴 때마다 현재 프로젝트를 기본값으로 재설정한다
  useEffect(() => {
    if (open) setProjectId(defaultProjectId ?? projects[0]?.id ?? "");
  }, [open, defaultProjectId, projects]);

  // 프로젝트 설정(스킴)의 활성 타입 반영 — 현재 선택이 꺼져 있으면 첫 활성 타입으로
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    void resolveSettings(projectId).then(({ body }) => {
      if (cancelled) return;
      // 하위 작업 계층 타입은 활성 목록과 무관하게 항상 만들 수 있다(상위 항목 필수)
      const subtaskTypes = issueTypes.filter((t) => t.level === "subtask").map((t) => t.id);
      const creatable: IssueType[] = [
        ...body.enabledTypes.filter((t) => typeLevel(issueTypes, t) !== "subtask"),
        ...subtaskTypes,
      ];
      setEnabledTypes(creatable);
      setType((prev) => (creatable.includes(prev) ? prev : creatable[0]));
      setSettingsBody(body);
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, issueTypes]);

  /**
   * 숨긴 필드는 그리지도 보내지도 않는다. 타입별 덮어쓰기가 있으면 그쪽이 이기므로
   * **타입을 바꾸면 표시·필수가 즉시 갱신**된다(스토어·서버도 요청의 타입으로 검사한다).
   */
  const fields = useMemo(() => resolveFields(settingsBody, type), [settingsBody, type]);
  const parentRequired = typeLevel(issueTypes, type) === "subtask";
  const show = (id: IssueFieldId) => fields[id].visible;
  const required = (id: IssueFieldId) => fields[id].visible && fields[id].required;
  const fieldLabel = (id: IssueFieldId, text: string) => withRequiredMark(text, required(id));
  /** 하위 작업은 상위 항목이 있어야 만들 수 있다 — 필드를 숨겨도 그때는 그린다(막다른 폼 방지) */
  const showParent = show("parent") || parentRequired;
  const parsedLabels = labelsText
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
  /**
   * 필드 구성의 필수 검사 — 숨긴 필드는 검사하지 않는다(스토어·서버도 같은 규칙).
   * 첨부·링크는 만든 뒤에 붙는 값이라 여기서 막지 않는다(서버도 강제하지 않는다).
   * 이름 목록으로 모아 버튼 옆에 그대로 보여준다 — 비활성 사유를 눈에 보이게.
   */
  const missingRequiredFields: IssueFieldId[] = [
    ...(required("description") && isEmptyHtml(description) ? (["description"] as const) : []),
    ...(required("assignee") && assigneeId === UNASSIGNED ? (["assignee"] as const) : []),
    ...(required("labels") && parsedLabels.length === 0 ? (["labels"] as const) : []),
    ...(required("components") && componentIds.length === 0 ? (["components"] as const) : []),
    ...(required("parent") && parentId === NO_PARENT ? (["parent"] as const) : []),
    ...(required("sprint") && sprintId === BACKLOG ? (["sprint"] as const) : []),
    ...(required("fixVersion") && fixVersionId === NO_VERSION ? (["fixVersion"] as const) : []),
    ...(required("dueDate") && !dueDate ? (["dueDate"] as const) : []),
    ...(required("estimate") && !estimateHours.trim() ? (["estimate"] as const) : []),
  ];
  const canSubmit =
    !submitting &&
    Boolean(title.trim()) &&
    Boolean(projectId) &&
    missingRequiredFields.length === 0 &&
    (!parentRequired || parentId !== NO_PARENT);

  const reset = (keepContext: boolean) => {
    setTitle("");
    setDescription("");
    setLinkDrafts([]);
    setLinkTargetId(NO_PARENT);
    if (keepContext) return;
    setType("task");
    setPriority("medium");
    setAssigneeId(UNASSIGNED);
    setDueDate("");
    setLabelsText("");
    setComponentIds([]);
    setParentId(NO_PARENT);
    setSprintId(BACKLOG);
    setFixVersionId(NO_VERSION);
    setEstimateHours("");
    setCreateAnother(false);
  };

  const addLinkDraft = () => {
    if (linkTargetId === NO_PARENT) return;
    setLinkDrafts((prev) =>
      prev.some((d) => d.kind === linkKind && d.targetId === linkTargetId)
        ? prev
        : [...prev, { kind: linkKind, targetId: linkTargetId }],
    );
    setLinkTargetId(NO_PARENT);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const issue = await createIssue({
        projectId,
        title,
        // 숨긴 필드는 값도 보내지 않는다 — 스토어가 기본값(우선순위·기본 담당자)을 채운다
        description: show("description") ? description : "",
        type,
        ...(show("priority") ? { priority } : {}),
        assigneeId: show("assignee") && assigneeId !== UNASSIGNED ? assigneeId : null,
        dueDate: show("dueDate") ? dueDate || null : null,
        labels: show("labels") ? parsedLabels : [],
        componentIds: show("components") ? componentIds : [],
        parentId: showParent && parentId !== NO_PARENT ? parentId : null,
        sprintId: show("sprint") && sprintId !== BACKLOG ? sprintId : null,
        fixVersionId: show("fixVersion") && fixVersionId !== NO_VERSION ? fixVersionId : null,
        estimateHours:
          show("estimate") && estimateHours.trim() ? Number(estimateHours) : null,
      });
      // 연결 이슈는 생성 뒤에 건다 — 하나가 실패해도 이슈 자체는 남고, 실패만 알린다
      const failed: string[] = [];
      for (const draft of linkDrafts) {
        const { type: linkType, inbound } = parseLinkKind(draft.kind);
        try {
          await addIssueLink({
            sourceId: inbound ? draft.targetId : issue.id,
            targetId: inbound ? issue.id : draft.targetId,
            type: linkType,
          });
        } catch {
          failed.push(projectIssues.find((i) => i.id === draft.targetId)?.key ?? draft.targetId);
        }
      }
      toast({
        title: `${issue.key}를 만들었습니다`,
        description: failed.length > 0 ? `연결하지 못한 이슈: ${failed.join(", ")}` : undefined,
        appearance: failed.length > 0 ? "info" : "success",
      });
      if (createAnother) {
        reset(true);
        setProjectIssues((prev) => [...prev, issue]);
        return;
      }
      reset(false);
      onOpenChange(false);
      await onCreated(issue);
    } catch (error) {
      toast({
        title: "이슈 생성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const issueOption = (i: Issue) => ({ value: i.id, label: `${i.key} ${i.title}` });
  const draftLabel = (draft: LinkDraft) => {
    const { type: linkType, inbound } = parseLinkKind(draft.kind);
    const def = linkTypes.find((t) => t.id === linkType);
    const verb = def ? (inbound ? def.inward : def.outward) : linkType;
    const target = projectIssues.find((i) => i.id === draft.targetId);
    return `${verb} ${target?.key ?? draft.targetId}`;
  };

  return (
    <Modal
      trigger={<span hidden />}
      title="이슈 만들기"
      description="필수 항목은 *로 표시됩니다."
      open={open}
      onOpenChange={(next) => {
        if (!next) reset(false);
        onOpenChange(next);
      }}
      className="create-issue-modal"
    >
      <form className="create-issue-form" onSubmit={handleSubmit}>
        <div className="create-issue-grid">
          <Select
            label="프로젝트 *"
            value={projectId}
            options={projects.map((p) => ({ value: p.id, label: `${p.name} (${p.key})` }))}
            onValueChange={setProjectId}
          />
          <Select
            label="이슈 타입 *"
            value={type}
            options={enabledTypes.map((t) => ({ value: t, label: typeName(issueTypes, t) }))}
            onValueChange={setType}
          />
        </div>
        <hr className="create-issue-divider" />
        <TextField
          label="요약 *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="무엇을 해야 하나요?"
        />
        {show("description") ? (
        <div className="create-issue-editor-field">
          {/* 시각 라벨은 다른 필드와 같은 자리. 접근 이름·테스트 레지스트리 키는 "설명"으로 고정한다 */}
          <span className="create-issue-field-label" aria-hidden="true">
            {fieldLabel("description", "설명")}
          </span>
        <RichTextEditor
          label="설명"
          value={description}
          onChange={setDescription}
          users={users}
          placeholder="배경, 완료 조건, 참고 링크… (@로 멘션)"
          minHeight={120}
        />
        </div>
        ) : null}
        {show("assignee") ? (
        <div className="create-issue-assignee">
          <Select
            label={fieldLabel("assignee", "담당자")}
            value={assigneeId}
            options={[
              { value: UNASSIGNED, label: "미지정" },
              ...users.map((u) => ({ value: u.id, label: u.name })),
            ]}
            onValueChange={setAssigneeId}
          />
          {me ? (
            <Button
              type="button"
              variant="ghost"
              size="small"
              onClick={() => setAssigneeId(me.id)}
              disabled={assigneeId === me.id}
            >
              나에게 할당
            </Button>
          ) : null}
        </div>
        ) : null}
        <div className="create-issue-grid">
          {show("priority") ? (
          <Select
            label={fieldLabel("priority", "우선순위")}
            value={priority}
            options={PRIORITIES.map((p) => ({ value: p, label: priorityName(priorities, p) }))}
            onValueChange={(v) => setPriority(v as IssuePriority)}
          />
          ) : null}
          {show("labels") ? (
          <TextField
            label={fieldLabel("labels", "라벨")}
            value={labelsText}
            onChange={(e) => setLabelsText(e.target.value)}
            placeholder="콤마로 구분 (예: backend, api)"
          />
          ) : null}
        </div>
        {show("components") && components.length === 0 && required("components") ? (
          <div className="create-issue-empty-field" role="group" aria-label="컴포넌트 *">
            <span className="create-issue-field-label" aria-hidden="true">컴포넌트 *</span>
            <p className="create-issue-empty-note">
              이 프로젝트에 컴포넌트가 없습니다 — 프로젝트 설정 &gt; 컴포넌트에서 먼저 만드세요.
            </p>
          </div>
        ) : null}
        {show("components") && components.length > 0 ? (
          <div
            className="board-settings-checks"
            role="group"
            aria-label={fieldLabel("components", "컴포넌트")}
          >
            {components.map((c) => (
              <Checkbox
                key={c.id}
                label={c.name}
                checked={componentIds.includes(c.id)}
                onCheckedChange={() =>
                  setComponentIds((prev) => (prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]))
                }
              />
            ))}
          </div>
        ) : null}
        {showParent ? (
        <Select
          label={parentRequired ? "상위 항목 *" : fieldLabel("parent", "상위 항목")}
          value={parentId}
          options={[{ value: NO_PARENT, label: "없음" }, ...projectIssues.map(issueOption)]}
          onValueChange={setParentId}
        />
        ) : null}
        <div className="create-issue-grid">
          {show("sprint") ? (
          <Select
            label={fieldLabel("sprint", "스프린트")}
            value={sprintId}
            options={[
              { value: BACKLOG, label: "백로그" },
              ...sprints.map((s) => ({ value: s.id, label: s.state === "active" ? `${s.name} (진행 중)` : s.name })),
            ]}
            onValueChange={setSprintId}
          />
          ) : null}
          {show("dueDate") ? (
          <TextField
            label={fieldLabel("dueDate", "마감일")}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          ) : null}
        </div>
        {show("fixVersion") ? (
          <Select
            label={fieldLabel("fixVersion", "수정 버전")}
            value={fixVersionId}
            options={[
              { value: NO_VERSION, label: "없음" },
              ...versions.map((v) => ({ value: v.id, label: v.name })),
            ]}
            onValueChange={setFixVersionId}
          />
        ) : null}
        {show("estimate") ? (
          <TextField
            label={fieldLabel("estimate", "예상 시간 (h)")}
            type="number"
            min={0.5}
            step={0.5}
            placeholder="미지정"
            value={estimateHours}
            onChange={(e) => setEstimateHours(e.target.value)}
          />
        ) : null}
        {show("links") ? (
        <fieldset className="create-issue-links">
          {/* 링크는 만든 뒤에 붙는 값이라 필수여도 제출을 막지 않는다 — 표시만 한다(서버도 강제하지 않음) */}
          <legend>{fieldLabel("links", "연결 이슈")}</legend>
          <div className="create-issue-link-row">
            <Select
              label="종류"
              value={linkKind}
              options={linkKindOptions(linkTypes)}
              onValueChange={setLinkKind}
            />
            <Select
              label="대상 이슈"
              value={linkTargetId}
              options={[{ value: NO_PARENT, label: "선택하세요" }, ...projectIssues.map(issueOption)]}
              onValueChange={setLinkTargetId}
            />
            <Button type="button" size="small" variant="subtle" disabled={linkTargetId === NO_PARENT} onClick={addLinkDraft}>
              추가
            </Button>
          </div>
          {linkDrafts.length > 0 ? (
            <ul className="create-issue-link-list" aria-label="추가할 연결">
              {linkDrafts.map((draft) => (
                <li key={`${draft.kind}:${draft.targetId}`}>
                  <span>{draftLabel(draft)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    aria-label={`${draftLabel(draft)} 제거`}
                    onClick={() => setLinkDrafts((prev) => prev.filter((d) => d !== draft))}
                  >
                    ×
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>
        ) : null}
        <div className="create-issue-footer">
          <Checkbox label="다른 이슈 계속 만들기" checked={createAnother} onCheckedChange={(v) => setCreateAnother(v === true)} />
          <div className="project-form-actions">
            {/* 비활성 사유를 문장으로 — 색이나 비활성 상태만으로 알리지 않는다 */}
            {missingRequiredFields.length > 0 ? (
              <span className="create-issue-missing" role="status">
                필수 항목 미입력: {missingRequiredFields.map((id) => FIELD_LABELS[id]).join(", ")}
              </span>
            ) : null}
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              만들기
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
