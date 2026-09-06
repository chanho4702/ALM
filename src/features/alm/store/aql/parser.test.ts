import { describe, expect, it } from "vitest";
import { parseAql } from "./parser";
import { validate } from "./validate";
import { AqlError } from "./types";

/**
 * 파서 계약 — 스펙 §6 벡터.
 *
 * 여기 적힌 JSON 문자열은 서버 `alm-backend`의 `AqlParserTest`에서 **그대로 옮겨 온 것**이다.
 * 두 구현이 갈라지면 이 문자열이 먼저 어긋난다. 키 순서까지 계약이라 `toEqual`이 아니라
 * `JSON.stringify`로 대조한다(같은 예시가 alm-backend README의 AQL 절에도 있다).
 */
const ast = (aql: string) => JSON.stringify(parseAql(aql));

describe("AQL 파서 — §6 벡터 (서버 AqlParserTest와 글자까지 같다)", () => {
  it("벡터1 AND와 함수", () => {
    expect(ast('status = "진행 중" AND assignee = currentUser()')).toBe(
      '{"where":{"kind":"and","children":[' +
        '{"kind":"compare","field":"status","operator":"=","value":{"type":"string","value":"진행 중"}},' +
        '{"kind":"compare","field":"assignee","operator":"=","value":{"type":"function","name":"currentUser","args":[]}}' +
        ']},"orderBy":[]}',
    );
  });

  it("벡터2 괄호와 OR와 ORDER BY 두 개 — 상대 날짜는 ident다", () => {
    expect(
      ast("project = ALM AND (priority >= high OR due <= +3d) ORDER BY due ASC, priority DESC"),
    ).toBe(
      '{"where":{"kind":"and","children":[' +
        '{"kind":"compare","field":"project","operator":"=","value":{"type":"ident","value":"ALM"}},' +
        '{"kind":"or","children":[' +
        '{"kind":"compare","field":"priority","operator":">=","value":{"type":"ident","value":"high"}},' +
        '{"kind":"compare","field":"due","operator":"<=","value":{"type":"ident","value":"+3d"}}]}' +
        ']},"orderBy":[{"field":"due","direction":"asc"},{"field":"priority","direction":"desc"}]}',
    );
  });

  it("벡터3 IN과 NOT", () => {
    expect(ast('labels IN (backend, "api v2") AND NOT type = 버그')).toBe(
      '{"where":{"kind":"and","children":[' +
        '{"kind":"in","field":"labels","negated":false,"values":[' +
        '{"type":"ident","value":"backend"},{"type":"string","value":"api v2"}]},' +
        '{"kind":"not","child":{"kind":"compare","field":"type","operator":"=",' +
        '"value":{"type":"ident","value":"버그"}}}' +
        ']},"orderBy":[]}',
    );
  });

  it("벡터4 IS EMPTY와 부등", () => {
    expect(ast("sprint IS EMPTY AND statusCategory != complete")).toBe(
      '{"where":{"kind":"and","children":[' +
        '{"kind":"empty","field":"sprint","negated":false},' +
        '{"kind":"compare","field":"statusCategory","operator":"!=",' +
        '"value":{"type":"ident","value":"complete"}}' +
        ']},"orderBy":[]}',
    );
  });

  it("벡터5 AND 셋은 한 노드로 평탄화된다", () => {
    expect(ast("text ~ 결제 AND created >= startOfMonth() AND assignee IS NOT EMPTY")).toBe(
      '{"where":{"kind":"and","children":[' +
        '{"kind":"compare","field":"text","operator":"~","value":{"type":"ident","value":"결제"}},' +
        '{"kind":"compare","field":"created","operator":">=",' +
        '"value":{"type":"function","name":"startOfMonth","args":[]}},' +
        '{"kind":"empty","field":"assignee","negated":true}' +
        ']},"orderBy":[]}',
    );
  });

  it("벡터6 별칭은 쓴 그대로 담기고 정규화는 해석이 한다", () => {
    expect(ast("상태 = 완료 AND 담당자 = 김찬호")).toBe(
      '{"where":{"kind":"and","children":[' +
        '{"kind":"compare","field":"상태","operator":"=","value":{"type":"ident","value":"완료"}},' +
        '{"kind":"compare","field":"담당자","operator":"=","value":{"type":"ident","value":"김찬호"}}' +
        ']},"orderBy":[]}',
    );
  });

  it("벡터7 방향을 안 쓰면 asc이고 상대 날짜는 ident다", () => {
    expect(ast("resolution IS EMPTY AND updated < -14d ORDER BY updated")).toBe(
      '{"where":{"kind":"and","children":[' +
        '{"kind":"empty","field":"resolution","negated":false},' +
        '{"kind":"compare","field":"updated","operator":"<","value":{"type":"ident","value":"-14d"}}' +
        ']},"orderBy":[{"field":"updated","direction":"asc"}]}',
    );
  });

  it("빈 질의는 조건도 정렬도 없다", () => {
    expect(ast("")).toBe('{"where":null,"orderBy":[]}');
    expect(ast("   ")).toBe('{"where":null,"orderBy":[]}');
    expect(ast("ORDER BY key DESC")).toBe(
      '{"where":null,"orderBy":[{"field":"key","direction":"desc"}]}',
    );
  });

  it("AND가 OR보다 강하게 묶인다", () => {
    const json = ast("status = a OR status = b AND status = c");
    expect(json).toContain('"kind":"or"');
    expect(json).toContain(
      '{"kind":"and","children":[{"kind":"compare","field":"status",' +
        '"operator":"=","value":{"type":"ident","value":"b"}}',
    );
  });

  it("키워드는 대소문자를 가리지 않는다", () => {
    expect(ast("status = a and priority = b order by key desc")).toBe(
      ast("status = a AND priority = b ORDER BY key DESC"),
    );
    expect(ast("sprint is not empty")).toBe(ast("sprint IS NOT EMPTY"));
    expect(ast("labels not in (a)")).toBe(ast("labels NOT IN (a)"));
  });

  it("숫자와 낱말을 가른다 — 낱말 전체가 수일 때만 number", () => {
    expect(ast("estimate > 3.5")).toContain('"value":{"type":"number","value":"3.5"}');
    expect(ast("due = 2026-09-06")).toContain('"value":{"type":"ident","value":"2026-09-06"}');
    expect(ast("fixVersion = 1.0")).toContain('"value":{"type":"number","value":"1.0"}');
  });

  it("괄호가 붙지 않으면 함수가 아니다", () => {
    expect(() => parseAql("status = done (x)")).toThrow(/여기서 끝나야 합니다/);
  });

  it("함수 인자도 값이다", () => {
    expect(ast("created >= startOfDay(-3)")).toContain(
      '"value":{"type":"function","name":"startOfDay","args":[{"type":"number","value":"-3"}]}',
    );
  });
});

