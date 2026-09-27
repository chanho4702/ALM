import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  Banner,
  Button,
  ConfirmDialog,
  EmptyState,
  Modal,
  Radio,
  RadioGroup,
  Select,
  Spinner,
  Switch,
  Tabs,
  TextArea,
  TextField,
  useToast,
} from "@chanho/react";
import {
  Cpu,
  Dices,
  FileText,
  IdCard,
  Keyboard,
  MessageCircle,
  Palette,
  PersonStanding,
  RotateCcw,
  Settings2,
  Sparkles,
} from "lucide-react";
import type { AgentPersonaDetail, AgentPersonaPatch, AgentRole, AgentTeamPersona } from "../store/types";
import { fetchAgentPersonaDetail, updateAgentPersona } from "../store/jiraStore";
import { ApiError } from "../store/mapping";
import { AGENT_ROLE_LABEL, AgentRoleGlyph, AgentRoleIcon } from "../components/AgentGlyphs";
import {
  EXTRA_LABEL,
  EXTRA_ORDER,
  EXTRA_SLOTS,
  HAIR_COLOR_LABEL,
  HAIR_COLOR_ORDER,
  HAIR_STYLE_LABEL,
  HAIR_STYLE_ORDER,
  ROLE_SLOTS,
  SHIRT_LABEL,
  SHIRT_ORDER,
  SKIN_LABEL,
  SKIN_ORDER,
  type AvatarSlot,
  type ExtraAccessory,
  type HairColor,
  type HairStyle,
  type ShirtColor,
  type SkinTone,
} from "./avatarParts";
import { avatarConfigPatch, parseAvatarConfig, personaLook, randomLook, sameLook } from "./avatarConfig";
import {
  avatarPaths,
  avatarVars,
  defaultLook,
  drawnRole,
  extraAllowed,
  facePaths,
  hairThumbPaths,
  spritePaths,
  type AvatarFrame,
  type AvatarLook,
  type FaceExpression,
} from "./pixel";
import { PixelSprite } from "./PixelSprite";

const NAME_MAX = 80;
const EMOJI_MAX = 16;
const SKILLS_MAX = 8000;
const SKILLS_WARN = 7600;
/** Select 빈 문자열 금지(DS 함정) — "기본값 따름" 센티널 = PATCH defaultModel "" */
const MODEL_DEFAULT = "default";
/** 셔츠 "롤 기본" 센티널 = shirtColor 키 없음 */
const SHIRT_ROLE = "role";

