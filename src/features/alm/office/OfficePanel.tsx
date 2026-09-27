import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useNavigate } from "react-router";
import { Banner, Button, Spinner } from "@chanho/react";
import { ExternalLink, FileText, History, Wrench, X } from "lucide-react";
import type { AgentBoardPost, AgentOfficePersona, AgentPersonaActivity, AgentRunSummary } from "../store/types";
import {
  AGENT_RUN_STATUS_LABEL,
  AGENT_RUN_TRIGGER_LABEL,
  AGENT_MEETING_TYPE_LABEL,
  AGENT_RUN_TYPE_LABEL,
  AgentMeetingTypeGlyph,
  AgentRoleGlyph,
  AgentRunStatusLozenge,
  AgentStatusLozenge,
} from "../components/AgentGlyphs";
import { formatClock, formatDateTime, relTime } from "../components/time";
import type { LoadStatus } from "./useOfficeData";
import { BoardPortrait, OfficePortrait } from "./PixelSprite";
import { linkableIssueKey, personaState, PROJECT_WIDE_LABEL } from "./officeModel";

export interface OfficeLinks {
  gates: string;
  runs: string;
  run: (runId: string) => string;
  /** `?issue=KEY` — 현재 쿼리(view 등)를 유지한 채 전역 이슈 모달을 연다 */
  issue: (key: string) => string;
}

export type PanelTarget = { kind: "persona"; persona: AgentOfficePersona } | { kind: "board" };

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
  onClose,
  onRetry,
}: {
  target: PanelTarget;
  personaNames: Map<string, AgentOfficePersona>;
  recentFinished: AgentRunSummary[];
  boardPosts: AgentBoardPost[];
  activity: AgentPersonaActivity | null;
  activityStatus: LoadStatus | "idle";
  links: OfficeLinks;
  docked: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const targetKey = target.kind === "board" ? "board" : target.persona.id;

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
          persona={target.persona}
          activity={activity}
          activityStatus={activityStatus}
          links={links}
          titleRef={titleRef}
          onClose={onClose}
          onRetry={onRetry}
        />
      ) : (
        <BoardBody
          posts={boardPosts}
          runs={recentFinished}
          personaNames={personaNames}
          links={links}
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
}: {
  persona: AgentOfficePersona;
  activity: AgentPersonaActivity | null;
  activityStatus: LoadStatus | "idle";
  links: OfficeLinks;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const state = personaState(persona);
  const run = state === "INACTIVE" ? null : persona.currentRun;

  return (
    <>
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
  titleRef,
  onClose,
}: {
  posts: AgentBoardPost[];
  runs: AgentRunSummary[];
  personaNames: Map<string, AgentOfficePersona>;
  links: OfficeLinks;
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
          <span className="office-panel-role">회의록 · 최근 작업 보고서</span>
        </div>
        <CloseButton onClose={onClose} label="게시판 닫기" />
      </header>
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
