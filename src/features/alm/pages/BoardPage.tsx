import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Button, Dropdown, EmptyState, Lozenge, Select, useToast } from "@chanho/react";
import type { Board, BoardSwimlane, CompleteSprintOptions, Issue, IssueTransitionOption, Sprint, User, WorkflowStatus } from "../store/types";
import {
  createIssue,
  getBoard,
  listBoardIssues,
  listIssueTransitions,
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
import { applyOptimisticMove, boardColumnsOf, columnAvailability, columnIssueIds } from "./boardColumns";
import type { ColumnAvailability } from "./boardColumns";
import { useTransitionRunner } from "../components/transitions/useTransitionRunner";
import { BulkEditModal } from "../components/BulkEditModal";
import { SelectionBar } from "../components/SelectionBar";
import { usePriorities } from "../components/usePriorities";
import { useIssueActions } from "../components/useIssueActions";
import { useIssueInteractions } from "../components/useIssueInteractions";
import { BoardSkeleton } from "../components/Skeletons";
import { useSprintCompletion } from "../components/useSprintCompletion";
import { useRealtimeIssueSync } from "../components/realtime/ProjectRealtime";

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
  /**
   * 드래그 중인 이슈의 가용 전환(A3) — 들어 올리는 순간 서버에 묻는다. 응답 전에는 열을 흐리지 않고(모름),
   * 응답이 오면 갈 수 없는 열을 흐리고 놓을 수 없게 한다. 놓을 때 아직 모르면 그때 기다린다.
   */
  const [dragOptions, setDragOptions] = useState<{ issueId: string; options: IssueTransitionOption[] } | null>(null);
  const dragOptionsRequest = useRef<{ issueId: string; promise: Promise<IssueTransitionOption[]> } | null>(null);
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

  // 실시간 동기화 — 남의 변경은 그 카드만 다시 읽어 갈아 끼우고 하이라이트. 보드 필터가 걸린 보드는 들고 나는 카드를
  // 서버가 정하게 다시 읽는다(필터 판정을 화면에 복제하지 않는다)
  const boardFiltered = Boolean(
    board && (board.filter.assigneeIds.length > 0 || board.filter.types.length > 0 || board.filter.labels.length > 0),
  );
  useRealtimeIssueSync({ issues, setIssues, reload, mode: boardFiltered ? "reload" : "patch" });

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

  /** 보드가 그릴 열(C4) — 열 하나에 여러 상태, 어느 열에도 없는 상태는 보드에 안 나온다 */
  const columns = useMemo(() => (board ? boardColumnsOf(board, statuses) : []), [board, statuses]);

  // 웨이브 B — 다중 선택(⌘/Shift 클릭·x)·우클릭 메뉴·미리보기(Space)·속성 단축키·명령 팔레트 범위.
  // 순서는 보이는 대로(열 왼쪽부터, 열 안은 위부터) — Shift 범위와 미리보기 이웃 이동의 기준
  const priorities = usePriorities();
  const orderedIssues = useMemo(
    () => columns.flatMap((column) => visibleIssues.filter((issue) => column.statuses.includes(issue.status))),
    [columns, visibleIssues],
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const { actions: issueActions, dialogs: issueActionDialogs } = useIssueActions({ setIssues, reload, statuses });
  const interactions = useIssueInteractions({
    source: "board",
    projectId,
    issues: orderedIssues,
    options: { statuses, users, priorities, labels: labelOptions },
    actions: issueActions,
    openIssue,
    sprints,
  });

  /** 열 id → 보드 순서 이슈 id (resolveMove 입력) */
  const columnIds = useMemo(() => columnIssueIds(columns, visibleIssues), [columns, visibleIssues]);

  /** 드래그 중 열마다 놓을 수 있나 — 전환 목록을 받기 전에는 비어 있다(전부 허용으로 보인다) */
  const availability = useMemo(() => {
    if (!activeIssue || dragOptions?.issueId !== activeIssue.id) return {} as Record<string, ColumnAvailability>;
    return Object.fromEntries(
      columns.map((column) => [column.id, columnAvailability(column, activeIssue, dragOptions.options)]),
    ) as Record<string, ColumnAvailability>;
  }, [activeIssue, dragOptions, columns]);

  /** 전환 실행 공용 흐름 — 전환 화면이 있으면 창을 띄운다(A4) */
  const { run: runTransition, element: transitionScreen } = useTransitionRunner(statuses);

  /** 컬럼 하단 인라인 생성 — 스크럼: 활성 스프린트로, 칸반: 백로그로. 매핑 열은 그 열의 첫 상태로 */
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

  /** 스프린트 완료 — 백로그와 같은 흐름(결과 토스트·배너). "새 스프린트 보기"는 백로그의 그 패널로 */
  const completion = useSprintCompletion({
    projectId,
    reload,
    onShowSprint: (sprintId) => navigate(`/projects/${projectId}/backlog#sprint-${sprintId}`),
  });
  const handleCompleteSprint = (target: Sprint, options: CompleteSprintOptions) => completion.complete(target, options);

  /** 드래그 중인 이슈의 가용 전환 — 같은 이슈는 요청 하나를 나눠 쓴다 */
  const optionsFor = (issueId: string): Promise<IssueTransitionOption[]> => {
    if (dragOptionsRequest.current?.issueId === issueId) return dragOptionsRequest.current.promise;
    const promise = listIssueTransitions(issueId).then((result) => result.transitions);
    dragOptionsRequest.current = { issueId, promise };
    promise.then(
      (options) => {
        if (dragOptionsRequest.current?.promise === promise) setDragOptions({ issueId, options });
      },
      () => undefined,
    );
    return promise;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const issue = visibleIssues.find((i) => i.id === event.active.id) ?? null;
    setActiveIssue(issue);
    setDragOptions(null);
    dragOptionsRequest.current = null;
    if (issue) void optionsFor(issue.id).catch(() => undefined);
  };

  const failMove = (error: unknown) =>
    toast({
      title: "이슈 이동 실패",
      description: error instanceof Error ? error.message : String(error),
      appearance: "danger",
    });

  /**
   * 놓기(A3) — **낙관적**: 서버 응답 전에 카드를 새 열에 먼저 그린다. 거부(400 조건·검증)·409면 원래 자리로 돌리고
   * 이유 토스트. 전환 화면이 있는 전환이면 창을 띄우고, 취소하면 제자리로 돌린다(A4). 끝나면 조용히 다시 읽어 맞춘다.
   */
  const handleDragEnd = async (event: DragEndEvent) => {
    const dragged = activeIssue;
    setActiveIssue(null);
    const { active, over } = event;
    if (!over || !dragged) return;
    // 스윔레인 컬럼 id("밴드키:열")는 열 id로 정규화 — 밴드는 시각적 그룹일 뿐이다
    const rawOver = String(over.id);
    const overId = rawOver.includes(":") ? rawOver.split(":").pop()! : rawOver;
    const target = resolveMove(String(active.id), overId, columnIds);
    if (!target) return;
    const column = columns.find((c) => c.id === target.status);
    if (!column) return;
    let decision: ColumnAvailability;
    try {
      decision = columnAvailability(column, dragged, await optionsFor(dragged.id));
    } catch (error) {
      failMove(error);
      return;
    }
    if (!decision.allowed) {
      // 흐린 열에는 놓을 수 없지만(드롭 비활성), 응답 전에 놓은 경우를 여기서 막는다
      toast({ title: "이 열로 옮길 수 없습니다", description: decision.reason, appearance: "danger" });
      return;
    }
    const option = decision.option;
    const toStatus = option ? option.to : dragged.status;
    const previous = issues;
    setIssues(applyOptimisticMove(issues, dragged.id, toStatus, target.beforeId, column.statuses));
    try {
      if (option?.hasScreen) {
        const outcome = await runTransition(dragged, option);
        if (outcome.kind === "cancelled") {
          setIssues(previous);
          return;
        }
        if (outcome.kind === "failed") throw outcome.error;
        // 전환 실행은 순서를 모른다 — 놓은 자리로 순서만 맞춘다(같은 상태 안 이동은 전환이 아니다)
        if (target.beforeId) await moveIssue(dragged.id, { status: toStatus, beforeId: target.beforeId });
      } else {
        await moveIssue(dragged.id, { status: toStatus, beforeId: target.beforeId });
      }
    } catch (error) {
      setIssues(previous);
      failMove(error);
      return;
    } finally {
      dragOptionsRequest.current = null;
      setDragOptions(null);
    }
    void reload(); // 서버 기준으로 조용히 맞춘다(화면은 이미 옮겨져 있다)
  };

  if (board === undefined) {
    return (
      <BoardSkeleton label="보드 불러오는 중" />
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
    content = interactions.withContextMenu(
      <section {...interactions.containerProps}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveIssue(null);
            setDragOptions(null);
            dragOptionsRequest.current = null;
          }}
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
                  {columns.map((column) => {
                    const blocked = availability[column.id];
                    return (
                      <BoardColumn
                        key={column.id}
                        columnId={column.id}
                        status={column.statuses[0] ?? column.id}
                        droppableId={`${band.key}:${column.id}`}
                        issues={band.issues.filter((i) => column.statuses.includes(i.status))}
                        usersById={usersById}
                        onOpenIssue={openIssue}
                        epicNames={epicNames}
                        columnName={column.name}
                        workflowStatus={statuses.find((s) => s.id === column.statuses[0])}
                        // 밴드별 개수는 전체 WIP 기준과 달라 오해 소지 — 스윔레인에선 표시 생략
                        wipLimit={null}
                        blockedReason={blocked && !blocked.allowed ? blocked.reason : null}
                        selectedIds={interactions.selected}
                      />
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="board-columns">
              {columns.map((column) => {
                const blocked = availability[column.id];
                return (
                  <BoardColumn
                    key={column.id}
                    columnId={column.id}
                    status={column.statuses[0] ?? column.id}
                    issues={visibleIssues.filter((i) => column.statuses.includes(i.status))}
                    usersById={usersById}
                    onOpenIssue={openIssue}
                    epicNames={epicNames}
                    onCreateIssue={column.statuses.length > 0 ? handleColumnCreate : undefined}
                    columnName={column.name}
                    workflowStatus={statuses.find((s) => s.id === column.statuses[0])}
                    wipLimit={column.wipLimit ?? null}
                    blockedReason={blocked && !blocked.allowed ? blocked.reason : null}
                    selectedIds={interactions.selected}
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
        <SelectionBar
          count={interactions.selected.size}
          onClear={interactions.clearSelection}
          onBulkEdit={() => setBulkOpen(true)}
          onDelete={() => issueActions.requestDelete(interactions.targets())}
        />
      </section>,
    );
  }

  return (
    <>
      {completion.notice}
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
            size="compact"
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
              <Button variant="ghost" size="small" iconOnly aria-label="보드 메뉴">
                <MoreHorizontal size={16} />
              </Button>
            }
            items={[{ label: "보드 설정", onSelect: () => setSettingsOpen(true) }]}
          />
        </div>
        {board.unmappedStatuses.length > 0 ? (
          <p className="board-unmapped-note" role="note">
            {`어느 열에도 없는 상태 ${board.unmappedStatuses.length}개(${board.unmappedStatuses
              .map((id) => statuses.find((s) => s.id === id)?.name ?? id)
              .join(", ")})의 이슈는 이 보드에 보이지 않습니다 — 보드 설정에서 열에 넣으세요.`}
          </p>
        ) : null}
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
        onConfirm={(target, options) => {
          setCompletingSprint(null);
          void handleCompleteSprint(target, options);
        }}
      />
      <BulkEditModal
        open={bulkOpen}
        targets={orderedIssues
          .filter((issue) => interactions.selected.has(issue.id))
          .map((issue) => ({ id: issue.id, key: issue.key, version: issue.version }))}
        statuses={statuses}
        users={users}
        sprints={sprints}
        onOpenChange={setBulkOpen}
        onDone={() => {
          interactions.clearSelection();
          void reload();
        }}
      />
      {interactions.peek}
      {issueActionDialogs}
      {/* 활성 스프린트가 없어도 백로그 이슈 키 공유 URL은 열려야 하므로 content 밖에서 렌더 */}
      {issueModal}
      {transitionScreen}
    </>
  );
}
