import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "react-router";
import { Badge, Banner, Button, Card, EmptyState, Select, useToast } from "@chanho/react";
import { RotateCcw, Save, SearchCheck, UserX } from "lucide-react";
import type { AgentReviewSetting, AgentTeamPersona } from "../store/types";
import { clearReviewSetting, fetchReviewSetting, saveReviewSetting } from "../store/jiraStore";
import { AgentReviewerSourceLozenge, AgentRoleIcon } from "../components/AgentGlyphs";
import { errorText, LoadState, PersonaAvatar, useLoad } from "./aiTeamShared";

/** 사무실 경고 칩이 여는 앵커 — `/projects/:id/settings/ai-team#reviewer` */
export const REVIEWER_ANCHOR = "reviewer";

/** Select 빈 문자열 금지(DS 함정) — 아직 고르지 않음 센티널 */
const NO_PICK = "none";

export interface ReviewerSectionProps {
  projectId: string;
  canManage: boolean;
  /** 권한 판정이 끝났는가 — 전에는 편집 UI를 열지 않는다 */
  loaded: boolean;
  /** 이 프로젝트 소속 + 공용 직원(조회 전이면 null) — 후보·초상은 여기서 찾는다 */
  team: AgentTeamPersona[] | null;
  /** 직원이 바뀌면 올라간다 — 유효 리뷰어(자동 선택)가 바뀔 수 있어 다시 조회한다 */
  version: number;
  /** "직원 추가"(REVIEWER 롤을 미리 골라 연다) */
  onAddReviewer: () => void;
}

/** 이 프로젝트에서 리뷰어로 지정할 수 있는가 — 활성 REVIEWER, 이 프로젝트 소속 또는 공용(서버가 다시 판정한다) */
export function isEligibleReviewer(persona: AgentTeamPersona, projectId: string): boolean {
  return persona.role === "REVIEWER" && persona.active && (persona.projectId === null || persona.projectId === projectId);
}

/**
 * 프로젝트 설정 "AI 팀" — 리뷰어(P4b D-P4b-1, AGP-59). AI 작업은 다른 AI 리뷰어의 검증을 통과해야 done이 된다.
 * 조회는 누구나, 지정·해제는 프로젝트 관리자(판정은 서버가 다시 한다). 구 백엔드(404)면 "지원 안 함" 안내만.
 */
