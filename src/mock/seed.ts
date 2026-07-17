import type { Activity, Comment, Issue, JiraData, Project, Sprint } from "../features/jira/store/types";
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
    reporterId: "u1",
    dueDate: null,
    labels: [] as string[],
    createdAt: now,
    updatedAt: now,
  };

  // 라벨/마감일 필터·정렬·대시보드를 바로 확인할 수 있도록 일부 이슈에 샘플 값을 준다
  const dueSoon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const issues: Issue[] = [
    { ...base, id: "i1", key: "ALM-1", title: "프로젝트 스캐폴드 구성", status: "done", priority: "high", assigneeId: "u1", sprintId: "s1", order: 1, labels: ["infra"] },
    { ...base, id: "i2", key: "ALM-2", title: "칸반 보드 UI 구현", status: "inprogress", priority: "high", assigneeId: "u2", sprintId: "s1", order: 1, labels: ["frontend", "design"], dueDate: dueSoon },
    { ...base, id: "i3", key: "ALM-3", title: "이슈 상세 모달 구현", status: "inprogress", priority: "medium", assigneeId: "u1", sprintId: "s1", order: 2, labels: ["frontend"] },
    { ...base, id: "i4", key: "ALM-4", title: "백로그 화면 구현", status: "todo", priority: "medium", assigneeId: "u3", sprintId: "s1", order: 1, dueDate: dueSoon },
    { ...base, id: "i5", key: "ALM-5", title: "이슈 목록 필터 구현", status: "todo", priority: "low", assigneeId: null, sprintId: "s1", order: 2 },
    { ...base, id: "i6", key: "ALM-6", title: "코멘트 기능 구현", status: "todo", priority: "medium", assigneeId: "u4", sprintId: null, order: 1, labels: ["backend"] },
    { ...base, id: "i7", key: "ALM-7", title: "활동 로그 표시", status: "todo", priority: "low", assigneeId: null, sprintId: null, order: 2 },
    { ...base, id: "i8", key: "ALM-8", title: "다크 테마 점검", status: "todo", priority: "low", assigneeId: null, sprintId: null, order: 3, labels: ["design"] },
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

  return {
    users: [...MOCK_USERS],
    projects: [project],
    sprints: [sprint],
    issues,
    comments,
    activities,
    issueCounters: { p1: 8 },
  };
}
