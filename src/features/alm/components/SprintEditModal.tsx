import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Button, Modal, TextArea, TextField } from "@chanho/react";
import type { Sprint } from "../store/types";

export interface SprintPlanDraft {
  name: string;
  goal: string;
  plannedStart: string;
  plannedEnd: string;
}

export interface SprintEditModalProps {
  /** null이면 닫힘 — 열 때 이 스프린트 값으로 초안을 채운다 */
  sprint: Sprint | null;
  onClose: () => void;
  onSave: (sprint: Sprint, draft: SprintPlanDraft) => void;
}

/**
 * 스프린트 계획 편집 — 지라 백로그의 "스프린트 수정"과 같은 자리(이름·목표·기간).
 * 저장 검증(기간 역전)은 스토어가 하고 여기서는 초안만 다룬다.
 */
export function SprintEditModal({ sprint, onClose, onSave }: SprintEditModalProps) {
  const [draft, setDraft] = useState<SprintPlanDraft>({
    name: "",
    goal: "",
    plannedStart: "",
    plannedEnd: "",
  });

  // 열릴 때만 서버 값으로 초안을 덮는다 — 타이핑 중 재조회가 입력을 지우지 않게.
  useEffect(() => {
    if (!sprint) return;
    setDraft({
      name: sprint.name,
      goal: sprint.goal ?? "",
      plannedStart: sprint.plannedStart ?? "",
      plannedEnd: sprint.plannedEnd ?? "",
    });
  }, [sprint]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sprint) onSave(sprint, draft);
  };

  return (
    <Modal
      trigger={<span hidden />}
      title="스프린트 수정"
      description="목표와 예정 기간은 번다운·스프린트 리포트의 기준이 됩니다."
      open={sprint !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <form className="sprint-edit-form" onSubmit={handleSubmit}>
        <TextField
          label="스프린트 이름"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <TextArea
          label="스프린트 목표"
          rows={2}
          placeholder="이 스프린트로 무엇을 이루려 하나요? (선택)"
          value={draft.goal}
          onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
        />
        <div className="sprint-edit-grid">
          <TextField
            label="시작 예정일"
            type="date"
            value={draft.plannedStart}
            onChange={(e) => setDraft({ ...draft, plannedStart: e.target.value })}
          />
          <TextField
            label="종료 예정일"
            type="date"
            value={draft.plannedEnd}
            onChange={(e) => setDraft({ ...draft, plannedEnd: e.target.value })}
          />
        </div>
        <div className="project-form-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={!draft.name.trim()}>
            저장
          </Button>
        </div>
      </form>
    </Modal>
  );
}
