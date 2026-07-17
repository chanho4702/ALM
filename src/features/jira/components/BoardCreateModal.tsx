import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Modal, Select, TextField, useToast } from "@chanho/react";
import type { Board, BoardType } from "../store/types";
import { createBoard } from "../store/jiraStore";
import { UI_CHANGED_EVENT } from "../store/uiStore";

const TYPE_OPTIONS: { value: BoardType; label: string }[] = [
  { value: "scrum", label: "스크럼 — 활성 스프린트 이슈" },
  { value: "kanban", label: "칸반 — 스프린트 무관 전체 흐름" },
];

export interface BoardCreateModalProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (board: Board) => void | Promise<void>;
}

export function BoardCreateModal({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: BoardCreateModalProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState<BoardType>("scrum");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const board = await createBoard({ projectId, name, type });
      toast({ title: `보드 "${board.name}"를 만들었습니다`, appearance: "success" });
      setName("");
      setType("scrum");
      onOpenChange(false);
      window.dispatchEvent(new Event(UI_CHANGED_EVENT)); // 사이드바 보드 목록 갱신
      await onCreated(board);
    } catch (error) {
      toast({
        title: "보드 생성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <Modal
      trigger={<span hidden />}
      title="새 보드"
      description="보드는 이슈를 보는 방법(필터·컬럼)만 저장합니다. 이슈는 프로젝트에 남습니다."
      open={open}
      onOpenChange={onOpenChange}
    >
      <form className="project-create-form" onSubmit={handleSubmit}>
        <TextField
          label="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 백엔드 팀"
        />
        <Select
          label="타입"
          value={type}
          options={TYPE_OPTIONS}
          onValueChange={(v) => setType(v as BoardType)}
        />
        <Button type="submit" disabled={!name.trim()}>
          보드 만들기
        </Button>
      </form>
    </Modal>
  );
}
