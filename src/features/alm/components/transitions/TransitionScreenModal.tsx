import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Banner, Button, Modal, Select, TextArea, TextField } from "@chanho/react";
import type {
  Issue,
  IssueResolution,
  IssueTransitionOption,
  ProjectVersion,
  TransitionFields,
  User,
  WorkflowStatus,
} from "../../store/types";
import { listUsers, listVersions } from "../../store/jiraStore";
import { RESOLUTIONS, RESOLUTION_LABELS } from "../labels";
import { ResolutionGlyph } from "../ResolutionGlyph";
import { StatusGlyph } from "../StatusGlyph";
import { ValueWithIcon } from "../ValueWithIcon";
import { requiredFieldName } from "./transitionText";
import "./transitions.css";

/** Select는 빈 문자열 value를 못 쓴다 — 센티널 */
const NONE = "__none__";

export interface TransitionScreenValues {
  fields: TransitionFields;
  comment: string;
}

export interface TransitionScreenModalProps {
  issue: Issue;
  option: IssueTransitionOption;
  statuses: WorkflowStatus[];
  /** 저장 중(부모가 요청을 보내는 동안) — 버튼을 잠근다 */
  busy?: boolean;
  /** 서버 거부 문구 — 창을 닫지 않고 위에 보인다 */
  error?: string | null;
  onSubmit: (values: TransitionScreenValues) => void;
  onCancel: () => void;
}

/**
 * 전환 화면(A4·C2) — 그 전환의 `screenFields` 칸만 묻는다. 지라의 Transition screen과 같은 자리:
 * 완료로 가는 전환이면 해결(기본 "완료됨")·코멘트, 설정에 따라 담당자·수정 버전·마감일.
 * 검증 필드(`requiredFields`) 중 화면 칸이 있는 것은 `*`, 지금 비어 있는 것(`missingFields`)은 안내한다.
 * 취소하면 이동이 일어나지 않는다(보드는 카드를 제자리로 돌린다).
 */
export function TransitionScreenModal({ issue, option, statuses, busy = false, error, onSubmit, onCancel }: TransitionScreenModalProps) {
  const screen = option.screenFields;
  const has = (field: string) => (screen as string[]).includes(field);
  const required = (field: string) => option.requiredFields.includes(field);
  const [resolution, setResolution] = useState<IssueResolution>(issue.resolution ?? "done");
  const [comment, setComment] = useState("");
  const [assignee, setAssignee] = useState(issue.assigneeId ?? NONE);
  const [fixVersion, setFixVersion] = useState(issue.fixVersionId ?? NONE);
  const [dueDate, setDueDate] = useState(issue.dueDate ?? "");
  const [users, setUsers] = useState<User[]>([]);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);

  useEffect(() => {
    if (has("assignee")) void listUsers().then(setUsers).catch(() => setUsers([]));
    if (has("fixVersion")) void listVersions(issue.projectId).then(setVersions).catch(() => setVersions([]));
    // 화면 칸은 열 때 한 번만 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.projectId]);

  /** 화면 칸 중 검증 필드인데 비어 있으면 저장을 막는다(서버도 400) */
  const missing: string[] = [];
  if (has("assignee") && required("assignee") && assignee === NONE) missing.push("assignee");
  if (has("fixVersion") && required("fixVersion") && fixVersion === NONE) missing.push("fixVersion");
  if (has("dueDate") && required("dueDate") && !dueDate) missing.push("dueDate");
  /** 화면에 칸이 없는 검증 필드가 비어 있으면 이 창에서 채울 수 없다 — 어디서 채우는지 안내한다 */
  const elsewhere = option.missingFields.filter((field) => !(screen as string[]).includes(field));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 모달은 포털이지만 React 이벤트는 컴포넌트 트리로 거품이 오른다 — 바깥 편집 폼(워크플로 저장 등)의 제출로 번지지 않게
    event.stopPropagation();
    if (missing.length > 0 || busy) return;
    const fields: TransitionFields = {};
    if (has("resolution")) fields.resolution = resolution;
    if (has("assignee")) fields.assigneeId = assignee === NONE ? null : assignee;
    if (has("fixVersion")) fields.fixVersionId = fixVersion === NONE ? null : fixVersion;
    if (has("dueDate")) fields.dueDate = dueDate || null;
    onSubmit({ fields, comment: has("comment") ? comment : "" });
  };

  const mark = (label: string, field: string) => (required(field) ? `${label} *` : label);

  return (
    <Modal
      trigger={<span hidden />}
      open
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
      title={option.name}
      description={`${issue.key} · ${issue.title}`}
      className="transition-screen-modal"
    >
      <form className="transition-screen" onSubmit={handleSubmit} aria-label={`${option.name} 전환 화면`}>
        <p className="transition-screen-target">
          <span className="transition-screen-target-label">이동할 상태</span>
          <ValueWithIcon icon={<StatusGlyph status={option.to} statuses={statuses} variant="icon" />}>
            <strong>{option.toName}</strong>
          </ValueWithIcon>
        </p>
        {error ? <Banner variant="danger">{error}</Banner> : null}
        {elsewhere.length > 0 ? (
          <Banner variant="warning">
            {`이 전환은 ${elsewhere.map(requiredFieldName).join(", ")} 값이 있어야 합니다 — 이슈 상세에서 먼저 채우세요.`}
          </Banner>
        ) : null}
        {has("resolution") ? (
          <Select
            label="해결"
            value={resolution}
            options={RESOLUTIONS.map((r) => ({
              value: r,
              label: RESOLUTION_LABELS[r],
              icon: <ResolutionGlyph resolution={r} variant="icon" />,
            }))}
            onValueChange={(value) => setResolution(value as IssueResolution)}
          />
        ) : null}
        {has("assignee") ? (
          <Select
            label={mark("담당자", "assignee")}
            value={assignee}
            searchable={users.length > 8}
            options={[{ value: NONE, label: "미지정" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
            onValueChange={setAssignee}
          />
        ) : null}
        {has("fixVersion") ? (
          <Select
            label={mark("수정 버전", "fixVersion")}
            value={fixVersion}
            options={[
              { value: NONE, label: "없음" },
              ...versions
                .filter((v) => v.status !== "archived" || v.id === issue.fixVersionId)
                .map((v) => ({ value: v.id, label: v.name })),
            ]}
            onValueChange={setFixVersion}
          />
        ) : null}
        {has("dueDate") ? (
          <TextField
            label={mark("마감일", "dueDate")}
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        ) : null}
        {has("comment") ? (
          <TextArea
            label="코멘트"
            rows={3}
            placeholder="전환과 함께 남길 말(선택)"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        ) : null}
        {missing.length > 0 ? (
          <p className="transition-screen-missing" role="status">
            {`필수 항목 미입력: ${missing.map(requiredFieldName).join(", ")}`}
          </p>
        ) : null}
        <div className="transition-screen-actions">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" disabled={busy || missing.length > 0 || elsewhere.length > 0}>
            {option.name}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
