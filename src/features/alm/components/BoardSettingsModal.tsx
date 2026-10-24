import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Checkbox, Modal, Select, Switch, TextField, useToast } from "@chanho/react";
import type { Board, BoardColumn, BoardColumnMode, BoardSwimlane, IssueType, User, WorkflowStatus } from "../store/types";
import { BoardColumnMappingEditor } from "./BoardColumnMappingEditor";
import type { ColumnDraft } from "./BoardColumnMappingEditor";
import { deleteBoard, updateBoard } from "../store/jiraStore";
import { UI_CHANGED_EVENT } from "../store/uiStore";
import { useIssueTypes } from "./useIssueTypes";

const SWIMLANE_OPTIONS: { value: BoardSwimlane; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "assignee", label: "담당자별" },
  { value: "epic", label: "에픽별" },
];

export interface BoardSettingsModalProps {
  board: Board;
  users: User[];
  /** 프로젝트 워크플로 상태 (order순) — 컬럼 편집 행의 원천 */
  statuses: WorkflowStatus[];
  /** 보드 이슈들의 라벨 합집합 — 저장 필터 라벨 선택지 */
  labelOptions: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 저장 후 보드 재조회 */
  onSaved: () => void | Promise<void>;
  /** 삭제 후 기본 보드로 이동 */
  onDeleted: () => void | Promise<void>;
}