describe("AQL 파서 — 문법 오류 계약", () => {
  const failure = (input: string) => {
    try {
      parseAql(input);
    } catch (error) {
      if (error instanceof AqlError) {
        return { message: error.message, position: error.position, expected: error.expected };
      }
      throw error;
    }
    throw new Error(`오류가 나야 하는 입력인데 통과했다: ${input}`);
  };

  it("이중 등호는 위치 7이다", () => {
    expect(failure("status == done")).toEqual({
      message: "연산자를 모릅니다: ==",
      position: 7,
      expected: ["=", "!="],
    });
  });

  it("값이 없으면 입력 끝을 가리킨다", () => {
    expect(failure("status = ")).toMatchObject({ message: "값이 필요합니다", position: 9 });
  });

  it("괄호가 안 닫히면 끝자리를 가리킨다", () => {
    expect(failure("(status = done")).toEqual({
      message: "괄호를 닫아야 합니다",
      position: 14,
      expected: [")"],
    });
  });

  it("따옴표를 안 닫으면 여는 따옴표를 가리킨다", () => {
    expect(failure('status = "진행')).toMatchObject({
      message: "따옴표를 닫아야 합니다",
      position: 9,
    });
  });

  it("느낌표 하나만 쓰면 연산자를 모른다", () => {
    expect(failure("status ! done")).toMatchObject({
      message: "연산자를 모릅니다: !",
      position: 7,
    });
  });

  it("깊이 50단계를 넘으면 스택이 터지기 전에 막는다 (괄호·NOT 공통)", () => {
    const deep = (n: number) => "(".repeat(n) + "status = done" + ")".repeat(n);
    expect(() => parseAql(deep(50))).not.toThrow();
    // 상한을 넘긴 그 여는 괄호를 짚는다(51번째 = 인덱스 50)
    expect(failure(deep(51))).toMatchObject({
      message: "너무 깊게 중첩됐습니다 (최대 50단계)",
      position: 50,
    });
    expect(failure("NOT ".repeat(51) + "status = done")).toMatchObject({
      message: "너무 깊게 중첩됐습니다 (최대 50단계)",
    });
  });

  it("예약어는 필드 자리에 올 수 없다", () => {
    expect(failure("and = done")).toMatchObject({ message: "필드가 필요합니다: and", position: 0 });
  });
});

