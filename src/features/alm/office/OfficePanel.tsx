import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useNavigate } from "react-router";
import { Badge, Banner, Button, Lozenge, Spinner, Tabs } from "@chanho/react";
import { ExternalLink, FileText, History, Keyboard, MessageCircle, Users, UsersRound, Wrench, X } from "lucide-react";
import type {
  AgentActiveMeeting,
  AgentBoardPost,
  AgentOfficePersona,
  AgentPersonaActivity,
  AgentRunSummary,
  IssueTypeDef,
  WorkflowStatus,
} from "../store/types";
import {
  AGENT_RUN_STATUS_LABEL,
  AGENT_RUN_TRIGGER_LABEL,
  AGENT_MEETING_TYPE_LABEL,
  AGENT_RUN_TYPE_LABEL,
  AgentMeetingTypeGlyph,
  AgentRoleGlyph,
  AgentRunStatusLozenge,
  AgentRunTypeGlyph,
  AgentStatusLozenge,
} from "../components/AgentGlyphs";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { StatusGlyph } from "../components/StatusGlyph";
import { statusAppearance, statusName } from "../components/labels";
import { formatClock, formatDateTime, relTime } from "../components/time";
import type { LoadStatus } from "./useOfficeData";
import { BoardPortrait, OfficePortrait, WhiteboardPortrait } from "./PixelSprite";
import { PixelProgress } from "./PixelProgress";
import { useDialogLog, type DialogMemory } from "./useDialogLog";
import { dayHeading, DialogLogRow } from "./DialogLogRows";
import { plainName } from "./officeDialogCopy";
import {
  deskStayState,
  linkableIssueKey,
  meetingElapsedMinutes,
  meetingRunStatus,
  personaState,
  PROJECT_WIDE_LABEL,
  type EpicGoal,
} from "./officeModel";

export interface OfficeLinks {
  gates: string;
  runs: string;
  run: (runId: string) => string;
  /** `?issue=KEY` — 현재 쿼리(view 등)를 유지한 채 전역 이슈 모달을 연다 */
  issue: (key: string) => string;
}

export type PanelTarget = { kind: "persona"; persona: AgentOfficePersona } | { kind: "board" } | { kind: "meeting" };

/** 게시판 "지금 만드는 것" 섹션 입력(P3e §3) — 목표는 페이지가 `epicGoals`로 만든다 */
export interface GoalsView {
  status: "idle" | "loading" | "ready" | "error";
  goals: EpicGoal[];
  statuses: WorkflowStatus[];
  types: IssueTypeDef[];
  retry: () => void;
}

/** 목표 기본 표시 수 — 완료 아닌 것 5개 + 접기(§3.4) */
const GOALS_SHOWN = 5;

const RUN_TYPE_LABEL = AGENT_RUN_TYPE_LABEL;
const TRIGGER_LABEL = AGENT_RUN_TRIGGER_LABEL;

function durationText(run: AgentRunSummary): string | null {
  if (!run.startedAt || !run.endedAt) return null;
  const ms = Date.parse(run.endedAt) - Date.parse(run.startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "1분 미만";
  if (minutes < 60) return `${minutes}분`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="office-panel-section">
      <h3 className="office-panel-h3">
        {title}
        {count !== undefined ? <span className="office-panel-count">{count}</span> : null}
      </h3>
      {children}
    </section>
  );
}

/**
 * 개인 오피스 / 게시판 패널(스펙 §5) — 비모달 영역(dialog 아님: 캔버스와 동시에 조작, 포커스 트랩 없음).
 * 열리거나 대상이 바뀌면 제목으로 포커스, Esc·닫기는 연 요소로 되돌린다(되돌리기는 부모 몫).
 */