/** 보드 설정 — 이름·저장 필터·컬럼 이름/WIP·스윔레인·기본 지정·삭제 */
export function BoardSettingsModal({
  board,
  users,
  statuses,
  labelOptions,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: BoardSettingsModalProps) {
  const toast = useToast();
  const [name, setName] = useState(board.name);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(board.filter.assigneeIds);
  const [types, setTypes] = useState<IssueType[]>(board.filter.types);
  const issueTypes = useIssueTypes();
  const [labels, setLabels] = useState<string[]>(board.filter.labels);
  const [columns, setColumns] = useState<BoardColumn[]>(board.columns);
  /** 열 구성(C4) — 상태 형식(상태 = 열) / 매핑 형식(열 하나에 여러 상태) */
  const [columnMode, setColumnMode] = useState<BoardColumnMode>(board.columnMode ?? "status");
  const [mappedColumns, setMappedColumns] = useState<ColumnDraft[]>([]);
  const [swimlane, setSwimlane] = useState<BoardSwimlane>(board.swimlane);
  const [isDefault, setIsDefault] = useState(board.isDefault);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 다른 보드로 전환되거나 다시 열릴 때 초안 리셋 — 컬럼은 프로젝트 상태 목록에서 파생
  useEffect(() => {
    if (!open) return;
    setName(board.name);
    setAssigneeIds(board.filter.assigneeIds);
    setTypes(board.filter.types);
    setLabels(board.filter.labels);
    setColumns(
      statuses.map(
        (ws) =>
          board.columns.find((c) => c.status === ws.id) ?? {
            status: ws.id,
            name: ws.name,
            wipLimit: null,
          },
      ),
    );
    setColumnMode(board.columnMode ?? "status");
    // 매핑 초안은 지금 보드가 그리는 열에서 시작한다 — 상태 형식에서 바꾸면 상태마다 한 열(이름·WIP 유지)
    setMappedColumns(
      board.columnMode === "mapped"
        ? board.resolvedColumns.map((c) => ({ id: c.id, name: c.name, statuses: [...c.statuses], wipLimit: c.wipLimit }))
        : statuses.map((ws) => {
            const override = board.columns.find((c) => c.status === ws.id);
            return { name: override?.name || ws.name, statuses: [ws.id], wipLimit: override?.wipLimit ?? null };
          }),
    );
    setSwimlane(board.swimlane);
    setIsDefault(board.isDefault);
  }, [open, board, statuses]);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await updateBoard(board.id, {
        name,
        filter: { assigneeIds, types, labels },
        // 매핑 형식은 모든 열에 statuses를 싣는다(서버가 형식을 이것으로 고른다), 상태 형식은 구 형식 그대로
        columns:
          columnMode === "mapped"
            ? mappedColumns.map((c) => ({
                ...(c.id ? { id: c.id } : {}),
                status: c.statuses[0] ?? "",
                name: c.name,
                statuses: c.statuses,
                wipLimit: c.wipLimit,
              }))
            : columns,
        swimlane,
        ...(isDefault && !board.isDefault ? { isDefault: true } : {}),
      });
      toast({ title: "보드 설정을 저장했습니다", appearance: "success" });
      onOpenChange(false);
      window.dispatchEvent(new Event(UI_CHANGED_EVENT)); // 사이드바 보드 이름 갱신
      await onSaved();
    } catch (error) {
      toast({
        title: "저장 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteBoard(board.id);
      toast({ title: `보드 "${board.name}"를 삭제했습니다`, appearance: "success" });
      setConfirmingDelete(false);
      onOpenChange(false);
      window.dispatchEvent(new Event(UI_CHANGED_EVENT));
      await onDeleted();
    } catch (error) {
      toast({
        title: "삭제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <>
      <Modal
        trigger={<span hidden />}
        title="보드 설정"
        open={open}
        onOpenChange={onOpenChange}
        className="board-settings-modal"
      >
        <form className="board-settings-form" onSubmit={handleSubmit}>
          <TextField label="이름" value={name} onChange={(e) => setName(e.target.value)} />

          <fieldset className="board-settings-fieldset">
            <legend>저장 필터 — 보드에 보일 이슈 (비우면 전체)</legend>
            <div className="board-settings-checks" role="group" aria-label="담당자 필터">
              {users.map((user) => (
                <Checkbox
                  key={user.id}
                  label={user.name}
                  checked={assigneeIds.includes(user.id)}
                  onCheckedChange={() => setAssigneeIds((prev) => toggle(prev, user.id))}
                />
              ))}
              <Checkbox
                label="미지정"
                checked={assigneeIds.includes("unassigned")}
                onCheckedChange={() => setAssigneeIds((prev) => toggle(prev, "unassigned"))}
              />
            </div>
            <div className="board-settings-checks" role="group" aria-label="타입 필터">
              {issueTypes.map(({ id: type, name }) => (
                <Checkbox
                  key={type}
                  label={name}
                  checked={types.includes(type)}
                  onCheckedChange={() => setTypes((prev) => toggle(prev, type))}
                />
              ))}
            </div>
            {labelOptions.length > 0 ? (
              <div className="board-settings-checks" role="group" aria-label="라벨 필터">
                {labelOptions.map((label) => (
                  <Checkbox
                    key={label}
                    label={label}
                    checked={labels.includes(label)}
                    onCheckedChange={() => setLabels((prev) => toggle(prev, label))}
                  />
                ))}
              </div>
            ) : null}
          </fieldset>

          <BoardColumnMappingEditor
            mode={columnMode}
            onModeChange={setColumnMode}
            statusColumns={columns}
            onStatusColumnsChange={setColumns}
            mappedColumns={mappedColumns}
            onMappedColumnsChange={setMappedColumns}
            statuses={statuses}
          />

          <Select
            label="기본 스윔레인"
            value={swimlane}
            options={SWIMLANE_OPTIONS}
            onValueChange={(v) => setSwimlane(v as BoardSwimlane)}
          />
          <Switch
            label="기본 보드로 지정"
            checked={isDefault}
            disabled={board.isDefault}
            onCheckedChange={setIsDefault}
          />

          <div className="project-delete-actions">
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmingDelete(true)}
            >
              보드 삭제
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              저장
            </Button>
          </div>
        </form>
      </Modal>

      {confirmingDelete ? (
        <Modal
          trigger={<span hidden />}
          title="보드 삭제"
          open
          onOpenChange={(next) => {
            if (!next) setConfirmingDelete(false);
          }}
        >
          <div className="project-delete-confirm">
            <p>
              <strong>{board.name}</strong> 보드를 삭제합니다. 이슈는 삭제되지 않습니다 — 보드는
              보는 방법일 뿐입니다.
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
    </>
  );
}
