import {
  AlignLeft,
  CalendarDays,
  CircleCheck,
  CircleDot,
  Clock,
  CornerLeftUp,
  Flag,
  FolderKanban,
  Layers,
  Link,
  Package,
  Paperclip,
  Shapes,
  Tag,
  Timer,
  Type,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ISSUE_FIELD_IDS, ISSUE_FIELD_NAMES } from "../store/types";
import type { IssueFieldConfig, IssueFieldId, SettingsBody } from "../store/types";

/** 구성 가능한 필드 id — 표시 순서이기도 하다(지라처럼 순서 자체는 고정) */
export const FIELD_IDS = ISSUE_FIELD_IDS;

/** 화면 라벨 — 검증 오류 문구와 같은 이름을 쓴다(store/types.ts가 원천) */
export const FIELD_LABELS: Record<IssueFieldId, string> = ISSUE_FIELD_NAMES;

/**
 * 필수로 지정할 수 없는 필드와 편집기에 띄우는 사유 — 서버도 같은 이유로 400을 낸다.
 * 해결은 완료 상태에서만 입력하고, 상위 항목은 최상위 이슈에 존재할 수 없다.
 */
export const NEVER_REQUIRED_REASON: Partial<Record<IssueFieldId, string>> = {
  resolution: "완료 상태에서만 입력",
  parent: "최상위 이슈가 있어야 함",
};

export const NEVER_REQUIRED: readonly IssueFieldId[] = Object.keys(
  NEVER_REQUIRED_REASON,
) as IssueFieldId[];

/**
 * 필수로 켤 수는 있지만 **만들기를 막지는 않는** 필드 — 이슈를 만든 뒤에 붙는 값이라
 * 서버도 생성 시 강제하지 않는다. 만들기 모달은 `*`만 표시한다.
 */
export const REQUIRED_NOT_ENFORCED_AT_CREATE: readonly IssueFieldId[] = ["attachments", "links"];

/** 기본 구성 — 13종 전부 보이고, 필수는 없다 */
export const DEFAULT_FIELDS: IssueFieldConfig[] = FIELD_IDS.map((id) => ({
  id,
  visible: true,
  required: false,
}));

export const defaultFields = (): IssueFieldConfig[] => DEFAULT_FIELDS.map((f) => ({ ...f }));

/** 필드 구성이 실린 본문 조각 — 기본 구성 + 이슈 타입별 덮어쓰기 */
export type FieldConfigSource = Pick<SettingsBody, "fields" | "fieldsByType">;

/**
 * 본문의 필드 구성을 id → 설정 맵으로 해석한다. 없는 id는 기본값(표시·비필수)으로 채우므로
 * 화면은 언제나 13종 전부를 조회할 수 있다.
 *
 * `typeId`를 주면 그 타입의 덮어쓰기(`fieldsByType[typeId]`)를 **필드 단위로** 기본 구성 위에
 * 얹는다 — 덮어쓰기에 없는 id는 기본 구성을 그대로 따른다(서버·목업과 같은 규칙).
 */
export function resolveFields(
  body?: FieldConfigSource | null,
  typeId?: string | null,
): Record<IssueFieldId, IssueFieldConfig> {
  const base = new Map((body?.fields ?? []).map((f) => [f.id, f]));
  const override = new Map(
    ((typeId && body?.fieldsByType?.[typeId]) || []).map((f) => [f.id, f]),
  );
  return Object.fromEntries(
    FIELD_IDS.map((id) => {
      const found = override.get(id) ?? base.get(id);
      return [id, { id, visible: found?.visible ?? true, required: found?.required ?? false }];
    }),
  ) as Record<IssueFieldId, IssueFieldConfig>;
}

/** 본문의 필드 구성을 13종 전부·고정 순서의 배열로 — 편집기 초안의 원천 */
export const normalizeFields = (
  body?: FieldConfigSource | null,
  typeId?: string | null,
): IssueFieldConfig[] => {
  const map = resolveFields(body, typeId);
  return FIELD_IDS.map((id) => ({ ...map[id] }));
};

