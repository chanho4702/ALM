import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
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
import { Button, Dropdown, EmptyState, Lozenge, Select, Spinner, useToast } from "@chanho/react";
import type { Board, BoardSwimlane, Issue, Sprint, User, WorkflowStatus } from "../store/types";
import {
  completeSprint,
  createIssue,
  getBoard,
  listBoardIssues,
  listIssues,
  listProjectStatuses,
  listSprints,
  listUsers,
  moveIssue,
} from "../store/jiraStore";
import { BoardColumn } from "../components/BoardColumn";
import { BoardSettingsModal } from "../components/BoardSettingsModal";
import { SprintCompleteModal } from "../components/SprintCompleteModal";
import { statusKind } from "../components/labels";
import { remainingDays, todayKey } from "./dashboardMetrics";
import {
  BoardFilterBar,
  EMPTY_QUICK_FILTER,
  applyQuickFilter,
} from "../components/BoardFilterBar";
import type { QuickFilter } from "../components/BoardFilterBar";
import { IssueCard } from "../components/IssueCard";
import { useIssueModal } from "../components/useIssueModal";
import { UserAvatar } from "../components/UserAvatar";
import { resolveMove } from "./boardDnd";

const BOARD_TYPE_LABELS: Record<Board["type"], string> = { scrum: "스크럼", kanban: "칸반" };

