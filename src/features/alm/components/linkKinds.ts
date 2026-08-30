import type { LinkTypeDef } from "../store/types";

/** 링크 종류 Select 값 — `{typeId}:out`(나가는 방향) / `{typeId}:in`(들어오는 방향). 대칭 타입은 out만 */
export type LinkKind = string;
export const LINK_KIND_DEFAULT: LinkKind = "blocks:out";

export function linkKindOptions(types: LinkTypeDef[]): { value: LinkKind; label: string }[] {
  const options: { value: LinkKind; label: string }[] = [];
  for (const t of types) {
    options.push({ value: `${t.id}:out`, label: t.outward });
    if (t.inward !== t.outward) options.push({ value: `${t.id}:in`, label: t.inward });
  }
  return options.length > 0 ? options : [{ value: LINK_KIND_DEFAULT, label: "차단함" }];
}

export function parseLinkKind(kind: LinkKind): { type: string; inbound: boolean } {
  const [type, dir] = kind.split(":");
  return { type, inbound: dir === "in" };
}
