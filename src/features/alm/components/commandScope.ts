import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Issue, User, WorkflowStatus } from "../store/types";
import type { PriorityDef } from "../store/types";
import type { IssueActionRunner } from "./useIssueActions";

/**
 * 명령 팔레트(⌘K)가 "지금 화면의 이슈"를 아는 통로.
 *
 * 팔레트는 전역 셸(AppShell)에 한 번 있고, 이슈는 화면(목록·보드·백로그·상세)이 갖는다. 화면은
 * 자기 범위(선택·커서 이슈, 필드 선택지, 적용 함수)를 여기에 올리고 떠날 때 내린다. 겹치면 마지막에
 * 올린 것이 이긴다 — 목록 위에 이슈 상세가 열리면 상세의 이슈가 "현재 이슈"다.
 *
 * 데이터는 여전히 jiraStore가 정본이다. 이 모듈은 화면 상태를 잠깐 빌려 줄 뿐 아무것도 저장하지 않는다.
 */
export interface IssueFieldOptions {
  statuses: WorkflowStatus[];
  users: User[];
  priorities: PriorityDef[];
  /** 라벨 선택지 — 프로젝트 라벨(서버 DISTINCT) 또는 화면에 보이는 이슈의 라벨 합집합 */
  labels: string[];
}

export interface IssueCommandScope {
  /** 이 범위의 이름 — 팔레트 그룹 설명("ALM-3", "3개 이슈")은 대상에서 만든다 */
  source: "list" | "board" | "backlog" | "detail";
  projectId: string;
  /** 지금 명령이 적용될 이슈 — 다중 선택이 있으면 선택 전부, 없으면 커서·포커스·미리보기 이슈 */
  getTargets: () => Issue[];
  getOptions: () => IssueFieldOptions;
  actions: IssueActionRunner;
  /** 상세 화면이 아닌 곳에서 "이슈 열기" 명령 */
  openIssue?: (key: string) => void;
}

let stack: { id: number; scope: () => IssueCommandScope }[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** 맨 위 범위 — 없으면 null(홈·설정처럼 이슈가 없는 화면) */
export function activeIssueScope(): IssueCommandScope | null {
  const top = stack[stack.length - 1];
  return top ? top.scope() : null;
}

/**
 * 화면이 자기 범위를 올린다. 값은 렌더마다 새로 만들어도 된다 — 최신 값을 ref로 읽어
 * 등록·해제는 마운트·언마운트(그리고 enabled 전환) 때만 일어난다.
 */
export function useIssueCommandScope(scope: IssueCommandScope | null) {
  const latest = useRef(scope);
  latest.current = scope;
  const enabled = scope !== null;
  useEffect(() => {
    if (!enabled) return;
    const id = nextId++;
    stack = [...stack, { id, scope: () => latest.current! }];
    emit();
    return () => {
      stack = stack.filter((entry) => entry.id !== id);
      emit();
    };
  }, [enabled]);
}

// ── 팔레트 열기 요청 — 속성 단축키(s/p/a/l)가 팔레트를 그 필드 하위 페이지로 연다 ──

export type PaletteField = "status" | "priority" | "assignee" | "labels";

export interface PaletteRequest {
  /** 바로 들어갈 필드 페이지 — 없으면 루트 */
  field?: PaletteField;
  /** 요청 순번 — 같은 필드를 다시 눌러도 새 요청으로 본다 */
  seq: number;
}

let request: PaletteRequest | null = null;
let seq = 0;

export function openCommandPalette(field?: PaletteField) {
  seq += 1;
  request = { field, seq };
  emit();
}

export function closeCommandPalette() {
  if (request === null) return;
  request = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 팔레트 호스트가 구독한다 — null이면 닫힘 */
export function usePaletteRequest(): PaletteRequest | null {
  return useSyncExternalStore(subscribe, () => request, () => null);
}

/** 테스트 격리용 */
export function __resetCommandScopeForTest() {
  stack = [];
  request = null;
  emit();
}
