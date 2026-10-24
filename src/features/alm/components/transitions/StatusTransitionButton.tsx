import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Button, Popover, SkeletonListItem, Tooltip, useToast } from "@chanho/react";
import { ArrowRight, ChevronDown, Lock } from "lucide-react";
import type { Issue, IssueTransitionOption, WorkflowStatus } from "../../store/types";
import { listIssueTransitions } from "../../store/jiraStore";
import { statusName } from "../labels";
import { StatusGlyph } from "../StatusGlyph";
import { transitionLabel } from "./transitionText";
import { useTransitionRunner } from "./useTransitionRunner";
import "./transitions.css";

export interface StatusTransitionButtonProps {
  issue: Issue;
  /** 프로젝트 워크플로 상태(order 순) — 글리프·이름의 원천 */
  statuses: WorkflowStatus[];
  /** 전환이 저장된 뒤 — 부모가 이슈를 갈아 끼우고 활동·목록을 다시 읽는다 */
  onTransitioned: (issue: Issue, option: IssueTransitionOption) => void | Promise<void>;
  /** 단축키(`s`) 등 바깥에서 목록을 열 때 */
  openSignal?: number;
}

/**
 * 지라 이슈 뷰의 상태 버튼(A2) — 누르면 **지금 갈 수 있는 전환**만 "전환 이름 → 대상 상태"로 보인다.
 * 조건 때문에 못 하는 전환은 숨기지 않고 흐리게, 이유는 툴팁·설명으로(`aria-describedby`). 전환 화면이 있는
 * 전환은 창을 띄운다(A4). 목록은 열 때마다 서버에서 다시 읽는다(조건이 담당자·하위 이슈에 따라 바뀐다).
 */
export function StatusTransitionButton({ issue, statuses, onTransitioned, openSignal }: StatusTransitionButtonProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<IssueTransitionOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const toast = useToast();
  const { run, element } = useTransitionRunner(statuses);
  const reasonBase = useId();

  const load = async () => {
    setOptions(null);
    setLoadError(null);
    try {
      setOptions((await listIssueTransitions(issue.id)).transitions);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    if (open) void load();
    // 열 때만 다시 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, issue.id, issue.status]);

  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);

  // 목록이 그려지면 첫 항목으로 포커스 — 키보드로 바로 고른다
  useEffect(() => {
    if (open && options && options.length > 0) {
      listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [open, options]);

  const choose = async (option: IssueTransitionOption) => {
    if (!option.available || working) return;
    setOpen(false);
    setWorking(true);
    const outcome = await run(issue, option);
    setWorking(false);
    if (outcome.kind === "done") {
      await onTransitioned(outcome.issue, option);
    } else if (outcome.kind === "failed") {
      toast({
        title: "상태를 바꾸지 못했습니다",
        description: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
        appearance: "danger",
      });
    }
  };

  /** ↑↓·Home·End로 항목 사이를 움직인다(못 하는 전환도 포커스는 받는다 — 이유를 읽을 수 있게) */
  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const go = (next: number) => {
      event.preventDefault();
      items[(next + items.length) % items.length]?.focus();
    };
    if (event.key === "ArrowDown") go(index + 1);
    else if (event.key === "ArrowUp") go(index - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(items.length - 1);
  };

  const current = statusName(statuses, issue.status);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        label="상태 전환"
        align="start"
        padding="none"
        className="transition-popover"
        trigger={
          <Button
            variant="secondary"
            size="small"
            className="transition-trigger"
            aria-label={`상태: ${current}`}
            aria-haspopup="menu"
            disabled={working}
            iconBefore={<StatusGlyph status={issue.status} statuses={statuses} variant="icon" />}
          >
            {current}
            <ChevronDown size={14} aria-hidden className="transition-trigger-chevron" />
          </Button>
        }
      >
        {loadError ? (
          <div className="transition-popover-state" role="alert">
            <p>{`전환 목록을 불러오지 못했습니다: ${loadError}`}</p>
            <Button size="small" variant="secondary" onClick={() => void load()}>
              다시 시도
            </Button>
          </div>
        ) : options === null ? (
          <div className="transition-popover-state" role="status" aria-label="전환 불러오는 중">
            <SkeletonListItem media="icon" width="70%" />
            <SkeletonListItem media="icon" width="50%" />
          </div>
        ) : options.length === 0 ? (
          <p className="transition-popover-state">지금 상태에서 갈 수 있는 전환이 없습니다.</p>
        ) : (
          <ul ref={listRef} role="menu" aria-label="상태 전환" className="transition-menu" onKeyDown={handleKeyDown}>
            {options.map((option, index) => {
              const reasonId = `${reasonBase}-${index}`;
              const item = (
                <button
                  type="button"
                  role="menuitem"
                  className={option.available ? "transition-item" : "transition-item is-unavailable"}
                  aria-disabled={option.available ? undefined : true}
                  aria-describedby={option.available ? undefined : reasonId}
                  aria-label={transitionLabel(option)}
                  onClick={() => void choose(option)}
                >
                  {option.name !== option.toName ? (
                    <>
                      <span className="transition-item-name">{option.name}</span>
                      <ArrowRight size={12} aria-hidden className="transition-item-arrow" />
                    </>
                  ) : null}
                  <span className="transition-item-target">
                    <StatusGlyph status={option.to} statuses={statuses} variant="icon" />
                    <span>{option.toName}</span>
                  </span>
                  {option.hasScreen ? <span className="transition-item-more" aria-hidden>…</span> : null}
                  {option.available ? null : <Lock size={12} aria-hidden className="transition-item-lock" />}
                  {option.available ? null : (
                    <span id={reasonId} className="visually-hidden">
                      {option.unavailableReason ?? "지금은 할 수 없는 전환입니다"}
                    </span>
                  )}
                </button>
              );
              return (
                <li key={option.id} role="none">
                  {option.available ? (
                    item
                  ) : (
                    <Tooltip content={option.unavailableReason ?? "지금은 할 수 없는 전환입니다"} side="right">
                      {item}
                    </Tooltip>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Popover>
      {element}
    </>
  );
}
