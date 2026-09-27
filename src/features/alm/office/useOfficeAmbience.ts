import { useEffect, useRef, useState, type RefObject } from "react";
import type { AgentMeetingType } from "../store/types";
import type { MicroGlyph } from "./pixel";
import { MICRO_BUBBLE_POOLS, pickWeighted } from "./officeModel";

/**
 * 앰비언트 디렉터(P3e §5.2) — 미니 말풍선·커피 산책·작업 이펙트·고양이 기지개의 "다음 예정 시각"을 한 표에 두고,
 * 가장 이른 것에 맞춰 `setTimeout` 하나만 건다. 10초 폴링과 독립이다: 폴링은 스냅샷만 바꾸고 디렉터는 발화할 때
 * 최신 스냅샷으로 자격을 다시 판정한다(애니가 10초마다 끊기지 않게). 수명 끝(말풍선 2초·이펙트 1.6초·산책 구간)도
 * 같은 표의 예정 항목이다 — jsdom처럼 animationend가 없는 환경에서도 결정적으로 끝난다.
 */

/** 미니 말풍선 수명·간격·동시 상한(§2.5) */
export const BUBBLE_LIFE_MS = 2000;
export const BUBBLE_GAP_MIN_MS = 600;
export const BUBBLE_GAP_SPAN_MS = 800;
export const BUBBLE_MAX = 3;
/** 진행자 가중치 */
const HOST_WEIGHT = 1.5;
/** 커피 산책(§4.1) */
export const STROLL_GAP_MIN_MS = 60_000;
export const STROLL_GAP_SPAN_MS = 60_000;
/** 1타일/초 = 16ap/s → 1ap = 62.5ms */
const STROLL_MS_PER_AP = 1000 / 16;
export const BREW_MS = 1600;
export const HOLD_CUP_MS = 8000;
export const COFFEE_SPOT = { x: 328, y: 18 };
export const CORRIDOR_Y = 26;
/** 작업 이펙트(§4.5) */
export const EFFECT_GAP_MIN_MS = 8000;
export const EFFECT_GAP_SPAN_MS = 7000;
export const EFFECT_LIFE_MS = 1600;
/** 고양이 기지개(§4.6) */
export const CAT_GAP_MIN_MS = 45_000;
export const CAT_GAP_SPAN_MS = 45_000;
export const CAT_STRETCH_MS = 1200;

export type EffectKind = "SWEAT" | "BULB" | "NOTE";

export interface AmbienceSnapshot {
  /** 말풍선을 띄울 수 있는 회의 — 회의 없음·일시 정지(승인 대기·차단)면 null */
  meeting: { type: AgentMeetingType; hostId: string; seatedIds: readonly string[] } | null;
  /** 지금 산책을 시작해도 되는 유휴 봇(회의 참석 아님·선택/hover/focus 아님)과 그 유휴 자리 */
  strollCandidates: readonly { id: string; x: number; y: number }[];
  /** 산책을 계속해도 되는 봇 — IDLE이고 회의 참석이 아닌 사람(선택·hover는 진행 중 산책을 끊지 않는다) */
  idleIds: readonly string[];
  /** 자기 책상에서 RUNNING 중인 봇 — attempt ≥ 2면 땀방울 가중 */
  effectTargets: readonly { id: string; attempt: number }[];
  killSwitch: boolean;
}

export interface MicroBubble {
  id: number;
  personaId: string;
  glyph: MicroGlyph;
}

/**
 * 산책 한 구간 — leg 0 위로(뒷모습) → 1 옆으로 → 2 위로 → 3 커피 머신 앞(뒷모습 정지) → 4 아래로(컵) → 5 옆으로 → 6 아래로
 * → 7 자리에서 컵 든 채 숨쉬기. x·y는 이 구간의 목표 좌표, legMs는 이동 시간(CSS 전이 길이), steps는 2ap당 한 계단.
 */
export interface Stroll {
  personaId: string;
  leg: number;
  x: number;
  y: number;
  legMs: number;
  steps: number;
  facing: "back" | "front";
  walking: boolean;
  cup: boolean;
  home: { x: number; y: number };
}

export interface WorkEffect {
  id: number;
  personaId: string;
  kind: EffectKind;
}

export interface AmbienceState {
  bubbles: MicroBubble[];
  stroll: Stroll | null;
  effect: WorkEffect | null;
  catStretch: boolean;
}

export const EMPTY_AMBIENCE: AmbienceState = { bubbles: [], stroll: null, effect: null, catStretch: false };

