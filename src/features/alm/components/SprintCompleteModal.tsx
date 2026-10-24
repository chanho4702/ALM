import { useEffect, useState } from "react";
import { Button, Lozenge, Modal, Radio, RadioGroup } from "@chanho/react";
import type { CompleteSprintOptions, Issue, Sprint, WorkflowStatus } from "../store/types";
import { statusAppearance, statusName } from "./labels";
import { StatusGlyph } from "./StatusGlyph";
import { ValueWithIcon } from "./ValueWithIcon";
import { usePlanningSettings } from "./usePlanningSettings";

/** 라디오 값 — Select 센티널과 같은 이유로 빈 문자열을 쓰지 않는다. 특정 스프린트는 `sprint:<id>` */
const BACKLOG = "backlog";
const NEXT = "next";
const SPRINT_PREFIX = "sprint:";

export interface SprintCompleteModalProps {
  /** null이면 닫힘 */
  sprint: Sprint | null;
  /** 완료 대상 스프린트의 미완료 이슈 (카테고리 done 제외) */
  unfinished: Issue[];
  /** 이관 후보 — 계획·진행 중인 다른 스프린트 */
  targets: Sprint[];
  statuses: WorkflowStatus[];
  onClose: () => void;
  onConfirm: (sprint: Sprint, options: CompleteSprintOptions) => void;
}

/**
 * 스프린트 완료 확인(Linear Cycles) — 미완료 이슈를 먼저 보여 주고 행선지를 고르게 한다.
 * 기본값은 프로젝트 설정 › 계획의 "미완료 이슈 기본 행선지"(설정이 없으면 백로그 — 기존 동작).
 * "다음 스프린트로"는 다음 예정 스프린트, 없으면 자동 생성될 새 스프린트(자동 생성이 꺼져 있으면 백로그로 간다).
 */
export function SprintCompleteModal({
  sprint,
  unfinished,
  targets,
  statuses,
  onClose,
  onConfirm,
}: SprintCompleteModalProps) {
  const settings = usePlanningSettings(sprint?.projectId);
  const defaultChoice = settings?.sprintAutomation.defaultCarryOver === "next" ? NEXT : BACKLOG;
  const [destination, setDestination] = useState<string>(defaultChoice);
  const [touched, setTouched] = useState(false);

  // 열릴 때마다(그리고 설정이 늦게 도착하면 사용자가 고르기 전까지) 기본값으로 — 이전 선택이 다음 완료에 새지 않게
  useEffect(() => {
    if (sprint) setTouched(false);
  }, [sprint]);
  useEffect(() => {
    if (sprint && !touched) setDestination(defaultChoice);
  }, [sprint, touched, defaultChoice]);

  const nextPlanned = targets.find((t) => t.state === "planned") ?? null;
  const autoCreate = settings?.sprintAutomation.autoCreateNext ?? false;
  const nextLabel = nextPlanned
    ? `다음 스프린트로 (${nextPlanned.name})`
    : autoCreate
      ? "다음 스프린트로 (새 스프린트 자동 생성)"
      : "다음 스프린트로";
  const nextHint = !nextPlanned && !autoCreate ? "예정 스프린트가 없고 자동 생성이 꺼져 있어 백로그로 갑니다" : null;
  const others = targets.filter((t) => t.id !== nextPlanned?.id);

  const confirm = () => {
    if (!sprint) return;
    if (destination.startsWith(SPRINT_PREFIX)) onConfirm(sprint, { moveUnfinishedTo: destination.slice(SPRINT_PREFIX.length) });
    else onConfirm(sprint, { moveUnfinishedTo: null, carryOver: destination === NEXT ? "next" : "backlog" });
  };

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
                <ValueWithIcon icon={<StatusGlyph status={issue.status} statuses={statuses} variant="icon" />}>
                  <Lozenge appearance={statusAppearance(statuses, issue.status)}>
                    {statusName(statuses, issue.status)}
                  </Lozenge>
                </ValueWithIcon>
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
          onValueChange={(value) => {
            setTouched(true);
            setDestination(value);
          }}
          aria-label="미완료 이슈 행선지"
          className="sprint-complete-targets"
        >
          <Radio value={NEXT} label={nextLabel} />
          <Radio value={BACKLOG} label="백로그로" />
          {others.map((target) => (
            <Radio key={target.id} value={`${SPRINT_PREFIX}${target.id}`} label={target.name} />
          ))}
        </RadioGroup>
        {destination === NEXT && nextHint ? <p className="settings-help">{nextHint}</p> : null}
        {autoCreate && !nextPlanned ? (
          <p className="settings-help">
            {`완료하면 다음 스프린트를 자동으로 만듭니다(${settings!.sprintAutomation.lengthDays}일, 쿨다운 ${settings!.sprintAutomation.cooldownDays}일).`}
          </p>
        ) : null}

        <div className="project-form-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            취소
          </Button>
          <Button type="button" onClick={confirm}>
            완료 처리
          </Button>
        </div>
      </div>
    </Modal>
  );
}