describe("AQL 검증 — 필드·연산자·정렬 (해석 단계)", () => {
  const failure = (input: string) => {
    const result = validate(input);
    if (result.ok) throw new Error(`오류가 나야 하는 입력인데 통과했다: ${input}`);
    return { message: result.error, position: result.position };
  };

  it("모르는 필드는 필드 자리를 짚는다", () => {
    expect(failure("statuss = done")).toEqual({ message: "필드를 모릅니다: statuss", position: 0 });
  });

  it("'~'는 텍스트 필드에만", () => {
    expect(failure("priority ~ high")).toEqual({
      message: "'~'는 텍스트 필드에만 쓸 수 있습니다 (priority)",
      position: 9,
    });
  });

  it("'>'는 날짜·숫자 필드에만", () => {
    expect(failure("status > done")).toEqual({
      message: "'>'는 날짜·숫자 필드에만 쓸 수 있습니다 (status)",
      position: 7,
    });
  });

  it("text는 포함 검색만 — '='를 쓰면 '~'를 알려준다", () => {
    expect(failure("text = 결제")).toEqual({
      message: "'='는 text 필드에 쓸 수 없습니다 — 포함 검색은 '~'입니다",
      position: 5,
    });
  });

  it("값이 늘 있는 필드에는 IS EMPTY를 쓸 수 없다", () => {
    expect(failure("status IS EMPTY")).toEqual({
      message: "'IS EMPTY'는 status 필드에 쓸 수 없습니다",
      position: 7,
    });
  });

  it("해결일은 아직 없는 필드다 — 다른 값으로 대신 답하지 않는다", () => {
    expect(failure("resolved >= -7d")).toEqual({
      message: "아직 지원하지 않는 필드입니다: resolved",
      position: 0,
    });
  });

  it("정렬할 수 없는 필드", () => {
    expect(failure("ORDER BY project")).toEqual({
      message: "정렬할 수 없는 필드입니다: project",
      position: 9,
    });
  });

  it("별칭으로 써도 검증되고, 쓰인 필드는 정식명으로 모인다", () => {
    expect(validate("상태 = 완료 AND 담당자 IS EMPTY ORDER BY 마감일")).toEqual({
      ok: true,
      fields: ["status", "assignee", "due"],
    });
  });

  it("값이 실재하는지는 보지 않는다 (실행에서 걸린다)", () => {
    expect(validate("status = 없는상태")).toMatchObject({ ok: true });
  });

  it("4000자를 넘으면 자리를 짚지 않고 메시지만 낸다 (요청 검증이라 position이 없다)", () => {
    const long = `summary ~ "${"가".repeat(4000)}"`;
    const result = validate(long);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("AQL은 4000자 이하여야 합니다");
    expect(result.position).toBeUndefined();
  });
});
