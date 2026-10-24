import { ISSUE_FIELD_NAMES } from "../../store/types";
import type { IssueTransitionOption } from "../../store/types";

/** 검증·화면 필드 id → 한국어 이름(서버 문구와 같은 이름) */
export function requiredFieldName(field: string): string {
  return (ISSUE_FIELD_NAMES as Record<string, string>)[field] ?? field;
}

/**
 * 전환 항목의 접근 이름 — 전환 이름이 대상 상태 이름과 같으면(지라 기본 워크플로) 상태 이름만,
 * 다르면 "끝내기 (→ 완료)". 화면은 같은 정보를 아이콘 + 텍스트로 그린다.
 */
export function transitionLabel(option: Pick<IssueTransitionOption, "name" | "toName">): string {
  return option.name === option.toName ? option.toName : `${option.name} (→ ${option.toName})`;
}