/** 서버 목록 API가 없어 프론트 상수(스펙 §6.6, 후속 GET /api/agent/models) */
export const AGENT_MODEL_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "claude-fable-5-1", label: "Claude Fable 5.1" },
  { value: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { value: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

/** 스킬 예시 골격(§6.6) — 글머리표 뒤 공백까지 그대로 둔다(바로 이어 쓰게) */
const SKILLS_TEMPLATE = (name: string) =>
  [`# ${name} — 한 줄 소개 (이 줄이 요약이 된다)`, "", "## 잘하는 것", "- ", "", "## 일하는 방식", "- ", "", "## 피하는 것", "- ", ""].join("\n");

const SLOT_LABEL: Record<AvatarSlot, string> = {
  HEAD_TOP: "머리 위",
  HAIR_SIDE: "머리 옆",
  EYES: "눈",
  EARS: "귀",
  EAR_R: "오른쪽 귀",
  HAND_L: "왼손",
  NECK: "목",
  CHEEKS: "볼",
};

const ROLE_SHIRT_KEYS: ReadonlySet<string> = new Set(["planner", "designer", "frontend", "backend", "ops", "reviewer", "manager"]);

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const vars = (v: Record<string, string | number>) => v as CSSProperties;
const count = (n: number) => n.toLocaleString("ko-KR");

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

type DetailLoad =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "error"; error: string }
  | { status: "ready"; detail: AgentPersonaDetail };

interface FormState {
  name: string;
  emoji: string;
  voicePrompt: string;
  skills: string;
  model: string;
  look: AvatarLook;
}

/** 롤 기본 셔츠의 이름 — 알 수 없는 롤은 기획 색으로 그려지므로 그 이름 */
const roleShirtKey = (role: AgentRole) => drawnRole(role).toLowerCase() as ShirtColor;

export interface PersonaEditorDialogProps {
  /** 편집 대상(목록 행) — 상세 응답 전에는 이 행의 이름·외형으로 제목·미리보기를 그린다 */
  persona: AgentTeamPersona;
  /** 방금 만든 직원이면 안내 배너 */
  justCreated?: boolean;
  onClose: () => void;
  /** 저장 성공 — 호출자가 닫고 목록을 다시 불러온다 */
  onSaved: (detail: AgentPersonaDetail) => void;
}

/**
 * 직원 편집 다이얼로그(AGP-62 §6) — 좌 실시간 도트 미리보기 / 우 탭(외형·정보·능력). 바뀐 필드만 PATCH.
 * 프리필은 관리자 전용 상세 API — 목록의 편집 필드로 대신 채우지 않는다(목록에는 외형만 있다).
 */
export function PersonaEditorDialog({ persona, justCreated = false, onClose, onSaved }: PersonaEditorDialogProps) {
  const toast = useToast();
  const [load, setLoad] = useState<DetailLoad>({ status: "loading" });
  const [form, setForm] = useState<FormState | null>(null);
  const [tab, setTab] = useState("look");
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [announce, setAnnounce] = useState("");
  const generation = useRef(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const reload = async () => {
    const mine = ++generation.current;
    setLoad({ status: "loading" });
    try {
      const detail = await fetchAgentPersonaDetail(persona.id);
      if (mine !== generation.current) return;
      setForm(formOf(detail));
      setLoad({ status: "ready", detail });
    } catch (error) {
      if (mine !== generation.current) return;
      if (error instanceof ApiError && error.status === 403) setLoad({ status: "forbidden" });
      else setLoad({ status: "error", error: errorText(error) });
    }
  };

  useEffect(() => {
    void reload();
    // 닫히거나(언마운트) 다른 직원으로 다시 열리면 늦게 온 응답을 버린다
    return () => {
      generation.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona.id]);

  // 열리면 포커스는 선택된 탭(첫 조작 지점)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      bodyRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const ready = load.status === "ready" && form !== null;
  const detail = load.status === "ready" ? load.detail : null;
  const role = persona.role;
  const baselineLook = detail ? parseAvatarConfig(detail.avatarConfig, persona.slug) : null;
  const storedBlocked =
    baselineLook && baselineLook.accessory !== "none" && !extraAllowed(role, baselineLook.accessory) ? baselineLook.accessory : null;
  const look = form?.look ?? personaLook(persona);

  const patch: AgentPersonaPatch = detail && form && baselineLook ? diff(detail, form, baselineLook, persona.slug) : {};
  const dirty = Object.keys(patch).length > 0;
  const nameError = form && !form.name.trim() ? "이름을 입력하세요" : undefined;
  const canSave = ready && dirty && !nameError && !saving;

  const update = (next: Partial<FormState>) => setForm((prev) => (prev ? { ...prev, ...next } : prev));
  const setLook = (next: Partial<AvatarLook>) => setForm((prev) => (prev ? { ...prev, look: { ...prev.look, ...next } } : prev));

  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    if (nameError) {
      setTab("info");
      requestAnimationFrame(() => nameRef.current?.focus());
      return;
    }
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await updateAgentPersona(persona.id, patch);
      toast({ title: `${saved.name}을(를) 저장했습니다`, appearance: "success" });
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        toast({ title: "저장하지 못했습니다", description: error.message, appearance: "danger" });
      } else if (error instanceof ApiError && error.status === 403) {
        toast({ title: "이 직원을 편집할 권한이 없습니다", appearance: "danger" });
      } else {
        toast({ title: "저장하지 못했습니다 — agent-service 연결을 확인하세요", description: errorText(error), appearance: "danger" });
      }
    } finally {
      setSaving(false);
    }
  };

  const randomize = () => {
    if (!form) return;
    const next = randomLook(role, form.look);
    update({ look: next });
    setAnnounce(
      `외형을 무작위로 바꿨습니다: ${HAIR_STYLE_LABEL[next.hairStyle]}, ${HAIR_COLOR_LABEL[next.hairColor]}, ${SKIN_LABEL[next.skinTone]}, ${EXTRA_LABEL[next.accessory]}`,
    );
  };
  const resetLook = () => {
    update({ look: defaultLook(persona.slug) });
    setAnnounce("외형을 기본값으로 되돌렸습니다");
  };
  const lookIsDefault = sameLook(look, defaultLook(persona.slug));

  const tabBody = (content: () => ReactNode): ReactNode => {
    if (load.status === "loading") return <Spinner label="직원 정보 불러오는 중" />;
    if (load.status === "forbidden") return <EmptyState title="이 직원을 편집할 권한이 없습니다" />;
    if (load.status === "error") {
      return (
        <EmptyState
          title="직원 정보를 불러오지 못했습니다"
          description={`agent-service 연결을 확인하세요 — ${load.error}`}
          primaryAction={{ label: "다시 시도", onClick: () => void reload() }}
        />
      );
    }
    return content();
  };

  const displayName = form?.name.trim() || persona.name;

  return (
    <Modal
      title={`${persona.name} 편집`}
      description="외형은 사무실·팀 카드·대화 장면에 모두 적용됩니다."
      open
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
      className="ai-team-modal is-editor"
    >
      <form className="ai-team-form" onSubmit={save} noValidate>
        {justCreated ? (
          <Banner variant="info">직원을 만들었습니다. 외형과 능력을 설정해 보세요 — 건너뛰어도 기본 외형으로 일합니다.</Banner>
        ) : null}
        <div className="ai-office ai-avatar-editor" ref={bodyRef}>
          <AvatarPreview
            slug={persona.slug}
            role={role}
            look={look}
            disabled={!ready}
            name={displayName}
            emoji={form?.emoji.trim() ?? persona.emoji ?? ""}
            onRandom={randomize}
            onReset={resetLook}
            resetDisabled={!ready || lookIsDefault}
          />
          <div className="ai-avatar-editor-body">
            <Tabs
              label="직원 편집"
              value={tab}
              onValueChange={setTab}
              items={[
                {
                  value: "look",
                  label: (
                    <>
                      <Palette size={14} aria-hidden /> 외형
                    </>
                  ),
                  ariaLabel: "외형",
                  content: tabBody(() => (
                    <LookTab
                      slug={persona.slug}
                      role={role}
                      look={look}
                      storedBlocked={storedBlocked}
                      emoji={form?.emoji.trim() ?? ""}
                      onChange={setLook}
                    />
                  )),
                },
                {
                  value: "info",
                  label: (
                    <>
                      <IdCard size={14} aria-hidden /> 정보
                    </>
                  ),
                  ariaLabel: "정보",
                  content: tabBody(() =>
                    form ? (
                      <div className="ai-avatar-tab">
                        <TextField
                          label="슬러그"
                          value={`@${persona.slug}`}
                          readOnly
                          description="만든 뒤에는 바꿀 수 없습니다"
                        />
                        <div className="ai-avatar-readonly">
                          <span className="ai-team-legend">롤</span>
                          <AgentRoleGlyph role={role} />
                          <p className="admin-scheme-note">
                            롤은 바꿀 수 없습니다. 다른 롤이 필요하면 직원을 새로 추가하세요
                          </p>
                        </div>
                        <TextField
                          ref={nameRef}
                          label="이름"
                          value={form.name}
                          maxLength={NAME_MAX}
                          error={nameError}
                          onChange={(e) => update({ name: e.target.value })}
                        />
                        <TextField
                          label="이모지"
                          value={form.emoji}
                          maxLength={EMOJI_MAX}
                          description="선택 · 명판 표시는 외형 탭에서"
                          onChange={(e) => update({ emoji: e.target.value })}
                        />
                        <TextArea
                          label="말투"
                          rows={3}
                          placeholder="예: 짧고 단정하게, 근거를 먼저 말한다"
                          value={form.voicePrompt}
                          onChange={(e) => update({ voicePrompt: e.target.value })}
                        />
                      </div>
                    ) : null,
                  ),
                },
                {
                  value: "skill",
                  label: (
                    <>
                      <Sparkles size={14} aria-hidden /> 능력
                    </>
                  ),
                  ariaLabel: "능력",
                  content: tabBody(() =>
                    form ? (
                      <SkillTab
                        name={displayName}
                        skills={form.skills}
                        model={form.model}
                        storedModel={detail?.defaultModel ?? null}
                        onSkills={(skills) => update({ skills })}
                        onModel={(model) => update({ model })}
                      />
                    ) : null,
                  ),
                },
              ]}
            />
          </div>
        </div>
        <p className="ai-office-sr" role="status">
          {announce}
        </p>
        <div className="ai-team-form-actions">
          <Button type="button" variant="ghost" disabled={saving} onClick={requestClose}>
            취소
          </Button>
          <Button type="submit" disabled={!canSave}>
            {saving ? (
              <>
                <Spinner size="small" label="저장 중" /> 저장 중
              </>
            ) : (
              "저장"
            )}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="변경 사항을 버릴까요?"
        confirmLabel="버리기"
        cancelLabel="계속 편집"
        danger
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </Modal>
  );
}

