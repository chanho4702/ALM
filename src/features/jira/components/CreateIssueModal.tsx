import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Modal, Select, TextArea, TextField, useToast } from "@chanho/react";
import type { Issue, IssuePriority, IssueType, Project, User } from "../store/types";
import { createIssue, listUsers } from "../store/jiraStore";
import { ISSUE_TYPES, PRIORITY_LABELS, TYPE_LABELS } from "./labels";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → null은 센티널로 표현
const UNASSIGNED = "unassigned";
const PRIORITIES: IssuePriority[] = ["high", "medium", "low"];

export interface CreateIssueModalProps {
  projects: Project[];
  /** 현재 보고 있는 프로젝트 — 프로젝트 Select 기본값 */
  defaultProjectId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 생성 성공 후 호출 — 셸이 상세 화면으로 이동시킨다 */
  onCreated: (issue: Issue) => void | Promise<void>;
}

/** 지라의 전역 "만들기" — 어느 화면에서든 이슈를 백로그에 생성한다 */
export function CreateIssueModal({
  projects,
  defaultProjectId,
  open,
  onOpenChange,
  onCreated,
}: CreateIssueModalProps) {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<IssueType>("task");
  const [priority, setPriority] = useState<IssuePriority>("medium");
  const [assigneeId, setAssigneeId] = useState(UNASSIGNED);
  const [dueDate, setDueDate] = useState("");
  const [labelsText, setLabelsText] = useState("");

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);

  // 열릴 때마다 현재 프로젝트를 기본값으로 재설정한다
  useEffect(() => {
    if (open) setProjectId(defaultProjectId ?? projects[0]?.id ?? "");
  }, [open, defaultProjectId, projects]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setType("task");
    setPriority("medium");
    setAssigneeId(UNASSIGNED);
    setDueDate("");
    setLabelsText("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const issue = await createIssue({
        projectId,
        title,
        description,
        type,
        priority,
        assigneeId: assigneeId === UNASSIGNED ? null : assigneeId,
        dueDate: dueDate || null,
        labels: labelsText
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
      });
      toast({ title: `${issue.key}를 만들었습니다`, appearance: "success" });
      reset();
      onOpenChange(false);
      await onCreated(issue);
    } catch (error) {
      toast({
        title: "이슈 생성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <Modal
      trigger={<span hidden />}
      title="이슈 만들기"
      description="이슈는 선택한 프로젝트의 백로그에 생성됩니다."
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      className="create-issue-modal"
    >
      <form className="create-issue-form" onSubmit={handleSubmit}>
        <Select
          label="프로젝트"
          value={projectId}
          options={projects.map((p) => ({ value: p.id, label: `${p.name} (${p.key})` }))}
          onValueChange={setProjectId}
        />
        <TextField
          label="제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="무엇을 해야 하나요?"
        />
        <TextArea
          label="설명"
          rows={3}
          placeholder="이슈 설명 (선택)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="create-issue-grid">
          <Select
            label="타입"
            value={type}
            // 하위 작업은 부모가 필수라 이슈 상세의 "하위 작업 추가"에서만 만든다
            options={ISSUE_TYPES.filter((t) => t !== "subtask").map((t) => ({
              value: t,
              label: TYPE_LABELS[t],
            }))}
            onValueChange={(v) => setType(v as IssueType)}
          />
          <Select
            label="우선순위"
            value={priority}
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
            onValueChange={(v) => setPriority(v as IssuePriority)}
          />
          <Select
            label="담당자"
            value={assigneeId}
            options={[
              { value: UNASSIGNED, label: "미지정" },
              ...users.map((u) => ({ value: u.id, label: u.name })),
            ]}
            onValueChange={setAssigneeId}
          />
          <TextField
            label="마감일"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <TextField
            label="라벨"
            value={labelsText}
            onChange={(e) => setLabelsText(e.target.value)}
            placeholder="콤마로 구분 (예: backend, api)"
          />
        </div>
        <div className="project-form-actions">
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" disabled={!title.trim() || !projectId}>
            만들기
          </Button>
        </div>
      </form>
    </Modal>
  );
}
