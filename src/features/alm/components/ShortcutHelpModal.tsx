import { Modal, Table } from "@chanho/react";
import type { TableColumn } from "@chanho/react";

/** 단축키 도움말 한 줄 — keys는 바인딩 문법(`"g d"` = g 다음 d) */
interface ShortcutRow {
  id: string;
  keys: string;
  label: string;
}

/**
 * 도움말 목록 — 실제 바인딩(AppShell·CommandPaletteHost·IssueListPage·useIssueInteractions·IssueDetailModal)과
 * 같은 키를 적는다. 바인딩을 바꾸면 여기도 함께 바꾼다(손으로 맞춘다 — STATUS "키보드 단축키").
 * 지라 클라우드 "Keyboard shortcuts"에 리니어식 조작(⌘K·Space 미리보기·x 선택·s/p/a/l)을 더했다.
 * 키 표기에서 공백은 "다음"(시퀀스), `+`는 함께 누르기다.
 */
export const SHORTCUT_GROUPS: { title: string; rows: ShortcutRow[] }[] = [
  {
    title: "전역",
    rows: [
      { id: "palette", keys: "Ctrl+K", label: "명령 팔레트 열기(맥은 ⌘K) — 이동·만들기·이슈 검색·현재 이슈 명령" },
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
      { id: "go-inbox", keys: "g n", label: "인박스(알림)로 — 상단 벨과 같다" },
    ],
  },
  {
    title: "인박스",
    rows: [
      { id: "inbox-move", keys: "j", label: "다음 알림(k는 이전, ↑↓도 같다)" },
      { id: "inbox-open", keys: "Enter", label: "알림의 이슈 열기(읽음으로 바뀐다)" },
      { id: "inbox-read", keys: "U", label: "읽음·읽지 않음 토글(선택이 있으면 선택 전부)" },
      { id: "inbox-snooze", keys: "H", label: "미루기 — 1시간·내일 아침 9시·다음 주 월요일·직접" },
      { id: "inbox-archive", keys: "E", label: "보관(Backspace도 같다, 보관함에서는 해제)" },
      { id: "inbox-select", keys: "x", label: "선택·해제(Shift+클릭 범위, Esc 해제)" },
    ],
  },
  {
    title: "이슈 목록",
    rows: [
      { id: "next", keys: "j", label: "다음 이슈 선택" },
      { id: "prev", keys: "k", label: "이전 이슈 선택" },
      { id: "open", keys: "o", label: "선택한 이슈 열기" },
      { id: "display", keys: "Shift+V", label: "표시 옵션(그룹·정렬·속성) 열기" },
    ],
  },
  {
    title: "목록·보드·백로그",
    rows: [
      { id: "peek", keys: "Space", label: "미리보기 열기·닫기(목록은 커서, 보드·백로그는 포커스·마우스가 가리킨 이슈)" },
      { id: "peek-move", keys: "j", label: "미리보기 중 다음 이슈(k·↑↓도 같다)" },
      { id: "peek-open", keys: "Enter", label: "미리보기 중 상세 열기" },
      { id: "open-board", keys: "o", label: "보드·백로그에서 가리킨 이슈 열기" },
      { id: "select", keys: "x", label: "이슈 선택·해제(다중 선택)" },
      { id: "select-toggle", keys: "Ctrl+클릭", label: "하나씩 더하거나 빼기(맥은 ⌘+클릭)" },
      { id: "select-range", keys: "Shift+클릭", label: "범위 선택" },
      { id: "context", keys: "Shift+F10", label: "이슈 메뉴 열기(우클릭과 같다)" },
      { id: "clear", keys: "Esc", label: "미리보기 닫기, 그다음 선택 해제" },
    ],
  },
  {
    title: "이슈 속성(목록·보드·백로그·상세)",
    rows: [
      { id: "prop-status", keys: "s", label: "상태 바꾸기" },
      { id: "prop-priority", keys: "p", label: "우선순위 바꾸기" },
      { id: "prop-assignee", keys: "a", label: "담당자 바꾸기" },
      { id: "prop-labels", keys: "l", label: "라벨(상세는 라벨 입력)" },
      { id: "prop-assign-me", keys: "i", label: "나에게 할당" },
      { id: "copy-branch", keys: "Ctrl+Shift+.", label: "git 브랜치 이름 복사(맥은 ⌘⇧.) — alm-12-login-bug 형식" },
    ],
  },
  {
    title: "이슈 상세",
    rows: [
      { id: "edit", keys: "e", label: "제목 편집" },
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
