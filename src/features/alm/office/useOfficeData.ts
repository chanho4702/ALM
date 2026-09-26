import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentOffice, AgentPersonaActivity } from "../store/types";
import { fetchOffice, fetchPersonaActivity } from "../store/jiraStore";
import { transitionAnnouncements } from "./officeModel";

/** 사무실 폴링 주기(D-P3a-1) — 실시간 푸시(SSE)는 이번 웨이브 밖 */
export const OFFICE_POLL_MS = 10_000;

export type LoadStatus = "loading" | "ready" | "error";

export interface OfficeData {
  office: AgentOffice | null;
  /** 첫 조회 상태 — error면 보여 줄 데이터가 없다 */
  status: LoadStatus;
  /** 첫 로드 이후 폴링이 실패했다 — 마지막 데이터를 유지하고 배너로 알린다 */
  stale: boolean;
  refreshing: boolean;
  lastUpdated: number | null;
  activity: AgentPersonaActivity | null;
  activityStatus: LoadStatus | "idle";
  /** 새로 승인 대기·차단이 된 페르소나 알림(aria-live) — 폴링마다 갈아 끼운다 */
  announcement: string;
  refresh: () => void;
}

/**
 * 사무실 + (열려 있으면) 개인 오피스 활동을 같은 타이머로 10초마다 함께 조회한다.
 * 탭이 숨겨지면(`document.hidden`) 멈추고, 다시 보이면 즉시 1회 조회 후 재개한다.
 */
export function useOfficeData(projectId: string, personaId: string | null): OfficeData {
  const [office, setOffice] = useState<AgentOffice | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [activity, setActivity] = useState<AgentPersonaActivity | null>(null);
  const [activityStatus, setActivityStatus] = useState<OfficeData["activityStatus"]>("idle");
  const [announcement, setAnnouncement] = useState("");

  const personaRef = useRef(personaId);
  const officeRef = useRef<AgentOffice | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const aliveRef = useRef(true);

  const clearTimer = () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const tick = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    clearTimer();
    setRefreshing(true);
    const pid = personaRef.current;
    const [officeResult, activityResult] = await Promise.allSettled([
      fetchOffice(projectId),
      pid ? fetchPersonaActivity(pid) : Promise.resolve(null),
    ]);
    inFlightRef.current = false;
    if (!aliveRef.current) return;

    if (officeResult.status === "fulfilled") {
      const next = officeResult.value;
      const notes = transitionAnnouncements(officeRef.current, next);
      if (notes.length > 0) setAnnouncement(notes.join(". "));
      officeRef.current = next;
      setOffice(next);
      setStatus("ready");
      setStale(false);
      setLastUpdated(Date.now());
    } else if (officeRef.current) {
      setStale(true);
    } else {
      setStatus("error");
    }

    if (pid && pid === personaRef.current) {
      if (activityResult.status === "fulfilled" && activityResult.value) {
        setActivity(activityResult.value);
        setActivityStatus("ready");
      } else if (activityResult.status === "rejected") {
        setActivityStatus((prev) => (prev === "ready" ? prev : "error"));
      }
    }

    setRefreshing(false);
    if (!document.hidden) timerRef.current = setTimeout(() => void tick(), OFFICE_POLL_MS);
  }, [projectId]);

  useEffect(() => {
    aliveRef.current = true;
    void tick();
    const onVisibility = () => {
      if (document.hidden) clearTimer();
      else void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      aliveRef.current = false;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tick]);

  // 패널 대상이 바뀌면 활동만 즉시 따로 불러온다(다음 폴링부터는 사무실과 함께 간다)
  useEffect(() => {
    personaRef.current = personaId;
    setActivity(null);
    if (!personaId) {
      setActivityStatus("idle");
      return;
    }
    setActivityStatus("loading");
    let cancelled = false;
    fetchPersonaActivity(personaId).then(
      (value) => {
        if (cancelled || personaRef.current !== personaId) return;
        setActivity(value);
        setActivityStatus("ready");
      },
      () => {
        if (cancelled || personaRef.current !== personaId) return;
        setActivityStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [personaId]);

  const refresh = useCallback(() => {
    void tick();
  }, [tick]);

  return {
    office,
    status,
    stale,
    refreshing,
    lastUpdated,
    activity,
    activityStatus,
    announcement,
    refresh,
  };
}
