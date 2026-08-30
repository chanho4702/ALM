import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Modal, Select, TextField, useToast } from "@chanho/react";
import type { IssuePriority, Sprint, User, WorkflowStatus } from "../store/types";
import { bulkUpdateIssues } from "../store/jiraStore";
import type { BulkIssuePatch } from "../store/jiraStore";
import { priorityName } from "./labels";
import { usePriorities } from "./usePriorities";

const KEEP = "__keep__"; // "변경 안 함" 센티널 — Select는 빈 문자열 value를 쓰지 않는다
const NONE = "__none__"; // 담당자 미지정 / 백로그

const splitLabels = (text: string) =>
  [...new Set(text.split(",").map((l) => l.trim()).filter(Boolean))];

export interface BulkEditModalProps {
  open: boolean;
  issueIds: string[];
  statuses: WorkflowStatus[];
  users: User[];
  sprints: Sprint[];
  onOpenChange: (open: boolean) => void;
  /** 적용이 끝나면(일부 실패 포함) 호출 — 목록 재조회용 */
  onDone: () => void;
}

/**
 * 대량 변경 — 고른 이슈에 같은 변경을 한 번에. 각 필드는 "변경 안 함"이 기본이라 손댄 것만 바뀐다.
 * 전이 규칙 등으로 막힌 이슈는 나머지와 분리해 사유와 함께 알린다(전부 롤백하지 않는다).
 */
export function BulkEditModal({
  open,
  issueIds,
  statuses,
  users,
  sprints,
  onOpenChange,
  onDone,
}: BulkEditModalProps) {
  const toast = useToast();
  const priorities = usePriorities();
  const PRIORITIES = priorities.map((d) => d.id);
  const [status, setStatus] = useState(KEEP);
  const [priority, setPriority] = useState(KEEP);
  const [assignee, setAssignee] = useState(KEEP);
  const [sprint, setSprint] = useState(KEEP);
  const [addLabels, setAddLabels] = useState("");
  const [removeLabels, setRemoveLabels] = useState("");
  const [busy, setBusy] = useState(false);

  const patch: BulkIssuePatch = {
    ...(status !== KEEP ? { status } : {}),
    ...(priority !== KEEP ? { priority: priority as IssuePriority } : {}),
    ...(assignee !== KEEP ? { assigneeId: assignee === NONE ? null : assignee } : {}),
    ...(sprint !== KEEP ? { sprintId: sprint === NONE ? null : sprint } : {}),
    ...(addLabels.trim() ? { addLabels: splitLabels(addLabels) } : {}),
    ...(removeLabels.trim() ? { removeLabels: splitLabels(removeLabels) } : {}),
  };
  const dirty = Object.keys(patch).length > 0;

  const reset = () => {
    setStatus(KEEP);
    setPriority(KEEP);
    setAssignee(KEEP);
    setSprint(KEEP);
    setAddLabels("");
    setRemoveLabels("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty) return;
    setBusy(true);
    try {
      const result = await bulkUpdateIssues(issueIds, patch);
      toast({
        title: `${result.updated}개 이슈를 변경했습니다`,
        appearance: result.failed.length > 0 ? "info" : "success",
      });
      if (result.failed.length > 0) {
        toast({
          title: `${result.failed.length}개는 바꾸지 못했습니다`,
          description: result.failed.map((f) => `${f.key}: ${f.reason}`).join(" · "),
          appearance: "danger",
        });
      }
      reset();
      onOpenChange(false);
      onDone();
    } catch (error) {
      toast({
        title: "대량 변경 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      trigger={<span hidden />}
      title="대량 변경"
      description={`${issueIds.length}개 이슈에 같은 변경을 적용합니다. 손대지 않은 항목은 그대로 둡니다.`}
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <form className="create-issue-form" onSubmit={(e) => void handleSubmit(e)}>
        <div className="create-issue-grid">
          <Select
            label="상태"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: KEEP, label: "변경 안 함" },
              ...statuses.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <Select
            label="우선순위"
            value={priority}
            onValueChange={setPriority}
            options={[
              { value: KEEP, label: "변경 안 함" },
              ...PRIORITIES.map((p) => ({ value: p, label: priorityName(priorities, p) })),
            ]}
          />
          <Select
            label="담당자"
            value={assignee}
            onValueChange={setAssignee}
            options={[
              { value: KEEP, label: "변경 안 함" },
              { value: NONE, label: "미지정" },
              ...users.map((u) => ({ value: u.id, label: u.name })),
            ]}
          />
          <Select
            label="스프린트"
            value={sprint}
            onValueChange={setSprint}
            options={[
              { value: KEEP, label: "변경 안 함" },
              { value: NONE, label: "백로그" },
              ...sprints
                .filter((s) => s.state !== "done")
                .map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
          <TextField
            label="라벨 추가"
            placeholder="콤마로 구분"
            value={addLabels}
            onChange={(e) => setAddLabels(e.target.value)}
          />
          <TextField
            label="라벨 제거"
            placeholder="콤마로 구분"
            value={removeLabels}
            onChange={(e) => setRemoveLabels(e.target.value)}
          />
        </div>
        <div className="create-issue-actions">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" disabled={!dirty || busy}>
            적용
          </Button>
        </div>
      </form>
    </Modal>
  );
}
