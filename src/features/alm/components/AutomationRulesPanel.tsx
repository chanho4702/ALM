export interface AutomationRulesPanelProps {
  projectId: string;
  /** 프로젝트 관리자만 규칙을 보고 고친다(서버도 ADMIN만) */
  canManage: boolean;
}

/** 프로젝트 설정 › 자동화(V36·V37) — 구현 예정(FE2 하위 작업) */
export function AutomationRulesPanel(_props: AutomationRulesPanelProps) {
  return null;
}
