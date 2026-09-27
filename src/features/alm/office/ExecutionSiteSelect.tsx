import { useEffect, useState } from "react";
import { Select } from "@chanho/react";
import type { AgentExecutionSite, AgentExecutionSiteSetting } from "../store/types";
import { fetchExecutionSite } from "../store/jiraStore";
import { AGENT_EXECUTION_SITE_LABEL, AgentExecutionSiteIcon } from "../components/AgentGlyphs";

/** Select 빈 문자열 금지(DS 함정) — "프로젝트 설정 따름" 센티널 */
export const SITE_FOLLOW = "follow";
export type ExecutionSiteChoice = AgentExecutionSite | typeof SITE_FOLLOW;

/** 요청에 실을 값 — 따름이면 생략(서버가 프로젝트 설정 > 전역 기본으로 푼다) */
export function siteOverride(choice: ExecutionSiteChoice): AgentExecutionSite | undefined {
  return choice === SITE_FOLLOW ? undefined : choice;
}

/**
 * 프로젝트 실행 위치(누구나 조회) — 구 백엔드(null)·실패면 null. 맡기기·회의 소집 폼의 "실행 위치" 덮어쓰기가 쓴다.
 * 조회 실패로 폼을 막지 않는다: 덮어쓰기 칸만 숨고 요청은 서버 기본으로 간다. enabled=false면 조회하지 않는다(폼을 열 때까지).
 */
export function useProjectExecutionSite(projectId: string, enabled = true): AgentExecutionSiteSetting | null {
  const [setting, setSetting] = useState<AgentExecutionSiteSetting | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchExecutionSite(projectId).then(
      (value) => alive && setSetting(value),
      () => alive && setSetting(null),
    );
    return () => {
      alive = false;
    };
  }, [projectId, enabled]);
  return setting;
}

/** 확인 단계·요약용 문구 — "프로젝트 설정 따름(내 PC 러너)" / "서버" */
export function executionChoiceText(choice: ExecutionSiteChoice, setting: AgentExecutionSiteSetting | null): string {
  if (choice !== SITE_FOLLOW) return AGENT_EXECUTION_SITE_LABEL[choice];
  return setting ? `프로젝트 설정 따름(${AGENT_EXECUTION_SITE_LABEL[setting.effectiveSite]})` : "프로젝트 설정 따름";
}

/**
 * 실행 위치 덮어쓰기(P4a) — 기본은 프로젝트 설정 따름. 서버가 실행 위치를 모르면(구 백엔드) 그리지 않는다.
 * 값은 옵션까지 아이콘 + 텍스트.
 */
export function ExecutionSiteSelect({
  setting,
  value,
  onChange,
}: {
  setting: AgentExecutionSiteSetting | null;
  value: ExecutionSiteChoice;
  onChange: (value: ExecutionSiteChoice) => void;
}) {
  if (!setting) return null;
  return (
    <Select
      label="실행 위치"
      value={value}
      onValueChange={(v) => onChange(v as ExecutionSiteChoice)}
      options={[
        {
          value: SITE_FOLLOW,
          label: executionChoiceText(SITE_FOLLOW, setting),
          icon: <AgentExecutionSiteIcon site={setting.effectiveSite} />,
        },
        { value: "SERVER", label: AGENT_EXECUTION_SITE_LABEL.SERVER, icon: <AgentExecutionSiteIcon site="SERVER" /> },
        { value: "LOCAL", label: AGENT_EXECUTION_SITE_LABEL.LOCAL, icon: <AgentExecutionSiteIcon site="LOCAL" /> },
      ]}
    />
  );
}