function formOf(detail: AgentPersonaDetail): FormState {
  const stored = parseAvatarConfig(detail.avatarConfig, detail.slug);
  // 롤에서 못 쓰는 저장 액세서리는 편집 상태에서 '없음'으로 — 이 경우만 열자마자 외형이 "바뀐 것"(§6.4)
  const look = stored.accessory !== "none" && !extraAllowed(detail.role, stored.accessory) ? { ...stored, accessory: "none" as const } : stored;
  return {
    name: detail.name,
    emoji: detail.emoji ?? "",
    voicePrompt: detail.voicePrompt ?? "",
    skills: detail.skills ?? "",
    model: detail.defaultModel ?? MODEL_DEFAULT,
    look,
  };
}

/** 바뀐 필드만(§5.3·§5.5) — 서버처럼 앞뒤 공백을 걷어 비교하고, 비우면 "" = 지움 */
function diff(detail: AgentPersonaDetail, form: FormState, baselineLook: AvatarLook, slug: string): AgentPersonaPatch {
  const out: AgentPersonaPatch = {};
  const name = form.name.trim();
  if (name !== detail.name) out.name = name;
  const emoji = form.emoji.trim();
  if (emoji !== (detail.emoji ?? "")) out.emoji = emoji;
  const voice = form.voicePrompt.trim();
  if (voice !== (detail.voicePrompt ?? "").trim()) out.voicePrompt = voice;
  const skills = form.skills.trim();
  if (skills !== (detail.skills ?? "").trim()) out.skills = skills;
  const model = form.model === MODEL_DEFAULT ? "" : form.model;
  if (model !== (detail.defaultModel ?? "")) out.defaultModel = model;
  const avatar = avatarConfigPatch(form.look, baselineLook, slug);
  if (avatar !== undefined) out.avatarConfig = avatar;
  return out;
}

