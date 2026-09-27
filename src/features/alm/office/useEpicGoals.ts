import { useCallback, useEffect, useRef, useState } from "react";
import type { Issue, IssueTypeDef, WorkflowStatus } from "../store/types";
import { listIssues, listIssueTypes, listProjectStatuses } from "../store/jiraStore";

/** 목표 재조회 주기(P3e §3.4) — 이슈 목록은 무겁고 자주 안 바뀐다. 사무실 10초 폴링과 분리 */
export const GOALS_POLL_MS = 60_000;

export interface EpicGoalsData {
  status: "idle" | "loading" | "ready" | "error";
  issues: Issue[];
  statuses: WorkflowStatus[];
  types: IssueTypeDef[];
  /** 한 번이라도 불러왔는가 — 게시판 버튼 접근 이름의 "진행 중 목표 n개"는 그 뒤에만 붙는다 */
  loaded: boolean;
  retry: () => void;
}

/**
 * 게시판 "지금 만드는 것"의 원자료 — 게시판 패널을 열 때 1회, 열려 있는 동안 60초마다 다시 부른다.
 * 탭이 숨으면 멈추고 다시 보이면 즉시 1회. 닫아도 마지막 값은 남긴다(접근 이름의 목표 수).
 */
export function useEpicGoals(projectId: string, open: boolean): EpicGoalsData {
  const [status, setStatus] = useState<EpicGoalsData["status"]>("idle");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [types, setTypes] = useState<IssueTypeDef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setStatus((prev) => (prev === "ready" ? prev : "loading"));
    try {
      const [issueList, statusList, typeList] = await Promise.all([
        listIssues(projectId),
        listProjectStatuses(projectId),
        listIssueTypes(),
      ]);
      if (mine !== generation.current) return;
      setIssues(issueList);
      setStatuses(statusList);
      setTypes(typeList);
      setLoaded(true);
      setStatus("ready");
    } catch {
      if (mine !== generation.current) return;
      setStatus("error");
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const tick = async () => {
      clear();
      await load();
      if (!cancelled && !document.hidden) timer = setTimeout(() => void tick(), GOALS_POLL_MS);
    };
    void tick();
    const onVisibility = () => {
      if (document.hidden) clear();
      else void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      generation.current += 1;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [open, load]);

  const retry = useCallback(() => {
    setStatus("loading");
    void load();
  }, [load]);

  return { status, issues, statuses, types, loaded, retry };
}
