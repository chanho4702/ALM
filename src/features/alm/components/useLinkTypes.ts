import { useEffect, useState } from "react";
import type { LinkTypeDef } from "../store/types";
import { LINK_TYPES_CHANGED_EVENT, listLinkTypes } from "../store/jiraStore";

let pending: Promise<LinkTypeDef[]> | null = null;
const fetchLinkTypes = () => {
  if (!pending) {
    pending = listLinkTypes().finally(() => {
      pending = null;
    });
  }
  return pending;
};

/** 전역 링크 타입 레지스트리 — 이슈 상세의 링크 종류 Select·그룹 제목이 여기서 문구를 읽는다 */
export function useLinkTypes(): LinkTypeDef[] {
  const [linkTypes, setLinkTypes] = useState<LinkTypeDef[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void fetchLinkTypes().then((list) => {
        if (!cancelled) setLinkTypes(list);
      });
    load();
    window.addEventListener(LINK_TYPES_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(LINK_TYPES_CHANGED_EVENT, load);
    };
  }, []);

  return linkTypes;
}