// ── 미리보기 ───────────────────────────────────────────────────

type PreviewMode = "stand" | "typing" | "talk";

const TALK_CYCLE: readonly FaceExpression[] = ["NORMAL", "THINKING", "HAPPY", "TROUBLED"];
const FACE_LABEL: Record<FaceExpression, string> = {
  NORMAL: "평소",
  THINKING: "생각",
  HAPPY: "기쁨",
  TROUBLED: "곤란",
  BLINK: "평소",
};

const STRIP: readonly { label: string; frame?: AvatarFrame; face?: FaceExpression }[] = [
  { label: "서기", frame: "standA" },
  { label: "뒷모습", frame: "back" },
  { label: "걷기", frame: "walkA" },
  { label: "엎드림", frame: "slump" },
  { label: "평소", face: "NORMAL" },
  { label: "생각", face: "THINKING" },
  { label: "기쁨", face: "HAPPY" },
  { label: "곤란", face: "TROUBLED" },
];

function Loop2({ a, b }: { a: ReactNode; b: ReactNode }) {
  return (
    <g className="office-loop" style={vars({ "--loop": "1200ms", "--phase": "0ms" })}>
      <g className="f-a">{a}</g>
      <g className="f-b">{b}</g>
    </g>
  );
}

function AvatarPreview({
  slug,
  role,
  look,
  disabled,
  name,
  emoji,
  onRandom,
  onReset,
  resetDisabled,
}: {
  slug: string;
  role: AgentRole;
  look: AvatarLook;
  disabled: boolean;
  name: string;
  emoji: string;
  onRandom: () => void;
  onReset: () => void;
  resetDisabled: boolean;
}) {
  const [mode, setMode] = useState<PreviewMode>("stand");
  const talkFace = useTalkFace(mode === "talk");
  const style = vars(avatarVars(slug, role, look));
  const shape = { hairStyle: look.hairStyle, accessory: look.accessory };

  return (
    <div className="ai-avatar-editor-preview">
      <div className="ai-office ai-avatar-stage" aria-hidden="true">
        {mode === "stand" ? (
          <svg viewBox="-4 0 24 24" shapeRendering="crispEdges" focusable="false" style={style}>
            <Loop2
              a={<PixelSprite paths={avatarPaths(role, "standA", shape)} />}
              b={<PixelSprite paths={avatarPaths(role, "standB", shape)} />}
            />
          </svg>
        ) : mode === "typing" ? (
          <svg viewBox="0 -8 64 64" shapeRendering="crispEdges" focusable="false" style={style}>
            <PixelSprite paths={spritePaths("CHAIR", "furn")} x={17} y={6} />
            <PixelSprite paths={avatarPaths(role, "seat", shape)} x={16} y={0} />
            <PixelSprite paths={spritePaths("DESK", "furn")} x={4} y={16} />
            <Loop2
              a={
                <>
                  <PixelSprite paths={spritePaths("MONITOR_ON_A", "furn")} x={5} y={6} />
                  <PixelSprite paths={spritePaths("HAND", "char")} x={19} y={16} />
                  <PixelSprite paths={spritePaths("HAND", "char")} x={27} y={17} />
                </>
              }
              b={
                <>
                  <PixelSprite paths={spritePaths("MONITOR_ON_B", "furn")} x={5} y={6} />
                  <PixelSprite paths={spritePaths("HAND", "char")} x={19} y={17} />
                  <PixelSprite paths={spritePaths("HAND", "char")} x={27} y={16} />
                </>
              }
            />
          </svg>
        ) : (
          <TalkStage role={role} shape={shape} style={style} face={talkFace} />
        )}
      </div>
      {mode === "talk" ? <span className="ai-avatar-caption">지금: {FACE_LABEL[talkFace]}</span> : null}
      {look.showEmoji && emoji ? (
        <p className="ai-office ai-avatar-plate-row">
          <span className="office-nameplate ai-avatar-plate">
            {name}
            <span className="office-nameplate-emoji" aria-hidden="true">
              {emoji}
            </span>
          </span>
        </p>
      ) : null}
      <RadioGroup
        className="ai-avatar-modes"
        aria-label="미리보기 동작"
        orientation="horizontal"
        value={mode}
        disabled={disabled}
        onValueChange={(v) => setMode(v as PreviewMode)}
      >
        <Radio value="stand" label={<span className="ai-avatar-chip"><PersonStanding size={14} aria-hidden /> 서기</span>} />
        <Radio value="typing" label={<span className="ai-avatar-chip"><Keyboard size={14} aria-hidden /> 타이핑</span>} />
        <Radio value="talk" label={<span className="ai-avatar-chip"><MessageCircle size={14} aria-hidden /> 대화</span>} />
      </RadioGroup>
      <div className="ai-office ai-avatar-strip" role="img" aria-label="모든 자세 미리보기">
        {STRIP.map((item) => (
          <figure key={item.label} className="ai-avatar-strip-item">
            <svg viewBox="0 0 16 24" width={32} height={48} shapeRendering="crispEdges" focusable="false" style={style}>
              {item.face ? (
                <PixelSprite paths={facePaths(role, item.face, shape)} y={8} />
              ) : item.frame === "slump" ? (
                <PixelSprite paths={avatarPaths(role, "slump", shape)} y={8} />
              ) : (
                <PixelSprite paths={avatarPaths(role, item.frame ?? "standA", shape)} />
              )}
            </svg>
            <figcaption>{item.label}</figcaption>
          </figure>
        ))}
      </div>
      <div className="ai-avatar-actions">
        <Button type="button" variant="secondary" iconBefore={<Dices size={16} aria-hidden />} disabled={disabled} onClick={onRandom}>
          랜덤
        </Button>
        <Button type="button" variant="subtle" iconBefore={<RotateCcw size={16} aria-hidden />} disabled={resetDisabled} onClick={onReset}>
          기본값으로
        </Button>
      </div>
    </div>
  );
}

