import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Banner, Button, Select, Spinner, TextArea, TextField, Tooltip } from "@chanho/react";
import { ClipboardCheck, FastForward, MessageSquare, PanelRight, ScrollText, Send, Sparkles, X } from "lucide-react";
import type {
  AgentBudget,
  AgentDialogEntry,
  AgentMeetingType,
  AgentOfficeFeatures,
  AgentOfficePersona,
  AgentPersonaActivity,
  AgentRunSummary,
  Issue,
  WorkflowStatus,
} from "../store/types";
import {
  addComment,
  createAgentRun,
  getIssueByKey,
  listIssues,
  listProjectStatuses,
  searchIssues,
  sendPersonaChat,
} from "../store/jiraStore";
import { errorStatus } from "../store/mapping";
import { AgentRoleGlyph, AgentRunTypeGlyph, AgentStatusLozenge } from "../components/AgentGlyphs";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { StatusGlyph } from "../components/StatusGlyph";
import { statusKind, statusName } from "../components/labels";
import { PixelSprite } from "./PixelSprite";
import { PixelChoiceMenu, type ChoiceItem, type PixelChoiceMenuHandle } from "./PixelChoiceMenu";
import { paginate, useTypewriter } from "./TypewriterText";
import { DialogLogRow, metToday } from "./DialogLogRows";
import type { DialogLog } from "./useDialogLog";
import type { OfficeLinks } from "./OfficePanel";
import {
  avatarVars,
  facePaths,
  SCENE_H,
  SCENE_W,
  sceneBackgroundPaths,
  spritePaths,
  type FaceExpression,
} from "./pixel";
import { linkableIssueKey, personaState } from "./officeModel";
import {
  AGENT_MODEL_OPTIONS,
  ASSIGN_ASK,
  ASSIGN_CONFLICT,
  ASSIGN_FAILED,
  ASSIGN_INACTIVE,
  assignOk,
  CHAT_ENOUGH,
  CHAT_FAILED,
  CHAT_MAX,
  CHAT_OFF,
  CHAT_SLOW,
  CHAT_START,
  CHAT_STOPPED,
  CHAT_TURN_LIMIT,
  dialogTitle,
  DIRECTIVE_ASK,
  DIRECTIVE_FAILED,
  DIRECTIVE_FORBIDDEN,
  DIRECTIVE_OK,
  DIRECTIVE_WHERE,
  directiveCommentHtml,
  EXIT_CONFIRM,
  farewellLine,
  greetingLine,
  ISSUE_NOT_FOUND,
  logLabel,
  MANAGE_DENIED,
  MANAGE_REASON,
  MODEL_DEFAULT,
  NEXT_STEP_NOTICE,
  NO_CURRENT_ISSUE,
  objectJosa,
  plainName,
  STATUS_LOADING,
  statusAnswer,
  type Mood,
  type StatusContext,
  type Utterance,
} from "./officeDialogCopy";

/** 와이프 한 방향 — 띠 240ms + 띠마다 10ms 지연 × 8(§3.2 예외 상수) */
const WIPE_MS = 320;
const WIPE_BANDS = 8;
/** 맡기기 성공 발화가 끝난 뒤 자동으로 닫히기까지 */
const ASSIGN_CLOSE_MS = 1500;
/** Esc·닫기 버튼의 "잘 가" — 1쪽 즉시 표시 후 */
const FAREWELL_QUICK_MS = 600;
/** "지금 뭐 해?" — activity가 이만큼 안 오면 사무실 데이터만으로 답한다 */
const STATUS_WAIT_MS = 10_000;
/** 로그 로드를 인사 전에 기다리는 한도 */
const GREETING_WAIT_MS = 1000;
const SEARCH_DEBOUNCE_MS = 250;
const INSTRUCTION_MAX = 4000;

export type DialogCloseResult =
  | { kind: "bye" }
  | { kind: "panel" }
  | { kind: "navigate"; to: string }
  | { kind: "assigned"; run: AgentRunSummary };

export interface OfficeDialogProps {
  /** 실시간 페르소나(폴링 갱신) — 헤더 상태·노트북이 따라간다 */
  persona: AgentOfficePersona;
  /** 회의실 좌석에 앉아 있다(문 앞에서 부른다) */
  inMeeting: boolean;
  /** 앉아 있는 회의의 종류 — 헤더 "회의 중" 표기 */
  meetingType: AgentMeetingType | null;
  activity: AgentPersonaActivity | null;
  activityFailed: boolean;
  recentRuns: readonly AgentRunSummary[];
  /** 다른 페르소나의 현재 이슈 — 이슈 고르기에서 "AI 작업 중" 표기 */
  personas: readonly AgentOfficePersona[];
  features: AgentOfficeFeatures;
  budget: AgentBudget;
  canManage: boolean;
  projectId: string;
  userVars: Record<string, string>;
  stageEl: HTMLElement | null;
  log: DialogLog;
  links: OfficeLinks;
  /** 장면이 열려 있는 동안 페이지의 전이 알림(P3a 승인 대기·차단, P3e 회의 시작/종료) — 장면 live 영역으로 */
  announcement: string;
  onClosed: (result: DialogCloseResult) => void;
}

type Mode =
  | { kind: "menu" }
  | { kind: "wait" }
  | { kind: "directiveText" }
  | { kind: "directiveWhere" }
  | { kind: "directiveConfirm" }
  | { kind: "assignPick" }
  | { kind: "assignConfirm" }
  | { kind: "chat" }
  | { kind: "exitConfirm"; back: Mode }
  | { kind: "closing"; result: DialogCloseResult; delay: number };

type Ctx = { kind: "GATES" } | { kind: "RUN_DETAIL"; runId: string } | { kind: "HANDOFF"; text: string };

