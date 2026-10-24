import type { ReactNode } from "react";
import type { CommandItem, ContextMenuItem } from "@chanho/react";
import { CircleDot, Copy, CopyPlus, ExternalLink, Eye, GitBranch, Link2, Signal, Star, Tag as TagIcon, Trash2, UserRound, UserRoundCheck } from "lucide-react";
import type { Issue } from "../store/types";
import type { BulkIssuePatch } from "../store/jiraStore";
import type { IssueFieldOptions, PaletteField } from "./commandScope";
import { openCommandPalette } from "./commandScope";
import type { IssueActionRunner } from "./useIssueActions";
import { describeTargets } from "./useIssueActions";
import { BUILTIN_PRIORITY_IDS, priorityName, statusName } from "./labels";
import { PriorityGlyph } from "./PriorityGlyph";
import { StatusGlyph } from "./StatusGlyph";
import { UserAvatar } from "./UserAvatar";
import type { StatusAvailability } from "./statusAvailability";

/** 브랜치 이름 복사 단축키 힌트 — 실제 바인딩은 CommandPaletteHost(⌘/Ctrl+Shift+.) */
export const COPY_BRANCH_SHORTCUT = "Ctrl+Shift+.";

/**
 * 이슈 명령 모델 — 우클릭 메뉴(ContextMenu)와 명령 팔레트(CommandPalette)가 같은 선택지·같은 단축키 힌트를
 * 쓰도록 한 곳에서 만든다. 단축키 힌트는 **실제로 바인딩된 키만** 적는다(`?` 도움말 SHORTCUT_GROUPS와 같은 키).
 */
export const FIELD_SHORTCUTS: Record<PaletteField, string> = {
  status: "S",
  priority: "P",
  assignee: "A",
  labels: "L",
};

/** 필드 명령 아이콘 — 메뉴·팔레트 공통(값 자체의 글리프는 하위 항목이 갖는다) */
const FIELD_ICONS: Record<PaletteField, (size: number) => ReactNode> = {
  status: (size) => <CircleDot size={size} />,
  priority: (size) => <Signal size={size} />,
  assignee: (size) => <UserRound size={size} />,
  labels: (size) => <TagIcon size={size} />,
};

export const FIELD_TITLES: Record<PaletteField, string> = {
  status: "상태 변경",
  priority: "우선순위 변경",
  assignee: "담당자 변경",
  labels: "라벨",
};

/** 필드 선택지 하나 — 고르면 `patch`를 대상 전부에 적용한다 */
export interface FieldChoice {
  id: string;
  label: string;
  icon?: ReactNode;
  /** 대상 전부가 이 값이면 true(체크 표시) */
  checked: boolean;
  patch: BulkIssuePatch;
  successTitle: string;
  /** 고를 수 없는 항목(조건에 막힌 전환·불러오는 중) */
  disabled?: boolean;
  /** 못 고르는 이유 등 보조 설명 */
  description?: string;
  /** 있으면 일괄 편집 패치가 아니라 워크플로 전환으로 간다(상태 변경) */
  transitionTo?: { id: string; name: string };
}

/** 선택지 적용 — 상태는 전환 실행, 나머지는 일괄 편집 */
export function applyChoice(choice: FieldChoice, targets: Issue[], actions: IssueActionRunner): void {
  if (choice.disabled) return;
  if (choice.transitionTo) void actions.transition(targets, choice.transitionTo.id, choice.transitionTo.name);
  else void actions.update(targets, choice.patch, choice.successTitle);
}

const UNASSIGNED = "__unassigned__";

