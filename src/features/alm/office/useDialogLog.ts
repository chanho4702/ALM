import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentDialogEntry, AgentDialogEntryInput } from "../store/types";
import { fetchPersonaDialog, savePersonaDialog } from "../store/jiraStore";
import { errorStatus } from "../store/mapping";

/** 서버 POST 1회 상한 */
const SAVE_CHUNK = 20;

/**
 * 구 백엔드(`/dialog` 404)용 메모리 기록(§6.3) — 이 페이지가 떠 있는 동안만. 브라우저 저장소에 두지 않는다
 * (대화 기록은 신뢰할 수 있게 남아야 하는 상태라 로컬 저장은 오해를 만든다). 사무실 페이지가 한 벌 들고 장면·패널이 같이 본다.
 */
export class DialogMemory {
  /** 서버가 대화 기록 API를 모른다(404를 한 번 받았다) */
  unsupported = false;
  private readonly byPersona = new Map<string, AgentDialogEntry[]>();
  private seq = 1;

  list(personaId: string): AgentDialogEntry[] {
    return [...(this.byPersona.get(personaId) ?? [])];
  }

  add(personaId: string, input: AgentDialogEntryInput): AgentDialogEntry {
    const entry: AgentDialogEntry = {
      id: `mem-${this.seq++}`,
      speaker: input.speaker,
      kind: input.kind,
      text: input.text,
      issueKey: input.issueKey ?? null,
      runId: input.runId ?? null,
      commentId: input.commentId ?? null,
      createdAt: new Date().toISOString(),
    };
    const list = this.byPersona.get(personaId) ?? [];
    list.push(entry);
    this.byPersona.set(personaId, list);
    return entry;
  }
}

/** now = 성공 직후 저장(DIRECTIVE·ASSIGN), later = 장면 종료 때 일괄(STATUS), server = 서버가 이미 저장(수다 SAY) */
export type Persist = "now" | "later" | "server";

export interface DialogLog {
  entries: AgentDialogEntry[];
  status: "idle" | "loading" | "ready" | "error";
  /** 서버가 대화 기록을 저장하지 않는다 — 메모리 폴백 중 */
  memoryOnly: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  load: () => void;
  loadMore: () => void;
  record: (input: AgentDialogEntryInput, persist: Persist) => void;
  /** 미뤄 둔 기록(STATUS)을 저장한다 — 장면을 닫을 때 */
  flush: () => Promise<void>;
}

/**
 * 사용자×봇 대화 기록 — 서버(본인 기록만) 또는 메모리 폴백. 조회는 열 때 1회(10초 폴링에 싣지 않는다 — 기록은 본인만 만든다).
 * record는 저장만 한다(이 인스턴스의 목록은 바꾸지 않는다 — 장면은 자기 발화를 따로 쌓는다).
 */
export function useDialogLog(personaId: string | null, memory: DialogMemory): DialogLog {
  const [entries, setEntries] = useState<AgentDialogEntry[]>([]);
  const [status, setStatus] = useState<DialogLog["status"]>("idle");
  const [memoryOnly, setMemoryOnly] = useState(memory.unsupported);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const queue = useRef<AgentDialogEntryInput[]>([]);
  const alive = useRef(true);
  const idRef = useRef(personaId);
  idRef.current = personaId;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    setEntries([]);
    setStatus("idle");
    setHasMore(false);
    queue.current = [];
  }, [personaId]);

  const fallBack = useCallback(
    (id: string) => {
      memory.unsupported = true;
      setMemoryOnly(true);
      setEntries(memory.list(id));
      setHasMore(false);
      setStatus("ready");
    },
    [memory],
  );

  const load = useCallback(() => {
    const id = idRef.current;
    if (!id) return;
    if (memory.unsupported) {
      fallBack(id);
      return;
    }
    setStatus("loading");
    fetchPersonaDialog(id).then(
      (page) => {
        if (!alive.current || idRef.current !== id) return;
        setEntries(page.entries);
        setHasMore(page.hasMore);
        setMemoryOnly(false);
        setStatus("ready");
      },
      (error: unknown) => {
        if (!alive.current || idRef.current !== id) return;
        if (errorStatus(error) === 404) fallBack(id);
        else setStatus("error");
      },
    );
  }, [fallBack, memory]);

  const loadMore = useCallback(() => {
    const id = idRef.current;
    const first = entries[0];
    if (!id || !first || memory.unsupported) return;
    setLoadingMore(true);
    fetchPersonaDialog(id, { before: first.id }).then(
      (page) => {
        if (!alive.current || idRef.current !== id) return;
        setEntries((prev) => [...page.entries, ...prev]);
        setHasMore(page.hasMore);
        setLoadingMore(false);
      },
      () => {
        if (alive.current) setLoadingMore(false);
      },
    );
  }, [entries, memory]);

  const save = useCallback(
    async (id: string, inputs: AgentDialogEntryInput[]) => {
      for (let i = 0; i < inputs.length; i += SAVE_CHUNK) {
        const chunk = inputs.slice(i, i + SAVE_CHUNK);
        if (memory.unsupported) {
          chunk.forEach((input) => memory.add(id, input));
          continue;
        }
        try {
          await savePersonaDialog(id, chunk);
        } catch (error) {
          // 404 = 구 백엔드 — 이후로는 메모리에. 그 밖의 실패는 기록을 버린다(대화 흐름을 막지 않는다)
          if (errorStatus(error) === 404) {
            memory.unsupported = true;
            chunk.forEach((input) => memory.add(id, input));
          }
        }
      }
    },
    [memory],
  );

  const record = useCallback(
    (input: AgentDialogEntryInput, persist: Persist) => {
      const id = idRef.current;
      if (!id) return;
      if (memory.unsupported) {
        memory.add(id, input);
        return;
      }
      if (persist === "now") void save(id, [input]);
      else if (persist === "later") queue.current.push(input);
    },
    [memory, save],
  );

  const flush = useCallback(async () => {
    const id = idRef.current;
    const pending = queue.current;
    queue.current = [];
    if (id && pending.length > 0) await save(id, pending);
  }, [save]);

  return { entries, status, memoryOnly, hasMore, loadingMore, load, loadMore, record, flush };
}
