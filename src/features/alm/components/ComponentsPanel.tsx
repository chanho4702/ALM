import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Card, Select, TextField, useToast } from "@chanho/react";
import type { Component, ComponentDefaultAssignee, User } from "../store/types";
import { createComponent, deleteComponent, listComponents, listUsers, updateComponent } from "../store/jiraStore";

const NO_LEAD = "__none__";
const RULE_OPTIONS: { value: ComponentDefaultAssignee; label: string }[] = [
  { value: "project", label: "프로젝트 기본값" },
  { value: "lead", label: "컴포넌트 리더" },
  { value: "unassigned", label: "미지정" },
];

export interface ComponentsPanelProps {
  projectId: string;
  canManage: boolean;
}

/**
 * 프로젝트 설정 → 컴포넌트(지라 Components). 이름·설명·리더·기본 담당자 규칙을 정하고,
 * 이슈는 여러 컴포넌트를 가질 수 있다. 컴포넌트 규칙이 프로젝트 기본 담당자보다 우선한다.
 */
export function ComponentsPanel({ projectId, canManage }: ComponentsPanelProps) {
  const toast = useToast();
  const [components, setComponents] = useState<Component[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [leadId, setLeadId] = useState(NO_LEAD);
  const [rule, setRule] = useState<ComponentDefaultAssignee>("project");

  const reload = useCallback(async () => {
    const list = await listComponents(projectId);
    setComponents(list);
    setDrafts(Object.fromEntries(list.map((c) => [c.id, c.name])));
  }, [projectId]);

  useEffect(() => {
    void reload();
    void listUsers().then(setUsers);
  }, [reload]);

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
    await reload();
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run("컴포넌트 추가 실패", async () => {
      await createComponent(projectId, {
        name,
        description,
        leadId: leadId === NO_LEAD ? null : leadId,
        defaultAssignee: rule,
      });
      setName("");
      setDescription("");
      toast({ title: "컴포넌트를 추가했습니다", appearance: "success" });
    });
  };

  const userOptions = [{ value: NO_LEAD, label: "없음" }, ...users.map((u) => ({ value: u.id, label: u.name }))];

  return (
    <div className="project-settings">
      <Card padding="lg" title="컴포넌트">
        <p className="settings-help">
          프로젝트를 나누는 구성 단위입니다(예: API, UI, 문서). 이슈에 여러 개를 붙일 수 있고, 컴포넌트의
          기본 담당자 규칙이 프로젝트 기본 담당자보다 먼저 적용됩니다.
        </p>
        {canManage ? (
          <form className="status-editor-add status-editor-add--4" onSubmit={handleCreate}>
            <TextField label="새 컴포넌트 이름" placeholder="예: API" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="설명" value={description} onChange={(e) => setDescription(e.target.value)} />
            <Select label="컴포넌트 리더" value={leadId} options={userOptions} onValueChange={setLeadId} />
            <Select
              label="기본 담당자"
              value={rule}
              options={RULE_OPTIONS}
              onValueChange={(v) => setRule(v as ComponentDefaultAssignee)}
            />
            <Button type="submit" variant="secondary" disabled={!name.trim()}>
              컴포넌트 추가
            </Button>
          </form>
        ) : null}
        {components.length === 0 ? (
          <p className="settings-empty">아직 컴포넌트가 없습니다.</p>
        ) : (
          <ul className="status-editor-list" aria-label="컴포넌트 목록">
            {components.map((component) => (
              <li key={component.id} className="status-editor-row status-editor-row--type">
                <TextField
                  label={`${component.name} 이름`}
                  value={drafts[component.id] ?? component.name}
                  disabled={!canManage}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [component.id]: e.target.value }))}
                  onBlur={() => {
                    const next = (drafts[component.id] ?? "").trim();
                    if (next && next !== component.name) void run("이름 변경 실패", () => updateComponent(component.id, { name: next }));
                  }}
                />
                <Select
                  label={`${component.name} 리더`}
                  value={component.leadId ?? NO_LEAD}
                  options={userOptions}
                  disabled={!canManage}
                  onValueChange={(v) =>
                    void run("리더 변경 실패", () => updateComponent(component.id, { leadId: v === NO_LEAD ? null : v }))
                  }
                />
                <Select
                  label={`${component.name} 기본 담당자`}
                  value={component.defaultAssignee}
                  options={RULE_OPTIONS}
                  disabled={!canManage}
                  onValueChange={(v) =>
                    void run("기본 담당자 변경 실패", () =>
                      updateComponent(component.id, { defaultAssignee: v as ComponentDefaultAssignee }),
                    )
                  }
                />
                <span className="status-editor-usage">이슈 {component.issueCount}개</span>
                {canManage ? (
                  <div className="status-editor-row-actions">
                    <Button
                      type="button"
                      size="small"
                      variant="ghost"
                      aria-label={`${component.name} 삭제`}
                      onClick={() => void run("컴포넌트 삭제 실패", () => deleteComponent(component.id))}
                    >
                      삭제
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
