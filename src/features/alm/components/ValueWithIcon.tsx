import type { ReactNode } from "react";

/**
 * 값(타입·상태·우선순위·해결) 표기의 공통 껍데기 — 아이콘을 텍스트 **왼쪽**에 세우고
 * 간격은 토큰(`.status-cell`의 `--chanho-space-50`)이 준다.
 *
 * 새 CSS를 만들지 않고 이미 있는 `.status-cell`을 재사용한다 — 이슈 목록 표·홈 행·대시보드가
 * 쓰던 그 배치가 값 표기의 표준이다. 아이콘은 반드시 `aria-hidden`이거나 스스로 이름을 갖고,
 * 이름 텍스트는 항상 함께 있다(색·모양만으로 구분하지 않는다).
 */
export function ValueWithIcon({
  icon,
  children,
  className,
}: {
  /** 왼쪽 아이콘 — 보통 `IssueTypeGlyph`/`StatusGlyph`/`PriorityGlyph`/`ResolutionGlyph` */
  icon: ReactNode;
  /** 오른쪽 텍스트 — Lozenge든 맨 텍스트든 이름이 보이는 노드 */
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={className ? `status-cell ${className}` : "status-cell"}>
      {icon}
      {children}
    </span>
  );
}
