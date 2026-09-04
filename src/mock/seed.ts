import type {
  Activity,
  Board,
  Comment,
  Component,
  Issue,
  IssueChange,
  ProjectMember,
  JiraData,
  Notification,
  Project,
  ProjectVersion,
  Sprint,
  Worklog,
} from "../features/alm/store/types";
import { MOCK_USERS } from "./users";

/**
 * 목업 시드.
 *
 * `rich`는 **개발 서버 첫 방문 화면이 비어 보이지 않게** 두 번째 프로젝트와 이슈를 더 얹는다.
 * 테스트(vitest)는 항상 `rich: false`로 종전 8건(ALM-1~8)을 그대로 본다 — 시드 개수를 하드코딩한
 * 단언(`toHaveLength(8)` 등)이 여럿이라 기본 시드를 키우면 우수수 깨진다(docs/areas/testing.md).
 */
export function createSeedData(options: { rich?: boolean } = {}): JiraData {
  const now = new Date().toISOString();

  const project: Project = {
    id: "p1",
    key: "ALM",
    name: "ALM 플랫폼",
    description: "스틸 블루 디자인 시스템 기반 ALM 데모",
    category: "",
    leadId: MOCK_USERS[0].id,
    defaultAssignee: "unassigned",
    icon: "",
    color: "",
    url: "",
    createdAt: now,
  };

  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  // 스프린트 시작과 그 시점 편입 이력은 **같은 순간**이어야 한다. 호출마다 Date.now()를 다시 읽으면
  // 편입이 시작보다 몇 ms 늦어져 리포트가 "시작 후 추가된 이슈"로 센다.
  const sprintStartedAt = daysAgo(5);
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
    startedAt: sprintStartedAt,
  };

  const base = {
    projectId: "p1",
    description: "",
    type: "task" as const,
    reporterId: "u1",
    parentId: null as string | null,
    dueDate: null,
    estimateHours: null as number | null,
    resolution: null as Issue["resolution"],
    fixVersionId: null as string | null,
    labels: [] as string[],
    createdAt: now,
    updatedAt: now,
  };

  // 라벨/마감일 필터·정렬·대시보드를 바로 확인할 수 있도록 일부 이슈에 샘플 값을 준다
  const dueSoon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const issues: Issue[] = [
    { ...base, id: "i1", key: "ALM-1", title: "프로젝트 스캐폴드 구성", status: "done", resolution: "done", priority: "high", assigneeId: "u1", sprintId: "s1", order: 1, labels: ["infra"] },
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
    pushChange(issue.id, "status", null, inSprint ? "todo" : issue.status, sprintStartedAt, issue.sprintId);
    if (inSprint) pushChange(issue.id, "sprint", null, "s1", sprintStartedAt, "s1");
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

  const data: JiraData = {
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
    versions: [],
    attachments: [],
    watchers: [],
    // 전역 상태 카테고리·상태 레지스트리 — 기본 3개, 워크플로는 여기서 골라 쓴다
    statusCategories: [
      { id: "todo", name: "할 일", kind: "new" as const, color: "neutral" as const, order: 1, builtIn: true },
      { id: "inprogress", name: "진행 중", kind: "active" as const, color: "info" as const, order: 2, builtIn: true },
      { id: "done", name: "완료", kind: "complete" as const, color: "success" as const, order: 3, builtIn: true },
    ],
    // 아이콘은 lucide 키(typeIcons.tsx) — 빈 문자열이면 카테고리 의미의 기본 아이콘으로 폴백한다
    statusDefs: [
      { id: "todo", name: "할 일", categoryId: "todo", description: "", icon: "circle" },
      { id: "inprogress", name: "진행 중", categoryId: "inprogress", description: "", icon: "loader-circle" },
      { id: "done", name: "완료", categoryId: "done", description: "", icon: "circle-check" },
    ],
    // 전역 이슈 타입 레지스트리 — 기본 5종 (계층·아이콘·색)
    issueTypes: [
      { id: "task", name: "작업", icon: "check-square", color: "info" as const, level: "standard" as const, description: "", order: 1, builtIn: true },
      { id: "story", name: "스토리", icon: "bookmark", color: "success" as const, level: "standard" as const, description: "", order: 2, builtIn: true },
      { id: "bug", name: "버그", icon: "bug", color: "danger" as const, level: "standard" as const, description: "", order: 3, builtIn: true },
      { id: "epic", name: "에픽", icon: "zap", color: "warning" as const, level: "epic" as const, description: "", order: 4, builtIn: true },
      { id: "subtask", name: "하위 작업", icon: "list-tree", color: "neutral" as const, level: "subtask" as const, description: "", order: 5, builtIn: true },
    ],
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
          enabledTypes: ["task", "story", "bug", "epic", "subtask"] as const as import("../features/alm/store/types").IssueType[], enabledPriorities: ["highest", "high", "medium", "low", "lowest"], defaultPriority: "medium",
        },
      },
    ],
    projectSettings: [{ projectId: "p1", schemeId: "scheme-default", custom: null }],
    priorities: [],
    linkTypes: [],
    archivedIssues: [],
    trashedProjects: [],
    components: [],
    dashboards: [],
    shortcuts: [],
    preferences: {},
    avatars: {},
    banner: { enabled: false, level: "info", message: "" },
    issueCounters: { p1: 8 },
  };

  if (options.rich) applyRichSeed(data, dayKey, daysAgo);
  return data;
}

