/**
 * 데모 프로젝트 시더 — "데모 프로젝트(풍부한 샘플)" 템플릿이 만드는 데이터.
 *
 * 규칙: 여기서는 **스토어(파사드) 함수만 부른다**. localStorage도 fetch도 직접 만지지 않는다.
 * 그래서 같은 코드가 목업(`jiraMock.ts`)과 REST 어댑터(`jiraApi.ts`) 양쪽에서 그대로 돈다 —
 * 각 어댑터가 자기 함수로 채운 `SampleDataApi`를 넘겨주기만 하면 된다(의존성 주입).
 *
 * 주의: **순차 실행**이다. REST는 낙관적 락(`expectedVersion`)을 쓰므로 같은 리소스에 대한 병렬
 * 호출이 409를 만든다. `Promise.all`을 넣지 말 것.
 */
import type {
  Component,
  Dashboard,
  DashboardGadget,
  Issue,
  IssueLink,
  ProjectVersion,
  Sprint,
  User,
  Worklog,
  Comment as IssueComment,
} from "./types";

/** 시더가 부르는 스토어 함수 목록 — 목업·REST 어댑터가 이 모양을 채운다(빠지면 타입 에러) */
export interface SampleDataApi {
  listUsers(): Promise<User[]>;
  createComponent(
    projectId: string,
    input: { name: string; description?: string; leadId?: string | null },
  ): Promise<Component>;
  createVersion(
    projectId: string,
    input: { name: string; description?: string | null; startDate?: string | null; releaseDate?: string | null },
  ): Promise<ProjectVersion>;
  releaseVersion(
    id: string,
    options?: { moveUnresolvedTo?: string | null },
  ): Promise<ProjectVersion>;
  createSprint(projectId: string): Promise<Sprint>;
  updateSprint(
    id: string,
    patch: { name?: string; goal?: string | null; plannedStart?: string | null; plannedEnd?: string | null },
  ): Promise<Sprint>;
  startSprint(id: string): Promise<Sprint>;
  completeSprint(
    id: string,
    options?: { moveUnfinishedTo?: string | null },
  ): Promise<Sprint>;
  createIssue(input: {
    projectId: string;
    title: string;
    description?: string;
    type?: string;
    status?: string;
    priority?: string;
    assigneeId?: string | null;
    sprintId?: string | null;
    parentId?: string | null;
    dueDate?: string | null;
    labels?: string[];
    componentIds?: string[];
    estimateHours?: number | null;
    fixVersionId?: string | null;
  }): Promise<Issue>;
  addIssueLink(input: { sourceId: string; targetId: string; type: string }): Promise<IssueLink>;
  addComment(issueId: string, body: string): Promise<IssueComment>;
  addWorklog(
    issueId: string,
    input: { hours: number; comment?: string; workedOn: string },
  ): Promise<Worklog>;
  archiveIssue(id: string): Promise<Issue>;
  createDashboard(input: {
    name: string;
    shared?: boolean;
    gadgets?: DashboardGadget[];
  }): Promise<Dashboard>;
}

