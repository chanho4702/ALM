import { useState } from "react";
import { Button, TextField } from "@chanho/react";
import { Plus } from "lucide-react";
import "./inlineCreate.css";

export interface InlineIssueCreateProps {
  /** 어디에 만드는지 — 버튼·입력의 접근 이름("Sprint 1에 이슈 만들기") */
  where: string;
  /** 제목만으로 만든다. true를 돌려주면 입력을 비우고 열어 둔다(연달아 만들기 — Linear) */
  onCreate: (title: string) => Promise<boolean>;
  /** 처음부터 열어 둔다 */
  defaultOpen?: boolean;
  compact?: boolean;
}

/**
 * 인라인 이슈 만들기(Linear) — 목록 끝·스프린트 패널·그룹 머리글에서 제목만 적고 Enter.
 * 만든 뒤에도 입력이 열려 있어 다음 제목을 바로 적는다. Esc·취소는 닫는다. 빈 제목은 만들지 않는다.
 */
export function InlineIssueCreate({ where, onCreate, defaultOpen = false, compact = false }: InlineIssueCreateProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setTitle("");
    setOpen(false);
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="small"
        className={compact ? "inline-create-toggle is-compact" : "inline-create-toggle"}
        iconBefore={<Plus size={14} aria-hidden />}
        aria-label={`${where}에 이슈 만들기`}
        onClick={() => setOpen(true)}
      >
        {compact ? null : "이슈 만들기"}
      </Button>
    );
  }

  return (
    <form
      className="inline-create-form"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = title.trim();
        if (!trimmed || busy) return;
        setBusy(true);
        void onCreate(trimmed)
          .then((ok) => {
            if (ok) setTitle("");
          })
          .finally(() => setBusy(false));
      }}
    >
      <TextField
        label={`${where} 새 이슈 제목`}
        className="visually-hidden-label"
        placeholder="제목을 적고 Enter — Esc로 닫기"
        value={title}
        autoFocus
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
      />
      <Button type="button" size="small" variant="ghost" onClick={close}>
        취소
      </Button>
      <Button type="submit" size="small" disabled={!title.trim()} loading={busy}>
        만들기
      </Button>
    </form>
  );
}
