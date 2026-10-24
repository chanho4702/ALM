import { useState } from "react";
import type { ReactNode } from "react";
import { Banner, useToast } from "@chanho/react";
import type { CompleteSprintOptions, Sprint, SprintCompletion } from "../store/types";
import { completeSprint, listSprints } from "../store/jiraStore";
import "./inlineCreate.css";

/** 완료 결과 문장 — "미완료 3건을 Sprint 4(으)로 이월했습니다 · 새 스프린트 Sprint 4를 자동으로 만들었습니다" */
export function describeCompletion(result: SprintCompletion, sprints: Pick<Sprint, "id" | "name">[]): string {
  const carry = result.carryOver;
  if (!carry) return `${result.name}을(를) 완료했습니다`;
  const name = (id: string | null) => sprints.find((s) => s.id === id)?.name ?? "다음 스프린트";
  const parts: string[] = [];
  if (carry.movedCount === 0) parts.push("미완료 이슈가 없습니다");
  else if (carry.target === "sprint") parts.push(`미완료 ${carry.movedCount}건을 ${name(carry.sprintId)}(으)로 이월했습니다`);
  else parts.push(`미완료 ${carry.movedCount}건을 백로그로 보냈습니다`);
  if (carry.nextSprintAutoCreated && carry.nextSprintId) parts.push(`새 스프린트 ${name(carry.nextSprintId)}을(를) 자동으로 만들었습니다`);
  return parts.join(" · ");
}

export interface UseSprintCompletionOptions {
  projectId: string | undefined;
  /** 완료 뒤 화면 재조회 */
  reload: () => void | Promise<void>;
  /** 결과 배너의 "새 스프린트 보기" — 백로그는 그 스프린트로 스크롤, 보드는 백로그로 이동 */
  onShowSprint: (sprintId: string) => void;
}

/**
 * 스프린트 완료 공용 흐름(백로그·보드) — 완료 요청 → 결과 토스트(n건 이월) → 결과 배너(새 스프린트 링크).
 * DS 토스트에 동작 버튼이 없어(ToastOptions = title·description·appearance) "새 스프린트 보기"는 화면 위 배너가 맡는다.
 */
export function useSprintCompletion({ projectId, reload, onShowSprint }: UseSprintCompletionOptions): {
  complete: (sprint: Sprint, options: CompleteSprintOptions) => Promise<void>;
  notice: ReactNode;
} {
  const toast = useToast();
  const [result, setResult] = useState<{ text: string; nextSprintId: string | null; created: boolean } | null>(null);

  const complete = async (sprint: Sprint, options: CompleteSprintOptions) => {
    try {
      const completion = await completeSprint(sprint.id, options);
      const sprints = projectId ? await listSprints(projectId).catch(() => []) : [];
      const text = describeCompletion(completion, sprints);
      toast({ title: "스프린트를 완료했습니다", description: text, appearance: "success" });
      const carry = completion.carryOver;
      setResult(
        carry
          ? { text: `${sprint.name} 완료 — ${text}`, nextSprintId: carry.nextSprintId, created: carry.nextSprintAutoCreated }
          : null,
      );
    } catch (error) {
      toast({
        title: "스프린트 완료 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reload();
  };

  const notice = result ? (
    <Banner
      variant="info"
      className="sprint-completion-notice"
      onDismiss={() => setResult(null)}
      action={
        result.nextSprintId
          ? {
              label: result.created ? "새 스프린트 보기" : "다음 스프린트 보기",
              onClick: () => {
                onShowSprint(result.nextSprintId!);
                setResult(null);
              },
            }
          : undefined
      }
    >
      {result.text}
    </Banner>
  ) : null;

  return { complete, notice };
}
