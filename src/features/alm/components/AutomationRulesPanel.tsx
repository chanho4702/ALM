import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  Dropdown,
  EmptyState,
  Lozenge,
  SkeletonListItem,
  Switch,
  Tabs,
  useToast,
} from "@chanho/react";
import {
  AlertTriangle,
  CircleCheck,
  CircleX,
  Copy,
  Gauge,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
} from "lucide-react";
import type { AutomationOutcome, AutomationRule, AutomationRuleInput, AutomationRun, User, WorkflowStatus } from "../store/types";
import {
  deleteAutomationRule,
  listAutomationRules,
  listProjectAutomationRuns,
  listProjectLabels,
  listProjectStatuses,
  listUsers,
  updateAutomationRule,
} from "../store/jiraStore";
import { errorStatus } from "../store/mapping";
import { AutomationRuleEditor, ACTION_ICONS, TRIGGER_ICONS } from "./AutomationRuleEditor";
import {
  OUTCOME_APPEARANCE,
  OUTCOME_LABELS,
  TRIGGER_LABELS,
  actionSummary,
  duplicateInput,
  ruleToInput,
  triggerSummary,
} from "./automationLabels";
import type { AutomationNameLookup } from "./automationLabels";
import { priorityName, statusName } from "./labels";
import { formatDateTime, relTime } from "./time";
import { usePriorities } from "./usePriorities";
import { useIssueModal } from "./useIssueModal";
import "./automation.css";

export interface AutomationRulesPanelProps {
  projectId: string;
  /** 프로젝트 관리자만 규칙을 보고 고친다(서버도 ADMIN만) */
  canManage: boolean;
}

const RUN_LIMIT = 50;

const OUTCOME_ICONS: Record<AutomationOutcome, typeof CircleCheck> = {
  SUCCESS: CircleCheck,
  FAILED: CircleX,
  LOOP_BLOCKED: Repeat,
  RATE_LIMITED: Gauge,
};

type EditorState =
  | { mode: "closed" }
  | { mode: "create"; initial: AutomationRuleInput | null }
  | { mode: "edit"; rule: AutomationRule };

/**
 * 프로젝트 설정 › 자동화(V36·V37) — 지라 Automation처럼 규칙 목록 → 편집기(트리거·조건·액션) → 감사 로그.
 * 관리·이력 조회는 프로젝트 ADMIN만이라 관리자가 아니면 API를 부르지 않고 안내만 보인다.
 */
export function AutomationRulesPanel({ projectId, canManage }: AutomationRulesPanelProps) {
  if (!canManage) {
    return (
      <div className="project-settings">
        <Card padding="lg" title="자동화">
          <p className="settings-help">프로젝트 관리자만 자동화 규칙을 보고 고칠 수 있습니다.</p>
          <p className="settings-help">
            자동화 규칙은 이슈가 만들어지거나 바뀔 때, 또는 정해진 시각에 필드 설정·담당자 지정·코멘트·전환·알림을 대신
            실행합니다. 규칙이 필요하면 프로젝트 관리자에게 요청하세요.
          </p>
        </Card>
      </div>
    );
  }
  return <ManagePanel projectId={projectId} />;
}

function ManagePanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const priorities = usePriorities();
  const [rules, setRules] = useState<AutomationRule[] | null>(null);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState("rules");
  const [runs, setRuns] = useState<AutomationRun[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [deleting, setDeleting] = useState<AutomationRule | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [ruleList, statusList, userList, labelList] = await Promise.all([
        listAutomationRules(projectId),
        listProjectStatuses(projectId),
        listUsers(),
        listProjectLabels(projectId),
      ]);
      setRules(ruleList);
      setStatuses(statusList);
      setUsers(userList);
      setLabels(labelList);
      setLoadError(null);
    } catch (error) {
      // 503(권한 서비스 불능)·네트워크 오류는 "규칙 없음"이 아니라 오류 상태로 드러낸다
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [projectId]);

  const reloadRuns = useCallback(async () => {
    try {
      setRuns(await listProjectAutomationRuns(projectId, RUN_LIMIT));
      setRunsError(null);
    } catch (error) {
      setRunsError(error instanceof Error ? error.message : String(error));
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (tab === "runs") void reloadRuns();
  }, [tab, reloadRuns]);

  const { openIssue, issueModal } = useIssueModal(() => {
    void reload();
    if (tab === "runs") void reloadRuns();
  });

  const names: AutomationNameLookup = useMemo(
    () => ({
      statusName: (id) => statusName(statuses, id),
      userName: (id) => users.find((u) => u.id === id)?.name ?? id,
      priorityName: (id) => priorityName(priorities, id),
    }),
    [statuses, users, priorities],
  );

  const toggle = async (rule: AutomationRule, enabled: boolean) => {
    try {
      await updateAutomationRule(rule.id, { ...ruleToInput(rule), enabled }, rule.version);
      toast({ title: enabled ? `"${rule.name}" 규칙을 켰습니다` : `"${rule.name}" 규칙을 껐습니다`, appearance: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: errorStatus(error) === 409 ? "다른 사용자가 먼저 이 규칙을 수정했습니다" : "규칙 상태 변경 실패",
        description: errorStatus(error) === 409 ? "최신 목록을 다시 불러왔습니다. 다시 시도하세요." : message,
        appearance: "danger",
      });
    }
    await reload();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteAutomationRule(deleting.id);
      toast({ title: `"${deleting.name}" 규칙을 삭제했습니다`, appearance: "success" });
      setDeleting(null);
    } catch (error) {
      toast({ title: "규칙 삭제 실패", description: error instanceof Error ? error.message : String(error), appearance: "danger" });
    } finally {
      setBusy(false);
    }
    await reload();
    if (tab === "runs") await reloadRuns();
  };

  const header = (
    <div className="automation-panel-head">
      <p className="settings-help">
        트리거(언제) → 조건(어떤 이슈에, AQL) → 액션(무엇을)으로 반복 작업을 대신합니다. 액션은 규칙을 마지막으로 저장한
        사람의 권한으로 실행되고, 실패·루프·실행 상한은 감사 로그에 남습니다.
      </p>
      <Button iconBefore={<Plus size={16} aria-hidden />} onClick={() => setEditor({ mode: "create", initial: null })} disabled={!rules}>
        규칙 만들기
      </Button>
    </div>
  );

  let rulesContent;
  if (loadError) {
    rulesContent = (
      <Banner variant="danger" action={{ label: "다시 시도", onClick: () => void reload() }}>
        자동화 규칙을 불러오지 못했습니다 — {loadError}
      </Banner>
    );
  } else if (!rules) {
    rulesContent = (
      <div className="automation-loading" aria-busy="true">
        <SkeletonListItem label="자동화 규칙 불러오는 중" lines={2} />
        <SkeletonListItem lines={2} />
      </div>
    );
  } else if (rules.length === 0) {
    rulesContent = (
      <EmptyState
        title="아직 자동화 규칙이 없습니다"
        description="예: 완료로 옮기면 플래그를 내리고 코멘트 남기기, 버그가 만들어지면 우선순위 높이기."
        primaryAction={{ label: "첫 규칙 만들기", onClick: () => setEditor({ mode: "create", initial: null }) }}
      />
    );
  } else {
    rulesContent = (
      <ul className="automation-rule-list" aria-label="자동화 규칙 목록">
        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            names={names}
            onToggle={(enabled) => void toggle(rule, enabled)}
            onEdit={() => setEditor({ mode: "edit", rule })}
            onDuplicate={() => setEditor({ mode: "create", initial: duplicateInput(rule) })}
            onDelete={() => setDeleting(rule)}
          />
        ))}
      </ul>
    );
  }

  const ruleName = (id: string) => rules?.find((r) => r.id === id)?.name ?? "삭제된 규칙";

  let runsContent;
  if (runsError) {
    runsContent = (
      <Banner variant="danger" action={{ label: "다시 시도", onClick: () => void reloadRuns() }}>
        감사 로그를 불러오지 못했습니다 — {runsError}
      </Banner>
    );
  } else if (!runs) {
    runsContent = (
      <div className="automation-loading" aria-busy="true">
        <SkeletonListItem label="감사 로그 불러오는 중" lines={1} />
      </div>
    );
  } else if (runs.length === 0) {
    runsContent = (
      <p className="settings-empty">
        아직 실행 기록이 없습니다. 조건에 맞지 않아 건너뛴 실행은 남지 않습니다. 기록은 30일 동안 보관합니다.
      </p>
    );
  } else {
    runsContent = (
      <ol className="automation-run-list" aria-label="자동화 감사 로그">
        {runs.map((run) => {
          const Icon = OUTCOME_ICONS[run.outcome];
          return (
            <li key={run.id} className="automation-run">
              <Lozenge appearance={OUTCOME_APPEARANCE[run.outcome]} className="automation-outcome">
                <Icon size={12} aria-hidden /> {OUTCOME_LABELS[run.outcome]}
              </Lozenge>
              <div className="automation-run-main">
                <span className="automation-run-title">
                  <strong>{ruleName(run.ruleId)}</strong>
                  {run.issueKey ? (
                    <Button
                      size="small"
                      variant="ghost"
                      className="automation-run-issue"
                      aria-label={`${run.issueKey} 열기`}
                      onClick={() => openIssue(run.issueKey!)}
                    >
                      {run.issueKey}
                    </Button>
                  ) : (
                    <span className="automation-run-meta">예약 회차</span>
                  )}
                </span>
                <span className="automation-run-meta">
                  {TRIGGER_LABELS[run.triggerType] ?? run.triggerType} · 연쇄 {run.depth}단계 · 액션 {run.actionsRun}개 실행
                </span>
                {run.message ? <span className="automation-run-message">{run.message}</span> : null}
              </div>
              <time className="automation-run-time" dateTime={run.startedAt} title={formatDateTime(run.startedAt)}>
                {relTime(run.startedAt)}
              </time>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className="project-settings">
      <Card padding="lg" title="자동화">
        {header}
        <Tabs
          label="자동화 보기"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "rules", label: "규칙", content: <div className="automation-tab">{rulesContent}</div> },
            {
              value: "runs",
              label: "감사 로그",
              content: (
                <div className="automation-tab">
                  <div className="automation-runs-head">
                    <span className="settings-help">최근 {RUN_LIMIT}건 · 최신 순</span>
                    <Button
                      size="small"
                      variant="secondary"
                      iconBefore={<RefreshCw size={14} aria-hidden />}
                      onClick={() => void reloadRuns()}
                    >
                      새로 고침
                    </Button>
                  </div>
                  {runsContent}
                </div>
              ),
            },
          ]}
        />
      </Card>

      {editor.mode !== "closed" ? (
        <AutomationRuleEditor
          open
          onOpenChange={(open) => {
            if (!open) setEditor({ mode: "closed" });
          }}
          projectId={projectId}
          rule={editor.mode === "edit" ? editor.rule : null}
          initial={editor.mode === "create" ? editor.initial : null}
          statuses={statuses}
          users={users}
          priorities={priorities}
          labels={labels}
          onSaved={() => void reload()}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="자동화 규칙 삭제"
        description={deleting ? `"${deleting.name}" 규칙과 실행 기록을 지웁니다. 되돌릴 수 없습니다.` : undefined}
        confirmLabel="삭제"
        danger
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />
      {issueModal}
    </div>
  );
}

function RuleRow({
  rule,
  names,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  rule: AutomationRule;
  names: AutomationNameLookup;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={rule.enabled ? "automation-rule" : "automation-rule is-disabled"} data-testid={`automation-rule-${rule.id}`}>
      <div className="automation-rule-main">
        <div className="automation-rule-title">
          <button type="button" className="automation-rule-name" onClick={onEdit}>
            {rule.name}
          </button>
          {rule.enabled ? null : <Lozenge appearance="neutral">꺼짐</Lozenge>}
          {rule.consecutiveFailures > 0 ? (
            <Lozenge appearance="warning">연속 실패 {rule.consecutiveFailures}회</Lozenge>
          ) : null}
        </div>
        {rule.description ? <p className="automation-rule-desc">{rule.description}</p> : null}
        <p className="automation-rule-line">
          {TRIGGER_ICONS[rule.trigger.type]}
          <span>{triggerSummary(rule.trigger, names.statusName)}</span>
        </p>
        <ul className="automation-rule-actions" aria-label={`${rule.name} 액션`}>
          {rule.actions.map((action, index) => (
            <li key={index} className="automation-rule-line">
              {ACTION_ICONS[action.type]}
              <span>{actionSummary(action, names)}</span>
            </li>
          ))}
        </ul>
        <p className="automation-rule-meta">
          마지막 실행 {rule.lastRunAt ? relTime(rule.lastRunAt) : "없음"}
          {rule.trigger.type === "SCHEDULED" && rule.nextRunAt ? ` · 다음 실행 ${formatDateTime(rule.nextRunAt)}` : null}
          {` · 실행 주체 ${names.userName(rule.actorId)}`}
        </p>
        {rule.disabledReason ? (
          <Banner variant="warning" className="automation-rule-reason">
            <AlertTriangle size={14} aria-hidden /> 자동으로 꺼짐 — {rule.disabledReason}. 원인을 고친 뒤 다시 켜면 사유가
            지워집니다.
          </Banner>
        ) : null}
      </div>
      <div className="automation-rule-side">
        <Switch
          label="사용"
          aria-label={`${rule.name} 사용`}
          checked={rule.enabled}
          onCheckedChange={(checked) => onToggle(checked === true)}
        />
        <Dropdown
          align="end"
          trigger={
            <Button size="small" variant="ghost" iconOnly aria-label={`${rule.name} 더 보기`}>
              <MoreHorizontal size={16} aria-hidden />
            </Button>
          }
          items={[
            { label: "편집", icon: <Pencil size={16} aria-hidden />, onSelect: onEdit },
            { label: "복제", icon: <Copy size={16} aria-hidden />, onSelect: onDuplicate },
            { separator: true },
            { label: "삭제", icon: <Trash2 size={16} aria-hidden />, danger: true, onSelect: onDelete },
          ]}
        />
      </div>
    </li>
  );
}