interface Line {
  id: number;
  speaker: "persona" | "user";
  text: string;
  mood: Mood;
  /** 타자 효과 없이 즉시(사람 발화·빠른 잘 가·건너뛰기) */
  instant: boolean;
}

type Phase = "cover-in" | "reveal" | "open" | "cover-out";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

const vars = (v: Record<string, string | number>) => v as CSSProperties;
/** 장면 격자 좌표(장면 px) — CSS가 정수 s를 곱한다 */
const at = (x: number, y: number, w?: number, h?: number) =>
  vars({ "--x": x, "--y": y, ...(w !== undefined ? { "--w": w } : {}), ...(h !== undefined ? { "--h": h } : {}) });

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface StageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 장면 창 = `.ai-office-stage` 사각형(열기 직전 scrollIntoView, 열려 있는 동안 ResizeObserver로 재측정) */
function useStageRect(stageEl: HTMLElement | null): StageRect {
  const measure = useCallback((): StageRect => {
    const r = stageEl?.getBoundingClientRect();
    return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : { left: 0, top: 0, width: 0, height: 0 };
  }, [stageEl]);
  const [rect, setRect] = useState<StageRect>(() => {
    if (stageEl && typeof stageEl.scrollIntoView === "function") stageEl.scrollIntoView({ block: "nearest" });
    return measure();
  });
  useLayoutEffect(() => {
    const update = () => setRect(measure());
    update();
    window.addEventListener("resize", update);
    let observer: ResizeObserver | null = null;
    if (stageEl && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(stageEl);
    }
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [measure, stageEl]);
  return rect;
}

/**
 * P3g 1:1 대화 장면(§3~§8) — 스테이지 위를 덮는 모달(body 포털, `ai-office` 클래스로 팔레트 스코프 유지).
 * 대화는 연출이다: run을 멈추지 않고 서버에 "대화 중"을 보내지 않는다. 실제 상태는 헤더 Lozenge와 노트북 두 곳뿐.
 */
export function OfficeDialog(props: OfficeDialogProps) {
  const { persona, log, onClosed } = props;
  const name = plainName(persona);
  const reduced = prefersReducedMotion();
  const rect = useStageRect(props.stageEl);
  const [phase, setPhase] = useState<Phase>(reduced ? "open" : "cover-in");
  const windowRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // 배경 inert·스크롤 잠금 — 포털은 앱 루트 밖이라 장면 안만 조작할 수 있다
  useEffect(() => {
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    windowRef.current?.focus();
    return () => {
      root?.removeAttribute("inert");
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    if (phase === "cover-in") {
      const t = setTimeout(() => setPhase("reveal"), WIPE_MS);
      return () => clearTimeout(t);
    }
    if (phase === "reveal") {
      const t = setTimeout(() => setPhase("open"), WIPE_MS);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const closeWith = useCallback(
    (result: DialogCloseResult) => {
      void log.flush();
      if (reduced) {
        onClosed(result);
        return;
      }
      setPhase("cover-out");
      setTimeout(() => onClosed(result), WIPE_MS);
    },
    [log, onClosed, reduced],
  );

  const s = Math.max(3, Math.floor(Math.min(rect.width / SCENE_W, rect.height / SCENE_H)));
  const sceneStyle = vars({
    "--s": s,
    left: `${Math.round((rect.width - SCENE_W * s) / 2)}px`,
    top: `${Math.round((rect.height - SCENE_H * s) / 2)}px`,
    width: `${SCENE_W * s}px`,
    height: `${SCENE_H * s}px`,
  });

  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !windowRef.current) return;
    const items = [...windowRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !windowRef.current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="ai-office office-dialog-layer">
      <div className="office-dialog-blanket" aria-hidden="true" />
      <div
        ref={windowRef}
        className="office-dialog-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        style={vars({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })}
        onKeyDown={trap}
      >
        <h2 id={titleId} className="ai-office-sr">
          {dialogTitle(name)}
        </h2>
        {phase === "cover-in" ? (
          <p id={descId} className="ai-office-sr" />
        ) : (
          <Conversation {...props} s={s} sceneStyle={sceneStyle} descId={descId} reduced={reduced} closeWith={closeWith} />
        )}
        {phase === "cover-in" || phase === "reveal" || phase === "cover-out" ? (
          <div className={`office-wipe is-${phase}`} aria-hidden="true">
            {Array.from({ length: WIPE_BANDS }, (_, i) => (
              <i key={i} className={i % 2 === 0 ? "is-left" : "is-right"} style={vars({ "--band": i })} />
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function Conversation({
  persona,
  inMeeting,
  meetingType,
  activity,
  activityFailed,
  recentRuns,
  personas,
  features,
  budget,
  canManage,
  projectId,
  userVars,
  log,
  links,
  announcement,
  s,
  sceneStyle,
  descId,
  reduced,
  closeWith,
}: OfficeDialogProps & {
  s: number;
  sceneStyle: CSSProperties;
  descId: string;
  reduced: boolean;
  closeWith: (result: DialogCloseResult) => void;
}) {
  const name = plainName(persona);
  const state = personaState(persona);
  const currentKey = persona.currentRun ? linkableIssueKey(persona.currentRun) : null;

  const seq = useRef(0);
  const utteranceNo = useRef(0);
  const [line, setLine] = useState<Line | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<Mode>({ kind: "menu" });
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [busy, setBusy] = useState(false);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [sceneLines, setSceneLines] = useState<AgentDialogEntry[]>([]);
  const [live, setLive] = useState("");
  const [firstLine, setFirstLine] = useState("");
  const lastChoice = useRef<string | null>(null);

  // 폼 입력(메뉴로 돌아가도 유지 — 실패 뒤 다시 고르면 그대로)
  const [directiveText, setDirectiveText] = useState("");
  const [picked, setPicked] = useState<Issue | null>(null);
  const [query, setQuery] = useState("");
  const [model, setModel] = useState(MODEL_DEFAULT);
  const [instruction, setInstruction] = useState("");
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [chatTurns, setChatTurns] = useState(0);
  const sessionId = useRef<string | undefined>(undefined);

  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<PixelChoiceMenuHandle>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLInputElement>(null);
  const pageTextId = useId();

  const pushScene = useCallback((entry: Omit<AgentDialogEntry, "id" | "createdAt">) => {
    seq.current += 1;
    setSceneLines((prev) => [...prev, { ...entry, id: `scene-${seq.current}`, createdAt: new Date().toISOString() }]);
  }, []);

  /** 봇·사람 발화 — 봇 발화는 시작할 때 전문을 live 영역으로(쪽·타자와 무관) */
  const say = useCallback(
    (u: Utterance, next: Mode, options: { speaker?: "persona" | "user"; instant?: boolean; kind?: AgentDialogEntry["kind"] } = {}) => {
      const speaker = options.speaker ?? "persona";
      seq.current += 1;
      setLine({ id: seq.current, speaker, text: u.text, mood: u.mood, instant: options.instant ?? speaker === "user" });
      setPageIndex(0);
      setMode(next);
      if (speaker === "persona") setLive(`${name}: ${u.text}`);
      pushScene({
        speaker: speaker === "persona" ? "PERSONA" : "USER",
        kind: options.kind ?? "SAY",
        text: u.text,
        issueKey: null,
        runId: null,
        commentId: null,
      });
    },
    [name, pushScene],
  );

  // 인사 — 대화 기록(오늘 만났는가)을 잠깐 기다린다
  const greeted = useRef(false);
  const greet = useCallback(() => {
    if (greeted.current) return;
    greeted.current = true;
    const u = greetingLine(persona, { inMeeting, metToday: metToday(log.entries) });
    setFirstLine(u.text);
    say(u, { kind: "menu" });
  }, [inMeeting, log.entries, persona, say]);
  useEffect(() => {
    if (log.status === "ready" || log.status === "error") greet();
  }, [log.status, greet]);
  useEffect(() => {
    const t = setTimeout(greet, GREETING_WAIT_MS);
    return () => clearTimeout(t);
  }, [greet]);

  // 전이 알림(승인 대기·차단·회의) — 장면이 열려 있는 동안 장면 live 영역으로. 대사를 끊지 않는다
  const firstAnnouncement = useRef(announcement);
  useEffect(() => {
    if (announcement && announcement !== firstAnnouncement.current) setLive(announcement);
  }, [announcement]);

  const innerWidth = 147 * s - 6;
  const linesPerPage = s >= 4 ? 3 : 2;
  const pages = useMemo(() => (line ? paginate(line.text, innerWidth, linesPerPage) : [""]), [line, innerWidth, linesPerPage]);
  const page = pages[Math.min(pageIndex, pages.length - 1)];
  const tw = useTypewriter(page, reduced || (line?.instant ?? true), line?.id ?? 0);
  const lastPage = pageIndex >= pages.length - 1;
  const lineComplete = line !== null && lastPage && tw.done;

  const showMenu = lineComplete && !busy && (mode.kind === "menu" || mode.kind === "directiveWhere");
  const formKinds = ["directiveText", "directiveConfirm", "assignPick", "assignConfirm", "exitConfirm"];
  const showForm = lineComplete && formKinds.includes(mode.kind);
  const chatMode = mode.kind === "chat";

  const advance = useCallback(() => {
    if (!line) return;
    if (!tw.done) {
      tw.complete();
      return;
    }
    if (!lastPage) {
      setPageIndex((i) => i + 1);
      return;
    }
    if (mode.kind === "closing") closeWith(mode.result);
  }, [closeWith, lastPage, line, mode, tw]);

  const skip = useCallback(() => {
    if (!line) return;
    setLine({ ...line, instant: true });
    setPageIndex(pages.length - 1);
    tw.complete();
  }, [line, pages.length, tw]);

  // 발화가 끝나면 자동으로 닫힘(잘 가·맡기기 성공)
  useEffect(() => {
    if (!lineComplete || mode.kind !== "closing") return;
    const t = setTimeout(() => closeWith(mode.result), mode.delay);
    return () => clearTimeout(t);
  }, [closeWith, lineComplete, mode]);

  // "지금 뭐 해?" — activity를 기다리는 중
  const answerStatus = useCallback(() => {
    utteranceNo.current += 1;
    const a = statusAnswer(persona, activity, recentRuns, utteranceNo.current);
    say(a, { kind: "menu" }, { kind: "STATUS" });
    log.record(
      { speaker: "PERSONA", kind: "STATUS", text: a.text, issueKey: currentKey, runId: persona.currentRun?.id ?? null },
      "later",
    );
    const context: StatusContext = a.context;
    if (context === "GATES") setCtx({ kind: "GATES" });
    else if (context === "RUN_DETAIL" && persona.currentRun) setCtx({ kind: "RUN_DETAIL", runId: persona.currentRun.id });
  }, [activity, currentKey, log, persona, recentRuns, say]);
  useEffect(() => {
    if (mode.kind !== "wait") return;
    if (activity || activityFailed) {
      answerStatus();
      return;
    }
    const t = setTimeout(answerStatus, STATUS_WAIT_MS);
    return () => clearTimeout(t);
  }, [mode.kind, activity, activityFailed, answerStatus]);

  // 포커스 — 메뉴가 뜨면 메뉴, 폼이 뜨면 첫 입력, 수다면 입력, 그 밖은 대화창
  useEffect(() => {
    if (backlogOpen) return;
    const t = setTimeout(() => {
      if (showMenu) menuRef.current?.focus();
      else if (showForm) formRef.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
      else if (chatMode && !busy && lineComplete) chatRef.current?.focus();
      else if (!chatMode) boxRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [showMenu, showForm, chatMode, busy, backlogOpen, line?.id, lineComplete, mode.kind]);

  // ── 흐름 ──

  const hasInput =
    ((mode.kind === "directiveText" || mode.kind === "directiveConfirm" || mode.kind === "directiveWhere") && directiveText.trim() !== "") ||
    ((mode.kind === "assignPick" || mode.kind === "assignConfirm") && (picked !== null || query.trim() !== "" || instruction.trim() !== "")) ||
    (mode.kind === "chat" && chatText.trim() !== "");

  const farewell = useCallback(
    (quick: boolean) => {
      say(farewellLine(persona, inMeeting), { kind: "closing", result: { kind: "bye" }, delay: FAREWELL_QUICK_MS }, { instant: quick });
    },
    [inMeeting, persona, say],
  );

  const requestClose = useCallback(() => {
    if (mode.kind === "closing") return;
    if (hasInput) {
      setMode({ kind: "exitConfirm", back: mode });
      return;
    }
    farewell(true);
  }, [farewell, hasInput, mode]);

  const startDirective = useCallback(
    (prefill?: string) => {
      if (prefill !== undefined) setDirectiveText(prefill);
      say(DIRECTIVE_ASK, { kind: "directiveText" });
    },
    [say],
  );

  const startAssign = useCallback(
    (withInstruction?: string) => {
      if (withInstruction !== undefined && withInstruction.trim() !== "") {
        setInstruction(withInstruction);
        setInstructionOpen(true);
      }
      say(ASSIGN_ASK, { kind: "assignPick" });
    },
    [say],
  );

  const menuItems: ChoiceItem[] = useMemo(() => {
    const ctxItem: ChoiceItem[] = !ctx
      ? []
      : ctx.kind === "GATES"
        ? [{ id: "ctx", label: "승인 인박스 열기" }]
        : ctx.kind === "RUN_DETAIL"
          ? [{ id: "ctx", label: "실행 상세 보기" }]
          : [{ id: "ctx", label: "지시하기로 전하기", disabledReason: canManage ? null : MANAGE_REASON }];
    const locked = canManage ? null : MANAGE_REASON;
    return [
      ...ctxItem,
      { id: "status", label: "지금 뭐 해?" },
      { id: "directive", label: "지시하기", disabledReason: locked },
      { id: "assign", label: "이 이슈 맡아줘", disabledReason: locked },
      { id: "chat", label: "그냥 얘기하자" },
      { id: "bye", label: "잘 가" },
    ];
  }, [canManage, ctx]);

  const whereItems: ChoiceItem[] = [
    {
      id: "current",
      label: currentKey ? `지금 하는 ${currentKey}에 남기기` : "지금 하는 이슈에 남기기",
      disabledReason: currentKey ? null : NO_CURRENT_ISSUE,
    },
    { id: "new", label: "새 작업으로 맡기기" },
    { id: "rewrite", label: "다시 쓰기" },
  ];

  const chooseMenu = (item: ChoiceItem) => {
    lastChoice.current = item.id;
    const context = ctx;
    // 상황 선택지는 이 답 뒤 메뉴에서만 — 다음 메뉴부터 사라진다
    setCtx(null);
    if (item.disabledReason) {
      say(item.disabledReason === MANAGE_REASON ? MANAGE_DENIED : { text: item.disabledReason, mood: "TROUBLED" }, { kind: "menu" });
      return;
    }
    pushScene({ speaker: "USER", kind: "SAY", text: item.label, issueKey: null, runId: null, commentId: null });
    switch (item.id) {
      case "ctx":
        if (context?.kind === "GATES") closeWith({ kind: "navigate", to: `${links.gates}?persona=${encodeURIComponent(persona.id)}` });
        else if (context?.kind === "RUN_DETAIL") closeWith({ kind: "navigate", to: links.run(context.runId) });
        else if (context?.kind === "HANDOFF") startDirective(context.text);
        return;
      case "status":
        if (activity || activityFailed) answerStatus();
        else say(STATUS_LOADING, { kind: "wait" });
        return;
      case "directive":
        startDirective();
        return;
      case "assign":
        startAssign();
        return;
      case "chat":
        if (!features.chat) say(CHAT_OFF, { kind: "menu" });
        else say(CHAT_START, { kind: "chat" });
        return;
      case "bye":
        farewell(false);
        return;
    }
  };

  const chooseWhere = (item: ChoiceItem) => {
    if (item.disabledReason) {
      say({ text: `${item.disabledReason}.`, mood: "TROUBLED" }, { kind: "directiveWhere" });
      return;
    }
    if (item.id === "current") setMode({ kind: "directiveConfirm" });
    else if (item.id === "new") startAssign(directiveText);
    else setMode({ kind: "directiveText" });
  };

  const submitDirective = async () => {
    if (!currentKey) return;
    setBusy(true);
    try {
      const issue = await getIssueByKey(currentKey);
      if (!issue) {
        say(ISSUE_NOT_FOUND, { kind: "menu" });
        return;
      }
      const comment = await addComment(issue.id, directiveCommentHtml(name, directiveText));
      log.record(
        { speaker: "USER", kind: "DIRECTIVE", text: directiveText.trim().slice(0, 200), issueKey: currentKey, commentId: comment.id },
        "now",
      );
      pushScene({ speaker: "USER", kind: "DIRECTIVE", text: directiveText.trim().slice(0, 200), issueKey: currentKey, runId: null, commentId: comment.id });
      setDirectiveText("");
      say(DIRECTIVE_OK, { kind: "menu" });
    } catch (error) {
      const status = errorStatus(error);
      say(status === 403 ? DIRECTIVE_FORBIDDEN : status === 404 ? ISSUE_NOT_FOUND : DIRECTIVE_FAILED, { kind: "menu" });
    } finally {
      setBusy(false);
    }
  };

  const submitAssign = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const run = await createAgentRun({
        issueKey: picked.key,
        ...(instructionOpen && instruction.trim() ? { instruction: instruction.trim() } : {}),
        ...(model !== MODEL_DEFAULT ? { model } : {}),
        personaSlug: persona.slug,
      });
      log.record({ speaker: "USER", kind: "ASSIGN", text: `${picked.key} ${picked.title}`, issueKey: picked.key, runId: run.id }, "now");
      pushScene({ speaker: "USER", kind: "ASSIGN", text: `${picked.key} ${picked.title}`, issueKey: picked.key, runId: run.id, commentId: null });
      say(assignOk(picked.key, budget.killSwitch), { kind: "closing", result: { kind: "assigned", run }, delay: ASSIGN_CLOSE_MS });
    } catch (error) {
      const status = errorStatus(error);
      const u =
        status === 409
          ? ASSIGN_CONFLICT
          : status === 404
            ? ISSUE_NOT_FOUND
            : status === 400
              ? ASSIGN_INACTIVE
              : status === 403
                ? MANAGE_DENIED
                : ASSIGN_FAILED;
      say(u, { kind: "menu" });
    } finally {
      setBusy(false);
    }
  };

  const sendChat = async () => {
    const message = chatText.trim();
    if (!message || busy) return;
    setChatText("");
    say({ text: message, mood: "NORMAL" }, { kind: "chat" }, { speaker: "user" });
    log.record({ speaker: "USER", kind: "SAY", text: message }, "server");
    setBusy(true);
    try {
      const reply = await sendPersonaChat(persona.id, { message, sessionId: sessionId.current, projectId });
      sessionId.current = reply.sessionId;
      log.record({ speaker: "PERSONA", kind: "SAY", text: reply.reply }, "server");
      const mood: Mood = reply.mood === "HAPPY" || reply.mood === "TROUBLED" || reply.mood === "THINKING" ? reply.mood : "NORMAL";
      if (reply.suggest === "DIRECTIVE") setCtx({ kind: "HANDOFF", text: message });
      const turns = chatTurns + 1;
      setChatTurns(turns);
      if (turns >= CHAT_TURN_LIMIT) {
        say({ text: `${reply.reply} ${CHAT_ENOUGH.text}`, mood: CHAT_ENOUGH.mood }, { kind: "menu" });
      } else {
        say({ text: reply.reply, mood }, { kind: "chat" });
      }
    } catch (error) {
      const status = errorStatus(error);
      if (status === 503) say(CHAT_OFF, { kind: "menu" });
      else if (status === 409) say(CHAT_STOPPED, { kind: "menu" });
      else if (status === 429) say(CHAT_SLOW, { kind: "chat" });
      else {
        setChatText(message);
        say(CHAT_FAILED, { kind: "chat" });
      }
    } finally {
      setBusy(false);
    }
  };

  const onEscape = () => {
    if (backlogOpen) {
      setBacklogOpen(false);
      return;
    }
    switch (mode.kind) {
      case "directiveText":
      case "directiveWhere":
      case "directiveConfirm":
      case "assignPick":
      case "assignConfirm":
        setMode({ kind: "menu" });
        return;
      case "exitConfirm":
        setMode(mode.back);
        return;
      case "chat":
        if (chatText.trim() !== "") setMode({ kind: "exitConfirm", back: mode });
        else setMode({ kind: "menu" });
        return;
      case "closing":
        return;
      default:
        requestClose();
    }
  };

  // ── 그리기 ──

  const expression: Mood = busy || mode.kind === "wait" ? "THINKING" : showMenu ? "NORMAL" : (line?.mood ?? "NORMAL");
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (reduced || expression !== "NORMAL") return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        setBlink(true);
        t = setTimeout(() => {
          setBlink(false);
          schedule();
        }, 120);
      }, 3000 + Math.random() * 2000);
    };
    schedule();
    return () => clearTimeout(t);
  }, [expression, reduced]);
  const face: FaceExpression = expression === "NORMAL" && blink ? "BLINK" : expression;
  const running = persona.currentRun?.status === "RUNNING";
  const speakerName = line?.speaker === "user" ? "나" : name;
  const boxY = chatMode ? 42 : 50;
  const boxH = chatMode ? 26 : 18;

  const renderSceneLink = (to: string, label: string) => (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        closeWith({ kind: "navigate", to });
      }}
    >
      {label}
    </a>
  );

  return (
    <div
      className="office-scene"
      style={sceneStyle}
      data-mode={mode.kind}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onEscape();
        }
      }}
    >
      <p id={descId} className="ai-office-sr">
        {firstLine}
      </p>
      <svg
        className="office-scene-svg"
        viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
      >
        {sceneBackgroundPaths().map((p, i) => (
          <path key={i} className={p.cls} d={p.d} />
        ))}
        <g
          key={expression === "HAPPY" ? `hop-${line?.id}` : "bot"}
          className={expression === "HAPPY" ? "office-scene-bot is-happy" : "office-scene-bot"}
          data-expression={face}
          style={vars(avatarVars(persona.slug, persona.role))}
        >
          <PixelSprite paths={facePaths(persona.role, face)} x={64} y={22} />
        </g>
        <PixelSprite paths={spritePaths("TABLE_SMALL", "furn2")} x={44} y={38} />
        {running ? (
          <g className="office-loop office-scene-laptop" data-laptop="on" style={vars({ "--loop": "600ms", "--phase": "0ms" })}>
            <g className="f-a">
              <PixelSprite paths={spritePaths("LAPTOP_ON_A", "laptop")} x={84} y={31} />
            </g>
            <g className="f-b">
              <PixelSprite paths={spritePaths("LAPTOP_ON_B", "laptop")} x={84} y={31} />
            </g>
          </g>
        ) : (
          <g data-laptop="off">
            <PixelSprite paths={spritePaths("LAPTOP_OFF", "laptop")} x={84} y={31} />
          </g>
        )}
        <PixelSprite paths={spritePaths("CUP", "item")} x={54} y={37} />
        <g style={vars(userVars)}>
          <PixelSprite paths={spritePaths("USER_BACK_BUST", "user")} x={22} y={32} />
        </g>
        {expression === "THINKING" ? (
          <g className="office-scene-thinking" data-fx="thinking" transform="translate(78 11)">
            <PixelSprite paths={spritePaths("MB_FRAME", "mb")} />
            {[3, 6, 9].map((x, i) => (
              <path key={x} className="px-mb-K office-scene-dot" style={vars({ "--dot": i })} d={`M${x} 3h2v2h-2z`} />
            ))}
          </g>
        ) : null}
        {expression === "TROUBLED" ? (
          <g className="office-scene-sweat" data-fx="sweat">
            <PixelSprite paths={spritePaths("FX_SWEAT", "fx")} x={81} y={23} />
          </g>
        ) : null}
      </svg>

      <div className="office-scene-el office-scene-header" style={at(2, 1)}>
        <AgentStatusLozenge state={state} />
        {meetingType ? (
          <span className="office-scene-meeting">
            <AgentRunTypeGlyph type={meetingType} size={12} />
            <span>회의 중</span>
          </span>
        ) : null}
        <span className="office-scene-name">
          <AgentRoleGlyph role={persona.role} size={14} />
          <span>{name}</span>
        </span>
      </div>

      <div className="office-scene-el office-scene-tools" style={at(118, 1)}>
        <Tooltip content="대화 기록">
          <Button
            variant="ghost"
            size="small"
            iconOnly
            aria-label="대화 기록"
            aria-pressed={backlogOpen}
            onClick={() => setBacklogOpen((v) => !v)}
          >
            <ScrollText size={16} aria-hidden />
          </Button>
        </Tooltip>
        <Tooltip content="개인 오피스 열기">
          <Button variant="ghost" size="small" iconOnly aria-label="개인 오피스 열기" onClick={() => closeWith({ kind: "panel" })}>
            <PanelRight size={16} aria-hidden />
          </Button>
        </Tooltip>
        <Tooltip content="대화 끝내기">
          <Button variant="ghost" size="small" iconOnly aria-label="대화 끝내기" onClick={requestClose}>
            <X size={16} aria-hidden />
          </Button>
        </Tooltip>
      </div>

      {backlogOpen ? (
        <div className="office-scene-el office-form-panel office-backlog" style={at(3, 8, 150, 40)}>
          <Backlog
            label={logLabel(name)}
            personaName={name}
            history={log.entries}
            scene={sceneLines}
            hasMore={log.hasMore}
            loadingMore={log.loadingMore}
            onMore={log.loadMore}
            links={links}
            renderLink={renderSceneLink}
          />
        </div>
      ) : null}

      {showForm ? (
        <div ref={formRef} className="office-scene-el office-form-panel" style={at(3, 8, 60, 40)}>
          {mode.kind === "directiveText" ? (
            <DirectiveForm
              value={directiveText}
              onChange={setDirectiveText}
              onCancel={() => setMode({ kind: "menu" })}
              onNext={() => say(DIRECTIVE_WHERE, { kind: "directiveWhere" })}
            />
          ) : mode.kind === "directiveConfirm" && currentKey ? (
            <FormBody title="확인">
              <p className="status-cell office-form-summary">
                <MessageSquare size={14} aria-hidden />
                {currentKey}에 코멘트로 남깁니다
              </p>
              <p className="office-form-preview">{directiveText}</p>
              <p className="office-form-notice">{NEXT_STEP_NOTICE}</p>
              <FormActions>
                <Button variant="ghost" size="small" onClick={() => setMode({ kind: "menu" })}>
                  취소
                </Button>
                <Button variant="secondary" size="small" disabled={busy} onClick={() => setMode({ kind: "directiveText" })}>
                  고치기
                </Button>
                <Button variant="primary" size="small" loading={busy} onClick={() => void submitDirective()}>
                  남기기
                </Button>
              </FormActions>
            </FormBody>
          ) : mode.kind === "assignPick" ? (
            <AssignPickForm
              projectId={projectId}
              personas={personas}
              selfId={persona.id}
              query={query}
              onQuery={setQuery}
              picked={picked}
              onPick={setPicked}
              model={model}
              onModel={setModel}
              instruction={instruction}
              onInstruction={setInstruction}
              instructionOpen={instructionOpen}
              onInstructionOpen={setInstructionOpen}
              onCancel={() => setMode({ kind: "menu" })}
              onNext={() => setMode({ kind: "assignConfirm" })}
            />
          ) : mode.kind === "assignConfirm" && picked ? (
            <FormBody title="확인">
              <p className="status-cell office-form-summary">
                <ClipboardCheck size={14} aria-hidden />
                {name}에게 {picked.key} {picked.title}
                {objectJosa(picked.title)} 맡깁니다
              </p>
              <dl className="office-form-dl">
                <dt>모델</dt>
                <dd>{model === MODEL_DEFAULT ? "기본값(프로젝트 정책)" : model}</dd>
                <dt>지시</dt>
                <dd>{instructionOpen && instruction.trim() ? "붙임" : "없음"}</dd>
              </dl>
              {budget.killSwitch ? (
                <Banner variant="warning">킬 스위치가 켜져 있어 지금은 대기열에만 올라가요</Banner>
              ) : budget.monthlyCapUsd !== null && budget.platformMonthToDateUsd >= budget.monthlyCapUsd ? (
                <Banner variant="warning">이달 예산 상한에 도달해 시작되지 않을 수 있어요</Banner>
              ) : null}
              <FormActions>
                <Button variant="ghost" size="small" onClick={() => setMode({ kind: "menu" })}>
                  취소
                </Button>
                <Button variant="secondary" size="small" disabled={busy} onClick={() => setMode({ kind: "assignPick" })}>
                  고치기
                </Button>
                <Button variant="primary" size="small" loading={busy} onClick={() => void submitAssign()}>
                  맡기기
                </Button>
              </FormActions>
            </FormBody>
          ) : mode.kind === "exitConfirm" ? (
            <FormBody title="대화 끝내기">
              <p className="office-form-text">{EXIT_CONFIRM}</p>
              <FormActions>
                <Button variant="secondary" size="small" onClick={() => setMode(mode.back)}>
                  계속하기
                </Button>
                <Button variant="danger" size="small" onClick={() => farewell(true)}>
                  끝내기
                </Button>
              </FormActions>
            </FormBody>
          ) : null}
        </div>
      ) : null}

      {showMenu ? (
        <div className="office-scene-el office-scene-menu" style={at(108, 8, 45)}>
          {mode.kind === "directiveWhere" ? (
            <PixelChoiceMenu ref={menuRef} label={`${name}에게 할 말`} items={whereItems} onChoose={chooseWhere} />
          ) : (
            <PixelChoiceMenu
              ref={menuRef}
              label={`${name}에게 할 말`}
              items={menuItems}
              initialId={ctx ? "ctx" : lastChoice.current}
              onChoose={chooseMenu}
            />
          )}
        </div>
      ) : null}

      <span className="office-scene-el office-dialog-name" style={at(8, boxY - 5)} aria-hidden="true">
        {speakerName}
      </span>
      <div
        ref={boxRef}
        className={chatMode ? "office-scene-el office-dialog-box office-pixel-box is-chat" : "office-scene-el office-dialog-box office-pixel-box"}
        style={at(3, boxY, 150, boxH)}
        tabIndex={0}
        role="group"
        aria-label="대화창 — Enter로 넘기기"
        aria-describedby={pageTextId}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button, input, a")) return;
          advance();
        }}
        onKeyDown={(e) => {
          if ((e.target as HTMLElement) !== boxRef.current) return;
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            skip();
          } else if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            advance();
          }
        }}
      >
        <p className="office-dialog-text" aria-hidden="true">
          {tw.shown}
        </p>
        <span id={pageTextId} className="ai-office-sr">
          {tw.done ? page : ""}
        </span>
        {line && !lastPage ? (
          <Button
            variant="ghost"
            size="small"
            className="office-dialog-skip"
            iconBefore={<FastForward size={12} aria-hidden />}
            onClick={skip}
          >
            건너뛰기
          </Button>
        ) : null}
        {tw.done && (!lastPage || mode.kind === "closing") ? (
          <span className="office-next-arrow" aria-hidden="true">
            <svg viewBox="0 0 7 4" shapeRendering="crispEdges" focusable="false">
              <PixelSprite paths={spritePaths("NEXT_ARROW", "mb")} />
            </svg>
          </span>
        ) : null}
        {chatMode ? (
          <form
            className="office-chat-row"
            onSubmit={(e) => {
              e.preventDefault();
              void sendChat();
            }}
          >
            <TextField
              ref={chatRef}
              label="할 말"
              className="office-chat-field"
              value={chatText}
              maxLength={CHAT_MAX}
              disabled={busy}
              onChange={(e) => setChatText(e.target.value)}
            />
            <Button type="submit" variant="primary" size="small" iconBefore={<Send size={14} aria-hidden />} disabled={busy || !chatText.trim()}>
              보내기
            </Button>
            <Button type="button" variant="ghost" size="small" onClick={() => setMode({ kind: "menu" })}>
              그만
            </Button>
          </form>
        ) : null}
      </div>

      <div className="ai-office-sr" aria-live="polite">
        {live}
      </div>
    </div>
  );
}

