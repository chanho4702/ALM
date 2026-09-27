import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@chanho/react";
import { Clock, Coins, FileText, Inbox } from "lucide-react";
import type { AgentActiveMeeting, AgentOfficePersona, AgentRunSummary } from "../store/types";
import {
  AGENT_MEETING_TYPE_LABEL,
  AGENT_RUN_TYPE_LABEL,
  AgentMeetingTypeIcon,
  AgentRoleGlyph,
  AgentStatusLozenge,
} from "../components/AgentGlyphs";
import { relTime } from "../components/time";
import { OfficePortrait } from "./PixelSprite";
import { drawnRole } from "./pixel";
import {
  activityText,
  formatUsd,
  linkableIssueKey,
  meetingAgendaText,
  personaState,
  PROJECT_WIDE_LABEL,
  type MeetingSeat,
} from "./officeModel";
import type { OfficeLinks } from "./OfficePanel";

/**
 * 팀 카드(AGP-11) — 캔버스의 텍스트 동등 대안(스펙 §6). 모든 상태·이슈·비용을 아이콘 + 텍스트로.
 * 카드 전체를 버튼으로 만들지 않는다 — 안에 이슈 링크가 있어 버튼-안-링크가 된다.
 */
export function TeamCards({
  personas,
  activeMeeting,
  seats,
  finished,
  selectedId,
  links,
  onOpenPersona,
}: {
  personas: readonly AgentOfficePersona[];
  /** 회의실에 앉은 참석자는 "회의 중" 줄이 붙는다(P3e §2.9 — 캔버스의 텍스트 동등성) */
  activeMeeting: AgentActiveMeeting | null;
  seats: ReadonlyMap<string, MeetingSeat>;
  /** 종결 run(최신 먼저) — "마지막 작업" 표기용 */
  finished: readonly AgentRunSummary[];
  selectedId: string | null;
  links: OfficeLinks;
  onOpenPersona: (id: string, opener: HTMLElement) => void;
}) {
  const navigate = useNavigate();
  return (
    <div className="ai-team-grid">
      {personas.map((persona) => {
        const state = personaState(persona);
        const run = state === "INACTIVE" ? null : persona.currentRun;
        const activity = state === "INACTIVE" ? null : activityText(persona);
        const last = finished.find((r) => r.personaId === persona.id && r.endedAt);
        const nameId = `card-${persona.id}-name`;
        const selected = selectedId === persona.id;
        return (
          <article
            key={persona.id}
            className="ai-team-card"
            aria-labelledby={nameId}
            style={{ "--card-role": `var(--office-role-${drawnRole(persona.role).toLowerCase()})` } as CSSProperties}
          >
            <div className="ai-team-card-top">
              <OfficePortrait slug={persona.slug} role={persona.role} className="is-card" />
              <div className="ai-team-card-id">
                <h3 id={nameId} className="ai-team-card-name">
                  {persona.emoji ? <span aria-hidden="true">{persona.emoji} </span> : null}
                  {persona.name}
                </h3>
                <span className="ai-team-card-role">
                  <AgentRoleGlyph role={persona.role} size={12} />
                </span>
                <AgentStatusLozenge state={state} />
              </div>
            </div>

            {activeMeeting && seats.has(persona.id) ? (
              <p className="ai-team-card-issue ai-team-card-meeting">
                <AgentMeetingTypeIcon type={activeMeeting.type} />
                회의 중 · {AGENT_MEETING_TYPE_LABEL[activeMeeting.type]} · {meetingAgendaText(activeMeeting)}
              </p>
            ) : null}
            <p className="ai-team-card-issue">
              <FileText size={14} aria-hidden />
              {run ? <span className="ai-team-card-kind">{AGENT_RUN_TYPE_LABEL[run.type]} · </span> : null}
              {run && linkableIssueKey(run) ? (
                <Link to={links.issue(run.issueKey!)}>{run.issueKey}</Link>
              ) : run?.issueKey ? (
                <span className="ai-team-card-subtle">{PROJECT_WIDE_LABEL}</span>
              ) : run ? (
                <span className="ai-team-card-subtle">이슈 없음</span>
              ) : (
                <span className="ai-team-card-subtle">진행 중인 작업 없음</span>
              )}
            </p>
            {activity ? (
              <p className="ai-team-card-activity" title={activity}>
                {activity}
              </p>
            ) : null}

            <p className="ai-team-card-meta">
              <span className="status-cell">
                <Coins size={14} aria-hidden />
                오늘 {formatUsd(persona.todayCostUsd)}
              </span>
              {run?.startedAt ? (
                <span className="status-cell">
                  <Clock size={14} aria-hidden />
                  {relTime(run.startedAt)} 시작
                </span>
              ) : last?.endedAt ? (
                <span className="status-cell">
                  <Clock size={14} aria-hidden />
                  마지막 작업 {relTime(last.endedAt)}
                </span>
              ) : null}
            </p>

            <div className="ai-team-card-actions">
              {state === "WAITING_APPROVAL" ? (
                <Button
                  variant="ghost"
                  size="small"
                  iconBefore={<Inbox size={14} aria-hidden />}
                  onClick={() => navigate(`${links.gates}?persona=${encodeURIComponent(persona.id)}`)}
                >
                  승인 인박스
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="small"
                aria-label={`${persona.name} 개인 오피스 열기`}
                aria-controls="ai-office-panel"
                aria-expanded={selected}
                onClick={(e) => onOpenPersona(persona.id, e.currentTarget)}
              >
                개인 오피스
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