const EFFECT_WEIGHTS_RETRY: readonly { value: EffectKind; weight: number }[] = [
  { value: "SWEAT", weight: 70 },
  { value: "BULB", weight: 15 },
  { value: "NOTE", weight: 15 },
];
const EFFECT_WEIGHTS: readonly { value: EffectKind; weight: number }[] = [
  { value: "BULB", weight: 45 },
  { value: "NOTE", weight: 35 },
  { value: "SWEAT", weight: 20 },
];

/** 산책 구간 목표 — home에서 시작하는 직각 3구간 왕복 */
function legTarget(leg: number, home: { x: number; y: number }): { x: number; y: number } {
  switch (leg) {
    case 0:
      return { x: home.x, y: CORRIDOR_Y };
    case 1:
      return { x: COFFEE_SPOT.x, y: CORRIDOR_Y };
    case 2:
    case 3:
      return COFFEE_SPOT;
    case 4:
      return { x: COFFEE_SPOT.x, y: CORRIDOR_Y };
    case 5:
      return { x: home.x, y: CORRIDOR_Y };
    default:
      return home;
  }
}

/**
 * 순수 디렉터 — 타이머는 모르고 "예정 표"만 관리한다. 훅이 `nextDueAt()`에 맞춰 setTimeout 하나를 걸고,
 * 발화하면 `tick()`을 부른다. rng·now는 주입(테스트에서 고정 난수·가짜 시계).
 */
export class AmbienceDirector {
  private due = new Map<string, number>();
  private state: AmbienceState = EMPTY_AMBIENCE;
  private snap: AmbienceSnapshot;
  private seq = 1;
  private lastBubbleTarget: string | null = null;
  private lastStroller: string | null = null;
  private lastEffectTarget: string | null = null;
  private running = false;

  constructor(
    snapshot: AmbienceSnapshot,
    private readonly rng: () => number,
    private readonly now: () => number,
    private readonly onChange: (state: AmbienceState) => void,
  ) {
    this.snap = snapshot;
  }

  get current(): AmbienceState {
    return this.state;
  }

  nextDueAt(): number | null {
    let min: number | null = null;
    for (const t of this.due.values()) if (min === null || t < min) min = t;
    return min;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const t = this.now();
    this.due.set("stroll", t + STROLL_GAP_MIN_MS + this.rng() * STROLL_GAP_SPAN_MS);
    this.due.set("effect", t + EFFECT_GAP_MIN_MS + this.rng() * EFFECT_GAP_SPAN_MS);
    this.due.set("cat", t + CAT_GAP_MIN_MS + this.rng() * CAT_GAP_SPAN_MS);
    if (this.snap.meeting) this.due.set("bubble", t + this.bubbleGap());
  }

  /** 정지 — 예정을 모두 버리고 떠 있던 장식을 즉시 걷는다(탭 숨김·화면 밖·reduced-motion). 재개는 새 간격부터 */
  stop(): void {
    this.running = false;
    this.due.clear();
    this.set(EMPTY_AMBIENCE);
  }

  /** 폴링이 바꾼 스냅샷 — 자격을 잃은 장식만 걷고, 예정 시각은 건드리지 않는다(폴링이 디렉터를 리셋하지 않는다) */
  update(snapshot: AmbienceSnapshot): void {
    this.snap = snapshot;
    if (!this.running) return;
    const t = this.now();
    let next = this.state;
    const meeting = snapshot.meeting;
    if (!meeting) {
      if (next.bubbles.length > 0) next = { ...next, bubbles: [] };
      this.due.delete("bubble");
      for (const key of [...this.due.keys()]) if (key.startsWith("bx:")) this.due.delete(key);
    } else {
      const seated = new Set(meeting.seatedIds);
      const kept = next.bubbles.filter((b) => seated.has(b.personaId));
      if (kept.length !== next.bubbles.length) {
        for (const b of next.bubbles) if (!kept.includes(b)) this.dropBubble(b.id);
        next = { ...next, bubbles: kept };
      }
      if (!this.due.has("bubble")) this.due.set("bubble", t + this.bubbleGap());
    }
    const stroll = next.stroll;
    if (stroll && (snapshot.killSwitch || !snapshot.idleIds.includes(stroll.personaId))) {
      next = { ...next, stroll: null };
      this.endStroll(stroll.personaId, t);
    }
    const effect = next.effect;
    if (effect && (snapshot.killSwitch || !snapshot.effectTargets.some((e) => e.id === effect.personaId))) {
      next = { ...next, effect: null };
      this.due.delete("fxEnd");
    }
    this.set(next);
  }

