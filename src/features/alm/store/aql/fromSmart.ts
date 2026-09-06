/**
 * 기존 한국어 스마트 구문(`상태:진행중 담당:김찬호 로그인`) → AQL.
 * 스마트 문자열은 `parseSmartQuery`로 `IssueQuery`가 되고, 거기서부터는 기본 모드와 같은 길(`toAql`)을 간다.
 */
import { parseSmartQuery } from "../searchQuery";
import { toAql, type AqlTranslateContext } from "./toAql";

export function fromSmart(smart: string, ctx: AqlTranslateContext): string {
  return toAql(parseSmartQuery(smart, ctx), ctx);
}
