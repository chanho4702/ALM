import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Lozenge,
  Modal,
  Select,
  Spinner,
  Switch,
  Table,
  TextArea,
  TextField,
  useToast,
} from "@chanho/react";
import {
  BookOpen,
  Copy,
  Eye,
  FolderKanban,
  KeyRound,
  MessageSquare,
  Pencil,
  Plus,
  Power,
  PowerOff,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import type {
  AgentCredentialScope,
  AgentGrantInput,
  AgentGrantResourceType,
  AgentGrantRole,
  AgentProjectCredential,
  AgentRole,
  AgentTeamPersona,
  AgentToken,
  AgentTokenIssued,
  User,
} from "../store/types";
import {
  createAgentPersona,
  deleteProjectCredential,
  fetchProjectCredential,
  issueAgentToken,
  listAgentTeamPersonas,
  listAgentTokens,
  revokeAgentToken,
  saveProjectCredential,
  setAgentPersonaActive,
} from "../store/jiraStore";
import { AGENT_ROLE_LABEL, AgentRoleGlyph, AgentRoleIcon } from "../components/AgentGlyphs";
import { useAiTeamStatus } from "../components/useAiTeamActive";
import { useAgentPermissions } from "../components/useAgentPermissions";
import { formatDateTime, relTime } from "../components/time";
import { OfficePortrait } from "./PixelSprite";
import { useConfirmedAction } from "./SupervisionFrame";
// 초상 팔레트(`--office-*`)만 쓴다 — 이 화면은 설정 청크에서도 지연 로드라 사무실을 안 여는 사람은 받지 않는다
import "./ai-office.css";

/** 외부 MCP 클라이언트 연결 가이드(위키 개발 문서) */
export const AI_TEAM_MCP_GUIDE_HREF = "/wiki/spaces/5/pages/47";

const AGENT_ROLES: readonly AgentRole[] = ["PLANNER", "DESIGNER", "FRONTEND", "BACKEND", "OPS", "REVIEWER", "MANAGER"];

const RESOURCE_TYPES: readonly AgentGrantResourceType[] = ["PROJECT", "SPACE"];
const RESOURCE_TYPE_LABEL: Record<AgentGrantResourceType, string> = {
  PROJECT: "ALM 프로젝트",
  SPACE: "위키 스페이스",
};
const RESOURCE_TYPE_ICON: Record<AgentGrantResourceType, typeof FolderKanban> = {
  PROJECT: FolderKanban,
  SPACE: BookOpen,
};

const GRANT_ROLES: readonly AgentGrantRole[] = ["VIEWER", "COMMENTER", "EDITOR", "ADMIN"];
const GRANT_ROLE_LABEL: Record<AgentGrantRole, string> = {
  VIEWER: "읽기",
  COMMENTER: "댓글",
  EDITOR: "편집",
  ADMIN: "관리",
};
const GRANT_ROLE_ICON: Record<AgentGrantRole, typeof Eye> = {
  VIEWER: Eye,
  COMMENTER: MessageSquare,
  EDITOR: Pencil,
  ADMIN: ShieldCheck,
};

const SLUG_MAX = 40;
const NAME_MAX = 80;
const EMOJI_MAX = 16;
const LABEL_MAX = 120;
const SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;
/** Select 빈 문자열 금지(DS 함정) — 발급 대상 미선택 센티널 */
const NO_PERSONA = "none";

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** 서버가 준 시각이 없거나 깨졌으면 "—" — "Invalid Date"를 그리지 않는다 */
function When({ iso }: { iso: string | null }) {
  if (!iso || Number.isNaN(Date.parse(iso))) return <span className="ai-team-subtle">—</span>;
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {relTime(iso)}
    </time>
  );
}

type Load<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: T };

/** 한 번 조회 + 수동 재조회. 프로젝트가 바뀌면 늦게 온 이전 응답을 버린다 */
function useLoad<T>(loader: (() => Promise<T>) | null): [Load<T>, () => Promise<void>] {
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!loader) return;
    const mine = ++generation.current;
    try {
      const data = await loader();
      if (mine === generation.current) setState({ status: "ready", data });
    } catch (error) {
      if (mine === generation.current) setState({ status: "error", error: errorText(error) });
    }
  }, [loader]);
  useEffect(() => {
    setState({ status: "loading" });
    void reload();
  }, [reload]);
  return [state, reload];
}

