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

/** 전환 조건 종류(C1) — 담당자만·프로젝트 역할·하위 이슈가 모두 완료 */
export type TransitionConditionType = "assignee" | "role" | "subtasksDone";

/** 역할 조건의 역할 — 서버 어휘(org-service PROJECT 판정) 그대로 */
export type TransitionConditionRole = "ADMIN" | "EDIT";

/** 전환 조건 — `role`은 `type === "role"`일 때만 의미가 있다(서버는 나머지에 null을 싣는다) */
export interface TransitionCondition {
  type: TransitionConditionType;
  role?: TransitionConditionRole | null;
}

/** 전환 검증(C2)으로 걸 수 있는 필드 — 서버 `SettingsBody.VALIDATOR_FIELDS`와 같은 순서·같은 id */
export const TRANSITION_VALIDATOR_FIELDS = [
  "description",
  "assignee",
  "labels",
  "components",
  "parent",
  "sprint",
  "dueDate",
  "fixVersion",
  "estimate",
] as const;
export type TransitionValidatorField = (typeof TRANSITION_VALIDATOR_FIELDS)[number];

/** 전환 화면(A4·C2)에 넣을 수 있는 칸 — 서버 `SettingsBody.SCREEN_FIELDS`. 해결은 완료로 가는 전환에만 */
export const TRANSITION_SCREEN_FIELDS = ["resolution", "comment", "assignee", "fixVersion", "dueDate"] as const;
export type TransitionScreenField = (typeof TRANSITION_SCREEN_FIELDS)[number];

/** 고정 후처리(C3) — 해결 해제는 내장 규칙이라 후처리로 두지 않는다 */
export type TransitionPostFunctionType = "assignToActor" | "clearAssignee" | "setResolution";

/**
 * 해결 값의 **서버 어휘**(대문자) — 설정 본문은 REST가 가공 없이 왕복하므로 본문 안의 값도 서버 표기를 쓴다.
 * 화면 모델(`IssueResolution`, 소문자)과 바꿀 때는 `resolutionFromServer`/`resolutionToServer`.
 */
export type ServerResolution = "DONE" | "WONT_DO" | "DUPLICATE" | "CANNOT_REPRODUCE";

export interface TransitionPostFunction {
  type: TransitionPostFunctionType;
  /** `setResolution`의 기본 해결 값. 나머지 종류에서는 비어 있다 */
  value?: ServerResolution | null;
}

/**
 * 워크플로 전이 — 어느 상태에서 어느 상태로 갈 수 있는가.
 * `from`이 비면 모든 상태에서 허용한다(지라의 "All statuses" 전이).
 *
 * 아래 넷(2026-10-24 C1~C3)은 모두 선택이고 비면 그 기능을 쓰지 않는다. **저장할 때 반드시 왕복한다** —
 * 편집기가 모르는 칸을 빼고 보내면 서버 본문에서 그 규칙이 사라진다(스킴 body PUT은 전체 교체).
 */
export interface WorkflowTransition {
  id: string;
  name: string;
  from: string[]; // WorkflowStatus.id 목록. 빈 배열 = 모든 상태
  to: string; // WorkflowStatus.id
  /** 누가·언제 할 수 있나 — 모두 충족해야 한다 */
  conditions?: TransitionCondition[];
  /** 전환 뒤 값이 있어야 하는 필드 */
  validators?: TransitionValidatorField[];
  /** 전환할 때 묻는 칸. 비면 화면 없이 바로 전환 */
  screenFields?: TransitionScreenField[];
  /** 전환 뒤 고정 후처리 */
  postFunctions?: TransitionPostFunction[];
}

/**
 * 이슈 타입별 워크플로(C5) — 프로젝트 상태 목록의 **부분집합**과 그 위의 전환.
 * 상태 정의는 프로젝트 목록(`statuses`) 하나뿐이라 보드 열·완료 판정·리포트는 그 목록을 그대로 본다.
 */
export interface TypeWorkflow {
  /** 이 타입이 쓰는 상태 id. 비면 프로젝트 상태 전부. 의미(할 일/진행 중/완료)마다 하나 이상 */
  statuses: string[];
  /** `null`이면 프로젝트 전환 중 이 상태들 사이의 것만, `[]`이면 모두 허용, 목록이면 그것 */
  transitions: WorkflowTransition[] | null;
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
  // V30(2026-10-24) — 뒤에 붙인다(앞 순서는 모달 순서라 그대로). 구버전 본문은 기본값(표시·비필수)으로 채워진다
  "startDate",
  "storyPoints",
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
  startDate: "시작일",
  storyPoints: "스토리 포인트",
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
   * 이슈 필드 구성의 **기본 구성**(모든 타입) — 없거나 비면 15종 전부 `visible:true, required:false`.
   * 모르는 id는 거부하고, 빠진 id는 읽을 때 기본값으로 채운다(구버전 호환).
   */
  fields?: IssueFieldConfig[];
  /**
   * 이슈 타입별 덮어쓰기 — 키는 이슈 타입 레지스트리 id다. 키가 없는 타입은 기본 구성을 따른다.
   * 읽을 때는 덮어쓰기가 있는 타입만 키로 남고 각 목록은 15종 전부로 채워진다.
   */
  fieldsByType?: Record<IssueType, IssueFieldConfig[]>;
  /**
   * 이슈 타입별 워크플로(C5) — 키는 레지스트리 타입 id(대소문자 구분). 키가 없는 타입은 프로젝트 기본 워크플로를 따른다.
   * 다른 구획 저장도 `...body` 스프레드로 이 값을 보존해야 한다(빠지면 서버에서 지워진다).
   */
  workflowsByType?: Record<IssueType, TypeWorkflow>;
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
