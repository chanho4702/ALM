import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, relTime } from "./time";

describe("formatDate", () => {
  it("ISO 일시를 yyyy-mm-dd로 (지역 포맷 `2026. 9. 4.` 대신)", () => {
    expect(formatDate("2026-09-04T14:03:00")).toBe("2026-09-04");
  });

  it("이미 yyyy-mm-dd면 그대로 — 마감일은 타임존 이동 없이 통과시킨다", () => {
    expect(formatDate("2026-01-02")).toBe("2026-01-02");
  });

  it("한 자리 월·일을 0으로 채운다", () => {
    expect(formatDate(new Date(2026, 0, 2, 9, 5).toISOString())).toBe("2026-01-02");
  });

  it("파싱할 수 없으면 원문을 돌려준다", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate("언젠가")).toBe("언젠가");
  });
});

describe("formatDateTime", () => {
  it("yyyy-mm-dd HH:MM", () => {
    expect(formatDateTime(new Date(2026, 8, 4, 14, 3).toISOString())).toBe("2026-09-04 14:03");
  });

  it("자정도 0으로 채운다", () => {
    expect(formatDateTime(new Date(2026, 8, 4, 0, 7).toISOString())).toBe("2026-09-04 00:07");
  });

  it("파싱할 수 없으면 원문", () => {
    expect(formatDateTime("nope")).toBe("nope");
  });
});

describe("relTime", () => {
  const now = new Date(2026, 8, 4, 12, 0, 0).getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const MINUTE = 60_000;
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  it("1분 미만은 '방금 전'", () => {
    expect(relTime(ago(30_000), now)).toBe("방금 전");
  });

  it("분·시간 단위는 내림한다", () => {
    expect(relTime(ago(5 * MINUTE), now)).toBe("5분 전");
    expect(relTime(ago(59 * MINUTE + 59_000), now)).toBe("59분 전");
    expect(relTime(ago(3 * HOUR), now)).toBe("3시간 전");
    expect(relTime(ago(23 * HOUR), now)).toBe("23시간 전");
  });

  it("하루 전은 '어제', 그 뒤 6일까지는 'n일 전'", () => {
    expect(relTime(ago(DAY + HOUR), now)).toBe("어제");
    expect(relTime(ago(3 * DAY), now)).toBe("3일 전");
    expect(relTime(ago(6 * DAY), now)).toBe("6일 전");
  });

  it("일주일이 넘으면 날짜로 떨어진다", () => {
    expect(relTime(ago(8 * DAY), now)).toBe("2026-08-27");
  });

  it("파싱할 수 없으면 원문", () => {
    expect(relTime("어제쯤", now)).toBe("어제쯤");
  });
});
