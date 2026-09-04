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

/**
 * 본문의 필드 구성을 id → 설정 맵으로 해석한다. 없는 id는 기본값(표시·비필수)으로 채우므로
 * 화면은 언제나 13종 전부를 조회할 수 있다.
 */
export function resolveFields(
  body?: Pick<SettingsBody, "fields"> | null,
): Record<IssueFieldId, IssueFieldConfig> {
  const byId = new Map((body?.fields ?? []).map((f) => [f.id, f]));
  return Object.fromEntries(
    FIELD_IDS.map((id) => {
      const found = byId.get(id);
      return [id, { id, visible: found?.visible ?? true, required: found?.required ?? false }];
    }),
  ) as Record<IssueFieldId, IssueFieldConfig>;
}

/** 본문의 필드 구성을 13종 전부·고정 순서의 배열로 — 편집기 초안의 원천 */
export const normalizeFields = (body?: Pick<SettingsBody, "fields"> | null): IssueFieldConfig[] => {
  const map = resolveFields(body);
  return FIELD_IDS.map((id) => ({ ...map[id] }));
};

/** 두 구성이 같은가 — 저장 버튼 dirty 판정 */
export const sameFields = (a: IssueFieldConfig[], b: IssueFieldConfig[]) =>
  FIELD_IDS.every((id) => {
    const left = a.find((f) => f.id === id);
    const right = b.find((f) => f.id === id);
    return (left?.visible ?? true) === (right?.visible ?? true) &&
      (left?.required ?? false) === (right?.required ?? false);
  });

/** 필수 표시 — 라벨 뒤에 `*`를 붙인다(요약·프로젝트와 같은 표기) */
export const withRequiredMark = (label: string, required: boolean) =>
  required ? `${label} *` : label;