export interface AiTeamSettingsProps {
  projectId: string;
  /** 갱신자 이름 표시용 사용자 디렉터리 */
  users: User[];
}

/**
 * 프로젝트 설정 "AI 팀"(P3f AGP-64·P3h AGP-66) — 이 프로젝트의 AI 직원·외부 연결 토큰·LLM 키.
 * 편집은 이 프로젝트를 관리할 수 있는 사람(전역 관리자 또는 프로젝트 ADMIN)만 — 판정은 서버가 다시 한다.
 * 설정 화면이라 DS 컴포넌트·토큰만 쓴다(픽셀 스타일은 아바타 썸네일만).
 */
export default function AiTeamSettings({ projectId, users }: AiTeamSettingsProps) {
  const status = useAiTeamStatus();
  if (status === "unknown") {
    return (
      <div className="board-loading">
        <Spinner size="large" label="AI 팀 불러오는 중" />
      </div>
    );
  }
  if (status === "inactive") {
    return (
      <EmptyState title="AI 팀이 아직 없습니다" description="agent-service가 연결된 플랫폼에서만 쓸 수 있습니다" />
    );
  }
  return <AiTeamBody key={projectId} projectId={projectId} users={users} />;
}

function AiTeamBody({ projectId, users }: AiTeamSettingsProps) {
  const permissions = useAgentPermissions(projectId);
  const canManage = permissions.loaded && permissions.canManage;
  const [personas, reloadPersonas] = useLoad(listAgentTeamPersonas);
  const tokenLoader = useCallback(() => listAgentTokens(projectId), [projectId]);
  const [tokens, reloadTokens] = useLoad(canManage ? tokenLoader : null);

  const team =
    personas.status === "ready"
      ? [
          ...personas.data.filter((p) => p.projectId === projectId),
          ...personas.data.filter((p) => p.projectId === null),
        ]
      : [];
  const own = team.filter((p) => p.projectId !== null);

  return (
    <div className="project-settings ai-team-settings">
      {permissions.loaded && !canManage ? (
        <Banner variant="info">프로젝트 관리자만 변경할 수 있습니다. 목록은 읽기 전용으로 보입니다.</Banner>
      ) : null}
      <StaffSection
        projectId={projectId}
        canManage={canManage}
        load={personas}
        team={team}
        tokens={tokens.status === "ready" ? tokens.data : null}
        onRetry={reloadPersonas}
        onChanged={reloadPersonas}
      />
      <TokenSection
        canManage={canManage}
        loaded={permissions.loaded}
        load={tokens}
        personas={own}
        onRetry={reloadTokens}
        onChanged={reloadTokens}
      />
      <LlmKeySection projectId={projectId} canManage={canManage} loaded={permissions.loaded} users={users} />
    </div>
  );
}

/** 초상 썸네일 — 사무실 도트 초상(롤별 셔츠색) 재사용. `.ai-office`는 팔레트 변수 스코프일 뿐 레이아웃이 없다 */
function PersonaAvatar({ persona }: { persona: AgentTeamPersona }) {
  return (
    <span className="ai-office ai-team-avatar">
      <OfficePortrait slug={persona.slug} role={persona.role} className="is-row" />
    </span>
  );
}

function LoadState({ load, label, errorTitle, onRetry }: {
  load: Load<unknown>;
  label: string;
  errorTitle: string;
  onRetry: () => void;
}) {
  if (load.status === "loading") return <Spinner label={label} />;
  if (load.status === "error") {
    return (
      <EmptyState
        title={errorTitle}
        description={`agent-service 연결을 확인하세요 — ${load.error}`}
        primaryAction={{ label: "다시 시도", onClick: onRetry }}
      />
    );
  }
  return null;
}

// ── 직원 ─────────────────────────────────────────────────────

