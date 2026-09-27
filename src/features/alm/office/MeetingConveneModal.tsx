import { useState, type FormEvent } from "react";
import { Button, Checkbox, Modal, Radio, RadioGroup, Select, TextArea, TextField, useToast } from "@chanho/react";
import type { AgentMeetingCreated, AgentMeetingType, AgentOfficePersona } from "../store/types";
import { createMeeting } from "../store/jiraStore";
import {
  AGENT_MEETING_TYPE_LABEL,
  agentMeetingRunName,
  AgentMeetingTypeIcon,
  AgentRoleGlyph,
} from "../components/AgentGlyphs";
import {
  ExecutionSiteSelect,
  siteOverride,
  SITE_FOLLOW,
  useProjectExecutionSite,
  type ExecutionSiteChoice,
} from "./ExecutionSiteSelect";

const AGENDA_MAX = 4000;
const ISSUE_KEY_MAX = 40;
const ATTENDEES_MAX = 20;

const MEETING_TYPES: readonly AgentMeetingType[] = ["MEETING", "RETRO", "ESCALATION", "MANAGER"];

/** 안건 없이 열 수 있는 종류 — 회고는 최근 run, 매니저 보고는 프로젝트 전반 순찰 자체가 안건(서버 MeetingService와 같은 분기) */
const AGENDA_OPTIONAL: readonly AgentMeetingType[] = ["RETRO", "MANAGER"];

/** 자동 참석 규칙(서버 MeetingService.defaultAttendees) — 참석자를 고르지 않으면 이대로 앉는다 */
const AUTO_RULE: Record<AgentMeetingType, string> = {
  MEETING: "기획·디자인·프론트엔드·백엔드",
  RETRO: "활성 팀원 전원",
  ESCALATION: "안건 이슈를 맡았던 팀원 + 리뷰",
  MANAGER: "매니저 롤 1명(단독 순찰)",
};

type AttendeeMode = "auto" | "pick";

export interface MeetingConveneModalProps {
  projectId: string;
  /** 참석자 후보 — 비활성 페르소나는 서버가 거부하므로 목록에서 뺀다 */
  personas: readonly AgentOfficePersona[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: AgentMeetingCreated) => void;
}

/**
 * 회의 소집(P3b D-P3b-4①) — 전역 관리자 전용 버튼에서 연다. 안건 규칙(계획·에스컬레이션은 안건 이슈나 지시 중 하나)은
 * 화면이 먼저 막고, 이슈 소속·활성 회의 중복(409) 같은 서버 판정은 `{"error"}` 문구를 그대로 토스트로 보여 준다.
 */
