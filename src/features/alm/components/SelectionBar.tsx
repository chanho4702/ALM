import { Button } from "@chanho/react";
import "./interaction.css";

/**
 * 보드·백로그 다중 선택 바 — 이슈 목록의 "대량 작업" 툴바와 같은 모양·같은 이름.
 * 일괄 편집은 목록과 같은 대량 변경 모달(`BulkEditModal` → `bulkUpdateIssues`)로 연다.
 */
export function SelectionBar({
  count,
  onClear,
  onBulkEdit,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onBulkEdit: () => void;
  onDelete: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="bulk-bar selection-bar" role="toolbar" aria-label="대량 작업">
      <span className="bulk-bar-count">{`${count}개 선택`}</span>
      <span className="selection-bar-hint" aria-hidden="true">
        우클릭·S/P/A/L로 한꺼번에 바꿀 수 있습니다 · Esc 선택 해제
      </span>
      <Button size="small" variant="ghost" onClick={onClear}>
        선택 해제
      </Button>
      <Button size="small" onClick={onBulkEdit}>
        대량 변경
      </Button>
      <Button size="small" variant="danger" onClick={onDelete}>
        삭제
      </Button>
    </div>
  );
}
