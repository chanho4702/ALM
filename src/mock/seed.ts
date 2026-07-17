import type {
  Activity,
  Board,
  Comment,
  Issue,
  JiraData,
  Notification,
  Project,
  Sprint,
} from "../features/jira/store/types";
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

  const sprint: Sprint = {
    id: "s1",
    projectId: "p1",
    name: "Sprint 1",
    state: "active",
    startedAt: now,
  };

  const base = {
    projectId: "p1",
    description: "",
    type: "task" as const,
    reporterId: "u1",
    parentId: null as string | null,
    dueDate: null,
    labels: [] as string[],
    createdAt: now,
    updatedAt: now,
  };

  // 라벨/마감일 필터·정렬·대시보드를 바로 확인할 수 있도록 일부 이슈에 샘플 값을 준다
  const dueSoon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const issues: Issue[] = [
    { ...base, id: "i1", key: "ALM-1", title: "프로젝트 스캐폴드 구성", status: "done", priority: "high", assigneeId: "u1", sprintId: "s1", order: 1, labels: ["infra"] },
    { ...base, id: "i2", key: "ALM-2", title: "칸반 보드 UI 구현", status: "inprogress", priority: "high", assigneeId: "u2", sprintId: "s1", order: 1, labels: ["frontend", "design"], dueDate: dueSoon, type: "story", parentId: "i4" },
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
    issueCounters: { p1: 8 },
  };
}
