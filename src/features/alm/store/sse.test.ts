import { describe, expect, it } from "vitest";
import { createSseParser, type SseFrame } from "./sse";

function collect(chunks: string[]) {
  const frames: SseFrame[] = [];
  const comments: string[] = [];
  const parser = createSseParser(
    (f) => frames.push(f),
    (c) => comments.push(c),
  );
  for (const chunk of chunks) parser.push(chunk);
  return { frames, comments };
}

const OFFICE = 'event:office\ndata:{"reason":"run","projectId":7,"at":"2026-09-29T03:00:00.123Z"}\n\n';

describe("SSE 파서(P4c 사무실 스트림)", () => {
  it("서버 형식 그대로 — 주석(:connected·:hb)은 프레임이 아니고, event:office 한 건", () => {
    const { frames, comments } = collect([`:connected\n\n${OFFICE}:hb\n\n`]);
    expect(comments).toEqual(["connected", "hb"]);
    expect(frames).toEqual([
      { event: "office", data: '{"reason":"run","projectId":7,"at":"2026-09-29T03:00:00.123Z"}' },
    ]);
  });

  it("조각 경계가 어디든(필드 이름·값·빈 줄 한가운데) 같은 결과 — 한 글자씩 밀어 넣어도", () => {
    const whole = collect([OFFICE + OFFICE]).frames;
    expect(whole).toHaveLength(2);
    expect(collect(OFFICE.repeat(2).split("")).frames).toEqual(whole);
    expect(collect(["ev", "ent:off", "ice\nda", 'ta:{"reason":"gate"}', "\n", "\n"]).frames).toEqual([
      { event: "office", data: '{"reason":"gate"}' },
    ]);
  });

  it("CRLF·CR 줄 끝 — CR과 LF가 서로 다른 조각으로 와도 빈 줄로 잘못 세지 않는다", () => {
    const crlf = OFFICE.replace(/\n/g, "\r\n");
    expect(collect([crlf]).frames).toHaveLength(1);
    // "\r" | "\n" 이 조각 사이에서 갈라진다 — 줄 하나 끝이지 빈 줄이 아니다
    const split = collect(["event:office\r", "\ndata:x\r", "\n\r", "\n"]);
    expect(split.frames).toEqual([{ event: "office", data: "x" }]);
    expect(collect(["event:office\rdata:y\r\r"]).frames).toEqual([{ event: "office", data: "y" }]);
  });

  it("data 여러 줄은 \\n으로 잇고, 콜론 뒤 공백 1칸만 버린다", () => {
    const { frames } = collect(["event: office\ndata: 첫 줄\ndata:  둘째(공백 하나 남음)\ndata\n\n"]);
    expect(frames).toEqual([{ event: "office", data: "첫 줄\n 둘째(공백 하나 남음)\n" }]);
  });

  it("data 없는 이벤트는 내보내지 않고, event가 없으면 message, retry는 무시", () => {
    const { frames } = collect(["event:office\n\n", "retry:1000\ndata:plain\n\n"]);
    expect(frames).toEqual([{ event: "message", data: "plain" }]);
  });

  it("id는 마지막 이벤트 id로 이어진다 — 다음 id가 올 때까지 뒤 프레임에도 실리고, NUL이 든 id는 버린다", () => {
    const { frames } = collect([
      "id:1729-0\nevent:ready\ndata:{}\n\n",
      "event:issue\ndata:a\n\n",
      "id:1730-1\nevent:issue\ndata:b\n\n",
      "id:bad\0id\nevent:issue\ndata:c\n\n",
    ]);
    expect(frames.map((f) => f.id)).toEqual(["1729-0", "1729-0", "1730-1", "1730-1"]);
    expect(frames[0]).toEqual({ event: "ready", data: "{}", id: "1729-0" });
  });

  it("빈 줄이 오기 전 조각은 내보내지 않는다(다음 조각을 기다린다)", () => {
    const frames: SseFrame[] = [];
    const parser = createSseParser((f) => frames.push(f));
    parser.push('event:office\ndata:{"reason":"audit"}\n');
    expect(frames).toHaveLength(0);
    parser.push("\n");
    expect(frames).toHaveLength(1);
  });
});