export function fieldChoices(
  field: PaletteField,
  targets: Issue[],
  options: IssueFieldOptions,
  availability?: StatusAvailability,
): FieldChoice[] {
  const all = (test: (issue: Issue) => boolean) => targets.length > 0 && targets.every(test);
  switch (field) {
    case "status":
      if (availability) return statusTransitionChoices(targets, options, availability);
      return options.statuses.map((status) => ({
        id: `status:${status.id}`,
        label: status.name,
        icon: <StatusGlyph status={status.id} statuses={options.statuses} variant="icon" />,
        checked: all((issue) => issue.status === status.id),
        patch: { status: status.id },
        successTitle: `상태를 ${status.name}(으)로 바꿨습니다`,
      }));
    case "priority": {
      const ids = options.priorities.length > 0 ? options.priorities.map((p) => p.id) : BUILTIN_PRIORITY_IDS;
      return ids.map((id) => ({
        id: `priority:${id}`,
        label: priorityName(options.priorities, id),
        icon: <PriorityGlyph defs={options.priorities} priority={id} size={14} variant="icon" />,
        checked: all((issue) => issue.priority === id),
        patch: { priority: id },
        successTitle: `우선순위를 ${priorityName(options.priorities, id)}(으)로 바꿨습니다`,
      }));
    }
    case "assignee":
      return [
        {
          id: `assignee:${UNASSIGNED}`,
          label: "미지정",
          icon: <UserRound size={14} />,
          checked: all((issue) => issue.assigneeId === null),
          patch: { assigneeId: null },
          successTitle: "담당자를 비웠습니다",
        },
        ...options.users.map((user) => ({
          id: `assignee:${user.id}`,
          label: user.name,
          icon: <UserAvatar user={user} size="small" />,
          checked: all((issue) => issue.assigneeId === user.id),
          patch: { assigneeId: user.id },
          successTitle: `담당자를 ${user.name}(으)로 바꿨습니다`,
        })),
      ];
    case "labels":
      return options.labels.map((label) => {
        const has = all((issue) => issue.labels.includes(label));
        return {
          id: `label:${label}`,
          label,
          icon: <TagIcon size={14} />,
          checked: has,
          // 전부 갖고 있으면 빼고, 하나라도 없으면 붙인다(지라·리니어의 라벨 토글)
          patch: has ? { removeLabels: [label] } : { addLabels: [label] },
          successTitle: has ? `라벨 ${label}을(를) 뺐습니다` : `라벨 ${label}을(를) 붙였습니다`,
        };
      });
  }
}

const placeholderChoice = (id: string, label: string, description?: string): FieldChoice => ({
  id,
  label,
  description,
  checked: false,
  disabled: true,
  patch: {},
  successTitle: "",
});

/** 상태 하위 메뉴 — 가용 전환만(statusAvailability). 상태 순서는 워크플로 order */
function statusTransitionChoices(targets: Issue[], options: IssueFieldOptions, availability: StatusAvailability): FieldChoice[] {
  if (availability.state === "loading") return [placeholderChoice("status:loading", "전환 불러오는 중…")];
  if (availability.state === "error") {
    return [placeholderChoice("status:error", "전환 목록을 불러오지 못했습니다", availability.error)];
  }
  const known = new Set(options.statuses.map((s) => s.id));
  const ids = [
    ...options.statuses.map((s) => s.id).filter((id) => availability.byStatus.has(id)),
    // 워크플로 밖(타입별 워크플로의 상태 등) 전환 대상도 버리지 않는다
    ...[...availability.byStatus.keys()].filter((id) => !known.has(id)),
  ];
  const choices = ids.map((id): FieldChoice => {
    const state = availability.byStatus.get(id)!;
    const name = statusName(options.statuses, id);
    return {
      id: `status:${id}`,
      label: name,
      icon: <StatusGlyph status={id} statuses={options.statuses} variant="icon" />,
      checked: false,
      disabled: !state.available,
      description: state.reason ?? undefined,
      patch: {},
      successTitle: `상태를 ${name}(으)로 바꿨습니다`,
      transitionTo: { id, name },
    };
  });
  if (choices.length === 0) {
    return [placeholderChoice("status:none", targets.length === 1 ? "지금 상태에서 갈 수 있는 전환이 없습니다" : "함께 갈 수 있는 상태가 없습니다")];
  }
  return choices;
}

/** 새 라벨 만들어 붙이기 — 팔레트 라벨 페이지에서 검색어가 기존 라벨과 다를 때 */
export function newLabelChoice(query: string, options: IssueFieldOptions): FieldChoice | null {
  const label = query.trim();
  if (!label || /[\s,]/.test(label) || options.labels.includes(label)) return null;
  return {
    id: `label-new:${label}`,
    label: `새 라벨 "${label}" 붙이기`,
    icon: <TagIcon size={14} />,
    checked: false,
    patch: { addLabels: [label] },
    successTitle: `라벨 ${label}을(를) 붙였습니다`,
  };
}

/** 현재 값 설명 — 팔레트 항목 설명 칸("현재: 진행 중") */
export function currentValue(field: PaletteField, targets: Issue[], options: IssueFieldOptions): string | undefined {
  if (targets.length !== 1) return describeTargets(targets);
  const issue = targets[0];
  switch (field) {
    case "status":
      return `현재: ${statusName(options.statuses, issue.status)}`;
    case "priority":
      return `현재: ${priorityName(options.priorities, issue.priority)}`;
    case "assignee":
      return `현재: ${issue.assigneeId ? (options.users.find((u) => u.id === issue.assigneeId)?.name ?? "알 수 없음") : "미지정"}`;
    case "labels":
      return issue.labels.length > 0 ? `현재: ${issue.labels.join(", ")}` : "현재: 없음";
  }
}