/** 로컬 달력 기준 "YYYY-MM-DD" — UTC로 만들면 자정 근처에서 하루 밀린다(store.md) */
function dayKey(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const COMPONENTS = [
  { name: "프론트엔드", description: "웹 화면과 디자인 시스템 적용" },
  { name: "백엔드", description: "API·도메인 로직·배치" },
  { name: "인프라", description: "배포 파이프라인·컨테이너·모니터링" },
  { name: "디자인", description: "UX 흐름과 화면 시안" },
] as const;

const LABEL_POOL = [
  "frontend",
  "backend",
  "infra",
  "design",
  "qa",
  "docs",
  "security",
  "performance",
] as const;

const PRIORITIES = ["highest", "high", "medium", "low", "lowest"] as const;

const EPICS = [
  { title: "사용자 온보딩 개선", component: 3, status: "inprogress", due: 24 },
  { title: "결제 모듈 안정화", component: 1, status: "inprogress", due: 12 },
  { title: "관리자 콘솔 구축", component: 0, status: "todo", due: 45 },
  { title: "관측성·성능 개선", component: 2, status: "inprogress", due: 33 },
] as const;

type Bucket = "s1" | "s2" | "s3" | "backlog";

interface SeedIssueSpec {
  title: string;
  type: "task" | "story" | "bug";
  /** EPICS 인덱스 */
  epic: number;
  /** COMPONENTS 인덱스 */
  component: number;
  status: "todo" | "inprogress" | "done";
  bucket: Bucket;
}

/** 완료된 스프린트 9 · 활성 스프린트 10 · 다음 스프린트 6 · 백로그 11 = 36건 */
const ISSUES: SeedIssueSpec[] = [
  // ── 완료된 스프린트 (전부 완료) ──
  { title: "회원가입 폼 유효성 검사 정리", type: "story", epic: 0, component: 0, status: "done", bucket: "s1" },
  { title: "이메일 인증 메일 템플릿 교체", type: "task", epic: 0, component: 1, status: "done", bucket: "s1" },
  { title: "온보딩 튜토리얼 문구 검수", type: "task", epic: 0, component: 3, status: "done", bucket: "s1" },
  { title: "결제 승인 타임아웃 재시도 로직", type: "story", epic: 1, component: 1, status: "done", bucket: "s1" },
  { title: "카드 결제 실패 로그 표준화", type: "task", epic: 1, component: 1, status: "done", bucket: "s1" },
  { title: "관리자 로그인 2단계 인증", type: "story", epic: 2, component: 1, status: "done", bucket: "s1" },
  { title: "관리자 첫 화면 레이아웃 정리", type: "task", epic: 2, component: 0, status: "done", bucket: "s1" },
  { title: "컨테이너 이미지 크기 축소", type: "task", epic: 3, component: 2, status: "done", bucket: "s1" },
  { title: "느린 쿼리 상위 10건 인덱스 추가", type: "task", epic: 3, component: 1, status: "done", bucket: "s1" },

  // ── 활성 스프린트 (할 일/진행 중/완료 섞기) ──
  { title: "소셜 로그인 연동", type: "story", epic: 0, component: 1, status: "inprogress", bucket: "s2" },
  { title: "온보딩 진행률 표시", type: "task", epic: 0, component: 0, status: "todo", bucket: "s2" },
  { title: "정기 결제 스케줄러", type: "story", epic: 1, component: 1, status: "inprogress", bucket: "s2" },
  { title: "환불 처리 화면", type: "story", epic: 1, component: 0, status: "todo", bucket: "s2" },
  { title: "결제 내역 CSV 내보내기", type: "task", epic: 1, component: 1, status: "done", bucket: "s2" },
  { title: "사용자 권한 매트릭스 화면", type: "story", epic: 2, component: 0, status: "inprogress", bucket: "s2" },
  { title: "감사 로그 조회 필터", type: "task", epic: 2, component: 1, status: "todo", bucket: "s2" },
  { title: "모바일 화면에서 저장 버튼이 겹칩니다", type: "bug", epic: 2, component: 0, status: "inprogress", bucket: "s2" },
  { title: "로그 수집 파이프라인 이중화", type: "task", epic: 3, component: 2, status: "todo", bucket: "s2" },
  { title: "API 응답 시간 p95 측정", type: "task", epic: 3, component: 2, status: "done", bucket: "s2" },

  // ── 다음 스프린트 (계획) ──
  { title: "비밀번호 재설정 흐름 개편", type: "story", epic: 0, component: 0, status: "todo", bucket: "s3" },
  { title: "로그인 후 첫 화면 개인화", type: "task", epic: 0, component: 0, status: "todo", bucket: "s3" },
  { title: "결제 수단 추가 등록", type: "story", epic: 1, component: 1, status: "todo", bucket: "s3" },
  { title: "관리자 알림 설정 화면", type: "task", epic: 2, component: 0, status: "todo", bucket: "s3" },
  { title: "대량 사용자 초대", type: "story", epic: 2, component: 1, status: "todo", bucket: "s3" },
  { title: "캐시 계층 도입 검토", type: "task", epic: 3, component: 2, status: "todo", bucket: "s3" },

  // ── 백로그 ──
  { title: "다국어 문구 추출", type: "task", epic: 0, component: 0, status: "todo", bucket: "backlog" },
  { title: "온보딩 이탈 지점 분석", type: "task", epic: 0, component: 3, status: "todo", bucket: "backlog" },
  { title: "회원 탈퇴 시 데이터 보존 정책", type: "story", epic: 0, component: 1, status: "todo", bucket: "backlog" },
  { title: "결제 실패 안내 문구가 잘립니다", type: "bug", epic: 1, component: 0, status: "todo", bucket: "backlog" },
  { title: "세금계산서 발행 연동", type: "story", epic: 1, component: 1, status: "todo", bucket: "backlog" },
  { title: "관리자 검색이 대소문자를 구분합니다", type: "bug", epic: 2, component: 1, status: "todo", bucket: "backlog" },
  { title: "대시보드 위젯 순서 저장", type: "task", epic: 2, component: 0, status: "todo", bucket: "backlog" },
  { title: "접근성 점검 리포트", type: "task", epic: 2, component: 3, status: "todo", bucket: "backlog" },
  { title: "배포 롤백 스크립트 정리", type: "task", epic: 3, component: 2, status: "todo", bucket: "backlog" },
  { title: "이미지 업로드 용량 제한 상향", type: "task", epic: 3, component: 1, status: "todo", bucket: "backlog" },
  { title: "알림 이메일 발송 실패 재시도", type: "task", epic: 3, component: 1, status: "todo", bucket: "backlog" },
];

/** 하위 작업 6 — parent는 ISSUES 인덱스 */
const SUBTASKS: { title: string; parent: number }[] = [
  { title: "OAuth 리다이렉트 URI 등록", parent: 9 },
  { title: "로그인 버튼 컴포넌트 교체", parent: 9 },
  { title: "스케줄러 실패 알림 연결", parent: 11 },
  { title: "환불 정책 문서 확인", parent: 12 },
  { title: "권한 매트릭스 표 시안 확정", parent: 14 },
  { title: "로그 보존 기간 산정", parent: 18 },
];

/** 이슈 링크 5 — 인덱스는 ISSUES 기준 */
const LINKS: { source: number; target: number; type: string }[] = [
  { source: 9, target: 10, type: "blocks" },
  { source: 11, target: 12, type: "blocks" },
  { source: 14, target: 15, type: "relates" },
  { source: 18, target: 19, type: "relates" },
  { source: 29, target: 4, type: "relates" },
];

/**
 * 코멘트 15 — 인덱스는 ISSUES 기준. `mention`이 있으면 그 위치의 사용자를 멘션한다.
 * 본문은 TipTap 저장 포맷(HTML)이라 문단으로 감싼다.
 */
const COMMENTS: { issue: number; body: string; mention?: number }[] = [
  { issue: 0, body: "정규식 대신 스키마 검증으로 바꿨습니다. 에러 문구는 디자인 확인 받았습니다." },
  { issue: 3, body: "재시도는 3회, 지수 백오프로 두었습니다. 결제사 응답이 5초를 넘으면 취소로 처리합니다." },
  { issue: 4, body: "로그 필드 이름을 결제사별로 통일했습니다. 대시보드 쿼리도 같이 고쳤습니다." },
  { issue: 5, body: "TOTP 앱만 우선 지원합니다. SMS는 비용 확인 후 다음 분기에 봅니다." },
  { issue: 8, body: "인덱스 추가 후 목록 조회가 1.9초에서 240밀리초로 줄었습니다." },
  { issue: 9, body: "구글부터 붙이고 있습니다. 리다이렉트 URI 등록은 하위 작업으로 뺐습니다.", mention: 1 },
  { issue: 9, body: "콜백에서 기존 계정과 이메일이 같으면 연결할지 확인이 필요합니다." },
  { issue: 11, body: "스케줄러는 매일 새벽 3시로 잡았습니다. 실패하면 알림 채널로 보냅니다." },
  { issue: 12, body: "부분 환불 UI는 이번 스프린트 범위에서 빼겠습니다." },
  { issue: 14, body: "역할 3단계까지만 표로 그리고, 세부 권한은 접었다 펴는 방식으로 갑니다.", mention: 2 },
  { issue: 17, body: "아이폰 SE 화면 폭에서 재현됩니다. 하단 고정 영역 높이를 잘못 계산하고 있었습니다." },
  { issue: 17, body: "패딩 대신 safe-area 값을 쓰도록 고쳤습니다. 리뷰 부탁드립니다." },
  { issue: 18, body: "수집기를 두 대로 늘리면 유실은 막지만 비용이 오릅니다. 보존 기간부터 정리하죠." },
  { issue: 19, body: "p95는 320밀리초입니다. 목표치 200밀리초까지는 캐시가 필요해 보입니다." },
  { issue: 29, body: "결제사 응답 코드가 새로 생겼습니다. 문구 매핑 표를 갱신해야 합니다." },
];

/** 워크로그 12 — 최근 3주에 분산 */
const WORKLOGS: { issue: number; hours: number; comment: string; day: number }[] = [
  { issue: 0, hours: 3, comment: "검증 스키마 정리", day: -18 },
  { issue: 1, hours: 2, comment: "메일 템플릿 교체", day: -17 },
  { issue: 3, hours: 5, comment: "재시도 로직 구현", day: -15 },
  { issue: 4, hours: 2.5, comment: "로그 필드 통일", day: -14 },
  { issue: 5, hours: 6, comment: "TOTP 발급·검증", day: -12 },
  { issue: 8, hours: 4, comment: "실행 계획 분석", day: -10 },
  { issue: 9, hours: 3.5, comment: "구글 OAuth 연동", day: -7 },
  { issue: 11, hours: 4, comment: "스케줄러 골격", day: -5 },
  { issue: 14, hours: 2, comment: "권한 표 초안", day: -4 },
  { issue: 17, hours: 1.5, comment: "레이아웃 재현·수정", day: -2 },
  { issue: 19, hours: 2, comment: "측정 스크립트 작성", day: -1 },
  { issue: 9, hours: 2.5, comment: "콜백 예외 처리", day: 0 },
];

const GADGETS = (projectId: string): DashboardGadget[] => [
  { id: "g1", type: "status-distribution", column: 0, title: "상태 분포", config: { projectId } },
  { id: "g2", type: "assignee-load", column: 0, title: "담당자별 부하", config: { projectId } },
  { id: "g3", type: "priority-distribution", column: 1, title: "우선순위 분포", config: { projectId } },
  { id: "g4", type: "sprint-burnup", column: 1, title: "스프린트 번업", config: { projectId } },
  { id: "g5", type: "worklog-summary", column: 0, title: "최근 30일 작업 시간", config: { projectId, period: 30 } },
];

function mentionHtml(user: User): string {
  return `<span data-type="mention" data-id="${user.id}">@${user.name}</span>`;
}

/** 담당자 순환 — 5건마다 한 건은 미지정 */
function assigneeAt(users: User[], index: number): string | null {
  if (users.length === 0) return null;
  if (index % 5 === 4) return null;
  return users[index % users.length].id;
}

function labelsAt(index: number): string[] {
  const first = LABEL_POOL[index % LABEL_POOL.length];
  if (index % 3 !== 0) return [first];
  const second = LABEL_POOL[(index + 3) % LABEL_POOL.length];
  return second === first ? [first] : [first, second];
}

/** 마감일: 지난 것 · 이번 주 · 다음 달 · 없음을 섞는다 */
function dueDateAt(index: number, bucket: Bucket): string | null {
  switch (index % 5) {
    case 0:
      return dayKey(bucket === "s1" ? -9 : 4);
    case 1:
      return dayKey(bucket === "s1" ? -13 : 34);
    case 2:
      return bucket === "backlog" ? null : dayKey(-2);
    default:
      return null;
  }
}

function estimateAt(index: number): number | null {
  if (index % 3 === 0) return null;
  return [2, 3, 5, 8, 13][index % 5];
}

/**
 * 데모 데이터를 만든다. 프로젝트·기본 보드는 이미 만들어진 상태로 들어온다.
 * 이슈 46건(에픽 4 · 표준 36 · 하위 작업 6) 중 2건은 보관 처리해 목록에는 44건이 남는다.
 */
export async function seedDemoProject(
  project: { id: string; key: string },
  api: SampleDataApi,
): Promise<void> {
  const projectId = project.id;
  const users = await api.listUsers();

  // 1. 컴포넌트 · 버전 ──────────────────────────────────────────
  const componentIds: string[] = [];
  for (const [index, spec] of COMPONENTS.entries()) {
    const component = await api.createComponent(projectId, {
      name: spec.name,
      description: spec.description,
      leadId: users.length > 0 ? users[index % users.length].id : null,
    });
    componentIds.push(component.id);
  }

  const v10 = await api.createVersion(projectId, {
    name: "1.0.0",
    description: "첫 정식 배포",
    startDate: dayKey(-42),
    releaseDate: dayKey(-7),
  });
  const v11 = await api.createVersion(projectId, {
    name: "1.1.0",
    description: "온보딩·결제 안정화",
    startDate: dayKey(-6),
    releaseDate: dayKey(8),
  });
  const v20 = await api.createVersion(projectId, {
    name: "2.0.0",
    description: "관리자 콘솔 정식 오픈",
    startDate: dayKey(9),
    releaseDate: dayKey(60),
  });
  const versionOf: Record<Bucket, string | null> = {
    s1: v10.id,
    s2: v11.id,
    s3: v20.id,
    backlog: null,
  };

  // 2. 스프린트 3 ───────────────────────────────────────────────
  const sprint1 = await api.createSprint(projectId);
  await api.updateSprint(sprint1.id, {
    goal: "결제 재시도와 관리자 로그인을 정식 배포한다",
    plannedStart: dayKey(-21),
    plannedEnd: dayKey(-8),
  });
  const sprint2 = await api.createSprint(projectId);
  await api.updateSprint(sprint2.id, {
    goal: "소셜 로그인과 정기 결제를 실제로 쓸 수 있게 만든다",
    plannedStart: dayKey(-6),
    plannedEnd: dayKey(8),
  });
  const sprint3 = await api.createSprint(projectId);
  await api.updateSprint(sprint3.id, {
    goal: "관리자 콘솔 2.0 범위를 확정한다",
    plannedStart: dayKey(9),
    plannedEnd: dayKey(23),
  });
  const sprintOf: Record<Bucket, string | null> = {
    s1: sprint1.id,
    s2: sprint2.id,
    s3: sprint3.id,
    backlog: null,
  };

  // 3. 에픽 4 ───────────────────────────────────────────────────
  const epicIds: string[] = [];
  for (const [index, epic] of EPICS.entries()) {
    const created = await api.createIssue({
      projectId,
      title: epic.title,
      type: "epic",
      status: epic.status,
      priority: PRIORITIES[index % PRIORITIES.length],
      assigneeId: users.length > 0 ? users[index % users.length].id : null,
      componentIds: [componentIds[epic.component]],
      labels: [LABEL_POOL[index]],
      dueDate: dayKey(epic.due),
      description: `${epic.title} 관련 작업을 묶어 관리합니다.`,
    });
    epicIds.push(created.id);
  }

  // 4. 표준 이슈 36 ─────────────────────────────────────────────
  const issueIds: string[] = [];
  for (const [index, spec] of ISSUES.entries()) {
    const created = await api.createIssue({
      projectId,
      title: spec.title,
      type: spec.type,
      status: spec.status,
      priority: PRIORITIES[index % PRIORITIES.length],
      assigneeId: assigneeAt(users, index),
      sprintId: sprintOf[spec.bucket],
      parentId: epicIds[spec.epic] ?? null,
      componentIds: [componentIds[spec.component]],
      labels: labelsAt(index),
      dueDate: dueDateAt(index, spec.bucket),
      estimateHours: estimateAt(index),
      fixVersionId: versionOf[spec.bucket],
    });
    issueIds.push(created.id);
  }

  // 5. 하위 작업 6 ──────────────────────────────────────────────
  for (const [index, subtask] of SUBTASKS.entries()) {
    await api.createIssue({
      projectId,
      title: subtask.title,
      type: "subtask",
      status: index % 3 === 0 ? "done" : index % 3 === 1 ? "inprogress" : "todo",
      priority: PRIORITIES[(index + 2) % PRIORITIES.length],
      assigneeId: assigneeAt(users, index + 1),
      sprintId: sprintOf.s2,
      parentId: issueIds[subtask.parent],
      estimateHours: [2, 3, 5][index % 3],
    });
  }

  // 6. 스프린트 수명주기 — 완료된 스프린트 하나, 활성 하나, 계획 하나
  await api.startSprint(sprint1.id);
  await api.completeSprint(sprint1.id);
  await api.startSprint(sprint2.id);

  // 7. 1.0 릴리스 ──────────────────────────────────────────────
  await api.releaseVersion(v10.id);

  // 8. 이슈 링크 5 ─────────────────────────────────────────────
  for (const link of LINKS) {
    await api.addIssueLink({
      sourceId: issueIds[link.source],
      targetId: issueIds[link.target],
      type: link.type,
    });
  }

  // 9. 코멘트 15 (멘션 2) ──────────────────────────────────────
  for (const comment of COMMENTS) {
    const target = users[comment.mention ?? 0];
    const prefix = comment.mention !== undefined && target ? `${mentionHtml(target)} ` : "";
    await api.addComment(issueIds[comment.issue], `<p>${prefix}${comment.body}</p>`);
  }

  // 10. 워크로그 12 ────────────────────────────────────────────
  for (const worklog of WORKLOGS) {
    await api.addWorklog(issueIds[worklog.issue], {
      hours: worklog.hours,
      comment: worklog.comment,
      workedOn: dayKey(worklog.day),
    });
  }

  // 11. 보관 2 · 대시보드 1 ────────────────────────────────────
  await api.archiveIssue(issueIds[ISSUES.length - 1]);
  await api.archiveIssue(issueIds[ISSUES.length - 2]);
  await api.createDashboard({
    name: `${project.key} 진행 현황`,
    shared: true,
    gadgets: GADGETS(projectId),
  });
}

/**
 * 시더가 부르는 스토어 함수 이름 — 어댑터가 전부 갖고 있는지 런타임으로도 확인한다
 * (컴파일 타임 강제는 각 어댑터의 `sampleDataApi()` 객체 리터럴이 한다).
 */
export const SAMPLE_DATA_API_FUNCTIONS = [
  "listUsers",
  "createComponent",
  "createVersion",
  "releaseVersion",
  "createSprint",
  "updateSprint",
  "startSprint",
  "completeSprint",
  "createIssue",
  "addIssueLink",
  "addComment",
  "addWorklog",
  "archiveIssue",
  "createDashboard",
] as const satisfies readonly (keyof SampleDataApi)[];

/** 위 목록이 SampleDataApi를 다 덮는지 — 함수를 추가하고 목록에 안 넣으면 컴파일이 깨진다 */
export type AllSampleDataApiFunctionsListed = Exclude<
  keyof SampleDataApi,
  (typeof SAMPLE_DATA_API_FUNCTIONS)[number]
> extends never
  ? true
  : ["SAMPLE_DATA_API_FUNCTIONS에 빠진 함수가 있습니다"];

/** 시더가 만드는 데이터 요약 — 위저드 카드 뱃지와 테스트가 같은 숫자를 본다 */
export const DEMO_SEED_COUNTS = {
  epics: EPICS.length,
  issues: EPICS.length + ISSUES.length + SUBTASKS.length,
  archived: 2,
  sprints: 3,
  versions: 3,
  components: COMPONENTS.length,
  comments: COMMENTS.length,
  worklogs: WORKLOGS.length,
  links: LINKS.length,
} as const;
