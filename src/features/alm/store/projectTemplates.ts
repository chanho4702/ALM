import type { BoardColumn, BoardFilter, BoardType, IssueStatus, IssueType } from "./types";

export type ProjectTemplateId = "blank" | "scrum" | "kanban" | "bugtrack" | "demo";

/** 템플릿이 만드는 샘플 이슈 — 삭제해도 무방한 온보딩용 더미 */
export interface TemplateSampleIssue {
  title: string;
  type: IssueType;
  status?: IssueStatus;
  labels?: string[];
}

export interface ProjectTemplate {
  id: ProjectTemplateId;
  name: string;
  description: string;
  glyph: string;
  /** 카드 미리보기 — 실제로 만들어질 컬럼 구성 그대로 */
  preview: string[];
  /** 포함물 요약 뱃지 */
  includes: string[];
  /** 기본 보드 세팅 (blank는 현행 기본 보드 그대로) */
  board: {
    name: string;
    type: BoardType;
    columns: BoardColumn[];
    filter: BoardFilter;
  } | null;
  /** true면 Sprint 1(planned) 생성 */
  withSprint: boolean;
  samples: TemplateSampleIssue[];
  /**
   * true면 `store/sampleData.ts`의 공용 시더가 데모 데이터를 채운다(목업·REST 공통).
   * 나머지 템플릿은 board/withSprint/samples만으로 끝난다 — 동작을 바꾸지 않는다.
   */
  richSeed?: boolean;
}

const DEFAULT_COLUMNS: BoardColumn[] = [
  { status: "todo", name: "할 일", wipLimit: null },
  { status: "inprogress", name: "진행 중", wipLimit: null },
  { status: "done", name: "완료", wipLimit: null },
];

const NO_FILTER: BoardFilter = { assigneeIds: [], types: [], labels: [] };

/** 순서 = 생성 페이지 카드 순서. "빈 프로젝트"가 항상 첫 자리 (템플릿 강요 없음) */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "blank",
    name: "빈 프로젝트",
    description: "기본 스크럼 보드만 두고 처음부터 직접 구성합니다.",
    glyph: "◻",
    preview: ["할 일", "진행 중", "완료"],
    includes: [],
    board: null,
    withSprint: false,
    samples: [],
  },
  {
    id: "scrum",
    name: "스크럼",
    description: "스프린트 단위로 계획하고 보드로 진행을 봅니다.",
    glyph: "⚡",
    preview: ["할 일", "진행 중", "완료"],
    includes: ["Sprint 1", "샘플 이슈 3개"],
    board: { name: "스프린트 보드", type: "scrum", columns: DEFAULT_COLUMNS, filter: NO_FILTER },
    withSprint: true,
    samples: [
      { title: "첫 스프린트 목표 정하기", type: "story" },
      { title: "백로그 우선순위 정리", type: "task" },
      { title: "팀 온보딩 문서 작성", type: "task" },
    ],
  },
  {
    id: "kanban",
    name: "칸반",
    description: "스프린트 없이 흐름 중심으로 일합니다. 진행 중 WIP 제한 포함.",
    glyph: "▤",
    preview: ["할 일", "진행 중 (WIP 3)", "완료"],
    includes: ["샘플 이슈 3개"],
    board: {
      name: "칸반 보드",
      type: "kanban",
      columns: [
        { status: "todo", name: "할 일", wipLimit: null },
        { status: "inprogress", name: "진행 중", wipLimit: 3 },
        { status: "done", name: "완료", wipLimit: null },
      ],
      filter: NO_FILTER,
    },
    withSprint: false,
    samples: [
      { title: "칸반 보드 사용법 익히기", type: "task", status: "inprogress" },
      { title: "첫 작업 등록하기", type: "task" },
      { title: "WIP 제한 조정하기", type: "task" },
    ],
  },
  {
    id: "bugtrack",
    name: "버그 트래킹",
    description: "버그 접수/처리에 집중합니다. 보드는 버그 타입만 봅니다.",
    glyph: "●",
    preview: ["할 일", "진행 중", "완료"],
    includes: ["버그 필터 보드", "샘플 버그 2개"],
    board: {
      name: "버그 보드",
      type: "kanban",
      columns: DEFAULT_COLUMNS,
      filter: { assigneeIds: [], types: ["bug"], labels: [] },
    },
    withSprint: false,
    samples: [
      { title: "예시: 로그인 버튼이 눌리지 않음", type: "bug", labels: ["bug"] },
      { title: "예시: 다크 모드에서 글자가 안 보임", type: "bug", labels: ["bug"] },
      { title: "버그 접수 규칙 문서화", type: "task" },
    ],
  },
  {
    id: "demo",
    name: "데모 프로젝트 (풍부한 샘플)",
    description: "스프린트·릴리스·컴포넌트·코멘트·워크로그까지 채워진 데모용.",
    glyph: "★",
    preview: ["할 일", "진행 중", "완료"],
    includes: ["이슈 46개", "스프린트 3개", "릴리스 3개", "컴포넌트 4개", "대시보드 1개"],
    board: { name: "데모 보드", type: "scrum", columns: DEFAULT_COLUMNS, filter: NO_FILTER },
    withSprint: false, // 스프린트는 시더가 3개 만든다
    samples: [], // 이슈도 시더가 만든다
    richSeed: true,
  },
];

export function getTemplate(id: ProjectTemplateId): ProjectTemplate {
  return PROJECT_TEMPLATES.find((t) => t.id === id) ?? PROJECT_TEMPLATES[0];
}