export interface IssueMenuExtras {
  /** 미리보기 토글(목록·보드·백로그) */
  onPeek?: (issue: Issue) => void;
  /** 상세 열기 */
  onOpen?: (issue: Issue) => void;
  /** 상태 하위 메뉴의 가용 전환(없으면 상태 목록 전부 — 옛 동작) */
  statusAvailability?: StatusAvailability;
  /** 즐겨찾기(단건) — 지금 고정됐나와 토글 */
  favorite?: { pinned: boolean; toggle: (issue: Issue) => void };
}

const FIELDS: PaletteField[] = ["status", "assignee", "priority", "labels"];

/** 우클릭 메뉴 항목 — 선택 여러 개면 머리글이 "3개 이슈"이고 모든 변경이 선택 전체에 적용된다 */
export function issueContextMenuItems(
  targets: Issue[],
  options: IssueFieldOptions,
  actions: IssueActionRunner,
  extras: IssueMenuExtras = {},
): ContextMenuItem[] {
  if (targets.length === 0) return [];
  const single = targets.length === 1 ? targets[0] : null;
  const fieldItem = (field: PaletteField): ContextMenuItem => {
    const choices = fieldChoices(field, targets, options, field === "status" ? extras.statusAvailability : undefined);
    return {
      label: FIELD_TITLES[field],
      icon: FIELD_ICONS[field](14),
      shortcut: FIELD_SHORTCUTS[field],
      disabled: choices.length === 0,
      items: choices.map((choice) => ({
        label: choice.label,
        icon: choice.icon,
        description: choice.description,
        disabled: choice.disabled,
        // 상태 전환 항목은 체크 항목이 아니다(현재 상태는 전환 목록에 없다)
        checked: choice.transitionTo || choice.disabled ? undefined : choice.checked,
        onSelect: () => applyChoice(choice, targets, actions),
      })),
    };
  };
  return [
    { heading: single ? `${single.key} ${single.title}` : `${targets.length}개 이슈` },
    ...(single && extras.onOpen
      ? [{ label: "이슈 열기", icon: <ExternalLink size={14} />, shortcut: "O", onSelect: () => extras.onOpen!(single) }]
      : []),
    ...(single && extras.onPeek
      ? [{ label: "미리보기", icon: <Eye size={14} />, shortcut: "Space", onSelect: () => extras.onPeek!(single) }]
      : []),
    { separator: true },
    ...FIELDS.map(fieldItem),
    { label: "나에게 할당", icon: <UserRoundCheck size={14} />, shortcut: "I", onSelect: () => void actions.assignToMe(targets) },
    { separator: true },
    { label: single ? "키 복사" : "키 복사(전부)", icon: <Copy size={14} />, onSelect: () => void actions.copyKeys(targets) },
    { label: single ? "링크 복사" : "링크 복사(전부)", icon: <Link2 size={14} />, onSelect: () => void actions.copyLinks(targets) },
    {
      label: single ? "브랜치 이름 복사" : "브랜치 이름 복사(전부)",
      icon: <GitBranch size={14} />,
      shortcut: COPY_BRANCH_SHORTCUT,
      onSelect: () => void actions.copyBranchName(targets),
    },
    ...(single && extras.favorite
      ? [
          {
            label: extras.favorite.pinned ? "즐겨찾기에서 빼기" : "즐겨찾기에 추가",
            icon: <Star size={14} />,
            onSelect: () => extras.favorite!.toggle(single),
          },
        ]
      : []),
    {
      label: "복제",
      icon: <CopyPlus size={14} />,
      // 복제는 한 건씩 — 여러 건 복제는 지라에도 없다(대량 작업 목록에 없음)
      disabled: single === null,
      onSelect: single ? () => void actions.duplicate(single) : undefined,
    },
    { separator: true },
    {
      label: single ? "삭제" : `${targets.length}개 삭제`,
      icon: <Trash2 size={14} />,
      danger: true,
      onSelect: () => actions.requestDelete(targets),
    },
  ];
}