  /** 예정 시각이 지난 항목을 시각 순으로 처리한다 */
  tick(): void {
    if (!this.running) return;
    const t = this.now();
    for (;;) {
      let key: string | null = null;
      let at = Infinity;
      for (const [k, v] of this.due) {
        if (v <= t && v < at) {
          key = k;
          at = v;
        }
      }
      if (key === null) break;
      this.due.delete(key);
      this.fire(key, t);
    }
  }

  private fire(key: string, t: number): void {
    if (key === "bubble") return this.spawnBubble(t);
    if (key.startsWith("bx:")) {
      const id = Number(key.slice(3));
      return this.set({ ...this.state, bubbles: this.state.bubbles.filter((b) => b.id !== id) });
    }
    if (key === "stroll") return this.startStroll(t);
    if (key === "strollLeg") return this.advanceStroll(t);
    if (key === "effect") return this.spawnEffect(t);
    if (key === "fxEnd") return this.set({ ...this.state, effect: null });
    if (key === "cat") {
      this.due.set("catEnd", t + CAT_STRETCH_MS);
      this.due.set("cat", t + CAT_GAP_MIN_MS + this.rng() * CAT_GAP_SPAN_MS);
      return this.set({ ...this.state, catStretch: true });
    }
    if (key === "catEnd") return this.set({ ...this.state, catStretch: false });
  }

  private bubbleGap(): number {
    return BUBBLE_GAP_MIN_MS + this.rng() * BUBBLE_GAP_SPAN_MS;
  }

  private spawnBubble(t: number): void {
    const meeting = this.snap.meeting;
    if (!meeting) return;
    this.due.set("bubble", t + this.bubbleGap());
    // 가득 차면 이번 스폰은 건너뛴다 — 다음 간격은 이미 다시 뽑았다
    if (this.state.bubbles.length >= BUBBLE_MAX) return;
    const floating = new Set(this.state.bubbles.map((b) => b.personaId));
    const solo = meeting.seatedIds.length === 1;
    const pool = meeting.seatedIds
      .filter((id) => !floating.has(id) && (solo || id !== this.lastBubbleTarget))
      .map((id) => ({ value: id, weight: id === meeting.hostId ? HOST_WEIGHT : 1 }));
    const target = pickWeighted(pool, this.rng);
    if (!target) return;
    const glyph = pickWeighted(MICRO_BUBBLE_POOLS[meeting.type], this.rng) ?? "DOTS";
    const id = this.seq++;
    this.lastBubbleTarget = target;
    this.due.set(`bx:${id}`, t + BUBBLE_LIFE_MS);
    this.set({ ...this.state, bubbles: [...this.state.bubbles, { id, personaId: target, glyph }] });
  }

  private dropBubble(id: number): void {
    this.due.delete(`bx:${id}`);
  }

  private startStroll(t: number): void {
    const candidates = this.snap.killSwitch
      ? []
      : this.snap.strollCandidates.filter((c) => c.id !== this.lastStroller);
    const pick = candidates.length > 0 ? candidates[Math.floor(this.rng() * candidates.length)] : null;
    if (!pick) {
      this.due.set("stroll", t + STROLL_GAP_MIN_MS + this.rng() * STROLL_GAP_SPAN_MS);
      return;
    }
    this.enterLeg(0, pick.id, { x: pick.x, y: pick.y }, { x: pick.x, y: pick.y }, t);
  }

  private enterLeg(leg: number, personaId: string, home: { x: number; y: number }, from: { x: number; y: number }, t: number) {
    const to = legTarget(leg, home);
    const dist = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    const walking = leg !== 3 && leg !== 7;
    const legMs = walking ? Math.round(dist * STROLL_MS_PER_AP) : 0;
    const stay = leg === 3 ? BREW_MS : leg === 7 ? HOLD_CUP_MS : legMs;
    this.due.set("strollLeg", t + stay);
    this.set({
      ...this.state,
      stroll: {
        personaId,
        leg,
        x: to.x,
        y: to.y,
        legMs,
        steps: Math.max(1, Math.round(dist / 2)),
        // 위로 가는 구간·커피 머신 앞은 뒷모습, 옆·아래는 정면(옆모습 스프라이트는 없다)
        facing: leg === 0 || leg === 2 || leg === 3 ? "back" : "front",
        walking,
        cup: leg >= 4,
        home,
      },
    });
  }