/**
 * dev 전용 확장 시드 — ALM-9~17(9건)과 두 번째 프로젝트 "위키 제품"(WIKI-1~8)을 얹어
 * 총 이슈 25건·프로젝트 2·스프린트 2·버전 1·컴포넌트 3·코멘트 6·워크로그 4를 만든다.
 * ALM-1~8의 제목·상태·담당자는 손대지 않는다(테스트 계약).
 */
function applyRichSeed(
  data: JiraData,
  dayKey: (offsetDays: number) => string,
  daysAgo: (days: number) => string,
): void {
  const now = new Date().toISOString();

  // ── 컴포넌트 3 · 버전 1 (ALM 플랫폼) ──
  const components: Component[] = [
    { id: "cmp1", projectId: "p1", name: "프론트엔드", description: "웹 화면", leadId: "u1", defaultAssignee: "project", issueCount: 0, createdAt: now },
    { id: "cmp2", projectId: "p1", name: "백엔드", description: "API·도메인", leadId: "u2", defaultAssignee: "project", issueCount: 0, createdAt: now },
    { id: "cmp3", projectId: "p1", name: "인프라", description: "배포·모니터링", leadId: "u3", defaultAssignee: "project", issueCount: 0, createdAt: now },
  ];
  const version: ProjectVersion = {
    id: "v1",
    projectId: "p1",
    name: "1.0.0",
    description: "첫 정식 배포",
    startDate: dayKey(-20),
    releaseDate: dayKey(14),
    status: "unreleased",
    createdAt: now,
  };

  const almBase = {
    projectId: "p1",
    description: "",
    type: "task" as const,
    reporterId: "u1",
    parentId: null as string | null,
    dueDate: null as string | null,
    estimateHours: null as number | null,
    resolution: null as Issue["resolution"],
    fixVersionId: null as string | null,
    labels: [] as string[],
    componentIds: [] as string[],
    createdAt: now,
    updatedAt: now,
  };

  // ── ALM-9~17 (기존 8건 뒤에 이어 붙인다) ──
  const almExtra: Issue[] = [
    { ...almBase, id: "i9", key: "ALM-9", title: "검색 결과 정렬 옵션 추가", status: "done", resolution: "done", priority: "medium", assigneeId: "u2", sprintId: "s1", order: 3, labels: ["frontend"], componentIds: ["cmp1"], type: "story", fixVersionId: "v1", estimateHours: 5 },
    { ...almBase, id: "i10", key: "ALM-10", title: "알림 배지 카운트가 갱신되지 않습니다", status: "inprogress", priority: "high", assigneeId: "u3", sprintId: "s1", order: 4, labels: ["frontend", "qa"], componentIds: ["cmp1"], type: "bug", dueDate: dayKey(3) },
    { ...almBase, id: "i11", key: "ALM-11", title: "이슈 일괄 편집 API", status: "inprogress", priority: "high", assigneeId: "u2", sprintId: "s1", order: 5, labels: ["backend"], componentIds: ["cmp2"], type: "story", estimateHours: 8, fixVersionId: "v1" },
    { ...almBase, id: "i12", key: "ALM-12", title: "첨부 파일 미리보기", status: "todo", priority: "medium", assigneeId: "u4", sprintId: "s1", order: 6, labels: ["frontend"], componentIds: ["cmp1"], estimateHours: 3 },
    { ...almBase, id: "i13", key: "ALM-13", title: "감사 로그 보존 기간 설정", status: "todo", priority: "low", assigneeId: null, sprintId: null, order: 4, labels: ["backend", "security"], componentIds: ["cmp2"] },
    { ...almBase, id: "i14", key: "ALM-14", title: "배포 파이프라인 캐시 정리", status: "todo", priority: "low", assigneeId: "u3", sprintId: null, order: 5, labels: ["infra"], componentIds: ["cmp3"] },
    { ...almBase, id: "i15", key: "ALM-15", title: "이슈 상세 단축키 안내", status: "todo", priority: "lowest", assigneeId: null, sprintId: null, order: 6, labels: ["docs"], componentIds: ["cmp1"] },
    { ...almBase, id: "i16", key: "ALM-16", title: "대량 이슈 목록 가상 스크롤", status: "todo", priority: "high", assigneeId: "u1", sprintId: null, order: 7, labels: ["performance"], componentIds: ["cmp1"], type: "story", estimateHours: 13, dueDate: dayKey(28) },
    { ...almBase, id: "i17", key: "ALM-17", title: "워크플로 전이 규칙 문서화", status: "todo", priority: "medium", assigneeId: "u4", sprintId: null, order: 8, labels: ["docs"], componentIds: ["cmp2"] },
  ];

  // ── 두 번째 프로젝트: 위키 제품 ──
  const wiki: Project = {
    id: "p2",
    key: "WIKI",
    name: "위키 제품",
    description: "문서 협업 도구 — 스페이스·페이지·권한",
    category: "제품",
    leadId: "u2",
    defaultAssignee: "unassigned",
    icon: "",
    color: "",
    url: "",
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
  };
  const wikiSprintStartedAt = daysAgo(3);
  const wikiSprint: Sprint = {
    id: "s2",
    projectId: "p2",
    name: "Sprint 1",
    state: "active",
    goal: "페이지 편집과 권한을 붙인다",
    plannedStart: dayKey(-3),
    plannedEnd: dayKey(11),
    startedAt: wikiSprintStartedAt,
  };
  const wikiBase = { ...almBase, projectId: "p2", reporterId: "u2", componentIds: [] as string[] };
  const wikiIssues: Issue[] = [
    { ...wikiBase, id: "i18", key: "WIKI-1", title: "스페이스 생성 화면", status: "done", resolution: "done", priority: "high", assigneeId: "u2", sprintId: "s2", order: 1, labels: ["frontend"], type: "story" },
    { ...wikiBase, id: "i19", key: "WIKI-2", title: "페이지 트리 지연 로딩", status: "inprogress", priority: "high", assigneeId: "u1", sprintId: "s2", order: 2, labels: ["performance"], type: "story", estimateHours: 8 },
    { ...wikiBase, id: "i20", key: "WIKI-3", title: "인라인 코멘트 앵커 복원", status: "inprogress", priority: "medium", assigneeId: "u3", sprintId: "s2", order: 3, labels: ["frontend"], dueDate: dayKey(5) },
    { ...wikiBase, id: "i21", key: "WIKI-4", title: "휴지통에서 페이지 복원", status: "todo", priority: "medium", assigneeId: "u4", sprintId: "s2", order: 4, labels: ["backend"] },
    { ...wikiBase, id: "i22", key: "WIKI-5", title: "라벨 자동완성이 느립니다", status: "todo", priority: "high", assigneeId: null, sprintId: "s2", order: 5, labels: ["qa"], type: "bug" },
    { ...wikiBase, id: "i23", key: "WIKI-6", title: "스페이스 권한 상속 정리", status: "todo", priority: "highest", assigneeId: "u2", sprintId: null, order: 6, labels: ["security"], type: "story", estimateHours: 13 },
    { ...wikiBase, id: "i24", key: "WIKI-7", title: "PDF 내보내기 여백 조정", status: "todo", priority: "low", assigneeId: null, sprintId: null, order: 7, labels: ["docs"] },
    { ...wikiBase, id: "i25", key: "WIKI-8", title: "첨부 이미지 썸네일 생성", status: "todo", priority: "lowest", assigneeId: "u3", sprintId: null, order: 8, labels: ["infra"] },
  ];

  const wikiBoard: Board = {
    id: "b3",
    projectId: "p2",
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
  };

  const newIssues = [...almExtra, ...wikiIssues];
  const activities: Activity[] = newIssues.map((issue) => ({
    id: `a-rich-${issue.id}`,
    issueId: issue.id,
    actorId: issue.reporterId,
    type: "created",
    detail: "이슈 생성",
    at: now,
  }));

  // 번다운이 그릴 계단 — 스프린트 편입은 시작 시각과 같은 순간이어야 한다
  const changes: IssueChange[] = [];
  for (const issue of newIssues) {
    const startedAt = issue.projectId === "p2" ? wikiSprintStartedAt : daysAgo(5);
    changes.push({
      id: `ch-rich-${issue.id}-s`,
      issueId: issue.id,
      projectId: issue.projectId,
      sprintId: issue.sprintId,
      field: "status",
      fromValue: null,
      toValue: issue.sprintId ? "todo" : issue.status,
      actorId: issue.reporterId,
      at: startedAt,
    });
    if (issue.sprintId) {
      changes.push({
        id: `ch-rich-${issue.id}-p`,
        issueId: issue.id,
        projectId: issue.projectId,
        sprintId: issue.sprintId,
        field: "sprint",
        fromValue: null,
        toValue: issue.sprintId,
        actorId: issue.reporterId,
        at: startedAt,
      });
    }
  }
  changes.push(
    { id: "ch-rich-i9-done", issueId: "i9", projectId: "p1", sprintId: "s1", field: "status", fromValue: "todo", toValue: "done", actorId: "u2", at: daysAgo(2) },
    { id: "ch-rich-i18-done", issueId: "i18", projectId: "p2", sprintId: "s2", field: "status", fromValue: "todo", toValue: "done", actorId: "u2", at: daysAgo(1) },
  );

  const comments: Comment[] = [
    { id: "c4", issueId: "i11", authorId: "u2", body: "<p>일괄 편집은 실패 건을 따로 돌려주는 계약으로 갑니다.</p>", createdAt: now },
    { id: "c5", issueId: "i19", authorId: "u1", body: "<p>트리는 자식 개수만 먼저 받고 펼칠 때 조회합니다.</p>", createdAt: now },
    { id: "c6", issueId: "i22", authorId: "u3", body: "<p>라벨 500개 넘는 스페이스에서 재현됩니다. 서버 검색으로 바꿔야 합니다.</p>", createdAt: now },
  ];

  const worklogs: Worklog[] = [
    { id: "w3", issueId: "i11", authorId: "u2", hours: 4, comment: "일괄 편집 API 구현", workedOn: dayKey(-2), at: now },
    { id: "w4", issueId: "i19", authorId: "u1", hours: 3, comment: "트리 지연 로딩", workedOn: dayKey(-1), at: now },
  ];

  const members: ProjectMember[] = MOCK_USERS.map((user, index) => ({
    projectId: "p2",
    userId: user.id,
    role: index === 0 ? ("admin" as const) : ("editor" as const),
  }));

  data.projects.push(wiki);
  data.sprints.push(wikiSprint);
  data.issues.push(...newIssues);
  data.boards.push(wikiBoard);
  data.components.push(...components);
  data.versions.push(version);
  data.activities.push(...activities);
  data.changes.push(...changes);
  data.comments.push(...comments);
  data.worklogs.push(...worklogs);
  data.members.push(...members);
  data.projectSettings.push({ projectId: "p2", schemeId: "scheme-default", custom: null });
  data.links.push({ id: "l2", sourceId: "i11", targetId: "i9", type: "relates" });
  data.issueCounters.p1 = 17;
  data.issueCounters.p2 = 8;
}
