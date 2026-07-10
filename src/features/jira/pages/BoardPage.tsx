import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { Button, Spinner, useToast } from "@chanho/react";
import type { Issue, IssueStatus, Sprint, User } from "../store/types";
import { listIssues, listSprints, listUsers, moveIssue } from "../store/jiraStore";
import { BoardColumn } from "../components/BoardColumn";
import { IssueCard } from "../components/IssueCard";
import { useIssueModal } from "../components/useIssueModal";
import { BOARD_STATUSES } from "../components/labels";
import { resolveMove } from "./boardDnd";

export function BoardPage() {
  const { projectId } = useParams();

  /** undefined = 로딩 중, null = 활성 스프린트 없음 */
  const [sprint, setSprint] = useState<Sprint | null | undefined>(undefined);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const toast = useToast();

  // 클릭과 드래그 구분: 5px 이상 움직여야 드래그 시작
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reload = useCallback(async () => {
    if (!projectId) return;
    setSprint(undefined); // 재조회 시작 = 로딩 — projectId 전환 시 이전 프로젝트 보드 잔상 방지 (W2 인계)
    const sprints = await listSprints(projectId);
    const active = sprints.find((s) => s.state === "active") ?? null;
    const all = active ? await listIssues(projectId) : [];
    setIssues(active ? all.filter((i) => i.sprintId === active.id) : []);
    setSprint(active);
  }, [projectId]);

  useEffect(() => {
    void listUsers().then(setUsers);
    void reload();
  }, [reload]);

  /** ?issue=ALM-1 → 상세 모달 (URL 공유 가능) — 세 페이지 공용 훅 */
  const { openIssue, issueModal } = useIssueModal(reload);

  const userNames = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.name])),
    [users],
  );

  /** status → order순 이슈 id 배열 (resolveMove 입력) */
  const columnIds = useMemo(() => {
    const map: Record<IssueStatus, string[]> = { todo: [], inprogress: [], done: [] };
    for (const issue of issues) map[issue.status].push(issue.id);
    return map;
  }, [issues]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveIssue(issues.find((i) => i.id === event.active.id) ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveIssue(null);
    const { active, over } = event;
    if (!over) return;
    const target = resolveMove(String(active.id), String(over.id), columnIds);
    if (!target) return;
    try {
      await moveIssue(String(active.id), target);
    } catch (error) {
      toast({
        title: "이슈 이동 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reload(); // 성공/실패 모두 스토어 기준으로 재조회
  };

  let content: ReactNode;
  if (sprint === undefined) {
    content = (
      <div className="board-loading">
        <Spinner size="large" label="보드 불러오는 중" />
      </div>
    );
  } else if (sprint === null) {
    content = (
      <section className="board-empty">
        <h2>진행 중인 스프린트가 없습니다</h2>
        <p>백로그에서 스프린트를 만들고 시작하면 보드가 열립니다.</p>
        <Link to="../backlog">
          <Button variant="subtle" tabIndex={-1}>
            백로그로 이동
          </Button>
        </Link>
      </section>
    );
  } else {
    content = (
      <section>
        <h2 className="board-title">{sprint.name}</h2>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveIssue(null)}
        >
          <div className="board-columns">
            {BOARD_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                issues={issues.filter((i) => i.status === status)}
                userNames={userNames}
                onOpenIssue={openIssue}
              />
            ))}
          </div>
          <DragOverlay>
            {activeIssue ? (
              <IssueCard
                issue={activeIssue}
                assigneeName={
                  activeIssue.assigneeId ? userNames[activeIssue.assigneeId] : undefined
                }
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </section>
    );
  }

  return (
    <>
      {content}
      {/* 활성 스프린트가 없어도 백로그 이슈 키 공유 URL은 열려야 하므로 content 밖에서 렌더 */}
      {issueModal}
    </>
  );
}
