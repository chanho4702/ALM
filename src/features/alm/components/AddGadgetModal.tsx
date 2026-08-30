import { useState } from "react";
import { Button, Modal, Select, TextField } from "@chanho/react";
import type { DashboardGadget, GadgetType, Project } from "../store/types";
import { GADGET_DESCRIPTIONS, GADGET_LABELS, PROJECT_SCOPED } from "./DashboardGadgets";

const TYPES = Object.keys(GADGET_LABELS) as GadgetType[];
const ALL_PROJECTS = "__all__";
const PERIODS: { value: string; label: string }[] = [
  { value: "7", label: "최근 7일" },
  { value: "30", label: "최근 30일" },
  { value: "90", label: "최근 90일" },
];

export interface AddGadgetModalProps {
  open: boolean;
  projects: Project[];
  onClose: () => void;
  onAdd: (gadget: Omit<DashboardGadget, "id">) => void;
}

/** 가젯 추가 — 종류를 고르면 필요한 설정(프로젝트·기간·쿼리)만 묻는다 */
export function AddGadgetModal({ open, projects, onClose, onAdd }: AddGadgetModalProps) {
  const [type, setType] = useState<GadgetType>("status-distribution");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? ALL_PROJECTS);
  const [period, setPeriod] = useState("7");
  const [query, setQuery] = useState("");
  const [column, setColumn] = useState("0");

  if (!open) return null;
  const needsProject = PROJECT_SCOPED.has(type);
  const projectMissing = needsProject && (projectId === ALL_PROJECTS || !projectId);

  const submit = () => {
    onAdd({
      type,
      column: column === "1" ? 1 : 0,
      config: {
        ...(projectId !== ALL_PROJECTS ? { projectId } : {}),
        ...(type === "worklog-summary" || type === "recent-issues" ? { period: Number(period) as 7 | 30 | 90 } : {}),
        ...(type === "filter-results" ? { query: query.trim() } : {}),
      },
    });
    onClose();
  };

  return (
    <Modal
      trigger={<span hidden />}
      title="가젯 추가"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div className="project-create-form">
        <Select
          label="가젯"
          value={type}
          options={TYPES.map((t) => ({ value: t, label: GADGET_LABELS[t] }))}
          onValueChange={(v) => setType(v as GadgetType)}
        />
        <p className="settings-help">{GADGET_DESCRIPTIONS[type]}</p>
        <Select
          label="프로젝트"
          value={projectId}
          options={[
            ...(needsProject ? [] : [{ value: ALL_PROJECTS, label: "전체 프로젝트" }]),
            ...projects.map((p) => ({ value: p.id, label: `${p.name} (${p.key})` })),
          ]}
          onValueChange={setProjectId}
        />
        {type === "worklog-summary" || type === "recent-issues" ? (
          <Select label="기간" value={period} options={PERIODS} onValueChange={setPeriod} />
        ) : null}
        {type === "filter-results" ? (
          <TextField
            label="스마트 검색 쿼리"
            placeholder="예: 담당:나 상태:진행중"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        ) : null}
        <Select
          label="열"
          value={column}
          options={[
            { value: "0", label: "왼쪽" },
            { value: "1", label: "오른쪽" },
          ]}
          onValueChange={setColumn}
        />
        <div className="project-form-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            취소
          </Button>
          <Button type="button" onClick={submit} disabled={projectMissing}>
            추가
          </Button>
        </div>
      </div>
    </Modal>
  );
}