/** 팔레트 "현재 이슈" 그룹 — 필드 변경은 하위 페이지("상태 변경 →")로 들어간다 */
export function issuePaletteCommands(
  targets: Issue[],
  options: IssueFieldOptions,
  actions: IssueActionRunner,
  extras: IssueMenuExtras = {},
): CommandItem[] {
  if (targets.length === 0) return [];
  const group = targets.length === 1 ? `현재 이슈 · ${targets[0].key}` : `선택한 ${targets.length}개 이슈`;
  const single = targets.length === 1 ? targets[0] : null;
  return [
    ...FIELDS.map((field) =>
      fieldPaletteItem(field, targets, options, actions, group, field === "status" ? extras.statusAvailability : undefined),
    ),
    {
      id: "issue:assign-me",
      group,
      label: "나에게 할당",
      icon: <UserRoundCheck size={16} />,
      shortcut: "I",
      keywords: ["assign", "me", "담당"],
      onSelect: () => void actions.assignToMe(targets),
    },
    ...(single && extras.onOpen
      ? [{ id: "issue:open", group, label: "이슈 열기", icon: <ExternalLink size={16} />, shortcut: "O", onSelect: () => extras.onOpen!(single) }]
      : []),
    { id: "issue:copy-key", group, label: "키 복사", icon: <Copy size={16} />, keywords: ["copy", "key"], onSelect: () => void actions.copyKeys(targets) },
    { id: "issue:copy-link", group, label: "링크 복사", icon: <Link2 size={16} />, keywords: ["copy", "link", "url"], onSelect: () => void actions.copyLinks(targets) },
    {
      id: "issue:copy-branch",
      group,
      label: "브랜치 이름 복사",
      icon: <GitBranch size={16} />,
      shortcut: ["Ctrl", "Shift", "."],
      keywords: ["git", "branch", "브랜치", "copy"],
      onSelect: () => void actions.copyBranchName(targets),
    },
    ...(single && extras.favorite
      ? [
          {
            id: "issue:favorite",
            group,
            label: extras.favorite.pinned ? "즐겨찾기에서 빼기" : "즐겨찾기에 추가",
            icon: <Star size={16} />,
            keywords: ["favorite", "pin", "star", "즐겨찾기", "별표"],
            onSelect: () => extras.favorite!.toggle(single),
          },
        ]
      : []),
    ...(single
      ? [{ id: "issue:duplicate", group, label: "복제", icon: <CopyPlus size={16} />, keywords: ["clone", "duplicate"], onSelect: () => void actions.duplicate(single) }]
      : []),
    { id: "issue:delete", group, label: single ? "삭제" : `${targets.length}개 삭제`, icon: <Trash2 size={16} />, keywords: ["delete"], onSelect: () => actions.requestDelete(targets) },
  ];
}

/** 필드 하위 페이지 항목 — 루트에서 들어가거나(`items`), 속성 단축키로 바로 연다(`fieldPageItems`) */
export function fieldPaletteItem(
  field: PaletteField,
  targets: Issue[],
  options: IssueFieldOptions,
  actions: IssueActionRunner,
  group?: string,
  availability?: StatusAvailability,
): CommandItem {
  return {
    id: `field:${field}`,
    group,
    label: `${FIELD_TITLES[field]}…`,
    icon: FIELD_ICONS[field](16),
    description: currentValue(field, targets, options),
    shortcut: FIELD_SHORTCUTS[field],
    keywords: [field],
    placeholder: `${FIELD_TITLES[field]} — ${describeTargets(targets)}`,
    // 하위 페이지 항목은 들어갈 때 스냅숏이다 — 전환 목록을 아직 읽는 중이면 그 필드 페이지로 다시 연다(살아 있는 목록)
    ...(field === "status" && availability?.state === "loading"
      ? { onSelect: () => setTimeout(() => openCommandPalette("status"), 0) }
      : { items: fieldPageItems(field, targets, options, actions, "", availability) }),
  };
}

export function fieldPageItems(
  field: PaletteField,
  targets: Issue[],
  options: IssueFieldOptions,
  actions: IssueActionRunner,
  query = "",
  availability?: StatusAvailability,
): CommandItem[] {
  const choices = fieldChoices(field, targets, options, field === "status" ? availability : undefined);
  const extra = field === "labels" ? newLabelChoice(query, options) : null;
  return [...choices, ...(extra ? [extra] : [])].map((choice) => ({
    id: choice.id,
    label: choice.label,
    icon: choice.icon,
    description: choice.description ?? (choice.checked ? (field === "labels" ? "붙어 있음 · 고르면 뺌" : "현재 값") : undefined),
    disabled: choice.disabled,
    keywords: choice.id.startsWith("label-new:") ? [query] : undefined,
    onSelect: () => applyChoice(choice, targets, actions),
  }));
}
