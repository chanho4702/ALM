import { Modal, Table } from "@chanho/react";
import type { TableColumn } from "@chanho/react";

/** 단축키 도움말 한 줄 — keys는 바인딩 문법(`"g d"` = g 다음 d) */
interface ShortcutRow {
  id: string;
  keys: string;
  label: string;
}

/**
 * 도움말 목록 — 실제 바인딩(AppShell·IssueListPage·IssueDetailModal)과 같은 키를 적는다.
 * 지라 클라우드 "Keyboard shortcuts" 중 우리 앱에 화면·동작이 있는 것만 담았다.
 */
export const SHORTCUT_GROUPS: { title: string; rows: ShortcutRow[] }[] = [
  {
    title: "전역",
    rows: [
      { id: "help", keys: "?", label: "단축키 도움말 열기" },
      { id: "search", keys: "/", label: "이슈 검색" },
      { id: "create", keys: "c", label: "이슈 만들기" },
      { id: "esc", keys: "Esc", label: "열린 창 닫기" },
    ],
  },
  {
    title: "이동",
    rows: [
      { id: "go-dashboards", keys: "g d", label: "대시보드로" },
      { id: "go-board", keys: "g b", label: "보드로(현재 프로젝트)" },
      { id: "go-issues", keys: "g i", label: "이슈 목록으로(프로젝트 밖에서는 이슈 검색)" },
      { id: "go-projects", keys: "g p", label: "프로젝트 목록으로" },
    ],
  },
  {
    title: "이슈 목록",
    rows: [
      { id: "next", keys: "j", label: "다음 이슈 선택" },
      { id: "prev", keys: "k", label: "이전 이슈 선택" },
      { id: "open", keys: "o", label: "선택한 이슈 열기" },
    ],
  },
  {
    title: "이슈 상세",
    rows: [
      { id: "edit", keys: "e", label: "제목 편집" },
      { id: "assign", keys: "a", label: "담당자 바꾸기" },
      { id: "assign-me", keys: "i", label: "나에게 할당" },
      { id: "labels", keys: "l", label: "라벨 추가" },
      { id: "comment", keys: "m", label: "코멘트 쓰기" },
    ],
  },
];

/** "g d" → g, 다음, d — 시퀀스는 "다음"으로 잇는다(지라 도움말 표기와 같다) */
function Keys({ keys }: { keys: string }) {
  const parts = keys.split(" ");
  return (
    <span className="keyboard-shortcut-keys">
      {parts.map((key, index) => (
        <span key={index} className="keyboard-shortcut-step">
          {index > 0 ? <span className="keyboard-shortcut-then">다음</span> : null}
          <kbd className="keyboard-shortcut-kbd">{key}</kbd>
        </span>
      ))}
    </span>
  );
}

const COLUMNS: TableColumn<ShortcutRow>[] = [
  { key: "keys", header: "키", width: "160px", render: (row) => <Keys keys={row.keys} /> },
  { key: "label", header: "동작" },
];

export interface ShortcutHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutHelpModal({ open, onOpenChange }: ShortcutHelpModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="키보드 단축키"
      description="입력란에 글을 쓰는 중에는 동작하지 않습니다. 개인 설정 > 일반 설정에서 끌 수 있습니다."
      className="keyboard-shortcut-modal"
    >
      <div className="keyboard-shortcut-groups">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="keyboard-shortcut-group" aria-label={group.title}>
            <h3 className="keyboard-shortcut-title">{group.title}</h3>
            <Table aria-label={`${group.title} 단축키`} columns={COLUMNS} rows={group.rows} />
          </section>
        ))}
      </div>
    </Modal>
  );
}