/**
 * 이 목록이 덮어쓰기인가 — **빈 목록은 "기본 구성 따름"** 이다(서버도 빈 목록 키를 버린다).
 * `Boolean([])`가 참이라 길이로 판정해야 한다.
 */
export const isFieldOverride = (fields?: IssueFieldConfig[] | null) => (fields?.length ?? 0) > 0;

/** 이 타입이 기본 구성을 덮어쓰고 있는가 — 탭의 ● 표시와 "기본 구성 따름" 스위치의 원천 */
export const hasTypeOverride = (body: FieldConfigSource | null | undefined, typeId: string) =>
  isFieldOverride(body?.fieldsByType?.[typeId]);

/**
 * 본문의 타입별 덮어쓰기를 편집기 초안 형태로 — 덮어쓰기가 있는 타입만 키로 남기고
 * 각 목록을 13종·고정 순서로 채운다. 빠진 id는 **기본 구성**을 따른다(해석과 같은 규칙).
 * 빈 목록 키는 "기본 구성 따름"이므로 버린다(서버 정규화와 같다).
 */
export const normalizeFieldsByType = (
  body?: FieldConfigSource | null,
): Record<string, IssueFieldConfig[]> =>
  Object.fromEntries(
    Object.keys(body?.fieldsByType ?? {})
      .filter((typeId) => hasTypeOverride(body, typeId))
      .map((typeId) => [typeId, normalizeFields(body, typeId)]),
  );

/** 두 구성이 같은가 — 저장 버튼 dirty 판정 */
export const sameFields = (a: IssueFieldConfig[], b: IssueFieldConfig[]) =>
  FIELD_IDS.every((id) => {
    const left = a.find((f) => f.id === id);
    const right = b.find((f) => f.id === id);
    return (left?.visible ?? true) === (right?.visible ?? true) &&
      (left?.required ?? false) === (right?.required ?? false);
  });

/** 타입별 덮어쓰기 맵이 같은가 — 키 집합과 각 구성을 함께 본다(저장 버튼 dirty 판정) */
export const sameFieldsByType = (
  a?: Record<string, IssueFieldConfig[]> | null,
  b?: Record<string, IssueFieldConfig[]> | null,
) => {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every(
    (key) => isFieldOverride(left[key]) === isFieldOverride(right[key]) &&
      (!isFieldOverride(left[key]) || sameFields(left[key], right[key])),
  );
};

/** 필수 표시 — 라벨 뒤에 `*`를 붙인다(요약·프로젝트와 같은 표기) */
export const withRequiredMark = (label: string, required: boolean) =>
  required ? `${label} *` : label;

/**
 * 필드 라벨 앞에 세우는 아이콘 키 — 구성 가능한 13종에 더해, 구성 대상은 아니지만
 * 같은 자리에 서는 필드(타입·상태·프로젝트·요약)까지 포함한다.
 */
export type FieldIconId = IssueFieldId | "type" | "status" | "project" | "summary";

/**
 * 필드를 상징하는 lucide 아이콘 — 지라 이슈 상세의 속성 아이콘을 따른다.
 * 라벨 텍스트를 대신하는 것이 아니라 옆에 서므로, 아이콘은 언제나 `aria-hidden`이다(FieldLabel).
 */
export const FIELD_ICONS: Record<FieldIconId, LucideIcon> = {
  type: Shapes,
  status: CircleDot,
  resolution: CircleCheck,
  parent: CornerLeftUp,
  assignee: UserRound,
  priority: Flag,
  sprint: Timer,
  fixVersion: Package,
  dueDate: CalendarDays,
  labels: Tag,
  components: Layers,
  estimate: Clock,
  description: AlignLeft,
  attachments: Paperclip,
  links: Link,
  project: FolderKanban,
  summary: Type,
};
