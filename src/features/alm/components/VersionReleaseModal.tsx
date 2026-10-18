import { useEffect, useState } from "react";
import { Button, Lozenge, Modal, Radio, RadioGroup } from "@chanho/react";
import type { Issue, ProjectVersion, WorkflowStatus } from "../store/types";
import { statusAppearance, statusName } from "./labels";
import { StatusGlyph } from "./StatusGlyph";
import { ValueWithIcon } from "./ValueWithIcon";

/** "그대로 두기" 센티널 — Select·Radio는 빈 문자열 value를 쓰지 않는다 */
const KEEP = "keep";

export interface VersionReleaseModalProps {
  /** null이면 닫힘 */
  version: ProjectVersion | null;
  /** 이 버전의 미완료 이슈 (카테고리 done 제외) — 한 페이지만 받을 수 있다 */
  unresolved: Issue[];
  /** 미완료 이슈 전체 건수 — 없으면 목록 길이. 목록이 일부면 "총 N건(일부만 표시)" */
  unresolvedTotal?: number;
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
  unresolvedTotal,
  targets,
  statuses,
  onClose,
  onConfirm,
}: VersionReleaseModalProps) {
  const [destination, setDestination] = useState<string>(KEEP);
  const total = Math.max(unresolvedTotal ?? unresolved.length, unresolved.length);

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
        <p className="sprint-complete-count">
          {`미완료 이슈 ${total}건`}
          {total > unresolved.length ? ` (일부만 표시 — 총 ${total}건 중 ${unresolved.length}건, 릴리스하면 전부 옮겨집니다)` : ""}
        </p>
        {total > 0 ? (
          <ul className="sprint-complete-list">
            {unresolved.slice(0, 5).map((issue) => (
              <li key={issue.id}>
                <span className="dash-issue-key">{issue.key}</span>
                <span className="dash-issue-title">{issue.title}</span>
                <ValueWithIcon icon={<StatusGlyph status={issue.status} statuses={statuses} variant="icon" />}>
                  <Lozenge appearance={statusAppearance(statuses, issue.status)}>
                    {statusName(statuses, issue.status)}
                  </Lozenge>
                </ValueWithIcon>
              </li>
            ))}
            {total > 5 ? (
              <li className="sprint-complete-more">{`외 ${total - 5}건`}</li>
            ) : null}
          </ul>
        ) : (
          <p className="dash-empty">모든 이슈가 완료됐습니다.</p>
        )}

        {total > 0 ? (
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
