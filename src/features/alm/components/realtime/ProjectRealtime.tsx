import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Badge, Tooltip } from "@chanho/react";
import { Radio, WifiOff } from "lucide-react";
import type { Issue, IssueStreamEvent, ProjectStreamEvent } from "../../store/types";
import { getCurrentUser, getIssueByKey, streamProject } from "../../store/jiraStore";
import { useReconnectingStream } from "../useReconnectingStream";
import type { ReconnectingStreamState } from "../useReconnectingStream";
import "./realtime.css";

/**
 * 프로젝트 실시간 동기화(Linear식) — 프로젝트 화면(ProjectLayout)에 연결 하나. 보드·백로그·목록·상세·미리보기가
 * 구독해 남의 변경을 바로 반영한다. 신호에는 본문이 없다 — 받으면 그 이슈만 REST로 다시 읽는다(권한은 REST가 거른다).
 *
 * 구독자 이벤트: 스트림 이벤트 그대로 + `{ kind: "resync" }`(놓친 신호가 있을 수 있다 — 전체 재조회).
 */
export type RealtimeEvent = ProjectStreamEvent | { kind: "resync"; projectId: string };
type Listener = (event: RealtimeEvent) => void;

interface RealtimeContextValue {
  projectId: string;
  state: ReconnectingStreamState;
  meId: string | null;
  subscribe: (listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const eventIdOf = (event: ProjectStreamEvent) => ("eventId" in event ? event.eventId : null);

export function ProjectRealtimeProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getCurrentUser().then(
      (me) => {
        if (alive) setMeId(me.id);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, []);

  const emit = useCallback((event: RealtimeEvent) => {
    for (const listener of [...listeners.current]) listener(event);
  }, []);

  const connect = useCallback(
    (connection: Parameters<typeof streamProject>[1]) => streamProject(projectId, connection),
    [projectId],
  );

  const state = useReconnectingStream<ProjectStreamEvent>({
    key: projectId,
    connect,
    eventIdOf,
    onEvent: (event) => {
      if (event.kind === "ready") {
        // 이어 줄 수 없었으면(재생 창 밖) 서버가 reset을 실어 보낸다 — 전체 재조회
        if (event.reset) emit({ kind: "resync", projectId });
        return;
      }
      emit(event);
      if (event.kind === "revoked") return "stop";
    },
    onReopen: ({ resumedFrom }) => {
      // 위치(id)가 없었으면 재생을 못 받는다 — 놓쳤을 수 있으니 전체 재조회. 있으면 서버가 이어서 재생한다
      if (!resumedFrom) emit({ kind: "resync", projectId });
    },
  });

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(() => ({ projectId, state, meId, subscribe }), [projectId, state, meId, subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** 실시간 이벤트 구독 — 프로젝트 밖(검색 화면 등)에서는 아무 일도 하지 않는다 */
export function useProjectRealtime(listener: Listener): { state: ReconnectingStreamState | null; meId: string | null } {
  const context = useContext(RealtimeContext);
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  const subscribe = context?.subscribe;
  useEffect(() => {
    if (!subscribe) return;
    return subscribe((event) => latest.current(event));
  }, [subscribe]);
  return { state: context?.state ?? null, meId: context?.meId ?? null };
}

// ── 이슈 신호 판정 — 순수 함수(테스트 대상) ─────────────────────────────

export type IssueEventDecision = "ignore" | "remove" | "refetch" | "reload";

/**
 * 이슈 신호 하나를 어떻게 처리할지 — `known`은 화면이 아는 그 이슈의 가장 높은 version(없으면 undefined).
 * - 삭제·보관 → remove. 순서만 바뀜(ranked) → 그 그룹 순서를 다시 읽어야 해서 reload.
 * - 내 변경의 메아리(actorId = 나)이고 이미 그 version 이상을 갖고 있으면 → ignore(낙관적 반영과 겹치지 않게).
 * - 남의 변경인데 갖고 있는 version이 더 크면 → ignore(늦게 온 옛 신호·역순). 같으면 refetch — 플래그·보드 이동처럼
 *   version을 올리지 않는 변경이 있다.
 */
export function decideIssueEvent(event: IssueStreamEvent, known: number | undefined, meId: string | null): IssueEventDecision {
  if (event.type === "issue.deleted" || event.type === "issue.archived") return "remove";
  if (event.type === "issue.ranked") return event.actorId !== "" && event.actorId === meId ? "ignore" : "reload";
  if (event.version !== null && known !== undefined) {
    const mine = meId !== null && event.actorId === meId;
    if (mine ? known >= event.version : known > event.version) return "ignore";
  }
  return "refetch";
}

// ── 남의 변경 하이라이트 ────────────────────────────────────────────────

const FLASH_MS = 2_400;
const FLASH_ATTR = "data-remote-flash";

/**
 * 그 이슈를 그린 요소(카드·백로그 행·목록 행)에 짧은 하이라이트 — React가 관리하지 않는 data 속성이라 다시 그려도
 * 지워지지 않는다. 표 행은 키 칸이 아니라 행 전체를 칠한다. 동작 줄이기에서는 모션 토큰이 1ms로 줄어든다.
 */
export function flashIssue(issueKey: string): void {
  if (!issueKey) return;
  setTimeout(() => {
    const nodes = document.querySelectorAll<HTMLElement>(`[data-issue-key="${CSS.escape(issueKey)}"]`);
    for (const node of nodes) {
      const target = node.closest<HTMLElement>("tr") ?? node;
      target.setAttribute(FLASH_ATTR, "");
      setTimeout(() => target.removeAttribute(FLASH_ATTR), FLASH_MS);
    }
  }, 0);
}

// ── 목록 동기화 — 보드·백로그·이슈 목록 공용 ──────────────────────────────

export interface UseRealtimeIssueSyncOptions {
  issues: Issue[] | null;
  setIssues: (update: (issues: Issue[]) => Issue[]) => void;
  /** 전체 재조회(순서 변경·스프린트·reset·새 이슈) */
  reload: () => void | Promise<void>;
  /** 이 화면에 들어갈 이슈인가(트리아지 대기열·다른 프로젝트는 뺀다) */
  belongs?: (issue: Issue) => boolean;
  /**
   * patch(기본) — 그 이슈만 다시 읽어 갈아 끼운다(보드·백로그). reload — 화면 조건(필터·정렬·페이지)을 서버가 다시 정해야
   * 하는 화면(이슈 목록)은 신호마다 한 페이지를 다시 읽는다(신호가 몰리면 한 번으로 모은다).
   */
  mode?: "patch" | "reload";
}

const RELOAD_COALESCE_MS = 250;

export function useRealtimeIssueSync({
  issues,
  setIssues,
  reload,
  belongs = (issue) => !issue.triageState,
  mode = "patch",
}: UseRealtimeIssueSyncOptions) {
  const issuesRef = useRef(issues);
  issuesRef.current = issues;
  const latest = useRef({ setIssues, reload, belongs });
  latest.current = { setIssues, reload, belongs };
  /** 이슈 id → 본 가장 높은 version(신호 순서가 뒤집혀도 옛 값을 다시 쓰지 않게) */
  const seen = useRef(new Map<string, number>());
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(new Map<string, Promise<void>>());

  useEffect(
    () => () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    },
    [],
  );

  const scheduleReload = () => {
    if (reloadTimer.current) return;
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null;
      void latest.current.reload();
    }, RELOAD_COALESCE_MS);
  };

  const { state, meId } = useProjectRealtime((event) => {
    if (event.kind === "resync" || event.kind === "reset" || event.kind === "sprint" || event.kind === "revoked") {
      scheduleReload();
      return;
    }
    if (event.kind !== "issue") return;
    const local = issuesRef.current?.find((issue) => issue.id === event.issueId);
    const known = Math.max(local?.version ?? -1, seen.current.get(event.issueId) ?? -1);
    const decision = decideIssueEvent(event, known < 0 ? undefined : known, meId);
    if (decision === "ignore") return;
    if (event.version !== null) seen.current.set(event.issueId, Math.max(known, event.version));
    const remote = event.actorId !== meId;
    if (decision === "remove") {
      latest.current.setIssues((list) => list.filter((issue) => issue.id !== event.issueId));
      return;
    }
    if (decision === "reload" || mode === "reload") {
      scheduleReload();
      if (remote) flashIssue(event.issueKey);
      return;
    }
    // refetch — 같은 이슈 신호가 몰리면 요청 하나로
    if (inflight.current.has(event.issueId)) return;
    const work = (async () => {
      const fresh = event.issueKey ? await getIssueByKey(event.issueKey) : null;
      if (!fresh) {
        latest.current.setIssues((list) => list.filter((issue) => issue.id !== event.issueId));
        return;
      }
      seen.current.set(fresh.id, Math.max(seen.current.get(fresh.id) ?? -1, fresh.version));
      const present = issuesRef.current?.some((issue) => issue.id === fresh.id) ?? false;
      if (!latest.current.belongs(fresh)) {
        if (present) latest.current.setIssues((list) => list.filter((issue) => issue.id !== fresh.id));
        return;
      }
      if (!present) {
        // 새 이슈(남이 만들었거나 이 화면 조건에 새로 들어옴) — 자리(순서·페이지)는 서버가 정한다
        scheduleReload();
      } else {
        latest.current.setIssues((list) => list.map((issue) => (issue.id === fresh.id ? fresh : issue)));
      }
      if (remote) flashIssue(fresh.key);
    })()
      .catch(() => scheduleReload())
      .finally(() => inflight.current.delete(event.issueId));
    inflight.current.set(event.issueId, work);
  });
  return { state, meId };
}

// ── 연결 상태 배지 ──────────────────────────────────────────────────────

/** 프로젝트 헤더의 작은 연결 표시 — 끊기면 배지, 연결 중이면 조용한 "실시간" 점, 스트림이 없으면 아무것도 */
export function RealtimeStatusBadge() {
  const context = useContext(RealtimeContext);
  if (!context) return null;
  const { state } = context;
  if (state === "live") {
    return (
      <Tooltip content="다른 사람의 변경이 바로 반영됩니다">
        <span className="realtime-status is-live" role="status" aria-label="실시간 연결됨">
          <Radio size={12} aria-hidden />
          <span>실시간</span>
        </span>
      </Tooltip>
    );
  }
  if (state === "offline") {
    return (
      <span className="realtime-status is-offline" role="status">
        <Badge appearance="danger">
          <WifiOff size={12} aria-hidden /> 실시간 끊김 — 다시 연결 중
        </Badge>
      </span>
    );
  }
  if (state === "stopped") {
    return (
      <span className="realtime-status is-offline" role="status">
        <Badge appearance="neutral">
          <WifiOff size={12} aria-hidden /> 실시간 꺼짐
        </Badge>
      </span>
    );
  }
  return null;
}