/** 대화 모드 표정 — 평소 → 생각 → 기쁨 → 곤란 1.2초씩, 평소에 깜빡임. reduced-motion은 평소 고정 */
function useTalkFace(active: boolean): FaceExpression {
  const [step, setStep] = useState(0);
  const [blink, setBlink] = useState(false);
  const animate = active && !prefersReducedMotion();

  useEffect(() => {
    if (!animate) return;
    setStep(0);
    const cycle = setInterval(() => setStep((s) => (s + 1) % TALK_CYCLE.length), 1200);
    return () => clearInterval(cycle);
  }, [animate]);

  const expression = animate ? TALK_CYCLE[step] : "NORMAL";
  useEffect(() => {
    if (!animate || expression !== "NORMAL") return;
    const open = setTimeout(() => setBlink(true), 700);
    const close = setTimeout(() => setBlink(false), 820);
    return () => {
      clearTimeout(open);
      clearTimeout(close);
      setBlink(false);
    };
  }, [animate, expression]);
  return expression === "NORMAL" && blink ? "BLINK" : expression;
}

/** 대화 모드 스테이지 — 표정 16×16을 10배(160px) + P3g 장면 효과(생각 말풍선·땀) */
function TalkStage({
  role,
  shape,
  style,
  face,
}: {
  role: AgentRole;
  shape: Pick<AvatarLook, "hairStyle" | "accessory">;
  style: CSSProperties;
  face: FaceExpression;
}) {
  const expression = face === "BLINK" ? "NORMAL" : face;
  return (
    <>
      {/* viewBox 96 단위 = 192px(1단위 2px) — 얼굴 scale 5(=10배), 말풍선 scale 2(=4배), 땀 scale 3(=6배): 전부 정수 배율 */}
      <svg viewBox="0 0 96 96" shapeRendering="crispEdges" focusable="false" style={style}>
        <g transform="translate(4 16) scale(5)">
          <PixelSprite paths={facePaths(role, face, shape)} />
        </g>
        {expression === "THINKING" ? (
          <g className="office-scene-thinking" transform="translate(68 0) scale(2)">
            <PixelSprite paths={spritePaths("MB_FRAME", "mb")} />
            {[3, 6, 9].map((x, i) => (
              <path key={x} className="px-mb-K office-scene-dot" style={vars({ "--dot": i })} d={`M${x} 3h2v2h-2z`} />
            ))}
          </g>
        ) : null}
        {expression === "TROUBLED" ? (
          <g className="office-scene-sweat" transform="translate(85 30) scale(3)">
            <PixelSprite paths={spritePaths("FX_SWEAT", "fx")} />
          </g>
        ) : null}
      </svg>
    </>
  );
}

