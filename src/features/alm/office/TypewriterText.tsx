import { useEffect, useRef, useState } from "react";

/** 타자 효과(§4.4 예외 상수) — 글자 30ms, `. ? ! …` 뒤 150ms, 쉼표 뒤 80ms */
export const TYPE_MS = 30;
const PAUSE_END_MS = 150;
const PAUSE_COMMA_MS = 80;

/** 대화창 글꼴(갈무리11 24px) — 폭 측정에 같은 문자열을 쓴다 */
export const DIALOG_FONT = '24px "Galmuri11"';

/** 그래핌 단위로 자른다(이모지·결합 문자를 반으로 쪼개지 않게) */
export function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (t: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return [...new Seg("ko", { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  return [...text];
}

export type Measure = (text: string) => number;

let canvasCtx: CanvasRenderingContext2D | null | undefined;

/**
 * 폭 측정 — `CanvasRenderingContext2D.measureText`(같은 글꼴). 캔버스가 없으면(jsdom 등) 글자 폭 근사:
 * 한글·전각 24px, 그 밖 12px(갈무리11은 반각이 절반 폭).
 */
export function measureText(text: string): number {
  if (canvasCtx === undefined) {
    try {
      const jsdom = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
      canvasCtx = typeof document !== "undefined" && !jsdom ? document.createElement("canvas").getContext("2d") : null;
    } catch {
      canvasCtx = null;
    }
  }
  if (canvasCtx) {
    canvasCtx.font = DIALOG_FONT;
    return canvasCtx.measureText(text).width;
  }
  let w = 0;
  for (const ch of text) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 24 : 12;
  return w;
}

/**
 * 한 발화를 쪽으로 나눈다 — 대화창 안쪽 폭에 맞춰 줄바꿈(공백 우선, 없으면 글자 단위)하고 줄 수 단위로 묶는다.
 * 발화 사이에 쪽을 섞지 않는다(호출자가 발화마다 부른다).
 */
export function paginate(text: string, width: number, linesPerPage: number, measure: Measure = measureText): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/(\s+)/).filter((w) => w.length > 0);
    let line = "";
    const push = () => {
      lines.push(line.trimEnd());
      line = "";
    };
    for (const word of words) {
      if (/^\s+$/.test(word)) {
        if (line !== "") line += word;
        continue;
      }
      if (measure((line + word).trimEnd()) <= width) {
        line += word;
        continue;
      }
      if (line.trim() !== "") push();
      if (measure(word) <= width) {
        line = word;
        continue;
      }
      // 한 단어가 한 줄보다 길다 — 글자 단위로 끊는다
      for (const ch of graphemes(word)) {
        if (line !== "" && measure(line + ch) > width) push();
        line += ch;
      }
    }
    if (line.trim() !== "" || lines.length === 0) push();
  }
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) pages.push(lines.slice(i, i + linesPerPage).join("\n"));
  return pages.length > 0 ? pages : [""];
}

function delayAfter(ch: string): number {
  if (/[.?!…]$/.test(ch)) return PAUSE_END_MS;
  if (/[,，]$/.test(ch)) return PAUSE_COMMA_MS;
  return TYPE_MS;
}

export interface Typewriter {
  /** 지금까지 보이는 글자 */
  shown: string;
  /** 쪽이 다 나왔다 */
  done: boolean;
  /** 타자 중이면 그 쪽을 즉시 완성 */
  complete: () => void;
}

/**
 * 한 쪽의 타자 효과 — `setTimeout` 체인 하나. instant(reduced-motion·사람 발화)면 쪽 전체를 즉시 보인다.
 * page가 바뀌면 처음부터 다시 친다.
 */
export function useTypewriter(page: string, instant: boolean, token: number): Typewriter {
  const [count, setCount] = useState(0);
  const chars = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    chars.current = graphemes(page);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    if (instant) {
      setCount(chars.current.length);
      return;
    }
    setCount(0);
    let n = 0;
    const tick = () => {
      n += 1;
      setCount(n);
      if (n >= chars.current.length) {
        timer.current = null;
        return;
      }
      timer.current = setTimeout(tick, delayAfter(chars.current[n - 1]));
    };
    if (chars.current.length > 0) timer.current = setTimeout(tick, TYPE_MS);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [page, instant, token]);

  const total = graphemes(page).length;
  return {
    shown: graphemes(page).slice(0, Math.min(count, total)).join(""),
    done: count >= total,
    complete: () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      setCount(chars.current.length);
    },
  };
}