function FormBody({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="office-form-body">
      <h3 className="office-form-title">{title}</h3>
      {children}
    </div>
  );
}

function FormActions({ children }: { children: ReactNode }) {
  return <div className="office-form-actions">{children}</div>;
}

function DirectiveForm({
  value,
  onChange,
  onCancel,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  return (
    <FormBody title="지시 내용">
      <TextArea
        label="지시 내용"
        value={value}
        maxLength={INSTRUCTION_MAX}
        placeholder="예: 로그인 실패 메시지는 서버 문구 그대로 보여 주세요"
        description={`${value.length.toLocaleString("ko-KR")} / ${INSTRUCTION_MAX.toLocaleString("ko-KR")}자`}
        onChange={(e) => onChange(e.target.value)}
      />
      <FormActions>
        <Button variant="ghost" size="small" onClick={onCancel}>
          취소
        </Button>
        <Button variant="primary" size="small" disabled={!value.trim()} onClick={onNext}>
          다음
        </Button>
      </FormActions>
    </FormBody>
  );
}

/**
 * 이슈 고르기(§5.4-2) — 빈 검색 = 이 프로젝트의 완료 아닌 이슈 최근 수정순 5개(1회 캐시), 입력하면 250ms 디바운스 검색 →
 * 같은 프로젝트만. 행 = 타입 아이콘 + 키 + 제목 + 상태(아이콘+텍스트), 다른 AI가 작업 중이면 흐리게 + "AI 작업 중".
 */
function AssignPickForm({
  projectId,
  personas,
  selfId,
  query,
  onQuery,
  picked,
  onPick,
  model,
  onModel,
  instruction,
  onInstruction,
  instructionOpen,
  onInstructionOpen,
  onCancel,
  onNext,
}: {
  projectId: string;
  personas: readonly AgentOfficePersona[];
  selfId: string;
  query: string;
  onQuery: (v: string) => void;
  picked: Issue | null;
  onPick: (issue: Issue) => void;
  model: string;
  onModel: (v: string) => void;
  instruction: string;
  onInstruction: (v: string) => void;
  instructionOpen: boolean;
  onInstructionOpen: (v: boolean) => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  const [recent, setRecent] = useState<Issue[] | null>(null);
  const [statuses, setStatuses] = useState<WorkflowStatus[] | undefined>(undefined);
  const [found, setFound] = useState<Issue[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    let alive = true;
    Promise.all([listIssues(projectId), listProjectStatuses(projectId).catch(() => undefined)]).then(
      ([issues, sts]) => {
        if (!alive) return;
        setStatuses(sts);
        setRecent(
          issues
            .filter((i) => statusKind(sts, i.status) !== "complete")
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, 5),
        );
      },
      () => alive && setRecent([]),
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setFound(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let alive = true;
    const t = setTimeout(() => {
      searchIssues(text, 20).then(
        (issues) => {
          if (!alive) return;
          setFound(issues.filter((i) => i.projectId === projectId).slice(0, 5));
          setSearching(false);
        },
        () => {
          if (!alive) return;
          setFound([]);
          setSearching(false);
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, projectId]);

  const rows = found ?? recent ?? [];
  const busyKeys = new Set(personas.filter((p) => p.id !== selfId && p.currentRun?.issueKey).map((p) => p.currentRun!.issueKey!));
  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <FormBody title="이슈 고르기">
      <TextField
        label="이슈 검색"
        placeholder="키나 제목"
        value={query}
        role="combobox"
        aria-expanded={rows.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={rows.length > 0 ? optionId(Math.min(active, rows.length - 1)) : undefined}
        onChange={(e) => {
          onQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(rows.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && rows[active]) {
            e.preventDefault();
            onPick(rows[active]);
          }
        }}
      />
      {recent === null || searching ? (
        <Spinner size="small" label="이슈를 찾는 중" />
      ) : rows.length === 0 ? (
        <p className="office-form-empty">맞는 이슈가 없어요</p>
      ) : (
        <ul id={listId} className="office-issue-list" role="listbox" aria-label="이슈 검색 결과">
          {rows.map((issue, i) => {
            const busy = busyKeys.has(issue.key);
            const selected = picked?.id === issue.id;
            return (
              <li
                key={issue.id}
                id={optionId(i)}
                role="option"
                aria-selected={selected}
                className={[
                  "office-issue-row",
                  i === active ? "is-active" : "",
                  selected ? "is-selected" : "",
                  busy ? "is-busy" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(issue)}
              >
                <IssueTypeGlyph type={issue.type} variant="icon" />
                <span className="office-issue-key">{issue.key}</span>
                <span className="office-issue-title">{issue.title}</span>
                <span className="status-cell office-issue-status">
                  <StatusGlyph status={issue.status} statuses={statuses} variant="icon" />
                  {statusName(statuses, issue.status)}
                </span>
                {busy ? <span className="office-issue-busy">AI 작업 중</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      <Select
        label="모델"
        value={model}
        onValueChange={onModel}
        options={[
          { value: MODEL_DEFAULT, label: "기본값(프로젝트 정책)", icon: <Sparkles size={14} aria-hidden /> },
          ...AGENT_MODEL_OPTIONS.map((m) => ({ value: m, label: m, icon: <Sparkles size={14} aria-hidden /> })),
        ]}
      />
      <Button variant="ghost" size="small" aria-expanded={instructionOpen} onClick={() => onInstructionOpen(!instructionOpen)}>
        지시 붙이기
      </Button>
      {instructionOpen ? (
        <TextArea
          label="지시문"
          value={instruction}
          maxLength={INSTRUCTION_MAX}
          description={`${instruction.length.toLocaleString("ko-KR")} / ${INSTRUCTION_MAX.toLocaleString("ko-KR")}자`}
          onChange={(e) => onInstruction(e.target.value)}
        />
      ) : null}
      <FormActions>
        <Button variant="ghost" size="small" onClick={onCancel}>
          취소
        </Button>
        <Button variant="primary" size="small" disabled={!picked} onClick={onNext}>
          다음
        </Button>
      </FormActions>
    </FormBody>
  );
}

/** 장면 안 백로그(§6.1) — 이전 기록 + 이번 장면 발화, 최신이 아래, 열 때 맨 아래로 */
function Backlog({
  label,
  personaName,
  history,
  scene,
  hasMore,
  loadingMore,
  onMore,
  links,
  renderLink,
}: {
  label: string;
  personaName: string;
  history: readonly AgentDialogEntry[];
  scene: readonly AgentDialogEntry[];
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  links: OfficeLinks;
  renderLink: (to: string, label: string) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, []);
  const rows = [...history, ...scene];
  return (
    <div ref={ref} className="office-backlog-scroll" role="log" aria-label={label}>
      {hasMore ? (
        <Button variant="ghost" size="small" loading={loadingMore} onClick={onMore}>
          이전 기록 더 보기
        </Button>
      ) : null}
      {rows.length === 0 ? <p className="office-form-empty">아직 나눈 대화가 없습니다</p> : null}
      <ol className="office-log-list">
        {rows.map((entry) => (
          <DialogLogRow key={entry.id} entry={entry} personaName={personaName} links={links} renderLink={renderLink} />
        ))}
      </ol>
    </div>
  );
}
