// localStorage 목업 스토어 — worklogs (jiraMock.ts에서 분할, 동작 불변)
import type { Worklog } from "../types";
import { CURRENT_USER_ID } from "../../../../mock/users";
import { clone, load, nextId, persist } from "./db";
import { canDeleteOwnedEntry } from "./members";

// ── worklogs ─────────────────────────────────────────────────

/** 작업일 내림차순, 같은 날은 기록 시각 내림차순 */
export async function listWorklogs(issueId: string): Promise<Worklog[]> {
  return clone(
    load()
      .worklogs.filter((w) => w.issueId === issueId)
      .sort((a, b) => b.workedOn.localeCompare(a.workedOn) || b.at.localeCompare(a.at)),
  );
}

export async function addWorklog(
  issueId: string,
  input: { hours: number; comment?: string; workedOn: string },
): Promise<Worklog> {
  const data = load();
  const issue = data.issues.find((i) => i.id === issueId);
  if (!issue) throw new Error("이슈를 찾을 수 없습니다");
  if (!(input.hours > 0)) throw new Error("시간은 0보다 커야 합니다");
  if (!input.workedOn) throw new Error("작업일을 입력하세요");
  const worklog: Worklog = {
    id: nextId(),
    issueId,
    authorId: CURRENT_USER_ID,
    hours: input.hours,
    comment: input.comment?.trim() ?? "",
    workedOn: input.workedOn,
    at: new Date().toISOString(),
  };
  data.worklogs.push(worklog);
  data.activities.push({
    id: nextId(),
    issueId,
    actorId: CURRENT_USER_ID,
    type: "worklog",
    detail: `${input.hours}시간 기록`,
    at: worklog.at,
  });
  persist();
  return clone(worklog);
}

export async function deleteWorklog(id: string): Promise<void> {
  const data = load();
  const index = data.worklogs.findIndex((w) => w.id === id);
  if (index === -1) throw new Error("워크로그를 찾을 수 없습니다");
  if (!canDeleteOwnedEntry(data, data.worklogs[index].authorId, data.worklogs[index].issueId)) {
    throw new Error("본인 워크로그만 삭제할 수 있습니다");
  }
  data.worklogs.splice(index, 1);
  persist();
}
