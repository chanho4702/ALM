import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Popover, TextField, useToast } from "@chanho/react";
import { Flag, FlagOff } from "lucide-react";
import type { Issue } from "../store/types";
import { setIssueFlag } from "../store/jiraStore";
import "./board-workflow.css";

export interface IssueFlagControlProps {
  issue: Issue;
  disabled?: boolean;
  onChanged: (issue: Issue) => void | Promise<void>;
}

/**
 * 플래그(막힘, D2) 켜기·끄기 — 지라의 "Add flag"와 같은 자리. 켤 때 선택적으로 이유를 받아 `플래그 추가: …` 코멘트로
 * 남긴다(서버 규칙). 플래그는 이슈 버전을 올리지 않아 열린 편집 폼과 충돌하지 않는다.
 */
export function IssueFlagControl({ issue, disabled = false, onChanged }: IssueFlagControlProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const apply = async (flagged: boolean, comment?: string) => {
    setBusy(true);
    try {
      const saved = await setIssueFlag(issue.id, flagged, comment);
      setOpen(false);
      setReason("");
      toast({ title: flagged ? "플래그를 달았습니다" : "플래그를 내렸습니다", appearance: "success" });
      await onChanged(saved);
    } catch (error) {
      toast({
        title: flagged ? "플래그를 달지 못했습니다" : "플래그를 내리지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  if (issue.flagged) {
    return (
      <Button
        variant="secondary"
        size="small"
        iconBefore={<FlagOff size={14} aria-hidden />}
        disabled={disabled || busy}
        onClick={() => void apply(false)}
      >
        플래그 해제
      </Button>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void apply(true, reason);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="플래그 추가"
      trigger={
        <Button variant="secondary" size="small" iconBefore={<Flag size={14} aria-hidden />} disabled={disabled || busy}>
          플래그 추가
        </Button>
      }
    >
      <form className="issue-flag-form" onSubmit={submit} aria-label="플래그 추가">
        <TextField
          label="이유(선택)"
          placeholder="예: API 응답 대기"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="issue-flag-form-actions">
          <Button type="button" variant="ghost" size="small" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button type="submit" size="small" disabled={busy}>
            플래그 달기
          </Button>
        </div>
      </form>
    </Popover>
  );
}