// ── 외형 탭 ────────────────────────────────────────────────────

function SwatchDot({ main, shade }: { main: string; shade: string }) {
  return (
    <svg
      className="ai-avatar-dot"
      viewBox="0 0 16 16"
      width={16}
      height={16}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      style={vars({ "--sw": `var(${main})`, "--sw2": `var(${shade})` })}
    >
      <path className="ai-avatar-dot-ol" d="M0 0h16v16h-16z" />
      <path className="ai-avatar-dot-main" d="M1 1h14v14h-14z" />
      <path className="ai-avatar-dot-shade" d="M8 8h7v7h-7z" />
    </svg>
  );
}

function chip(icon: ReactNode, text: ReactNode) {
  return (
    <span className="ai-avatar-chip">
      {icon}
      <span>{text}</span>
    </span>
  );
}

function shirtMain(role: AgentRole, key: ShirtColor | null): string {
  const k = key ?? roleShirtKey(role);
  return ROLE_SHIRT_KEYS.has(k) ? `--office-role-${k}` : `--office-shirt-${k}`;
}

function LookGroup({ legend, note, children }: { legend: string; note?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="ai-avatar-group">
      <legend className="ai-team-legend">{legend}</legend>
      {children}
      {note ? <p className="admin-scheme-note">{note}</p> : null}
    </fieldset>
  );
}

