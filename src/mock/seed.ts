import type {
  Activity,
  Board,
  Comment,
  Issue,
  IssueChange,
  ProjectMember,
  JiraData,
  Notification,
  Project,
  Sprint,
} from "../features/alm/store/types";
import { MOCK_USERS } from "./users";

export function createSeedData(): JiraData {
  const now = new Date().toISOString();

  const project: Project = {
    id: "p1",
    key: "ALM",
    name: "ALM 플랫폼",
    description: "스틸 블루 디자인 시스템 기반 ALM 데모",
    createdAt: now,
  };

  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  // 로컬 달력 기준 날짜 — 리포트 집계도 로컬 경계를 쓴다. UTC로 만들면 자정 근처에서 하루 밀린다.
  const dayKey = (offsetDays: number) => {
    const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  };

  // 5일 전에 시작해 9일 뒤 끝나는 2주 스프린트 — 번다운이 실제 구간을 그리도록 기간을 준다
  const sprint: Sprint = {
    id: "s1",
    projectId: "p1",
    name: "Sprint 1",
    state: "active",
    goal: "보드와 백로그를 실제로 쓸 수 있게 만든다",
    plannedStart: dayKey(-5),
    plannedEnd: dayKey(9),
    startedAt: daysAgo(5),
  };

  const base = {
    projectId: "p1",
    description: "",
    type: "task" as const,
    reporterId: "u1",
    parentId: null as string | null,
    dueDate: null,
    estimateHours: null as number | null,
    labels: [] as string[],
    createdAt: now,
    updatedAt: now,
  };

  // 라벨/마감일 필터·정렬·대시보드를 바로 확인할 수 있도록 일부 이슈에 샘플 값을 준다
  const dueSoon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const issues: Issue[] = [
    { ...base, id: "i1", key: "ALM-1", title: "프로젝트 스캐폴드 구성", status: "done", priority: "high", assigneeId: "u1", sprintId: "s1", order: 1, labels: ["infra"] },
    { ...base, id: "i2", key: "ALM-2", title: "칸반 보드 UI 구현", status: "inprogress", priority: "high", assigneeId: "u2", sprintId: "s1", order: 1, labels: ["frontend", "design"], dueDate: dueSoon, type: "story", parentId: "i4", estimateHours: 8 },
    { ...base, id: "i3", key: "ALM-3", title: "이슈 상세 모달 구현", status: "inprogress", priority: "medium", assigneeId: "u1", sprintId: "s1", order: 2, labels: ["frontend"] },
    { ...base, id: "i4", key: "ALM-4", title: "백로그 화면 구현", status: "todo", priority: "medium", assigneeId: "u3", sprintId: "s1", order: 1, dueDate: dueSoon, type: "epic" },
    { ...base, id: "i5", key: "ALM-5", title: "이슈 목록 필터 구현", status: "todo", priority: "low", assigneeId: null, sprintId: "s1", order: 2 },
    { ...base, id: "i6", key: "ALM-6", title: "코멘트 기능 구현", status: "todo", priority: "medium", assigneeId: "u4", sprintId: null, order: 1, labels: ["backend"] },
    { ...base, id: "i7", key: "ALM-7", title: "활동 로그 표시", status: "todo", priority: "low", assigneeId: null, sprintId: null, order: 2 },
    { ...base, id: "i8", key: "ALM-8", title: "다크 테마 점검", status: "todo", priority: "low", assigneeId: null, sprintId: null, order: 3, labels: ["design"], type: "bug" },
  ];

  const comments: Comment[] = [
    { id: "c1", issueId: "i2", authorId: "u1", body: "드래그 라이브러리는 @dnd-kit로 확정했습니다.", createdAt: now },
    { id: "c2", issueId: "i2", authorId: "u2", body: "컬럼 간 이동부터 붙여볼게요.", createdAt: now },
    { id: "c3", issueId: "i3", authorId: "u3", body: "속성 패널은 Select 4개로 구성합니다.", createdAt: now },
  ];

  const activities: Activity[] = issues.map((issue, index) => ({
    id: `a${index + 1}`,
    issueId: issue.id,
    actorId: issue.reporterId,
    type: "created",
    detail: "이슈 생성",
    at: now,
  }));

  // 목업은 단일 사용자(u1)라 실시간 알림이 생성될 일이 없으므로 시드로 데모 데이터를 준다
  const notifications: Notification[] = [
    {
      id: "n1",
      userId: "u1",
      issueId: "i2",
      issueKey: "ALM-2",
      actorId: "u2",
      message: "이서연 님이 ALM-2에 코멘트를 남겼습니다",
      at: now,
      read: false,
    },
    {
      id: "n2",
      userId: "u1",
      issueId: "i3",
      issueKey: "ALM-3",
      actorId: "u3",
      message: "박준영 님이 ALM-3을 나에게 할당했습니다",
      at: now,
      read: false,
    },
  ];

  // 기본 스크럼 보드 + 칸반 보드(라벨 필터·WIP 데모)
  const boards: Board[] = [
    {
      id: "b1",
      projectId: "p1",
      name: "메인 보드",
      type: "scrum",
      filter: { assigneeIds: [], types: [], labels: [] },
      columns: [
        { status: "todo", name: "할 일", wipLimit: null },
        { status: "inprogress", name: "진행 중", wipLimit: null },
        { status: "done", name: "완료", wipLimit: null },
      ],
      swimlane: "none",
      isDefault: true,
      createdAt: now,
    },
    {
      id: "b2",
      projectId: "p1",
      name: "백엔드 팀",
      type: "kanban",
      filter: { assigneeIds: [], types: [], labels: ["backend"] },
      columns: [
        { status: "todo", name: "할 일", wipLimit: null },
        { status: "inprogress", name: "진행 중", wipLimit: 2 },
        { status: "done", name: "완료", wipLimit: null },
      ],
      swimlane: "none",
      isDefault: false,
      createdAt: now,
    },
  ];

  /**
   * 변경 이력 시드 — 번다운이 그릴 계단이 있어야 데모가 의미를 갖는다.
   * 스프린트 시작(5일 전) 시점 편입 + 그 뒤 실제 전이 3건.
   */
  const changes: IssueChange[] = [];
  const pushChange = (
    issueId: string,
    field: IssueChange["field"],
    fromValue: string | null,
    toValue: string | null,
    at: string,
    sprintId: string | null,
  ) => {
    changes.push({
      id: `ch${changes.length + 1}`,
      issueId,
      projectId: "p1",
      sprintId,
      field,
      fromValue,
      toValue,
      actorId: "u1",
      at,
    });
  };

  for (const issue of issues) {
    const inSprint = issue.sprintId === "s1";
    // 스프린트 이슈는 전부 "할 일"로 시작했다 — 이후 전이는 아래에서 준다
    pushChange(issue.id, "status", null, inSprint ? "todo" : issue.status, daysAgo(5), issue.sprintId);
    if (inSprint) pushChange(issue.id, "sprint", null, "s1", daysAgo(5), "s1");
  }
  pushChange("i3", "status", "todo", "inprogress", daysAgo(3), "s1");
  pushChange("i2", "status", "todo", "inprogress", daysAgo(2), "s1");
  pushChange("i1", "status", "todo", "done", daysAgo(1), "s1");

  // 데모: 팀 전원이 시드 프로젝트 멤버 (u1 관리자, 나머지 편집자)
  const members: ProjectMember[] = MOCK_USERS.map((user, index) => ({
    projectId: "p1",
    userId: user.id,
    role: index === 0 ? ("admin" as const) : ("editor" as const),
  }));

  return {
    users: [...MOCK_USERS],
    projects: [project],
    sprints: [sprint],
    issues,
    comments,
    activities,
    notifications,
    boards,
    // 데모 링크: ALM-3(상세 모달)이 ALM-2(보드 UI)를 차단
    links: [{ id: "l1", sourceId: "i3", targetId: "i2", type: "blocks" as const }],
    // 데모 워크로그: ALM-2(예상 8h)에 2건 = 5h 기록
    worklogs: [
      { id: "w1", issueId: "i2", authorId: "u2", hours: 3, comment: "컬럼 드래그 구현", workedOn: now.slice(0, 10), at: now },
      { id: "w2", issueId: "i2", authorId: "u1", hours: 2, comment: "리뷰·리팩터링", workedOn: now.slice(0, 10), at: now },
    ],
    changes,
    members,
    // 지라식 설정 스킴 — 디폴트 스킴에 전 프로젝트 배정 (상태 id = 기존 status 값)
    schemes: [
      {
        id: "scheme-default",
        name: "기본 스킴",
        isDefault: true,
        body: {
          statuses: [
            { id: "todo", name: "할 일", category: "todo" as const, order: 1 },
            { id: "inprogress", name: "진행 중", category: "inprogress" as const, order: 2 },
            { id: "done", name: "완료", category: "done" as const, order: 3 },
          ],
          enabledTypes: ["task", "story", "bug", "epic", "subtask"] as const as import("../features/alm/store/types").IssueType[],
        },
      },
    ],
    projectSettings: [{ projectId: "p1", schemeId: "scheme-default", custom: null }],
    issueCounters: { p1: 8 },
  };
}