function StaffSection({
  projectId,
  canManage,
  load,
  team,
  tokens,
  onRetry,
  onChanged,
}: {
  projectId: string;
  canManage: boolean;
  load: Load<AgentTeamPersona[]>;
  team: AgentTeamPersona[];
  tokens: AgentToken[] | null;
  onRetry: () => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const action = useConfirmedAction(onChanged);

  const tokenCount = (persona: AgentTeamPersona): ReactNode => {
    if (persona.projectId === null || tokens === null) return <span className="ai-team-subtle">—</span>;
    return tokens.filter((t) => t.personaSlug === persona.slug && !t.revoked).length;
  };

  const requestToggle = (persona: AgentTeamPersona, next: boolean) =>
    action.request({
      title: next ? `${persona.name} 활성화` : `${persona.name} 비활성화`,
      description: next
        ? "다시 배정을 받고 토큰으로 접속할 수 있게 됩니다."
        : "새 작업을 배정받지 않고, 이 직원의 토큰은 바로 거부됩니다(진행 중인 실행은 끝까지 갑니다).",
      confirmLabel: next ? "활성화" : "비활성화",
      danger: !next,
      successMessage: next ? `${persona.name}을(를) 활성화했습니다` : `${persona.name}을(를) 비활성화했습니다`,
      failureTitle: "상태를 바꾸지 못했습니다",
      run: async () => {
        await setAgentPersonaActive(persona.id, next);
      },
    });

  return (
    <Card
      padding="lg"
      title="직원"
      headerActions={
        canManage ? (
          <Button
            variant="subtle"
            size="small"
            iconBefore={<UserPlus size={16} aria-hidden />}
            onClick={() => setAdding(true)}
          >
            직원 추가
          </Button>
        ) : null
      }
    >
      <p className="admin-scheme-note ai-team-note">
        이 프로젝트 전용 AI 직원과 전사 공용 직원이 함께 일합니다. 공용 직원은 전역 관리 화면에서만 바꿀 수 있습니다.
      </p>
      {load.status === "ready" ? (
        team.length === 0 ? (
          <EmptyState title="아직 AI 직원이 없습니다" description="직원을 추가하면 사무실에 자리가 생깁니다" />
        ) : (
          <Table
            aria-label="AI 직원"
            columns={[
              { key: "persona", header: "직원" },
              { key: "role", header: "롤" },
              { key: "active", header: "상태" },
              { key: "tokens", header: "토큰", align: "right" },
            ]}
            rows={team.map((persona) => {
              const shared = persona.projectId === null;
              return {
                id: persona.id,
                persona: (
                  <span className="ai-team-staff">
                    <PersonaAvatar persona={persona} />
                    <span className="ai-team-staff-text">
                      <span className="ai-team-staff-name">
                        {persona.emoji ? <span aria-hidden>{persona.emoji}</span> : null}
                        {persona.name}
                        {shared ? <Badge>공용</Badge> : null}
                      </span>
                      <span className="ai-team-subtle">@{persona.slug}</span>
                    </span>
                  </span>
                ),
                role: <AgentRoleGlyph role={persona.role} />,
                active:
                  canManage && !shared ? (
                    <Switch
                      label={persona.active ? "활성" : "비활성"}
                      aria-label={`${persona.name} 활성`}
                      checked={persona.active}
                      onCheckedChange={(next) => requestToggle(persona, next)}
                    />
                  ) : (
                    <ActiveLozenge active={persona.active} />
                  ),
                tokens: tokenCount(persona),
              };
            })}
          />
        )
      ) : (
        <LoadState load={load} label="직원 불러오는 중" errorTitle="직원 목록을 불러오지 못했습니다" onRetry={() => void onRetry()} />
      )}
      {action.dialog}
      {canManage ? (
        <AddPersonaModal
          projectId={projectId}
          open={adding}
          onOpenChange={setAdding}
          onCreated={() => {
            setAdding(false);
            void onChanged();
          }}
        />
      ) : null}
    </Card>
  );
}

function ActiveLozenge({ active }: { active: boolean }) {
  return active ? (
    <Lozenge appearance="success" className="agent-lozenge">
      <Power size={12} aria-hidden />
      활성
    </Lozenge>
  ) : (
    <Lozenge appearance="neutral" className="agent-lozenge">
      <PowerOff size={12} aria-hidden />
      비활성
    </Lozenge>
  );
}

interface GrantRow extends AgentGrantInput {
  key: string;
}

let grantSeq = 0;
const grantRow = (grant: AgentGrantInput): GrantRow => ({ key: `grant-${++grantSeq}`, ...grant });

function AddPersonaModal({
  projectId,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (persona: AgentTeamPersona) => void;
}) {
  const toast = useToast();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AgentRole>("FRONTEND");
  const [emoji, setEmoji] = useState("");
  const [voicePrompt, setVoicePrompt] = useState("");
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 열 때마다 초기화 — 기본 권한은 "이 프로젝트 편집" 1행
  useEffect(() => {
    if (!open) return;
    setSlug("");
    setName("");
    setRole("FRONTEND");
    setEmoji("");
    setVoicePrompt("");
    setGrants([grantRow({ resourceType: "PROJECT", resourceId: projectId, role: "EDITOR" })]);
    setTouched(false);
    setSubmitting(false);
  }, [open, projectId]);

  const slugError = !SLUG_PATTERN.test(slug.trim()) ? `소문자·숫자·하이픈 2~${SLUG_MAX}자로 입력하세요` : undefined;
  const nameError = !name.trim() ? "이름을 입력하세요" : undefined;
  const grantError = grants.some((g) => !g.resourceId.trim()) ? "권한 행의 식별자를 채우거나 행을 지우세요" : null;
  const invalid = Boolean(slugError || nameError || grantError);

  const updateGrant = (key: string, patch: Partial<AgentGrantInput>) =>
    setGrants((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (invalid || submitting) return;
    setSubmitting(true);
    try {
      const persona = await createAgentPersona({
        slug: slug.trim(),
        role,
        name: name.trim(),
        emoji: emoji.trim() || undefined,
        voicePrompt: voicePrompt.trim() || undefined,
        projectId,
        grants: grants.map(({ resourceType, resourceId, role: grantRole }) => ({
          resourceType,
          resourceId: resourceId.trim(),
          role: grantRole,
        })),
      });
      toast({ title: `${persona.name}을(를) 추가했습니다`, appearance: "success" });
      onCreated(persona);
    } catch (error) {
      toast({ title: "직원을 추가하지 못했습니다", description: errorText(error), appearance: "danger" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="직원 추가"
      description="이 프로젝트 전용 AI 직원을 만듭니다. 인증 서버에 전용 계정이 생기고 조직 멤버로 등록됩니다."
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
      className="ai-team-modal"
    >
      <form className="ai-team-form" onSubmit={handleSubmit} noValidate>
        <div className="ai-team-form-grid">
          <TextField
            label="슬러그"
            value={slug}
            maxLength={SLUG_MAX}
            description="만든 뒤에는 바꿀 수 없습니다. 같은 슬러그면 이름·이모지만 갱신됩니다."
            error={touched ? slugError : undefined}
            onChange={(e) => setSlug(e.target.value)}
          />
          <TextField
            label="이름"
            value={name}
            maxLength={NAME_MAX}
            error={touched ? nameError : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label="롤"
            value={role}
            options={AGENT_ROLES.map((r) => ({ value: r, label: AGENT_ROLE_LABEL[r], icon: <AgentRoleIcon role={r} /> }))}
            onValueChange={(v) => setRole(v as AgentRole)}
          />
          <TextField
            label="이모지"
            value={emoji}
            maxLength={EMOJI_MAX}
            description="선택"
            onChange={(e) => setEmoji(e.target.value)}
          />
        </div>
        <TextArea
          label="말투"
          rows={3}
          placeholder="예: 짧고 단정하게, 근거를 먼저 말한다"
          value={voicePrompt}
          onChange={(e) => setVoicePrompt(e.target.value)}
        />
        <fieldset className="ai-team-grants">
          <legend className="ai-team-legend">권한</legend>
          <p className="admin-scheme-note">
            만들 때 한 번 부여됩니다. 내가 관리하는 프로젝트·스페이스의 권한만 줄 수 있습니다.
          </p>
          {grants.map((row, index) => {
            return (
              <div key={row.key} className="ai-team-grant-row" role="group" aria-label={`권한 ${index + 1}`}>
                <Select
                  label="자원"
                  value={row.resourceType}
                  options={RESOURCE_TYPES.map((t) => {
                    const Icon = RESOURCE_TYPE_ICON[t];
                    return { value: t, label: RESOURCE_TYPE_LABEL[t], icon: <Icon size={14} aria-hidden /> };
                  })}
                  onValueChange={(v) => {
                    const type = v as AgentGrantResourceType;
                    updateGrant(row.key, { resourceType: type, resourceId: type === "PROJECT" ? projectId : "" });
                  }}
                />
                <TextField
                  label={row.resourceType === "PROJECT" ? "프로젝트 id" : "스페이스 id"}
                  value={row.resourceId}
                  error={touched && !row.resourceId.trim() ? "필수" : undefined}
                  onChange={(e) => updateGrant(row.key, { resourceId: e.target.value })}
                />
                <Select
                  label="역할"
                  value={row.role}
                  options={GRANT_ROLES.map((r) => {
                    const Icon = GRANT_ROLE_ICON[r];
                    return { value: r, label: GRANT_ROLE_LABEL[r], icon: <Icon size={14} aria-hidden /> };
                  })}
                  onValueChange={(v) => updateGrant(row.key, { role: v as AgentGrantRole })}
                />
                <Button
                  type="button"
                  variant="subtle"
                  size="small"
                  iconOnly
                  aria-label={`권한 ${index + 1} 지우기`}
                  onClick={() => setGrants((rows) => rows.filter((r) => r.key !== row.key))}
                >
                  <Trash2 size={14} aria-hidden />
                </Button>
              </div>
            );
          })}
          <div>
            <Button
              type="button"
              variant="subtle"
              size="small"
              iconBefore={<Plus size={14} aria-hidden />}
              onClick={() => setGrants((rows) => [...rows, grantRow({ resourceType: "SPACE", resourceId: "", role: "EDITOR" })])}
            >
              권한 추가
            </Button>
          </div>
          {touched && grantError ? (
            <p className="ai-team-error" role="alert">
              {grantError}
            </p>
          ) : null}
        </fieldset>
        <div className="ai-team-form-actions">
          <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" disabled={submitting}>
            추가
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── 토큰 ─────────────────────────────────────────────────────

function TokenSection({
  canManage,
  loaded,
  load,
  personas,
  onRetry,
  onChanged,
}: {
  canManage: boolean;
  loaded: boolean;
  load: Load<AgentToken[]>;
  personas: AgentTeamPersona[];
  onRetry: () => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [personaSlug, setPersonaSlug] = useState(NO_PERSONA);
  const [label, setLabel] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<AgentTokenIssued | null>(null);
  const action = useConfirmedAction(onChanged);

  const personaName = (slug: string) => personas.find((p) => p.slug === slug)?.name ?? `@${slug}`;
  const selectedPersona = personaSlug === NO_PERSONA ? null : personaSlug;
  const canIssue = selectedPersona !== null && label.trim().length > 0 && !issuing;

  const issue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPersona || !canIssue) return;
    setIssuing(true);
    try {
      const result = await issueAgentToken({ label: label.trim(), personaSlug: selectedPersona });
      setIssued(result);
      setLabel("");
      await onChanged();
    } catch (error) {
      toast({ title: "토큰을 발급하지 못했습니다", description: errorText(error), appearance: "danger" });
    } finally {
      setIssuing(false);
    }
  };

  const guide = (
    <p className="admin-scheme-note ai-team-note">
      Claude Desktop 같은 외부 MCP 클라이언트가 이 직원으로 접속할 때 쓰는 개인 토큰입니다.{" "}
      <a href={AI_TEAM_MCP_GUIDE_HREF} target="_blank" rel="noreferrer">
        연결 가이드
      </a>
    </p>
  );

  let body: ReactNode;
  if (!loaded) {
    body = <Spinner label="권한 확인 중" />;
  } else if (!canManage) {
    body = <p className="ai-team-subtle">토큰 목록은 프로젝트 관리자만 볼 수 있습니다.</p>;
  } else if (load.status !== "ready") {
    body = <LoadState load={load} label="토큰 불러오는 중" errorTitle="토큰 목록을 불러오지 못했습니다" onRetry={() => void onRetry()} />;
  } else {
    body = (
      <>
        <form className="ai-team-token-form" onSubmit={issue}>
          <Select
            label="직원"
            value={personaSlug}
            options={[
              { value: NO_PERSONA, label: "직원 선택" },
              ...personas.map((p) => ({ value: p.slug, label: p.name, icon: <AgentRoleIcon role={p.role} /> })),
            ]}
            onValueChange={setPersonaSlug}
          />
          <TextField
            label="토큰 이름"
            placeholder="예: 내 노트북 Claude Desktop"
            value={label}
            maxLength={LABEL_MAX}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button type="submit" iconBefore={<KeyRound size={16} aria-hidden />} disabled={!canIssue}>
            발급
          </Button>
        </form>
        {load.data.length === 0 ? (
          <p className="ai-team-subtle">발급한 토큰이 없습니다.</p>
        ) : (
          <Table
            aria-label="직원 토큰"
            columns={[
              { key: "label", header: "이름" },
              { key: "persona", header: "직원" },
              { key: "created", header: "발급" },
              { key: "used", header: "마지막 사용" },
              { key: "state", header: "상태" },
              { key: "actions", header: "", ariaLabel: "작업" },
            ]}
            rows={load.data.map((token) => ({
              id: token.id,
              label: token.label,
              persona: personaName(token.personaSlug),
              created: <When iso={token.createdAt} />,
              used: <When iso={token.lastUsedAt} />,
              state: token.revoked ? (
                <Lozenge appearance="neutral" className="agent-lozenge">
                  <PowerOff size={12} aria-hidden />
                  철회됨
                </Lozenge>
              ) : (
                <Lozenge appearance="success" className="agent-lozenge">
                  <KeyRound size={12} aria-hidden />
                  사용 가능
                </Lozenge>
              ),
              actions: token.revoked ? null : (
                <Button
                  variant="subtle"
                  size="small"
                  aria-label={`${token.label} 철회`}
                  onClick={() =>
                    action.request({
                      title: `토큰 "${token.label}" 철회`,
                      description: "이 토큰으로 접속한 클라이언트는 바로 거부됩니다. 되돌릴 수 없습니다.",
                      confirmLabel: "철회",
                      danger: true,
                      successMessage: "토큰을 철회했습니다",
                      failureTitle: "토큰을 철회하지 못했습니다",
                      run: () => revokeAgentToken(token.id),
                    })
                  }
                >
                  철회
                </Button>
              ),
            }))}
          />
        )}
      </>
    );
  }

  return (
    <Card padding="lg" title="토큰">
      {guide}
      {body}
      {action.dialog}
      <Modal
        title="토큰이 발급됐습니다"
        open={issued !== null}
        onOpenChange={(next) => {
          if (!next) setIssued(null);
        }}
      >
        {issued ? <IssuedToken issued={issued} personaName={personaName(issued.personaSlug)} onClose={() => setIssued(null)} /> : null}
      </Modal>
    </Card>
  );
}

function IssuedToken({ issued, personaName, onClose }: { issued: AgentTokenIssued; personaName: string; onClose: () => void }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.token);
      toast({ title: "토큰을 복사했습니다", appearance: "success" });
    } catch {
      toast({ title: "복사하지 못했습니다", description: "입력 칸을 선택해 직접 복사하세요", appearance: "danger" });
    }
  };
  return (
    <div className="ai-team-form">
      <Banner variant="warning">
        이 창을 닫으면 토큰을 다시 볼 수 없습니다. 지금 안전한 곳에 복사해 두세요.
      </Banner>
      <p className="admin-scheme-note">
        {personaName} · {issued.label}
      </p>
      <div className="ai-team-token-reveal">
        <TextField label="토큰" value={issued.token} readOnly onFocus={(e) => e.currentTarget.select()} />
        <Button variant="secondary" iconBefore={<Copy size={16} aria-hidden />} onClick={() => void copy()}>
          복사
        </Button>
      </div>
      <div className="ai-team-form-actions">
        <Button onClick={onClose}>완료</Button>
      </div>
    </div>
  );
}

// ── LLM 키 ───────────────────────────────────────────────────

const SCOPE_TEXT: Record<AgentCredentialScope, { lead: string; strong: string; tail: string }> = {
  PROJECT: { lead: "이 프로젝트는 ", strong: "프로젝트 전용 키", tail: " 사용 중" },
  PLATFORM: { lead: "이 프로젝트는 ", strong: "전역 키", tail: " 사용 중" },
  ENV: { lead: "이 프로젝트는 ", strong: "서버 기본 키(환경 변수)", tail: " 사용 중" },
  NONE: { lead: "", strong: "키 없음", tail: " — 워커는 호스트 구독 세션으로 일하고, 자유 대화는 꺼집니다" },
};

function EffectiveSource({ effective }: { effective: AgentProjectCredential["effective"] }) {
  const text = SCOPE_TEXT[effective.scope];
  const none = effective.scope === "NONE";
  const Icon = none ? TriangleAlert : KeyRound;
  return (
    <div className={none ? "ai-team-effective is-none" : "ai-team-effective"} role="status" aria-label="적용 중인 키">
      <Icon size={20} aria-hidden />
      <span>
        {text.lead}
        <strong>{text.strong}</strong>
        {text.tail}
        {effective.keyHint ? <span className="ai-team-hint"> (…{effective.keyHint})</span> : null}
      </span>
    </div>
  );
}

function LlmKeySection({
  projectId,
  canManage,
  loaded,
  users,
}: {
  projectId: string;
  canManage: boolean;
  loaded: boolean;
  users: User[];
}) {
  const toast = useToast();
  const loader = useCallback(() => fetchProjectCredential(projectId), [projectId]);
  const [load, reload] = useLoad(canManage ? loader : null);
  const [apiKey, setApiKey] = useState("");
  const [validate, setValidate] = useState(true);
  const [saving, setSaving] = useState(false);
  const action = useConfirmedAction(reload);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = apiKey.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      await saveProjectCredential(projectId, { apiKey: value, validate });
      toast({ title: "프로젝트 키를 저장했습니다", appearance: "success" });
    } catch (error) {
      toast({ title: "키를 저장하지 못했습니다", description: errorText(error), appearance: "danger" });
    } finally {
      // 원문 키를 화면·메모리에 남기지 않는다 — 성공·실패 모두 즉시 비운다
      setApiKey("");
      setSaving(false);
      await reload();
    }
  };

  const updatedByName = (id: string | null) => {
    if (!id) return null;
    return users.find((u) => u.id === id)?.name ?? `사용자 #${id}`;
  };

  let body: ReactNode;
  if (!loaded) {
    body = <Spinner label="권한 확인 중" />;
  } else if (!canManage) {
    body = <p className="ai-team-subtle">키 설정은 프로젝트 관리자만 볼 수 있습니다.</p>;
  } else if (load.status !== "ready") {
    body = <LoadState load={load} label="키 설정 불러오는 중" errorTitle="키 설정을 불러오지 못했습니다" onRetry={() => void reload()} />;
  } else {
    const { project, effective } = load.data;
    const updater = updatedByName(project.updatedBy);
    body = (
      <>
        <EffectiveSource effective={effective} />
        <dl className="ai-team-key-meta">
          <div>
            <dt>프로젝트 키</dt>
            <dd>
              {project.set ? (
                <>
                  Anthropic{project.keyHint ? <span className="ai-team-hint"> …{project.keyHint}</span> : null}
                </>
              ) : (
                <span className="ai-team-subtle">설정 안 함 — 전역 키를 따릅니다</span>
              )}
            </dd>
          </div>
          {project.set ? (
            <div>
              <dt>갱신</dt>
              <dd>
                {updater ?? <span className="ai-team-subtle">—</span>} · <When iso={project.updatedAt} />
              </dd>
            </div>
          ) : null}
        </dl>
        <form className="ai-team-key-form" onSubmit={save}>
          <TextField
            label={project.set ? "새 Anthropic API 키" : "Anthropic API 키"}
            type="password"
            autoComplete="off"
            placeholder="sk-ant-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Checkbox label="저장 시 검증" checked={validate} onCheckedChange={(next) => setValidate(next === true)} />
          <div className="ai-team-form-actions">
            {project.set ? (
              <Button
                type="button"
                variant="danger"
                iconBefore={<Trash2 size={16} aria-hidden />}
                onClick={() =>
                  action.request({
                    title: "프로젝트 키 삭제",
                    description:
                      "삭제하면 이 프로젝트는 전역 키(없으면 호스트 구독 세션)로 돌아갑니다. 저장된 키는 복구할 수 없습니다.",
                    confirmLabel: "삭제",
                    danger: true,
                    successMessage: "프로젝트 키를 삭제했습니다",
                    failureTitle: "키를 삭제하지 못했습니다",
                    run: () => deleteProjectCredential(projectId),
                  })
                }
              >
                프로젝트 키 삭제
              </Button>
            ) : null}
            <Button type="submit" iconBefore={<KeyRound size={16} aria-hidden />} disabled={!apiKey.trim() || saving}>
              {project.set ? "교체" : "저장"}
            </Button>
          </div>
        </form>
      </>
    );
  }

  return (
    <Card padding="lg" title="LLM 키">
      <p className="admin-scheme-note ai-team-note">
        이 프로젝트의 AI 작업에만 쓰는 키입니다. 우선순위: 프로젝트 키 → 전역 키 → 서버 기본 키. 키 원문은 저장 뒤 다시 보여 주지 않습니다.
      </p>
      {body}
      {action.dialog}
    </Card>
  );
}