  private advanceStroll(t: number): void {
    const stroll = this.state.stroll;
    if (!stroll) return;
    if (stroll.leg >= 7) {
      this.set({ ...this.state, stroll: null });
      this.endStroll(stroll.personaId, t);
      return;
    }
    this.enterLeg(stroll.leg + 1, stroll.personaId, stroll.home, { x: stroll.x, y: stroll.y }, t);
  }

  private endStroll(personaId: string, t: number): void {
    this.lastStroller = personaId;
    this.due.delete("strollLeg");
    this.due.set("stroll", t + STROLL_GAP_MIN_MS + this.rng() * STROLL_GAP_SPAN_MS);
  }

  private spawnEffect(t: number): void {
    this.due.set("effect", t + EFFECT_GAP_MIN_MS + this.rng() * EFFECT_GAP_SPAN_MS);
    if (this.snap.killSwitch || this.state.effect) return;
    const targets = this.snap.effectTargets.filter((e) => e.id !== this.lastEffectTarget);
    if (targets.length === 0) return;
    const target = targets[Math.floor(this.rng() * targets.length)];
    const kind = pickWeighted(target.attempt >= 2 ? EFFECT_WEIGHTS_RETRY : EFFECT_WEIGHTS, this.rng) ?? "BULB";
    this.lastEffectTarget = target.id;
    this.due.set("fxEnd", t + EFFECT_LIFE_MS);
    this.set({ ...this.state, effect: { id: this.seq++, personaId: target.id, kind } });
  }

  private set(next: AmbienceState): void {
    if (next === this.state) return;
    this.state = next;
    this.onChange(next);
  }
}

function systemReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

export interface OfficeAmbienceOptions {
  snapshot: AmbienceSnapshot;
  /** 스테이지 — 화면 밖이면(IntersectionObserver, 임계 0) 멈춘다 */
  stageRef?: RefObject<Element | null>;
  /** false면 시작하지 않는다(첫 데이터 전 등) */
  enabled?: boolean;
  rng?: () => number;
  now?: () => number;
  /** 테스트용 — 기본은 `prefers-reduced-motion` */
  reducedMotion?: boolean;
}

export interface OfficeAmbience extends AmbienceState {
  /** 디렉터가 돌고 있는가(탭 숨김·화면 밖·reduced-motion이면 false) — CSS 루프 정지(`is-offscreen`)에도 쓴다 */
  active: boolean;
  offscreen: boolean;
  reducedMotion: boolean;
}

/**
 * 사무실 장식 디렉터 훅 — reduced-motion이면 시작하지 않고, 탭이 숨거나 스테이지가 화면 밖이면 정지(떠 있던 장식 제거),
 * 돌아오면 새 간격부터 다시 시작한다.
 */
export function useOfficeAmbience({
  snapshot,
  stageRef,
  enabled = true,
  rng = Math.random,
  now = Date.now,
  reducedMotion,
}: OfficeAmbienceOptions): OfficeAmbience {
  const [state, setState] = useState<AmbienceState>(EMPTY_AMBIENCE);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [offscreen, setOffscreen] = useState(false);
  const reduced = reducedMotion ?? systemReducedMotion();
  const directorRef = useRef<AmbienceDirector | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const rngRef = useRef(rng);
  rngRef.current = rng;
  const nowRef = useRef(now);
  nowRef.current = now;

  const active = enabled && !reduced && !hidden && !offscreen;

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const el = stageRef?.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setOffscreen(!entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [stageRef]);

  useEffect(() => {
    if (!active) return;
    const clear = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    const schedule = () => {
      clear();
      const director = directorRef.current;
      const at = director?.nextDueAt();
      if (!director || at === null || at === undefined) return;
      timerRef.current = setTimeout(
        () => {
          director.tick();
          schedule();
        },
        Math.max(0, at - nowRef.current()),
      );
    };
    const director = new AmbienceDirector(snapRef.current, () => rngRef.current(), () => nowRef.current(), (next) => {
      setState(next);
      schedule();
    });
    directorRef.current = director;
    director.start();
    schedule();
    return () => {
      clear();
      director.stop();
      directorRef.current = null;
      setState(EMPTY_AMBIENCE);
    };
  }, [active]);

  useEffect(() => {
    directorRef.current?.update(snapshot);
  }, [snapshot]);

  return { ...state, active, offscreen, reducedMotion: reduced };
}