function LookTab({
  slug,
  role,
  look,
  storedBlocked,
  emoji,
  onChange,
}: {
  slug: string;
  role: AgentRole;
  look: AvatarLook;
  storedBlocked: ExtraAccessory | null;
  emoji: string;
  onChange: (next: Partial<AvatarLook>) => void;
}) {
  const roleLabel = AGENT_ROLE_LABEL[drawnRole(role)];
  const style = vars(avatarVars(slug, role, look));
  const blocked = EXTRA_ORDER.filter((a) => !extraAllowed(role, a));
  const roleSlots = ROLE_SLOTS[drawnRole(role)];
  const clashSlots = (Object.keys(SLOT_LABEL) as AvatarSlot[]).filter(
    (slot) => roleSlots.includes(slot) && blocked.some((a) => EXTRA_SLOTS[a].includes(slot)),
  );
  const ownShirt = roleShirtKey(role);
  const otherRoleShirt = look.shirtColor !== null && ROLE_SHIRT_KEYS.has(look.shirtColor) && look.shirtColor !== ownShirt;

  return (
    <div className="ai-avatar-tab">
      {storedBlocked ? (
        <Banner variant="warning">
          저장된 액세서리({EXTRA_LABEL[storedBlocked]})는 {roleLabel} 롤에서 쓸 수 없어 표시되지 않습니다. 저장하면 '없음'으로 바뀝니다.
        </Banner>
      ) : null}
      <LookGroup legend="피부톤">
        <RadioGroup className="ai-avatar-swatches" value={look.skinTone} onValueChange={(v) => onChange({ skinTone: v as SkinTone })}>
          {SKIN_ORDER.map((k) => (
            <Radio key={k} value={k} label={chip(<SwatchDot main={`--office-skin-${k}`} shade={`--office-skin-${k}2`} />, SKIN_LABEL[k])} />
          ))}
        </RadioGroup>
      </LookGroup>
      <LookGroup legend="머리 모양">
        <RadioGroup className="ai-avatar-swatches" value={look.hairStyle} onValueChange={(v) => onChange({ hairStyle: v as HairStyle })}>
          {HAIR_STYLE_ORDER.map((k) => (
            <Radio
              key={k}
              value={k}
              label={chip(
                <svg className="ai-office ai-avatar-thumb" viewBox="0 0 16 13" width={32} height={26} shapeRendering="crispEdges" aria-hidden="true" focusable="false" style={style}>
                  <PixelSprite paths={hairThumbPaths(k)} />
                </svg>,
                HAIR_STYLE_LABEL[k],
              )}
            />
          ))}
        </RadioGroup>
      </LookGroup>
      <LookGroup legend="머리색">
        <RadioGroup className="ai-avatar-swatches" value={look.hairColor} onValueChange={(v) => onChange({ hairColor: v as HairColor })}>
          {HAIR_COLOR_ORDER.map((k) => (
            <Radio key={k} value={k} label={chip(<SwatchDot main={`--office-hair-${k}`} shade={`--office-hair-${k}2`} />, HAIR_COLOR_LABEL[k])} />
          ))}
        </RadioGroup>
      </LookGroup>
      <LookGroup
        legend="셔츠색"
        note={otherRoleShirt ? "다른 롤의 기본색입니다. 롤은 모자·소품 모양과 이름표로 구분되니 괜찮지만, 헷갈리면 롤 기본을 권합니다." : undefined}
      >
        <RadioGroup
          className="ai-avatar-swatches"
          value={look.shirtColor ?? SHIRT_ROLE}
          onValueChange={(v) => onChange({ shirtColor: v === SHIRT_ROLE ? null : (v as ShirtColor) })}
        >
          <Radio
            value={SHIRT_ROLE}
            label={chip(
              <span className="ai-avatar-dot-stack">
                <SwatchDot main={shirtMain(role, null)} shade={`${shirtMain(role, null)}2`} />
                <span className="ai-avatar-dot-badge">
                  <AgentRoleIcon role={drawnRole(role)} size={12} />
                </span>
              </span>,
              `롤 기본 (${SHIRT_LABEL[ownShirt]})`,
            )}
          />
          {SHIRT_ORDER.map((k) => (
            <Radio key={k} value={k} label={chip(<SwatchDot main={shirtMain(role, k)} shade={`${shirtMain(role, k)}2`} />, SHIRT_LABEL[k])} />
          ))}
        </RadioGroup>
      </LookGroup>
      <LookGroup
        legend="액세서리"
        note={
          blocked.length > 0
            ? `${roleLabel} 롤은 ${clashSlots.map((s) => SLOT_LABEL[s]).join("·")} 자리에 롤 표식이 있어 ${blocked.map((a) => EXTRA_LABEL[a]).join(", ")}을(를) 쓸 수 없습니다.`
            : undefined
        }
      >
        <RadioGroup className="ai-avatar-swatches" value={look.accessory} onValueChange={(v) => onChange({ accessory: v as ExtraAccessory })}>
          {EXTRA_ORDER.map((k) => {
            const allowed = extraAllowed(role, k);
            return (
              <Radio
                key={k}
                value={k}
                disabled={!allowed}
                label={chip(
                  <svg className="ai-office ai-avatar-thumb" viewBox="0 0 16 16" width={32} height={32} shapeRendering="crispEdges" aria-hidden="true" focusable="false" style={vars(avatarVars(slug, role, { ...look, accessory: k }))}>
                    <PixelSprite paths={avatarPaths(role, "seat", { hairStyle: look.hairStyle, accessory: k })} />
                  </svg>,
                  <>
                    {EXTRA_LABEL[k]}
                    {allowed ? null : <span className="ai-team-subtle"> · {roleLabel} 표식과 겹침</span>}
                  </>,
                )}
              />
            );
          })}
        </RadioGroup>
      </LookGroup>
      <div className="ai-avatar-group">
        <Switch
          label="명판에 이모지 표시"
          checked={look.showEmoji && Boolean(emoji)}
          disabled={!emoji}
          onCheckedChange={(next) => onChange({ showEmoji: next })}
        />
        {!emoji ? <p className="admin-scheme-note">정보 탭에서 이모지를 먼저 입력하세요</p> : null}
      </div>
    </div>
  );
}