export function OfficePanel({
  target,
  personaNames,
  recentFinished,
  boardPosts,
  activity,
  activityStatus,
  links,
  docked,
  meeting,
  goals,
  onClose,
  onRetry,
  onOpenPersona,
  onOpenBoard,
  onConvene,
  dialogMemory,
  logVersion,
  onTalk,
}: {
  target: PanelTarget;
  personaNames: Map<string, AgentOfficePersona>;
  recentFinished: AgentRunSummary[];
  boardPosts: AgentBoardPost[];
  activity: AgentPersonaActivity | null;
  activityStatus: LoadStatus | "idle";
  links: OfficeLinks;
  docked: boolean;
  meeting: AgentActiveMeeting | null;
  goals: GoalsView;
  onClose: () => void;
  onRetry: () => void;
  onOpenPersona: (id: string, opener: HTMLElement) => void;
  onOpenBoard: (opener: HTMLElement) => void;
  /** 회의 소집 모달 열기 — 소집 권한(전역 관리자)이 없으면 없음 */
  onConvene?: () => void;
  /** P3g — 대화 기록(메모리 폴백 공유)·다시 조회 신호·말 걸기 */
  dialogMemory: DialogMemory;
  logVersion: number;
  onTalk: (id: string, opener: HTMLElement) => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const targetKey = target.kind === "persona" ? target.persona.id : target.kind;

  useEffect(() => {
    titleRef.current?.focus();
  }, [targetKey]);

  return (
    <aside
      id="ai-office-panel"
      className={docked ? "ai-office-panel is-docked" : "ai-office-panel is-overlay"}
      aria-labelledby="ai-office-panel-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="office-panel-band" aria-hidden="true" />
      {target.kind === "persona" ? (
        <PersonaBody
          key={target.persona.id}
          persona={target.persona}
          activity={activity}
          activityStatus={activityStatus}
          links={links}
          titleRef={titleRef}
          onClose={onClose}
          onRetry={onRetry}
          dialogMemory={dialogMemory}
          logVersion={logVersion}
          onTalk={onTalk}
        />
      ) : target.kind === "meeting" ? (
        <MeetingBody
          meeting={meeting}
          personaNames={personaNames}
          links={links}
          titleRef={titleRef}
          onClose={onClose}
          onOpenPersona={onOpenPersona}
          onOpenBoard={onOpenBoard}
          onConvene={onConvene}
        />
      ) : (
        <BoardBody
          posts={boardPosts}
          runs={recentFinished}
          personaNames={personaNames}
          links={links}
          goals={goals}
          titleRef={titleRef}
          onClose={onClose}
        />
      )}
    </aside>
  );
}

function CloseButton({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <Button variant="ghost" size="small" iconOnly aria-label={label} className="office-panel-close" onClick={onClose}>
      <X size={16} aria-hidden />
    </Button>
  );
}

function PersonaBody({
  persona,
  activity,
  activityStatus,
  links,
  titleRef,
  onClose,
  onRetry,
  dialogMemory,
  logVersion,
  onTalk,
}: {
  persona: AgentOfficePersona;
  activity: AgentPersonaActivity | null;
  activityStatus: LoadStatus | "idle";
  links: OfficeLinks;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onRetry: () => void;
  dialogMemory: DialogMemory;
  logVersion: number;
  onTalk: (id: string, opener: HTMLElement) => void;
}) {
  const [tab, setTab] = useState("activity");
  return (
    <>
      <PersonaHead persona={persona} titleRef={titleRef} onClose={onClose} />
      {/* P3g §6.2 — 게시판·회의실 모드에는 탭이 없다. 대화 기록은 탭을 열 때 1회 조회(폴링에 싣지 않는다) */}
      <Tabs
        label={`${persona.name} 개인 오피스`}
        className="office-panel-tabs"
        value={tab}
        onValueChange={setTab}
        items={[
          {
            value: "activity",
            label: "활동",
            content: (
              <div className="office-panel-tab">
                <PersonaActivity persona={persona} activity={activity} activityStatus={activityStatus} links={links} onRetry={onRetry} />
              </div>
            ),
          },
          {
            value: "log",
            label: "대화 기록",
            content:
              tab === "log" ? (
                <div className="office-panel-tab">
                  <DialogHistory persona={persona} memory={dialogMemory} version={logVersion} links={links} onTalk={onTalk} />
                </div>
              ) : null,
          },
        ]}
      />
    </>
  );
}

function PersonaHead({
  persona,
  titleRef,
  onClose,
}: {
  persona: AgentOfficePersona;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}) {
  const state = personaState(persona);
  return (
    <header className="office-panel-head">
      <OfficePortrait slug={persona.slug} role={persona.role} className="is-panel" />
      <div className="office-panel-id">
        <h2 id="ai-office-panel-title" className="office-panel-title" tabIndex={-1} ref={titleRef}>
          {persona.emoji ? <span aria-hidden="true">{persona.emoji} </span> : null}
          {persona.name}
        </h2>
        <span className="office-panel-role">
          <AgentRoleGlyph role={persona.role} />
        </span>
        <AgentStatusLozenge state={state} />
      </div>
      <CloseButton onClose={onClose} label="개인 오피스 닫기" />
    </header>
  );
}

/**
 * "대화 기록" 탭(P3g §6.2) — 맨 위 "말 걸기"(패널을 닫고 그 봇에게 걸어간다) → 날짜 묶음 → 줄. 최근 50 + "더 보기".
 * 구 백엔드면 이 화면에 있는 동안만 메모리 — 안내를 맨 위에.
 */
function DialogHistory({
  persona,
  memory,
  version,
  links,
  onTalk,
}: {
  persona: AgentOfficePersona;
  memory: DialogMemory;
  version: number;
  links: OfficeLinks;
  onTalk: (id: string, opener: HTMLElement) => void;
}) {
  const log = useDialogLog(persona.id, memory);
  const { load } = log;
  useEffect(() => {
    load();
  }, [load, version]);
  const name = plainName(persona);
  const groups: { day: string; rows: typeof log.entries }[] = [];
  for (const entry of log.entries) {
    const day = dayHeading(entry.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(entry);
    else groups.push({ day, rows: [entry] });
  }
  return (
    <section className="office-panel-section">
      <div>
        <Button
          variant="primary"
          size="small"
          iconBefore={<MessageCircle size={14} aria-hidden />}
          disabled={!persona.active}
          onClick={(e) => onTalk(persona.id, e.currentTarget)}
        >
          말 걸기
        </Button>
      </div>
      {log.memoryOnly ? (
        <p className="office-panel-empty">이 서버는 대화 기록을 저장하지 않아요 — 화면을 떠나면 사라져요</p>
      ) : null}
      {log.status === "loading" || log.status === "idle" ? (
        <div className="office-panel-loading">
          <Spinner size="small" label="대화 기록을 불러오는 중" />
        </div>
      ) : log.status === "error" ? (
        <div className="office-panel-error">
          <p role="alert">대화 기록을 불러오지 못했습니다</p>
          <Button variant="secondary" size="small" onClick={load}>
            다시 시도
          </Button>
        </div>
      ) : log.entries.length === 0 ? (
        <p className="office-panel-empty">아직 나눈 대화가 없습니다</p>
      ) : (
        <>
          {log.hasMore ? (
            <div>
              <Button variant="ghost" size="small" loading={log.loadingMore} onClick={log.loadMore}>
                더 보기
              </Button>
            </div>
          ) : null}
          {groups.map((g) => (
            <div key={g.day} className="office-log-group">
              <h3 className="office-panel-h3">{g.day}</h3>
              <ol className="office-log-list" aria-label={`${g.day} 대화`}>
                {g.rows.map((entry) => (
                  <DialogLogRow
                    key={entry.id}
                    entry={entry}
                    personaName={name}
                    links={links}
                    renderLink={(to, label) => <Link to={to}>{label}</Link>}
                  />
                ))}
              </ol>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function PersonaActivity({
  persona,
  activity,
  activityStatus,
  links,
  onRetry,
}: {
  persona: AgentOfficePersona;
  activity: AgentPersonaActivity | null;
  activityStatus: LoadStatus | "idle";
  links: OfficeLinks;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const state = personaState(persona);
  const run = state === "INACTIVE" ? null : persona.currentRun;

  return (
    <>
      <Section title="현재 작업">
        {run ? (
          <>
            {run.status === "WAITING_APPROVAL" ? (
              <Banner variant="warning" action={{ label: "승인 인박스 열기", onClick: () => navigate(`${links.gates}?persona=${encodeURIComponent(persona.id)}`) }}>
                사람의 승인을 기다리고 있습니다.
              </Banner>
            ) : null}
            {run.status === "BLOCKED" ? <Banner variant="danger">차단됨 — 다음 조치가 필요합니다.</Banner> : null}
            <dl className="office-panel-dl">
              <dt>이슈</dt>
              <dd>
                <IssueCell run={run} links={links} />
              </dd>
              <dt>종류</dt>
              <dd>
                {RUN_TYPE_LABEL[run.type]} · {TRIGGER_LABEL[run.trigger]}
              </dd>
              <dt>상태</dt>
              <dd>
                <AgentStatusLozenge state={run.status} />
              </dd>
              <dt>시작</dt>
              <dd>
                {run.startedAt ? (
                  <span title={formatDateTime(run.startedAt)}>
                    {relTime(run.startedAt)} ({formatClock(run.startedAt)})
                  </span>
                ) : (
                  "아직 시작 전"
                )}
              </dd>
              <dt>시도</dt>
              <dd>{run.attempt}회</dd>
              <dt>모델</dt>
              <dd className="office-mono">{run.model ?? "—"}</dd>
            </dl>
            <Button
              variant="secondary"
              size="small"
              iconBefore={<History size={14} aria-hidden />}
              onClick={() => navigate(links.run(run.id))}
            >
              실행 상세
            </Button>
          </>
        ) : (
          <p className="office-panel-empty">지금 진행 중인 작업이 없습니다</p>
        )}
      </Section>

      {activityStatus === "loading" || activityStatus === "idle" ? (
        <div className="office-panel-loading">
          <Spinner size="medium" label="불러오는 중" />
        </div>
      ) : activityStatus === "error" && !activity ? (
        <div className="office-panel-error">
          <p role="alert">개인 오피스를 불러오지 못했습니다</p>
          <Button variant="secondary" size="small" onClick={onRetry}>
            다시 시도
          </Button>
        </div>
      ) : activity ? (
        <>
          <TodayAudits activity={activity} />
          <Section title="최근 실행" count={activity.runs.length}>
            {activity.runs.length === 0 ? (
              <p className="office-panel-empty">아직 실행 기록이 없습니다</p>
            ) : (
              <ul className="office-run-list">
                {activity.runs.map((r) => (
                  <li key={r.id}>
                    <Link
                      className="office-run-row"
                      to={links.run(r.id)}
                      aria-label={`${AGENT_RUN_STATUS_LABEL[r.status]} ${runKeyText(r, "이슈 없음")} ${RUN_TYPE_LABEL[r.type]} — 실행 상세`}
                    >
                      <AgentRunStatusLozenge status={r.status} />
                      <span className="office-run-key">{runKeyText(r, "—")}</span>
                      <span>{RUN_TYPE_LABEL[r.type]}</span>
                      <span className="office-run-meta">
                        {r.startedAt ? relTime(r.startedAt) : "시작 전"}
                        {durationText(r) ? ` · ${durationText(r)}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      ) : null}
    </>
  );
}

/** "오늘 한 일" — 오늘 감사(≤50, 최신 먼저). 요약은 서버가 가린 문구일 수 있다 */
function TodayAudits({ activity }: { activity: AgentPersonaActivity }) {
  const [expanded, setExpanded] = useState(false);
  const rows = activity.todayAudits;
  const shown = expanded ? rows : rows.slice(0, 10);
  return (
    <Section title="오늘 한 일" count={rows.length}>
      {rows.length === 0 ? (
        <p className="office-panel-empty">오늘 기록된 활동이 없습니다</p>
      ) : (
        <>
          <ul className="office-audit-list">
            {shown.map((a) => (
              <li key={a.id} className={a.status === "ERROR" ? "office-audit is-error" : "office-audit"}>
                <span className="office-audit-time">{formatClock(a.createdAt)}</span>
                <span className="office-audit-tool">
                  <Wrench size={12} aria-hidden />
                  {a.tool}
                </span>
                <span className="office-audit-summary" title={a.summary ?? undefined}>
                  {a.summary ?? ""}
                  {a.status === "ERROR" ? <span className="office-audit-error"> · 오류</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {!expanded && rows.length > 10 ? (
            <Button variant="ghost" size="small" onClick={() => setExpanded(true)}>
              {rows.length - 10}개 더 보기
            </Button>
          ) : null}
        </>
      )}
    </Section>
  );
}

function BoardBody({
  posts,
  runs,
  personaNames,
  links,
  goals,
  titleRef,
  onClose,
}: {
  posts: AgentBoardPost[];
  runs: AgentRunSummary[];
  personaNames: Map<string, AgentOfficePersona>;
  links: OfficeLinks;
  goals: GoalsView;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}) {
  return (
    <>
      <header className="office-panel-head">
        <BoardPortrait />
        <div className="office-panel-id">
          <h2 id="ai-office-panel-title" className="office-panel-title" tabIndex={-1} ref={titleRef}>
            게시판
          </h2>
          <span className="office-panel-role">개발 목표 · 회의록 · 최근 작업 보고서</span>
        </div>
        <CloseButton onClose={onClose} label="게시판 닫기" />
      </header>
      <GoalsSection goals={goals} links={links} />
      <Section title="회의록" count={posts.length}>
        {posts.length === 0 ? (
          <p className="office-panel-empty">아직 게시물이 없습니다</p>
        ) : (
          <ul className="office-board-list" aria-label="회의록 게시물">
            {posts.map((post) => (
              <BoardPostRow key={post.runId} post={post} links={links} />
            ))}
          </ul>
        )}
      </Section>
      <Section title="최근 종결" count={runs.length}>
        {runs.length === 0 ? (
          <p className="office-panel-empty">아직 게시된 보고서가 없습니다</p>
        ) : (
          <ul className="office-board-list" aria-label="최근 종결 보고서">
            {runs.map((r) => {
              const persona = personaNames.get(r.personaId);
              return (
                <li key={r.id} className="office-board-row">
                  <AgentRunStatusLozenge status={r.status} />
                  <span className="office-board-who">
                    {persona ? <AgentRoleGlyph role={persona.role} size={12} /> : null}
                    <span>{persona?.name ?? `페르소나 #${r.personaId}`}</span>
                  </span>
                  <IssueCell run={r} links={links} className="office-run-key" />
                  <span className="office-run-meta" title={r.endedAt ? formatDateTime(r.endedAt) : undefined}>
                    {r.endedAt ? relTime(r.endedAt) : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}

/**
 * 게시물 한 줄 — 종류·안건·회의록·시각. 회의록은 위키(`/wiki/spaces/:spaceId/pages/:pageId`)를 새 탭으로 연다
 * (AGP-54 가이드 진입점과 같은 방식 — 같은 오리진의 다른 앱). 위키에는 스페이스 없이 페이지로 가는 라우트가 없어서,
 * spaceId가 없으면(구 백엔드·회의록 스페이스 미설정) 링크 없이 라벨만 둔다.
 */
function BoardPostRow({ post, links }: { post: AgentBoardPost; links: OfficeLinks }) {
  return (
    <li className="office-board-row" data-testid={`office-board-post-${post.runId}`}>
      <AgentMeetingTypeGlyph type={post.type} size={12} />
      {post.agendaIssueKey ? (
        <Link
          to={links.issue(post.agendaIssueKey)}
          className="office-run-key"
          aria-label={`${AGENT_MEETING_TYPE_LABEL[post.type]} 안건 ${post.agendaIssueKey}`}
        >
          {post.agendaIssueKey}
        </Link>
      ) : (
        <span className="office-board-agenda">프로젝트 전반</span>
      )}
      {post.spaceId ? (
        <a
          className="office-board-doc"
          href={`/wiki/spaces/${encodeURIComponent(post.spaceId)}/pages/${encodeURIComponent(post.pageId)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${AGENT_MEETING_TYPE_LABEL[post.type]} 회의록 — 위키에서 열기(새 탭)`}
        >
          <FileText size={12} aria-hidden />
          회의록
          <ExternalLink size={12} aria-hidden />
        </a>
      ) : (
        <span className="office-board-doc" title={`위키 페이지 #${post.pageId}`}>
          <FileText size={12} aria-hidden />
          회의록
        </span>
      )}
      <span className="office-run-meta" title={formatDateTime(post.endedAt)}>
        {relTime(post.endedAt)}
      </span>
    </li>
  );
}

/** run 목록 행 텍스트용 키 — 안건 이슈 없는 회의는 "프로젝트 전반" */
function runKeyText(run: Pick<AgentRunSummary, "type" | "issueKey">, empty: string): string {
  if (run.issueKey && !linkableIssueKey(run)) return PROJECT_WIDE_LABEL;
  return run.issueKey ?? empty;
}

/** 이슈 칸 — 실이슈는 전역 이슈 모달 링크, 합성 키 회의는 "프로젝트 전반", 없으면 "—" */
function IssueCell({
  run,
  links,
  className,
}: {
  run: Pick<AgentRunSummary, "type" | "issueKey">;
  links: OfficeLinks;
  className?: string;
}) {
  const key = linkableIssueKey(run);
  if (key) {
    return (
      <Link to={links.issue(key)} className={className}>
        {key}
      </Link>
    );
  }
  return <span className={className}>{run.issueKey ? PROJECT_WIDE_LABEL : "—"}</span>;
}

/**
 * 게시판 맨 위 "지금 만드는 것"(P3e §3.2) — 에픽별 제목·상태·도트 진행바·"n/m 완료"·지금 붙어 있는 AI 수.
 * 로딩·오류는 이 섹션 자리에서만(나머지 섹션은 즉시 표시).
 */
function GoalsSection({ goals, links }: { goals: GoalsView; links: OfficeLinks }) {
  const [openMore, setOpenMore] = useState(false);
  const [openDone, setOpenDone] = useState(false);
  const pending = goals.goals.filter((g) => g.kind !== "complete");
  const done = goals.goals.filter((g) => g.kind === "complete");
  const shownPending = openMore ? pending : pending.slice(0, GOALS_SHOWN);
  const rows = openDone ? [...shownPending, ...done] : shownPending;

  let body: ReactNode;
  if (goals.status === "error" && goals.goals.length === 0) {
    body = (
      <div className="office-panel-error">
        <p role="alert">목표를 불러오지 못했습니다</p>
        <Button variant="secondary" size="small" onClick={goals.retry}>
          다시 시도
        </Button>
      </div>
    );
  } else if (goals.status !== "ready" && goals.goals.length === 0) {
    body = (
      <div className="office-goal-loading">
        <Spinner size="small" label="목표를 불러오는 중" />
      </div>
    );
  } else if (goals.goals.length === 0) {
    body = <p className="office-panel-empty">아직 목표(에픽)가 없습니다</p>;
  } else {
    body = (
      <>
        <ul className="office-goal-list" aria-label="개발 목표">
          {rows.map((goal) => (
            <GoalRow key={goal.issue.id} goal={goal} goals={goals} links={links} />
          ))}
        </ul>
        {!openMore && pending.length > GOALS_SHOWN ? (
          <Button variant="ghost" size="small" onClick={() => setOpenMore(true)}>
            목표 {pending.length - GOALS_SHOWN}개 더 보기
          </Button>
        ) : null}
        {!openDone && done.length > 0 ? (
          <Button variant="ghost" size="small" onClick={() => setOpenDone(true)}>
            완료된 목표 {done.length}개 더 보기
          </Button>
        ) : null}
      </>
    );
  }
  return (
    <Section title="지금 만드는 것" count={goals.status === "ready" || goals.goals.length > 0 ? goals.goals.length : undefined}>
      {body}
    </Section>
  );
}

function GoalRow({ goal, goals, links }: { goal: EpicGoal; goals: GoalsView; links: OfficeLinks }) {
  const { issue } = goal;
  const workerNames = goal.workers.map((p) => p.name).join(", ");
  return (
    <li className="office-goal" data-testid={`office-goal-${issue.key}`}>
      <div className="office-goal-head">
        <IssueTypeGlyph type={issue.type} types={goals.types} />
        <Link to={links.issue(issue.key)} className="office-goal-title">
          {issue.title}
        </Link>
        <span className="status-cell office-goal-status">
          <StatusGlyph status={issue.status} statuses={goals.statuses} variant="icon" />
          <Lozenge appearance={statusAppearance(goals.statuses, issue.status)}>
            {statusName(goals.statuses, issue.status)}
          </Lozenge>
        </span>
      </div>
      <div className="office-goal-meta">
        <span className="office-run-key">{issue.key}</span>
        {goal.total > 0 ? (
          <>
            <PixelProgress done={goal.done} total={goal.total} label={`${issue.title} 진행`} />
            <span className="office-goal-count">
              {goal.done}/{goal.total} 완료
            </span>
          </>
        ) : (
          <span className="office-panel-empty office-goal-count">하위 이슈 없음</span>
        )}
      </div>
      {goal.workers.length > 0 ? (
        <p className="office-goal-workers" title={workerNames}>
          <Keyboard size={12} aria-hidden />
          AI {goal.workers.length}명 작업 중
        </p>
      ) : null}
    </li>
  );
}

/**
 * 회의실 모드(P3e §2.8) — 종류·안건·진행자·경과·참석자·실행 상세·회의록. 회의 없음이면 안내 + (권한 있으면) 회의 소집.
 * 열려 있는 동안 회의가 끝나면 내용만 "회의 없음"으로 바뀐다(패널을 닫지 않는다).
 */
function MeetingBody({
  meeting,
  personaNames,
  links,
  titleRef,
  onClose,
  onOpenPersona,
  onOpenBoard,
  onConvene,
}: {
  meeting: AgentActiveMeeting | null;
  personaNames: Map<string, AgentOfficePersona>;
  links: OfficeLinks;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onOpenPersona: (id: string, opener: HTMLElement) => void;
  onOpenBoard: (opener: HTMLElement) => void;
  onConvene?: () => void;
}) {
  const navigate = useNavigate();
  const personas = [...personaNames.values()];
  const host = meeting ? personaNames.get(meeting.hostPersonaId) : undefined;
  const status = meeting ? meetingRunStatus(meeting, personas) : null;
  const minutes = meeting ? meetingElapsedMinutes(meeting.startedAt, Date.now()) : null;
  const hostRun = meeting && host?.currentRun?.id === meeting.runId ? host.currentRun : null;
  const agendaKey = meeting ? linkableIssueKey(meeting) : null;

  return (
    <>
      <header className="office-panel-head">
        <WhiteboardPortrait active={meeting !== null} />
        <div className="office-panel-id">
          <h2 id="ai-office-panel-title" className="office-panel-title" tabIndex={-1} ref={titleRef}>
            회의실
          </h2>
          <span className="office-panel-role">
            {meeting ? <AgentRunTypeGlyph type={meeting.type} size={12} /> : "진행 중인 회의 없음"}
          </span>
          {meeting && status ? (
            status === "WAITING_APPROVAL" || status === "BLOCKED" ? (
              <AgentRunStatusLozenge status={status} />
            ) : (
              <Lozenge appearance="info" className="agent-lozenge is-info">
                <Users size={12} aria-hidden />
                {minutes === null ? "진행 중" : minutes < 1 ? "진행 중 방금" : `진행 중 ${minutes}분`}
              </Lozenge>
            )
          ) : null}
        </div>
        <CloseButton onClose={onClose} label="회의실 닫기" />
      </header>

      <Section title="진행 중인 회의">
        {meeting ? (
          <>
            <dl className="office-panel-dl">
              <dt>종류</dt>
              <dd>
                <span className="status-cell">
                  <AgentRunTypeGlyph type={meeting.type} size={12} />
                  {hostRun ? ` · ${TRIGGER_LABEL[hostRun.trigger]}` : ""}
                </span>
              </dd>
              <dt>안건</dt>
              <dd>
                {agendaKey ? (
                  <Link to={links.issue(agendaKey)} className="office-run-key">
                    {agendaKey}
                  </Link>
                ) : (
                  PROJECT_WIDE_LABEL
                )}
              </dd>
              <dt>진행자</dt>
              <dd>
                {host ? (
                  <span className="status-cell">
                    <AgentRoleGlyph role={host.role} size={12} />
                    <span>{host.name}</span>
                  </span>
                ) : (
                  `페르소나 #${meeting.hostPersonaId}`
                )}
              </dd>
              <dt>시작</dt>
              <dd>
                {meeting.startedAt ? (
                  <span title={formatDateTime(meeting.startedAt)}>
                    {relTime(meeting.startedAt)} ({formatClock(meeting.startedAt)})
                  </span>
                ) : (
                  "아직 시작 전"
                )}
              </dd>
            </dl>
            <div>
              <Button
                variant="secondary"
                size="small"
                iconBefore={<History size={14} aria-hidden />}
                onClick={() => navigate(links.run(meeting.runId))}
              >
                실행 상세
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="office-panel-empty">지금 진행 중인 회의가 없습니다</p>
            {onConvene ? (
              <div>
                <Button
                  variant="secondary"
                  size="small"
                  iconBefore={<UsersRound size={14} aria-hidden />}
                  onClick={onConvene}
                >
                  회의 소집
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Section>

      {meeting ? (
        <Section title="참석자" count={meeting.attendeePersonaIds.length}>
          <ul className="office-attendee-list" aria-label="참석자">
            {meeting.attendeePersonaIds.map((id) => {
              const p = personaNames.get(id);
              if (!p || !p.active) {
                return (
                  <li key={id} className="office-attendee is-inactive">
                    <span>{p?.name ?? `페르소나 #${id}`}</span>
                    <span className="office-panel-empty">· 비활성</span>
                  </li>
                );
              }
              const stay = deskStayState(p, meeting);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="office-attendee"
                    onClick={(e) => onOpenPersona(p.id, e.currentTarget)}
                  >
                    <OfficePortrait slug={p.slug} role={p.role} className="is-row" />
                    <span className="office-attendee-name">{p.name}</span>
                    <AgentRoleGlyph role={p.role} size={12} />
                    {id === meeting.hostPersonaId ? <Badge appearance="brand">진행자</Badge> : null}
                    {stay ? (
                      <span className="status-cell">
                        <AgentStatusLozenge state={stay} />
                        <span className="office-panel-empty">· 자리에 있음</span>
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section title="회의록">
        <div>
          <Button
            variant="ghost"
            size="small"
            iconBefore={<FileText size={14} aria-hidden />}
            onClick={(e) => onOpenBoard(e.currentTarget)}
          >
            게시판에서 회의록 보기
          </Button>
        </div>
      </Section>
    </>
  );
}
