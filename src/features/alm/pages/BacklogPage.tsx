import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { Badge, Button, Spinner, TextField, useToast } from "@chanho/react";
import type { Issue, Sprint, User } from "../store/types";
import {
  completeSprint,
  createIssue,
  createSprint,
  deleteIssue,
  listIssues,
  listSprints,
  listUsers,
  rankIssue,
  startSprint,
  updateIssue,
} from "../store/jiraStore";
import { useIssueModal } from "../components/useIssueModal";
import { BacklogDropZone, BacklogIssueRow, SortableBacklogRow, SprintPanel } from "../components/SprintPanel";
import type { MoveTarget } from "../components/SprintPanel";
import { BACKLOG_PANEL, resolveBacklogMove } from "./backlogDnd";

export function BacklogPage() {
  const { projectId } = useParams();
  const [loading, setLoading] = useState(true);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const toast = useToast();

  // 행 클릭(상세)과 드래그 구분: 5px 이상 움직여야 드래그 시작
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reload = useCallback(async () => {
    if (!projectId) return;
    const [sprintList, issueList] = await Promise.all([
      listSprints(projectId),
      listIssues(projectId), // order 오름차순
    ]);
    setSprints(sprintList);
    setIssues(issueList);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true); // projectId 전환 시 이전 프로젝트 잔상 방지
    void listUsers().then(setUsers);
    void reload();
  }, [reload]);

  const { openIssue, issueModal } = useIssueModal(reload);

  const userNames = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);

  // done 스프린트는 패널을 만들지 않는다 — active 먼저, planned 다음 (스펙 §4)
  const visibleSprints = useMemo(
    () => [
      ...sprints.filter((s) => s.state === "active"),
      ...sprints.filter((s) => s.state === "planned"),
    ],
    [sprints],
  );

  const moveTargets: MoveTarget[] = useMemo(
    () => [
      { sprintId: null, label: "백로그" },
      ...visibleSprints.map((s) => ({ sprintId: s.id, label: s.name })),
    ],
    [visibleSprints],
  );

  const backlogIssues = issues.filter((i) => i.sprintId === null);

  /** 패널 키 → order순 이슈 id 배열 (resolveBacklogMove 입력) */
  const panels = useMemo(() => {
    const map: Record<string, string[]> = {
      [BACKLOG_PANEL]: issues.filter((i) => i.sprintId === null).map((i) => i.id),
    };
    for (const sprint of visibleSprints) {
      map[sprint.id] = issues.filter((i) => i.sprintId === sprint.id).map((i) => i.id);
    }
    return map;
  }, [issues, visibleSprints]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveIssue(issues.find((i) => i.id === event.active.id) ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveIssue(null);
    const { active, over } = event;
    if (!over) return;
    const target = resolveBacklogMove(String(active.id), String(over.id), panels);
    if (!target) return;
    try {
      await rankIssue(String(active.id), target); // 빈번한 조작이라 성공 toast는 생략
    } catch (error) {
      toast({
        title: "이슈 이동 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reload();
  };

  /** 스토어 액션 공통 래퍼: 성공/도메인 에러 Toast, 끝나면 항상 재조회 (스펙 §5) */
  const run = async (failTitle: string, successTitle: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toast({ title: successTitle, appearance: "success" });
    } catch (error) {
      toast({
        title: failTitle,
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reload();
  };

  const handleCreateIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run("이슈 생성 실패", "이슈를 생성했습니다", async () => {
      if (!projectId) throw new Error("프로젝트를 찾을 수 없습니다");
      await createIssue({ projectId, title: newTitle }); // sprintId 생략 = 백로그로 생성
      setNewTitle(""); // 성공했을 때만 입력 초기화
    });
  };

  const handleMove = (issue: Issue, sprintId: string | null) =>
    void run("이슈 이동 실패", "이슈를 이동했습니다", () => updateIssue(issue.id, { sprintId }));

  const handleDelete = (issue: Issue) =>
    void run("이슈 삭제 실패", `${issue.key} 이슈를 삭제했습니다`, () => deleteIssue(issue.id));

  if (loading) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="백로그 불러오는 중" />
      </div>
    );
  }

  return (
    <>
      <div className="view-actions">
        <Button
          variant="secondary"
          onClick={() =>
            void run("스프린트 생성 실패", "스프린트를 만들었습니다", () => {
              if (!projectId) throw new Error("프로젝트를 찾을 수 없습니다");
              return createSprint(projectId);
            })
          }
        >
          스프린트 만들기
        </Button>
      </div>
      <section className="backlog-page">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveIssue(null)}
        >
        {visibleSprints.map((sprint) => (
          <SprintPanel
            key={sprint.id}
            sprint={sprint}
            issues={issues.filter((i) => i.sprintId === sprint.id)}
            userNames={userNames}
            moveTargets={moveTargets}
            onStart={(s) => void run("스프린트 시작 실패", "스프린트를 시작했습니다", () => startSprint(s.id))}
            onComplete={(s) =>
              void run("스프린트 완료 실패", "스프린트를 완료했습니다", () => completeSprint(s.id))
            }
            onMove={handleMove}
            onDelete={handleDelete}
            onOpen={openIssue}
          />
        ))}

        <section className="sprint-panel" aria-label="백로그 목록">
          <header className="sprint-panel-header">
            <h3>백로그</h3>
            <Badge>{backlogIssues.length}</Badge>
          </header>
          <BacklogDropZone panelId={BACKLOG_PANEL} issueIds={backlogIssues.map((i) => i.id)}>
            {backlogIssues.map((issue) => (
              <SortableBacklogRow
                key={issue.id}
                issue={issue}
                assigneeName={issue.assigneeId ? userNames[issue.assigneeId] : undefined}
                moveTargets={moveTargets}
                onMove={handleMove}
                onDelete={handleDelete}
                onOpen={openIssue}
              />
            ))}
            {backlogIssues.length === 0 ? (
              <p className="sprint-panel-empty">백로그가 비어 있습니다</p>
            ) : null}
          </BacklogDropZone>
          <form className="backlog-create-form" onSubmit={handleCreateIssue}>
            <TextField
              label="새 이슈 제목"
              placeholder="무엇을 해야 하나요?"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Button type="submit">만들기</Button>
          </form>
        </section>
        <DragOverlay>
          {activeIssue ? (
            <BacklogIssueRow
              issue={activeIssue}
              assigneeName={
                activeIssue.assigneeId ? userNames[activeIssue.assigneeId] : undefined
              }
              moveTargets={[]}
              onMove={() => {}}
              onDelete={() => {}}
              onOpen={() => {}}
            />
          ) : null}
        </DragOverlay>
        </DndContext>
      </section>
      {issueModal}
    </>
  );
}
