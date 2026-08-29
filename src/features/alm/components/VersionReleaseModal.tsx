import { useEffect, useState } from "react";
import { Button, Lozenge, Modal, Radio, RadioGroup } from "@chanho/react";
import type { Issue, ProjectVersion, WorkflowStatus } from "../store/types";
import { statusAppearance, statusName } from "./labels";

/** "그대로 두기" 센티널 — Select·Radio는 빈 문자열 value를 쓰지 않는다 */
const KEEP = "keep";

export interface VersionReleaseModalProps {
  /** null이면 닫힘 */
  version: ProjectVersion | null;
  /** 이 버전의 미완료 이슈 (카테고리 done 제외) */
  unresolved: Issue[];
  /** 이관 후보 — 같은 프로젝트의 미릴리스 다른 버전 */
  targets: ProjectVersion[];
  statuses: WorkflowStatus[];
  onClose: () => void;
  onConfirm: (version: ProjectVersion, moveUnresolvedTo: string | null) => void;
}

/**
 * 릴리스 확인 — 지라처럼 미완료 이슈를 먼저 보여주고 행선지를 고르게 한다.
 * 기본값은 "그대로 두기"(지라 기본)라 아무것도 고르지 않아도 결과가 예측 가능하다.
 */
export function VersionReleaseModal({
  version,
  unresolved,
  targets,
  statuses,
  onClose,
  onConfirm,
}: VersionReleaseModalProps) {
  const [destination, setDestination] = useState<string>(KEEP);

  useEffect(() => {
    if (version) setDestination(KEEP);
  }, [version]);

  return (
    <Modal
      trigger={<span hidden />}
      title="버전 릴리스"
      description="릴리스된 버전에는 더 이상 이슈를 달지 않습니다. 미완료 이슈를 어디에 둘지 고르세요."
      open={version !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div className="sprint-complete">
        <p className="sprint-complete-count">{`미완료 이슈 ${unresolved.length}건`}</p>
        {unresolved.length > 0 ? (
          <ul className="sprint-complete-list">
            {unresolved.slice(0, 5).map((issue) => (
              <li key={issue.id}>
                <span className="dash-issue-key">{issue.key}</span>
                <span className="dash-issue-title">{issue.title}</span>
                <Lozenge appearance={statusAppearance(statuses, issue.status)}>
                  {statusName(statuses, issue.status)}
                </Lozenge>
              </li>
            ))}
            {unresolved.length > 5 ? (
              <li className="sprint-complete-more">{`외 ${unresolved.length - 5}건`}</li>
            ) : null}
          </ul>
        ) : (
          <p className="dash-empty">모든 이슈가 완료됐습니다.</p>
        )}

        {unresolved.length > 0 ? (
          <RadioGroup
            value={destination}
            onValueChange={setDestination}
            aria-label="미완료 이슈 행선지"
            className="sprint-complete-targets"
          >
            <Radio value={KEEP} label="이 버전에 그대로 두기" />
            {targets.map((target) => (
              <Radio key={target.id} value={target.id} label={target.name} />
            ))}
          </RadioGroup>
        ) : null}

        <div className="project-form-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            취소
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (version) onConfirm(version, destination === KEEP ? null : destination);
            }}
          >
            릴리스
          </Button>
        </div>
      </div>
    </Modal>
  );
}