export function MeetingConveneModal({ projectId, personas, open, onOpenChange, onCreated }: MeetingConveneModalProps) {
  const toast = useToast();
  const [type, setType] = useState<AgentMeetingType>("MEETING");
  const [issueKey, setIssueKey] = useState("");
  const [agenda, setAgenda] = useState("");
  const [mode, setMode] = useState<AttendeeMode>("auto");
  const [picked, setPicked] = useState<string[]>([]);
  const [site, setSite] = useState<ExecutionSiteChoice>(SITE_FOLLOW);
  const [submitted, setSubmitted] = useState(false);
  // 실행 위치 덮어쓰기(P4a) — 모달이 열릴 때만 조회, 구 백엔드면 칸이 없다
  const siteSetting = useProjectExecutionSite(projectId, open);
  const [busy, setBusy] = useState(false);

  const candidates = personas.filter((p) => p.active);
  const needsAgenda = !AGENDA_OPTIONAL.includes(type) && !issueKey.trim() && !agenda.trim();
  const agendaError = submitted && needsAgenda ? "착수/계획·에스컬레이션 회의에는 안건 이슈나 안건 지시가 필요합니다" : undefined;
  const attendeeError =
    submitted && mode === "pick" && picked.length === 0
      ? "참석자를 한 명 이상 고르세요"
      : mode === "pick" && picked.length > ATTENDEES_MAX
        ? `참석자는 ${ATTENDEES_MAX}명까지 고를 수 있습니다`
        : undefined;

  const reset = () => {
    setType("MEETING");
    setIssueKey("");
    setAgenda("");
    setMode("auto");
    setPicked([]);
    setSite(SITE_FOLLOW);
    setSubmitted(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const togglePersona = (slug: string, checked: boolean) =>
    setPicked((prev) => (checked ? [...prev, slug] : prev.filter((s) => s !== slug)));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (needsAgenda || (mode === "pick" && (picked.length === 0 || picked.length > ATTENDEES_MAX))) return;
    setBusy(true);
    try {
      const result = await createMeeting({
        type,
        projectId,
        agendaIssueKey: issueKey.trim() || undefined,
        agenda: agenda.trim() || undefined,
        personaSlugs: mode === "pick" ? picked : undefined,
        executionSite: siteOverride(site),
      });
      toast({
        title: `${agentMeetingRunName(type)}를 소집했습니다`,
        description: result.attendees.length > 0 ? `참석: ${result.attendees.map((a) => a.name).join(", ")}` : undefined,
        appearance: "success",
      });
      handleOpenChange(false);
      onCreated(result);
    } catch (error) {
      toast({
        title: "회의를 소집하지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      trigger={<span hidden />}
      title="회의 소집"
      description="AI 팀이 회의를 열고, 끝나면 회의록을 위키에 남겨 사무실 게시판에 게시합니다."
      open={open}
      onOpenChange={handleOpenChange}
    >
      <form className="meeting-convene-form" onSubmit={handleSubmit} noValidate>
        <Select
          label="종류"
          value={type}
          options={MEETING_TYPES.map((t) => ({
            value: t,
            label: AGENT_MEETING_TYPE_LABEL[t],
            icon: <AgentMeetingTypeIcon type={t} />,
          }))}
          onValueChange={(v) => setType(v as AgentMeetingType)}
        />
        <ExecutionSiteSelect setting={siteSetting} value={site} onChange={setSite} />
        <TextField
          label="안건 이슈 키 (선택)"
          value={issueKey}
          maxLength={ISSUE_KEY_MAX}
          placeholder="예: ALM-12"
          description="이 프로젝트의 이슈여야 합니다"
          onChange={(e) => setIssueKey(e.target.value)}
        />
        <TextArea
          label="안건 지시 (선택)"
          value={agenda}
          maxLength={AGENDA_MAX}
          rows={4}
          description={`${agenda.length.toLocaleString("ko-KR")} / ${AGENDA_MAX.toLocaleString("ko-KR")}자`}
          error={agendaError}
          onChange={(e) => setAgenda(e.target.value)}
        />
        <fieldset className="meeting-convene-attendees">
          <legend className="meeting-convene-legend">참석자</legend>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as AttendeeMode)} aria-label="참석자 정하는 방법">
            <Radio value="auto" label={`자동(롤 규칙) — ${AUTO_RULE[type]}`} />
            <Radio value="pick" label="직접 고르기" />
          </RadioGroup>
          {mode === "pick" ? (
            <div className="meeting-convene-people" role="group" aria-label="참석할 팀원">
              {candidates.map((p) => (
                <Checkbox
                  key={p.id}
                  checked={picked.includes(p.slug)}
                  onCheckedChange={(checked) => togglePersona(p.slug, checked === true)}
                  label={
                    <span className="meeting-convene-person">
                      {p.name} <AgentRoleGlyph role={p.role} size={12} />
                    </span>
                  }
                />
              ))}
            </div>
          ) : null}
          {attendeeError ? (
            <p className="meeting-convene-error" role="alert">
              {attendeeError}
            </p>
          ) : null}
        </fieldset>
        <div className="meeting-convene-actions">
          <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" disabled={busy}>
            소집
          </Button>
        </div>
      </form>
    </Modal>
  );
}
