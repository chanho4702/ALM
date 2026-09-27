import type { ReactNode } from "react";
import { ClipboardCheck, MessageSquare } from "lucide-react";
import type { AgentDialogEntry } from "../store/types";
import { formatClock } from "../components/time";
import { objectJosa } from "./officeDialogCopy";
import type { OfficeLinks } from "./OfficePanel";

/**
 * 대화 기록 한 줄(§6.1) — `HH:mm`(mono) · 화자(나 / 이름) · 본문. 지시는 MessageSquare + "{키}에 지시를 남겼어요" + 키 링크,
 * 맡기기는 ClipboardCheck + "{키}를 맡겼어요" + 실행 링크(아이콘+텍스트). 링크는 호출자가 그린다(장면은 닫고 이동, 패널은 라우터 링크).
 */
export function DialogLogRow({
  entry,
  personaName,
  links,
  renderLink,
}: {
  entry: AgentDialogEntry;
  personaName: string;
  links: OfficeLinks;
  renderLink: (to: string, label: string) => ReactNode;
}) {
  const who = entry.speaker === "USER" ? "나" : personaName;
  let body: ReactNode = entry.text;
  if (entry.kind === "DIRECTIVE" && entry.issueKey) {
    body = (
      <>
        <span className="status-cell office-log-kind">
          <MessageSquare size={12} aria-hidden />
          {renderLink(links.issue(entry.issueKey), entry.issueKey)}에 지시를 남겼어요
        </span>
        {entry.text ? <span className="office-log-quote">{entry.text}</span> : null}
      </>
    );
  } else if (entry.kind === "ASSIGN" && entry.issueKey) {
    const label = `${entry.issueKey}${objectJosa(entry.issueKey)} 맡겼어요`;
    body = (
      <span className="status-cell office-log-kind">
        <ClipboardCheck size={12} aria-hidden />
        {entry.runId ? renderLink(links.run(entry.runId), label) : label}
      </span>
    );
  }
  return (
    <li className="office-log-row" data-kind={entry.kind}>
      <time className="office-log-time" dateTime={entry.createdAt}>
        {formatClock(entry.createdAt)}
      </time>
      <span className="office-log-who">{who}</span>
      <span className="office-log-body">{body}</span>
    </li>
  );
}

/** 날짜 묶음 제목 — 오늘 / 어제 / M월 d일 */
export function dayHeading(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  const today = new Date(now);
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "오늘";
  if (d.toDateString() === yesterday.toDateString()) return "어제";
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 오늘 이미 대화했는가 — 인사 앞 "또 오셨네요!" */
export function metToday(entries: readonly AgentDialogEntry[], now: number = Date.now()): boolean {
  const today = new Date(now).toDateString();
  return entries.some((e) => new Date(e.createdAt).toDateString() === today);
}