export function ReviewerSection({ projectId, canManage, loaded, team, version, onAddReviewer }: ReviewerSectionProps) {
  const toast = useToast();
  const location = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);
  // version은 조회 트리거로만 쓴다(직원이 바뀌면 자동 선택 결과가 바뀔 수 있다)
  const loader = useCallback(() => fetchReviewSetting(projectId), [projectId, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [load, reload] = useLoad(loader);
  const [view, setView] = useState<AgentReviewSetting | null>(null);
  const [pick, setPick] = useState(NO_PICK);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (load.status !== "ready" || !load.data) return;
    setView(load.data);
    setPick(load.data.setting?.personaId ?? NO_PICK);
  }, [load]);

  // 사무실 "리뷰어 없음" 칩에서 왔으면 이 카드로 스크롤(라우터는 해시로 스크롤하지 않는다)
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || location.hash !== `#${REVIEWER_ANCHOR}` || load.status === "loading") return;
    scrolled.current = true;
    cardRef.current?.scrollIntoView?.({ block: "start" });
  }, [location.hash, load.status]);

  const candidates = (team ?? []).filter((p) => isEligibleReviewer(p, projectId));
  const editable = loaded && canManage;
  const saved = view?.setting?.personaId ?? NO_PICK;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editable || busy || pick === NO_PICK || pick === saved) return;
    setBusy(true);
    try {
      const next = await saveReviewSetting(projectId, pick);
      setView(next);
      setPick(next.setting?.personaId ?? NO_PICK);
      toast({ title: "리뷰어를 지정했습니다", description: "이미 시작된 리뷰는 바뀌지 않습니다", appearance: "success" });
    } catch (error) {
      toast({ title: "리뷰어를 지정하지 못했습니다", description: errorText(error), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!editable || busy) return;
    setBusy(true);
    try {
      await clearReviewSetting(projectId);
      toast({ title: "리뷰어 지정을 해제했습니다", description: "전역 설정이나 자동 선택을 따릅니다", appearance: "success" });
      await reload();
    } catch (error) {
      toast({ title: "지정을 해제하지 못했습니다", description: errorText(error), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  let body: ReactNode;
  if (load.status === "ready" && load.data === null) {
    body = (
      <EmptyState
        title="이 서버는 리뷰어를 지정할 수 없습니다"
        description="agent-service가 리뷰어 지정(P4b)을 지원하면 여기서 고를 수 있습니다. 지금은 서버 설정(REVIEW_PERSONA)을 따릅니다."
      />
    );
  } else if (load.status !== "ready" || !view) {
    body = <LoadState load={load} label="리뷰어 불러오는 중" errorTitle="리뷰어 설정을 불러오지 못했습니다" onRetry={() => void reload()} />;
  } else {
    const { setting, effective } = view;
    const none = effective.source === "NONE";
    const reviewer = effective.personaId ? (team ?? []).find((p) => p.id === effective.personaId) : undefined;
    const settingName = setting ? (setting.name ?? `삭제된 페르소나 (id=${setting.personaId})`) : null;
    body = (
      <form className="ai-team-site-form" onSubmit={save}>
        {none ? (
          <Banner
            variant="warning"
            action={editable ? { label: "직원 추가", onClick: onAddReviewer } : undefined}
          >
            리뷰어가 없어 AI 작업이 완료(done)되지 않습니다 — REVIEWER 직원을 만들거나 지정하세요
            {setting ? ` (지정한 ${settingName}을(를) 지금은 쓸 수 없습니다 — 다시 지정하세요)` : ""}
          </Banner>
        ) : null}
        <div className={none ? "ai-team-effective is-none" : "ai-team-effective is-reviewer"} role="status" aria-label="적용 중인 리뷰어">
          {none ? (
            <UserX size={20} aria-hidden />
          ) : reviewer ? (
            <PersonaAvatar persona={reviewer} />
          ) : (
            <SearchCheck size={20} aria-hidden />
          )}
          <span className="ai-team-reviewer-text">
            {none ? (
              <strong>리뷰어 없음</strong>
            ) : (
              <>
                <strong>
                  {reviewer?.emoji ? <span aria-hidden>{reviewer.emoji} </span> : null}
                  {effective.name ?? `페르소나 #${effective.personaId}`}
                </strong>
                {effective.slug ? <span className="ai-team-hint"> @{effective.slug}</span> : null}
                {reviewer && reviewer.projectId === null ? <Badge>공용</Badge> : null}
              </>
            )}
          </span>
          <AgentReviewerSourceLozenge source={effective.source} />
        </div>
        <p className="ai-team-subtle">
          {setting ? `이 프로젝트 지정: ${settingName}` : "이 프로젝트 지정 없음 — 전역 설정·서버 설정·자동 선택 순서로 따릅니다"}
        </p>
        {editable ? (
          <>
            <Select
              label="리뷰어"
              value={pick}
              disabled={busy || candidates.length === 0}
              options={[
                { value: NO_PICK, label: "리뷰어 선택" },
                ...candidates.map((p) => ({
                  value: p.id,
                  label: `${p.emoji ? `${p.emoji} ` : ""}${p.name}${p.projectId === null ? " · 공용" : ""}`,
                  icon: <AgentRoleIcon role={p.role} />,
                })),
              ]}
              onValueChange={setPick}
            />
            <p className="ai-team-subtle">
              {candidates.length === 0
                ? "지정할 수 있는 REVIEWER 직원이 없습니다 — 직원을 추가하거나 비활성 직원을 켜세요"
                : "이 프로젝트 소속이거나 공용인 활성 REVIEWER 직원만 고를 수 있습니다"}
            </p>
            <div className="ai-team-form-actions">
              {setting ? (
                <Button
                  type="button"
                  variant="subtle"
                  iconBefore={<RotateCcw size={16} aria-hidden />}
                  disabled={busy}
                  onClick={() => void clear()}
                >
                  지정 해제(자동/상위 설정 따름)
                </Button>
              ) : null}
              <Button type="submit" iconBefore={<Save size={16} aria-hidden />} disabled={busy || pick === NO_PICK || pick === saved}>
                리뷰어 저장
              </Button>
            </div>
          </>
        ) : loaded ? (
          <p className="ai-team-subtle">리뷰어는 프로젝트 관리자만 지정할 수 있습니다.</p>
        ) : null}
      </form>
    );
  }

  return (
    <div ref={cardRef} id={REVIEWER_ANCHOR} className="ai-team-anchor">
      <Card padding="lg" title="리뷰어">
        <p className="admin-scheme-note ai-team-note">
          AI 작업은 끝나도 바로 완료(done)되지 않습니다. 작업한 직원이 아닌 다른 AI 리뷰어가 결과를 검증해 통과시켜야 완료됩니다.
        </p>
        {body}
      </Card>
    </div>
  );
}
