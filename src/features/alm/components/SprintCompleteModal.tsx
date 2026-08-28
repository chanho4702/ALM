import { useEffect, useState } from "react";
import { Button, Lozenge, Modal, Radio, RadioGroup } from "@chanho/react";
import type { Issue, Sprint, WorkflowStatus } from "../store/types";
import { statusAppearance, statusName } from "./labels";

/** 백로그를 뜻하는 라디오 값 — Select 센티널과 같은 이유로 빈 문자열을 쓰지 않는다 */
const BACKLOG = "backlog";

export interface SprintCompleteModalProps {
  /** null이면 닫힘 */
  sprint: Sprint | null;
  /** 완료 대상 스프린트의 미완료 이슈 (카테고리 done 제외) */
  unfinished: Issue[];
  /** 이관 후보 — 계획·진행 중인 다른 스프린트 */
  targets: Sprint[];
  statuses: WorkflowStatus[];
  onClose: () => void;
  onConfirm: (sprint: Sprint, moveUnfinishedTo: string | null) => void;
}

/**
 * 스프린트 완료 확인 — 지라처럼 미완료 이슈를 먼저 보여주고 행선지를 고르게 한다.
 * 기본값은 백로그(기존 동작)라 아무것도 고르지 않아도 결과가 예측 가능하다.
 */
export function SprintCompleteModal({
  sprint,
  unfinished,
  targets,
  statuses,
  onClose,
  onConfirm,
}: SprintCompleteModalProps) {
  const [destination, setDestination] = useState<string>(BACKLOG);

  // 열릴 때마다 기본값으로 돌린다 — 이전 선택이 다음 완료에 새지 않게.
  useEffect(() => {
    if (sprint) setDestination(BACKLOG);
  }, [sprint]);

  return (
    <Modal
      trigger={<span hidden />}
      title="스프린트 완료"
      description="완료되지 않은 이슈를 어디로 보낼지 고르세요."
      open={sprint !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div className="sprint-complete">
        <p className="sprint-complete-count">{`미완료 이슈 ${unfinished.length}건`}</p>
        {unfinished.length > 0 ? (
          <ul className="sprint-complete-list">
            {unfinished.slice(0, 5).map((issue) => (
              <li key={issue.id}>
                <span className="dash-issue-key">{issue.key}</span>
                <span className="dash-issue-title">{issue.title}</span>
                <Lozenge appearance={statusAppearance(statuses, issue.status)}>
                  {statusName(statuses, issue.status)}
                </Lozenge>
              </li>
            ))}
            {unfinished.length > 5 ? (
              <li className="sprint-complete-more">{`외 ${unfinished.length - 5}건`}</li>
            ) : null}
          </ul>
        ) : (
          <p className="dash-empty">모든 이슈가 완료됐습니다.</p>
        )}

        <RadioGroup
          value={destination}
          onValueChange={setDestination}
          aria-label="미완료 이슈 행선지"
          className="sprint-complete-targets"
        >
          <Radio value={BACKLOG} label="백로그" />
          {targets.map((target) => (
            <Radio key={target.id} value={target.id} label={target.name} />
          ))}
        </RadioGroup>

        <div className="project-form-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (sprint) onConfirm(sprint, destination === BACKLOG ? null : destination);
            }}
          >
            완료 처리
          </Button>
        </div>
      </div>
    </Modal>
  );
}