// ── 능력 탭 ────────────────────────────────────────────────────

function SkillTab({
  name,
  skills,
  model,
  storedModel,
  onSkills,
  onModel,
}: {
  name: string;
  skills: string;
  model: string;
  storedModel: string | null;
  onSkills: (value: string) => void;
  onModel: (value: string) => void;
}) {
  // 스크린리더용 글자 수는 포커스가 떠날 때만 갱신한다 — 타이핑마다 읽지 않게
  const [spoken, setSpoken] = useState(skills.length);
  const known = AGENT_MODEL_OPTIONS.some((o) => o.value === storedModel);
  const options = [
    { value: MODEL_DEFAULT, label: "기본값 따름 (프로젝트·전역 설정)", icon: <Settings2 size={14} aria-hidden /> },
    ...AGENT_MODEL_OPTIONS.map((o) => ({ ...o, icon: <Cpu size={14} aria-hidden /> })),
    // 목록 밖 저장값은 옵션으로 보존 — 보이지 않는 값을 조용히 지우지 않는다
    ...(storedModel && !known ? [{ value: storedModel, label: `사용자 지정: ${storedModel}`, icon: <Cpu size={14} aria-hidden /> }] : []),
  ];

  return (
    <div className="ai-avatar-tab">
      {skills.length === 0 ? (
        <div>
          <Button
            type="button"
            variant="subtle"
            size="small"
            iconBefore={<FileText size={14} aria-hidden />}
            onClick={() => onSkills(SKILLS_TEMPLATE(name))}
          >
            예시 넣기
          </Button>
        </div>
      ) : null}
      <div className="ai-avatar-skills">
        <TextArea
          id="persona-skills"
          label="스킬"
          rows={14}
          maxLength={SKILLS_MAX}
          description="이 직원이 잘하는 것과 일하는 방식을 마크다운으로 적습니다. 작업할 때 SKILL.md로 주어지고, 첫 줄은 회의 소개·대화에 요약으로 쓰입니다."
          aria-describedby="persona-skills-desc persona-skills-count"
          value={skills}
          onChange={(e) => onSkills(e.target.value)}
          onBlur={() => setSpoken(skills.length)}
        />
        <p className={skills.length > SKILLS_WARN ? "ai-avatar-counter is-warning" : "ai-avatar-counter"} aria-hidden="true">
          {count(skills.length)} / {count(SKILLS_MAX)}
        </p>
        <span id="persona-skills-count" className="ai-office-sr">
          {count(spoken)} / {count(SKILLS_MAX)}자
        </span>
      </div>
      <Select label="기본 모델" value={model} options={options} onValueChange={onModel} />
      <p className="admin-scheme-note">
        이 직원의 작업(run)에 쓸 모델. 사용자가 실행할 때 고른 모델이 우선이고, 비우면 프로젝트·전역 기본을 따릅니다.
      </p>
    </div>
  );
}
