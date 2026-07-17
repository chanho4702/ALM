import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { Button, Dropdown, EmptyState, Lozenge, Spinner, useToast } from "@chanho/react";
import type { Board, Issue, IssueStatus, Sprint, User } from "../store/types";
import { createIssue, getBoard, listBoardIssues, listSprints, listUsers, moveIssue } from "../store/jiraStore";
import { BoardColumn } from "../components/BoardColumn";
import { BoardSettingsModal } from "../components/BoardSettingsModal";
import {
  BoardFilterBar,
  EMPTY_QUICK_FILTER,
  applyQuickFilter,
} from "../components/BoardFilterBar";
import type { QuickFilter } from "../components/BoardFilterBar";
import { IssueCard } from "../components/IssueCard";
import { useIssueModal } from "../components/useIssueModal";
import { BOARD_STATUSES } from "../components/labels";
import { resolveMove } from "./boardDnd";

const BOARD_TYPE_LABELS: Record<Board["type"], string> = { scrum: "스크럼", kanban: "칸반" };

export function BoardPage() {
  const { projectId, boardId } = useParams();
  const navigate = useNavigate();

  /** undefined = 로딩 중, null = 보드 없음(기본 보드로 redirect) */
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  /** 스크럼 보드의 활성 스프린트 (칸반이면 null) */
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [quick, setQuick] = useState<QuickFilter>(EMPTY_QUICK_FILTER);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toast = useToast();

  // 클릭과 드래그 구분: 5px 이상 움직여야 드래그 시작
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reload = useCallback(async () => {
    if (!projectId || !boardId) return;
    const found = await getBoard(boardId);
    if (!found || found.projectId !== projectId) {
      setBoard(null);
      return;
    }
    const [boardIssues, sprints] = await Promise.all([
      listBoardIssues(found.id),
      found.type === "scrum" ? listSprints(projectId) : Promise.resolve([]),
    ]);
    setIssues(boardIssues);
    setSprint(sprints.find((s) => s.state === "active") ?? null);
    setBoard(found);
  }, [projectId, boardId]);

  useEffect(() => {
    setBoard(undefined); // 보드 전환 시 이전 보드 잔상 방지
    setQuick(EMPTY_QUICK_FILTER); // 퀵 필터는 보드별 화면 상태
    void listUsers().then(setUsers);
    void reload();
  }, [reload]);

  /** ?issue=ALM-1 → 상세 모달 (URL 공유 가능) — 세 페이지 공용 훅 */
  const { openIssue, issueModal } = useIssueModal(reload);

  const userNames = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.name])),
    [users],
  );

  /** 퀵 필터 적용 결과 — 컬럼 렌더와 DnD 모두 이 목록 기준 */
  const visibleIssues = useMemo(() => applyQuickFilter(issues, quick), [issues, quick]);

  /** 보드 이슈들의 라벨 합집합 (퀵 필터 라벨 선택지) */
  const labelOptions = useMemo(
    () => [...new Set(issues.flatMap((i) => i.labels))].sort(),
    [issues],
  );

  /** status → order순 이슈 id 배열 (resolveMove 입력) */
  const columnIds = useMemo(() => {
    const map: Record<IssueStatus, string[]> = { todo: [], inprogress: [], done: [] };
    for (const issue of visibleIssues) map[issue.status].push(issue.id);
    return map;
  }, [visibleIssues]);

  /** 컬럼 하단 인라인 생성 — 스크럼: 활성 스프린트로, 칸반: 백로그로 */
  const handleColumnCreate = async (status: IssueStatus, title: string) => {
    if (!projectId || !board) return;
    if (board.type === "scrum" && !sprint) return;
    try {
      const issue = await createIssue({
        projectId,
        title,
        status,
        sprintId: board.type === "scrum" ? sprint!.id : null,
      });
      toast({ title: `${issue.key}를 만들었습니다`, appearance: "success" });
    } catch (error) {
      toast({
        title: "이슈 생성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reload();
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveIssue(visibleIssues.find((i) => i.id === event.active.id) ?? null);
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

  if (board === undefined) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="보드 불러오는 중" />
      </div>
    );
  }
  if (board === null) {
    // 없는 보드 ID → 기본 보드로 (BoardRedirect가 해석)
    return <Navigate to={`/projects/${projectId}/board`} replace />;
  }

  let content: ReactNode;
  if (board.type === "scrum" && !sprint) {
    content = (
      <EmptyState
        title="진행 중인 스프린트가 없습니다"
        description="백로그에서 스프린트를 만들고 시작하면 보드가 열립니다."
        primaryAction={{ label: "백로그로 이동", onClick: () => navigate("../backlog") }}
      />
    );
  } else {
    content = (
      <section>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveIssue(null)}
        >
          <div className="board-columns">
            {BOARD_STATUSES.map((status) => {
              const column = board.columns.find((c) => c.status === status);
              return (
                <BoardColumn
                  key={status}
                  status={status}
                  issues={visibleIssues.filter((i) => i.status === status)}
                  userNames={userNames}
                  onOpenIssue={openIssue}
                  onCreateIssue={handleColumnCreate}
                  columnName={column?.name}
                  wipLimit={column?.wipLimit ?? null}
                />
              );
            })}
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
      <div className="board-toolbar">
        <div className="board-toolbar-title">
          <strong className="board-name">{board.name}</strong>
          <Lozenge appearance={board.type === "scrum" ? "info" : "success"}>
            {BOARD_TYPE_LABELS[board.type]}
          </Lozenge>
          {board.type === "scrum" && sprint ? (
            <Lozenge appearance="info" aria-label={`활성 스프린트: ${sprint.name}`}>
              {sprint.name}
            </Lozenge>
          ) : null}
          <Dropdown
            trigger={
              <Button variant="ghost" size="small" aria-label="보드 메뉴">
                ⋯
              </Button>
            }
            items={[{ label: "보드 설정", onSelect: () => setSettingsOpen(true) }]}
          />
        </div>
        <BoardFilterBar
          users={users}
          labelOptions={labelOptions}
          quick={quick}
          onChange={setQuick}
        />
      </div>
      {content}
      <BoardSettingsModal
        board={board}
        users={users}
        labelOptions={labelOptions}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={reload}
        onDeleted={() => navigate(`/projects/${projectId}/board`)}
      />
      {/* 활성 스프린트가 없어도 백로그 이슈 키 공유 URL은 열려야 하므로 content 밖에서 렌더 */}
      {issueModal}
    </>
  );
}