export function BoardPage() {
  const { projectId, boardId } = useParams();
  const navigate = useNavigate();

  /** undefined = 로딩 중, null = 보드 없음(기본 보드로 redirect) */
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  /** 스크럼 보드의 활성 스프린트 (칸반이면 null) */
  const [sprint, setSprint] = useState<Sprint | null>(null);
  /** 프로젝트의 모든 스프린트 — 스프린트 완료 시 이관 후보 */
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  /** 프로젝트 전체 이슈 — 보드 필터 밖의 이슈까지 세야 하는 스프린트 완료 모달용 */
  const [projectIssues, setProjectIssues] = useState<Issue[]>([]);
  /** 완료 확인 중인 스프린트 (null이면 모달 닫힘) */
  const [completingSprint, setCompletingSprint] = useState<Sprint | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  /** 프로젝트 워크플로 상태 (order순) — 컬럼 구성의 원천 */
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  /** epicId → 이름 (카드 에픽 태그) */
  const [epicsById, setEpicsById] = useState<Record<string, string>>({});
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [quick, setQuick] = useState<QuickFilter>(EMPTY_QUICK_FILTER);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 화면 그룹핑 — 초기값은 보드 설정(swimlane), Select로 임시 전환 */
  const [groupBy, setGroupBy] = useState<BoardSwimlane>("none");
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
    const [boardIssues, sprintList, epics, statusList] = await Promise.all([
      listBoardIssues(found.id),
      found.type === "scrum" ? listSprints(projectId) : Promise.resolve([]),
      // 에픽만 — 전체 이슈는 스프린트 완료 모달을 열 때만 받는다(리로드는 DnD·인라인 생성마다 돈다)
      listIssues(projectId, { type: "epic" }),
      listProjectStatuses(projectId),
    ]);
    setIssues(boardIssues);
    setStatuses(statusList);
    setEpicsById(Object.fromEntries(epics.map((e) => [e.id, e.title])));
    setSprints(sprintList);
    setSprint(sprintList.find((s) => s.state === "active") ?? null);
    setBoard((prev) => {
      // 보드가 바뀌었을 때만 그룹핑을 보드 기본값으로 리셋 (화면 전환 유지)
      if (prev?.id !== found.id) setGroupBy(found.swimlane);
      return found;
    });
  }, [projectId, boardId]);

  useEffect(() => {
    setBoard(undefined); // 보드 전환 시 이전 보드 잔상 방지
    setQuick(EMPTY_QUICK_FILTER); // 퀵 필터는 보드별 화면 상태
    void listUsers().then(setUsers);
    void reload();
  }, [reload]);

  /** ?issue=ALM-1 → 상세 모달 (URL 공유 가능) — 세 페이지 공용 훅 */
  const { openIssue, issueModal } = useIssueModal(reload);

  /** userId → 사용자. 카드·스윔레인 아바타가 프로필 사진을 여기서 읽는다 */
  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);

  /** 퀵 필터 적용 결과 — 컬럼 렌더와 DnD 모두 이 목록 기준 */
  const visibleIssues = useMemo(() => applyQuickFilter(issues, quick), [issues, quick]);

  /** issueId → 부모 에픽 이름 (카드 에픽 태그) */
  const epicNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const issue of issues) {
      if (issue.parentId && epicsById[issue.parentId]) map[issue.id] = epicsById[issue.parentId];
    }
    return map;
  }, [issues, epicsById]);

  /** 보드 이슈들의 라벨 합집합 (퀵 필터 라벨 선택지) */
  const labelOptions = useMemo(
    () => [...new Set(issues.flatMap((i) => i.labels))].sort(),
    [issues],
  );

  /**
   * 스윔레인 밴드 — 담당자별(이슈 있는 담당자 순, 미지정 마지막) 또는
   * 에픽별(자식이 보이는 에픽 순, "에픽 없음" 마지막 — 에픽 카드 자신도 여기).
   */
  const bands = useMemo(() => {
    if (groupBy === "assignee") {
      const result: { key: string; name: string; issues: Issue[] }[] = [];
      for (const user of users) {
        const userIssues = visibleIssues.filter((i) => i.assigneeId === user.id);
        if (userIssues.length > 0) {
          result.push({ key: user.id, name: user.name, issues: userIssues });
        }
      }
      const unassigned = visibleIssues.filter((i) => i.assigneeId === null);
      if (unassigned.length > 0) {
        result.push({ key: "unassigned", name: "미지정", issues: unassigned });
      }
      return result;
    }
    if (groupBy === "epic") {
      const result: { key: string; name: string; issues: Issue[] }[] = [];
      for (const [epicId, epicName] of Object.entries(epicsById)) {
        const children = visibleIssues.filter((i) => i.parentId === epicId);
        if (children.length > 0) result.push({ key: epicId, name: epicName, issues: children });
      }
      const noEpic = visibleIssues.filter(
        (i) => i.parentId === null || !epicsById[i.parentId],
      );
      if (noEpic.length > 0) result.push({ key: "noepic", name: "에픽 없음", issues: noEpic });
      return result;
    }
    return null;
  }, [groupBy, users, visibleIssues, epicsById]);

  /** 상태 id → order순 이슈 id 배열 (resolveMove 입력) — 프로젝트 상태 전부가 키 */
  const columnIds = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const status of statuses) map[status.id] = [];
    for (const issue of visibleIssues) (map[issue.status] ??= []).push(issue.id);
    return map;
  }, [visibleIssues, statuses]);

  /** 컬럼 하단 인라인 생성 — 스크럼: 활성 스프린트로, 칸반: 백로그로 */
  const handleColumnCreate = async (status: string, title: string) => {
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

  /** 스프린트 완료 — 백로그 화면과 같은 스토어 호출·Toast 규약 */
  const handleCompleteSprint = async (target: Sprint, moveUnfinishedTo: string | null) => {
    try {
      await completeSprint(target.id, { moveUnfinishedTo });
      toast({ title: "스프린트를 완료했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "스프린트 완료 실패",
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
    // 스윔레인 컬럼 id("밴드키:status")는 status로 정규화 — 밴드는 시각적 그룹일 뿐이다
    const rawOver = String(over.id);
    const overId = rawOver.includes(":") ? rawOver.split(":").pop()! : rawOver;
    const target = resolveMove(String(active.id), overId, columnIds);
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

  /** 활성 스프린트 종료까지 남은 일수 — 기간 미설정이면 표시 생략 (요약 화면과 같은 계산) */
  const sprintDaysLeft =
    board.type === "scrum" && sprint ? remainingDays(sprint.plannedEnd, todayKey()) : null;

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
          {bands ? (
            bands.map((band) => (
              <section
                key={band.key}
                className="board-swimlane"
                aria-label={`${band.name} 스윔레인`}
                data-testid={`swimlane-${band.key}`}
              >
                <header className="board-swimlane-header">
                  {groupBy === "assignee" && band.key !== "unassigned" ? (
                    <UserAvatar user={usersById[band.key]} name={band.name} size="small" />
                  ) : null}
                  {groupBy === "epic" && band.key !== "noepic" ? (
                    <Lozenge appearance="warning">에픽</Lozenge>
                  ) : null}
                  <strong>{band.name}</strong>
                  <span className="board-swimlane-count">{band.issues.length}개</span>
                </header>
                <div className="board-columns">
                  {statuses.map((ws) => {
                    const column = board.columns.find((c) => c.status === ws.id);
                    return (
                      <BoardColumn
                        key={ws.id}
                        status={ws.id}
                        droppableId={`${band.key}:${ws.id}`}
                        issues={band.issues.filter((i) => i.status === ws.id)}
                        usersById={usersById}
                        onOpenIssue={openIssue}
                        epicNames={epicNames}
                        columnName={column?.name ?? ws.name}
                        appearance={ws.color ?? "neutral"}
                        workflowStatus={ws}
                        // 밴드별 개수는 전체 WIP 기준과 달라 오해 소지 — 스윔레인에선 표시 생략
                        wipLimit={null}
                      />
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="board-columns">
              {statuses.map((ws) => {
                const column = board.columns.find((c) => c.status === ws.id);
                return (
                  <BoardColumn
                    key={ws.id}
                    status={ws.id}
                    issues={visibleIssues.filter((i) => i.status === ws.id)}
                    usersById={usersById}
                    onOpenIssue={openIssue}
                    epicNames={epicNames}
                    onCreateIssue={handleColumnCreate}
                    columnName={column?.name ?? ws.name}
                    appearance={ws.color ?? "neutral"}
                    workflowStatus={ws}
                    wipLimit={column?.wipLimit ?? null}
                  />
                );
              })}
            </div>
          )}
          <DragOverlay>
            {activeIssue ? (
              <IssueCard
                issue={activeIssue}
                assignee={
                  activeIssue.assigneeId ? usersById[activeIssue.assigneeId] : undefined
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
          {sprintDaysLeft !== null ? (
            <span className="board-sprint-days">
              {sprintDaysLeft < 0 ? `${-sprintDaysLeft}일 지남` : `${sprintDaysLeft}일 남음`}
            </span>
          ) : null}
          <span className="board-toolbar-spacer" />
          <Select
            label="그룹"
            className="visually-hidden-label board-group-select"
            value={groupBy}
            options={[
              { value: "none", label: "그룹 없음" },
              { value: "assignee", label: "담당자별" },
              { value: "epic", label: "에픽별" },
            ]}
            onValueChange={(v) => setGroupBy(v as BoardSwimlane)}
          />
          {board.type === "scrum" && sprint ? (
            <Button
              variant="secondary"
              size="small"
              onClick={() =>
                void listIssues(projectId!).then((all) => {
                  setProjectIssues(all); // 미완료 집계는 보드 필터 밖 이슈까지 봐야 한다
                  setCompletingSprint(sprint);
                })
              }
            >
              스프린트 완료
            </Button>
          ) : null}
          <Dropdown
            trigger={
              <Button variant="ghost" size="small" aria-label="보드 메뉴">
                <MoreHorizontal size={16} />
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
        statuses={statuses}
        labelOptions={labelOptions}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={reload}
        onDeleted={() => navigate(`/projects/${projectId}/board`)}
      />
      {/* 백로그와 같은 완료 흐름 — 미완료 이슈는 보드 필터 밖까지 세야 하므로 프로젝트 전체 이슈 기준 */}
      <SprintCompleteModal
        sprint={completingSprint}
        unfinished={
          completingSprint
            ? projectIssues.filter(
                (issue) =>
                  issue.sprintId === completingSprint.id &&
                  statusKind(statuses, issue.status) !== "complete",
              )
            : []
        }
        targets={sprints.filter((s) => s.id !== completingSprint?.id && s.state !== "done")}
        statuses={statuses}
        onClose={() => setCompletingSprint(null)}
        onConfirm={(target, moveUnfinishedTo) => {
          setCompletingSprint(null);
          void handleCompleteSprint(target, moveUnfinishedTo);
        }}
      />
      {/* 활성 스프린트가 없어도 백로그 이슈 키 공유 URL은 열려야 하므로 content 밖에서 렌더 */}
      {issueModal}
    </>
  );
}
