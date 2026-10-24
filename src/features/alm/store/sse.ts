/**
 * text/event-stream 파서(HTML 표준 "Interpreting an event stream" 규칙) — fetch 스트리밍으로 받은 조각을
 * 그대로 밀어 넣는다. 조각 경계는 줄·필드 한가운데, CRLF의 CR과 LF 사이 어디든 올 수 있다.
 *
 * - 줄 끝: LF · CR · CRLF. 빈 줄이 이벤트를 끝낸다.
 * - `:`로 시작하는 줄은 주석(`:connected`·`:hb`) — `onComment`로만 알린다.
 * - `field:value`(콜론 뒤 공백 1칸은 버린다), 콜론이 없으면 필드명만(값 빈 문자열).
 * - `data`가 여러 줄이면 `\n`으로 잇는다. data가 한 줄도 없는 이벤트는 내보내지 않는다.
 * - `event`가 없으면 `message`. `id`는 "마지막 이벤트 id"로 기억해 그 뒤 프레임마다 싣는다(표준: 다음 id가 올 때까지
 *   이어진다 — 재연결 `Last-Event-ID`의 원천). NUL이 든 id는 버린다. `retry`는 재연결을 훅이 정하므로 무시한다.
 */
export interface SseFrame {
  event: string;
  data: string;
  /** 마지막으로 받은 id — 한 번도 없었으면 생략 */
  id?: string;
}

export interface SseParser {
  push(chunk: string): void;
}

export function createSseParser(onFrame: (frame: SseFrame) => void, onComment?: (text: string) => void): SseParser {
  let buffer = "";
  // 직전 조각이 CR로 끝났다 — 다음 조각 첫 LF는 같은 줄 끝(CRLF)이라 버린다
  let pendingCr = false;
  let event = "";
  let data: string[] = [];
  let lastId: string | undefined;

  const dispatch = () => {
    if (data.length > 0) {
      const frame: SseFrame = { event: event || "message", data: data.join("\n") };
      if (lastId !== undefined) frame.id = lastId;
      onFrame(frame);
    }
    event = "";
    data = [];
  };

  const line = (text: string) => {
    if (text === "") {
      dispatch();
      return;
    }
    if (text.startsWith(":")) {
      onComment?.(text.slice(1));
      return;
    }
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id" && !value.includes("\0")) lastId = value;
  };

  return {
    push(chunk: string) {
      let text = chunk;
      if (pendingCr && text.startsWith("\n")) text = text.slice(1);
      pendingCr = false;
      buffer += text;
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i];
        if (ch !== "\n" && ch !== "\r") continue;
        line(buffer.slice(start, i));
        if (ch === "\r") {
          if (i + 1 < buffer.length) {
            if (buffer[i + 1] === "\n") i++;
          } else {
            pendingCr = true;
          }
        }
        start = i + 1;
      }
      buffer = buffer.slice(start);
    },
  };
}
