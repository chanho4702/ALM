import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ConfirmDialog, useToast } from "@chanho/react";
import type { Issue, User } from "../store/types";
import { bulkDeleteIssues, bulkUpdateIssues, cloneIssue, getCurrentUser } from "../store/jiraStore";
import type { BulkIssuePatch } from "../store/jiraStore";

/**
 * 이슈 조작 실행기 — 우클릭 메뉴·명령 팔레트·속성 단축키가 같은 경로로 바꾼다.
 *
 * 필드 변경은 단건이든 여러 건이든 기존 일괄 편집 API(`bulkUpdateIssues`)를 그대로 쓴다 — 전환 규칙·
 * 낙관적 락(목록을 그릴 때 본 버전)·실패 건 분리 보고가 이미 거기 있다. 화면은 결과를 기다리지 않고
 * 먼저 바꿔 보여 주고(낙관적 업데이트), 실패하면 이전 상태로 되돌린 뒤 이유를 토스트로 알린다.
 * 마지막에는 성공·실패와 관계없이 스토어 기준으로 다시 읽어 버전을 맞춘다.
 */
export interface IssueActionRunner {
  update: (targets: Issue[], patch: BulkIssuePatch, successTitle: string) => Promise<void>;
  assignToMe: (targets: Issue[]) => Promise<void>;
  copyKeys: (targets: Issue[]) => Promise<void>;
  copyLinks: (targets: Issue[]) => Promise<void>;
  duplicate: (target: Issue) => Promise<void>;
  /** 삭제 확인 창을 연다(바로 지우지 않는다) */
  requestDelete: (targets: Issue[]) => void;
}

export interface UseIssueActionsOptions {
  /** 화면의 이슈 목록을 바꾸는 함수 — 주면 낙관적으로 먼저 반영한다 */
  setIssues?: (update: (issues: Issue[]) => Issue[]) => void;
  /** 끝난 뒤 스토어 기준 재조회 */
  reload: () => void | Promise<void>;
  /** 삭제가 끝나면(선택 해제·미리보기 닫기 등) */
  onDeleted?: (ids: string[]) => void;
}

/** 일괄 변경 패치를 화면의 이슈 하나에 적용한 모습 — 서버 응답 전 미리 보여 줄 값 */
export function patchIssueLocally(issue: Issue, patch: BulkIssuePatch): Issue {
  let labels = issue.labels;
  if (patch.addLabels?.length) labels = [...new Set([...labels, ...patch.addLabels])];
  if (patch.removeLabels?.length) labels = labels.filter((label) => !patch.removeLabels!.includes(label));
  return {
    ...issue,
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
    ...(patch.sprintId !== undefined ? { sprintId: patch.sprintId } : {}),
    ...(patch.fixVersionId !== undefined ? { fixVersionId: patch.fixVersionId } : {}),
    labels,
  };
}

/** 이슈 상세 링크 — 라우터 basename(`/alm`)을 포함한 절대 주소 */
export function issueLink(issue: Pick<Issue, "key" | "projectId">): string {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return new URL(`${base}projects/${issue.projectId}/issues?issue=${encodeURIComponent(issue.key)}`, window.location.origin).href;
}

/** 대상 묘사 — "ALM-3" 또는 "3개 이슈" */
export function describeTargets(targets: Issue[]): string {
  return targets.length === 1 ? targets[0].key : `${targets.length}개 이슈`;
}

