import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Banner, Button, Modal, TextArea, TextField } from "@chanho/react";
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
  /** 저장이 409(다른 사람이 먼저 수정)로 막혔다 — 초안을 유지한 채 해소 선택지를 보인다 */
  conflict?: boolean;
  /** reload = 최신 값으로 초안을 다시 채움(내 입력 버림), reapply = 최신 버전 기준으로 내 초안을 다시 저장 */
  onResolveConflict?: (sprint: Sprint, draft: SprintPlanDraft, mode: "reload" | "reapply") => void;
  /**
   * 저장(또는 다시 적용) 중 — 성공하면 모달이 닫히므로 그 사이 입력은 잃게 된다. 그래서 저장이 끝날 때까지
   * 입력을 잠근다(조용히 버리지 않는다).
   */
  saving?: boolean;
}

/**
 * 스프린트 계획 편집 — 지라 백로그의 "스프린트 수정"과 같은 자리(이름·목표·기간).
 * 저장 검증(기간 역전)은 스토어가 하고 여기서는 초안만 다룬다.
 */
export function SprintEditModal({
  sprint,
  onClose,
  onSave,
  conflict = false,
  onResolveConflict,
  saving = false,
}: SprintEditModalProps) {
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
    if (sprint && !saving) onSave(sprint, draft);
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
      <form className="sprint-edit-form" onSubmit={handleSubmit} aria-busy={saving}>
        <fieldset className="sprint-edit-fieldset" disabled={saving}>
        {conflict && sprint ? (
          <Banner variant="warning">
            <div className="issue-conflict">
              <p className="issue-conflict-text">
                다른 사용자가 이 스프린트를 먼저 수정해 저장하지 않았습니다. 입력한 내용은 그대로 남아 있습니다.
              </p>
              <div className="issue-conflict-actions">
                <Button size="small" variant="secondary" type="button" disabled={saving} onClick={() => onResolveConflict?.(sprint, draft, "reload")}>
                  최신 내용 불러오기
                </Button>
                <Button size="small" variant="primary" type="button" disabled={saving} onClick={() => onResolveConflict?.(sprint, draft, "reapply")}>
                  내 변경 다시 적용(최신 버전 기준)
                </Button>
              </div>
            </div>
          </Banner>
        ) : null}
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
          <Button type="submit" loading={saving} disabled={!draft.name.trim()}>
            저장
          </Button>
        </div>
        </fieldset>
      </form>
    </Modal>
  );
}
