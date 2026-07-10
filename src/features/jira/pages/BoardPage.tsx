import { useCallback, useEffect, useMemo, useState } from "react";
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

  // 클릭과 드래그 구분: 5px 이상 움직여야 드래그 시작 (Task 3의 카드 클릭 열기 대비)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reload = useCallback(async () => {
    if (!projectId) return;
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

  if (sprint === undefined) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="보드 불러오는 중" />
      </div>
    );
  }

  if (sprint === null) {
    return (
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
  }

  return (
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
            />
          ))}
        </div>
        <DragOverlay>
          {activeIssue ? (
            <IssueCard
              issue={activeIssue}
              assigneeName={activeIssue.assigneeId ? userNames[activeIssue.assigneeId] : undefined}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
