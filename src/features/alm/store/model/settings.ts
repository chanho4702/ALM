// ALM 도메인 모델 타입 — settings (types.ts에서 분할, 동작 불변)
import type { StatusKind, StatusColor, IssueType, IssuePriority } from "./issue";

/** 워크플로 상태 — id는 불변(이슈가 참조), category가 색/완료 판정을 결정한다 */
export interface WorkflowStatus {
  id: string; // StatusDef.id
  /** 레지스트리 값의 캐시 — 읽을 때는 레지스트리가 이기고, 저장할 때는 레지스트리로 관통된다 */
  name: string;
  category: string; // StatusCategory.id
  order: number;
  /** 해석(resolve) 시 채워지는 파생 — 카테고리 의미·색·아이콘. 저장 데이터에는 없다 */
  kind?: StatusKind;
  color?: StatusColor;
  /** 레지스트리(`StatusDef.icon`)의 lucide 키. 빈 문자열/미지정은 kind 기본 아이콘 폴백 */
  icon?: string;
}

/**
 * 워크플로 전이 — 어느 상태에서 어느 상태로 갈 수 있는가.
 * `from`이 비면 모든 상태에서 허용한다(지라의 "All statuses" 전이).
 */
export interface WorkflowTransition {
  id: string;
  name: string;
  from: string[]; // WorkflowStatus.id 목록. 빈 배열 = 모든 상태
  to: string; // WorkflowStatus.id
}

/** 워크플로 캔버스 노드 위치 — 상태 id(또는 `WORKFLOW_ANY_NODE`) → 좌상단 좌표 */
export type WorkflowLayout = Record<string, { x: number; y: number }>;

/** 캔버스의 가상 "모든 상태" 노드 id — 전역 전이(`from: []`)의 출발점 */
export const WORKFLOW_ANY_NODE = "__any__";

/**
 * 구성 가능한 이슈 필드 — 프로젝트·타입·요약·상태는 항상 있으므로 목록에 없다.
 * 순서는 만들기 모달·속성 패널의 표시 순서(지라 순서 고정)와 같다.
 */
export const ISSUE_FIELD_IDS = [
  "description",
  "assignee",
  "priority",
  "labels",
  "components",
  "parent",
  "sprint",
  "dueDate",
  "fixVersion",
  "resolution",
  "estimate",
  "attachments",
  "links",
] as const;

export type IssueFieldId = (typeof ISSUE_FIELD_IDS)[number];

/** 필드 이름 — 화면 라벨이자 검증 오류 문구(서버와 같은 말)의 원천 */
export const ISSUE_FIELD_NAMES: Record<IssueFieldId, string> = {
  description: "설명",
  assignee: "담당자",
  priority: "우선순위",
  labels: "라벨",
  components: "컴포넌트",
  parent: "상위 항목",
  sprint: "스프린트",
  dueDate: "마감일",
  fixVersion: "수정 버전",
  resolution: "해결",
  estimate: "예상 시간",
  attachments: "첨부",
  links: "링크",
};

export interface IssueFieldConfig {
  id: IssueFieldId;
  /** false면 만들기 모달·상세 속성 패널·대량 변경에서 숨긴다 */
  visible: boolean;
  /** true면 만들기 모달에서 필수(값 없으면 만들기 불가) — 서버도 생성 시 검사 */
  required: boolean;
}

/** 설정 본문 — 스킴과 프로젝트 커스텀이 같은 형태를 공유한다 */
export interface SettingsBody {
  statuses: WorkflowStatus[];
  /** 캔버스에서 끌어 놓은 노드 위치. 없는 노드는 자동 배치(dagre) */
  layout?: WorkflowLayout;
  /**
   * 전이 목록. **비어 있거나 없으면 모든 이동을 허용**한다 — 기존 프로젝트가 갑자기
   * 막히지 않게 하려는 기본값이다.
   */
  transitions?: WorkflowTransition[];
  /** 프로젝트에서 쓸 이슈 타입 — subtask는 항상 포함 */
  enabledTypes: IssueType[];
  /** 프로젝트에서 쓸 우선순위(레지스트리 id) — 최소 1개 */
  enabledPriorities: IssuePriority[];
  /** 우선순위 없이 만든 이슈에 붙는 값 — enabledPriorities 안에 있어야 한다 */
  defaultPriority: IssuePriority;
  /**
   * 이슈 필드 구성의 **기본 구성**(모든 타입) — 없거나 비면 13종 전부 `visible:true, required:false`.
   * 모르는 id는 거부하고, 빠진 id는 읽을 때 기본값으로 채운다(구버전 호환).
   */
  fields?: IssueFieldConfig[];
  /**
   * 이슈 타입별 덮어쓰기 — 키는 이슈 타입 레지스트리 id다. 키가 없는 타입은 기본 구성을 따른다.
   * 읽을 때는 덮어쓰기가 있는 타입만 키로 남고 각 목록은 13종 전부로 채워진다.
   */
  fieldsByType?: Record<IssueType, IssueFieldConfig[]>;
}

/** 지라식 설정 스킴 — 전역 관리가 정의하고 프로젝트에 배정한다 */
export interface SettingsScheme {
  id: string;
  name: string;
  isDefault: boolean; // 새 프로젝트 자동 배정, 삭제 불가
  body: SettingsBody;
}

export interface ProjectSettingsEntry {
  projectId: string;
  schemeId: string; // 배정된 스킴 (커스텀 중에도 복귀 대상으로 유지)
  custom: SettingsBody | null; // null = 스킴 사용
}