let mePromise: Promise<User> | null = null;
function currentUser(): Promise<User> {
  mePromise ??= getCurrentUser().catch((error: unknown) => {
    mePromise = null;
    throw error;
  });
  return mePromise;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function useIssueActions({ setIssues, reload, onDeleted }: UseIssueActionsOptions): {
  actions: IssueActionRunner;
  dialogs: ReactNode;
} {
  const toast = useToast();
  const [deleting, setDeleting] = useState<Issue[] | null>(null);
  const [busy, setBusy] = useState(false);
  // 실행기는 메뉴·팔레트가 잡아 둔 채 나중에 부를 수 있다 — 최신 콜백을 ref로 읽는다
  const latest = useRef({ setIssues, reload, onDeleted });
  latest.current = { setIssues, reload, onDeleted };

  const update = useCallback(
    async (targets: Issue[], patch: BulkIssuePatch, successTitle: string) => {
      if (targets.length === 0) return;
      const ids = new Set(targets.map((issue) => issue.id));
      const before = new Map(targets.map((issue) => [issue.id, issue]));
      const apply = latest.current.setIssues;
      apply?.((issues) => issues.map((issue) => (ids.has(issue.id) ? patchIssueLocally(issue, patch) : issue)));
      // 낙관적으로 바꾼 값을 이전 값으로 — 그 사이 다른 필드가 바뀌었어도 이 변경만 되돌린다
      const revert = (failedIds: Set<string>) =>
        apply?.((issues) => issues.map((issue) => (failedIds.has(issue.id) ? (before.get(issue.id) ?? issue) : issue)));
      try {
        const result = await bulkUpdateIssues(
          targets.map((issue) => ({ id: issue.id, key: issue.key, version: issue.version })),
          patch,
        );
        if (result.failed.length > 0) {
          revert(new Set(result.failed.map((failure) => failure.id)));
          toast({
            title:
              result.updated > 0
                ? `${result.updated}개는 바꿨고 ${result.failed.length}개는 바꾸지 못했습니다`
                : targets.length === 1
                  ? "바꾸지 못했습니다"
                  : `${result.failed.length}개 이슈를 바꾸지 못했습니다`,
            description: result.failed.map((failure) => `${failure.key}: ${failure.reason}`).join(" · "),
            appearance: "danger",
          });
        } else {
          toast({ title: successTitle, appearance: "success" });
        }
      } catch (error) {
        revert(ids);
        toast({ title: "변경 실패", description: message(error), appearance: "danger" });
      }
      await latest.current.reload();
    },
    [toast],
  );

  const assignToMe = useCallback(
    async (targets: Issue[]) => {
      try {
        const me = await currentUser();
        const pending = targets.filter((issue) => issue.assigneeId !== me.id);
        if (pending.length === 0) {
          toast({ title: "이미 나에게 할당되어 있습니다", appearance: "info" });
          return;
        }
        await update(pending, { assigneeId: me.id }, "나에게 할당했습니다");
      } catch (error) {
        toast({ title: "할당 실패", description: message(error), appearance: "danger" });
      }
    },
    [toast, update],
  );

  const copy = useCallback(
    async (text: string, title: string) => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("이 브라우저는 클립보드 쓰기를 지원하지 않습니다");
        await navigator.clipboard.writeText(text);
        toast({ title, appearance: "success" });
      } catch (error) {
        toast({ title: "복사하지 못했습니다", description: message(error), appearance: "danger" });
      }
    },
    [toast],
  );

  const copyKeys = useCallback(
    (targets: Issue[]) =>
      copy(targets.map((issue) => issue.key).join(", "), targets.length === 1 ? `${targets[0].key}를 복사했습니다` : `키 ${targets.length}개를 복사했습니다`),
    [copy],
  );

  const copyLinks = useCallback(
    (targets: Issue[]) =>
      copy(targets.map(issueLink).join("\n"), targets.length === 1 ? "링크를 복사했습니다" : `링크 ${targets.length}개를 복사했습니다`),
    [copy],
  );

  const duplicate = useCallback(
    async (target: Issue) => {
      try {
        const clone = await cloneIssue(target.id);
        toast({ title: `${clone.key}를 만들었습니다`, description: `${target.key}를 복제했습니다`, appearance: "success" });
      } catch (error) {
        toast({ title: "복제 실패", description: message(error), appearance: "danger" });
      }
      await latest.current.reload();
    },
    [toast],
  );

  const requestDelete = useCallback((targets: Issue[]) => {
    if (targets.length > 0) setDeleting(targets);
  }, []);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const result = await bulkDeleteIssues(deleting.map((issue) => ({ id: issue.id, key: issue.key })));
      toast({
        title: `${result.deleted}개 이슈를 삭제했습니다`,
        appearance: result.failed.length > 0 ? "info" : "success",
      });
      if (result.failed.length > 0) {
        toast({
          title: `${result.failed.length}개는 지우지 못했습니다`,
          description: result.failed.map((failure) => `${failure.key}: ${failure.reason}`).join(" · "),
          appearance: "danger",
        });
      }
      const failed = new Set(result.failed.map((failure) => failure.id));
      latest.current.onDeleted?.(deleting.map((issue) => issue.id).filter((id) => !failed.has(id)));
    } catch (error) {
      toast({ title: "삭제 실패", description: message(error), appearance: "danger" });
    } finally {
      setBusy(false);
      setDeleting(null);
    }
    await latest.current.reload();
  };

  const dialogs = (
    <ConfirmDialog
      open={deleting !== null}
      onOpenChange={(open) => {
        if (!open && !busy) setDeleting(null);
      }}
      title={deleting ? `${describeTargets(deleting)}를 삭제할까요?` : "이슈 삭제"}
      description="하위 작업·코멘트·첨부가 함께 지워지며 되돌릴 수 없습니다."
      confirmLabel="삭제"
      danger
      loading={busy}
      onConfirm={() => void confirmDelete()}
    />
  );

  // 실행기 객체는 매 렌더 새로 만들지 않는다 — 범위(commandScope)·메뉴가 같은 참조를 오래 들고 있어도 된다
  const actionsRef = useRef<IssueActionRunner | null>(null);
  actionsRef.current = { update, assignToMe, copyKeys, copyLinks, duplicate, requestDelete };
  const [actions] = useState<IssueActionRunner>(() => ({
    update: (...args) => actionsRef.current!.update(...args),
    assignToMe: (...args) => actionsRef.current!.assignToMe(...args),
    copyKeys: (...args) => actionsRef.current!.copyKeys(...args),
    copyLinks: (...args) => actionsRef.current!.copyLinks(...args),
    duplicate: (...args) => actionsRef.current!.duplicate(...args),
    requestDelete: (...args) => actionsRef.current!.requestDelete(...args),
  }));

  return { actions, dialogs };
}
