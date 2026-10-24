import { useCallback, useEffect, useState } from "react";
import { Banner, Button, Card, Radio, RadioGroup, Select, SkeletonText, Switch, TextField, useToast } from "@chanho/react";
import { RotateCw } from "lucide-react";
import type { CarryOverTarget, EstimationScale, PlanningSettings, PlanningSettingsPatch, TshirtSize } from "../store/types";
import { getPlanningSettings, updatePlanningSettings } from "../store/jiraStore";
import { errorStatus } from "../store/mapping";
import { ESTIMATION_SCALE_LABELS, FIBONACCI_POINTS, TSHIRT_SIZES } from "../store/model/cycles";
import { notifyPlanningSettingsChanged } from "./usePlanningSettings";
import "./storyPoints.css";
import "./inlineCreate.css";

export interface PlanningSettingsPanelProps {
  projectId: string;
  /** 프로젝트 관리자만 고친다(PUT ADMIN) */
  canManage: boolean;
}

function describeError(error: unknown): string {
  if (errorStatus(error) === 503) return "ALM 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요.";
  return error instanceof Error ? error.message : String(error);
}

const SCALES: EstimationScale[] = ["fibonacci", "tshirt", "linear", "custom"];

interface Draft {
  autoCreateNext: boolean;
  lengthDays: string;
  cooldownDays: string;
  defaultCarryOver: CarryOverTarget;
  estimationScale: EstimationScale;
  customValues: string;
  tshirt: Record<TshirtSize, string>;
}

const draftOf = (s: PlanningSettings): Draft => ({
  autoCreateNext: s.sprintAutomation.autoCreateNext,
  lengthDays: String(s.sprintAutomation.lengthDays),
  cooldownDays: String(s.sprintAutomation.cooldownDays),
  defaultCarryOver: s.sprintAutomation.defaultCarryOver,
  estimationScale: s.estimationScale,
  customValues: s.customValues.join(", "),
  tshirt: Object.fromEntries(TSHIRT_SIZES.map((size) => [size, String(s.tshirtPoints[size])])) as Record<TshirtSize, string>,
});

/** "1, 2, 4" → [1, 2, 4] — 숫자가 아닌 조각이 있으면 null */
function parseValues(text: string): number[] | null {
  const parts = text.split(/[,\s]+/).filter(Boolean);
  const values = parts.map(Number);
  return values.some((v) => Number.isNaN(v)) ? null : values;
}

/**
 * 프로젝트 설정 › 계획(V39) — Linear Cycles·Estimates.
 * 스프린트 자동화(완료 시 다음 스프린트 자동 생성·길이·쿨다운·이월 기본값)와 추정 척도(피보나치·T셔츠·수직선·직접 정의).
 * 저장은 바뀐 항목만 보내고, 다른 사람이 먼저 저장했으면(409) 최신 값을 다시 읽게 한다.
 */
export function PlanningSettingsPanel({ projectId, canManage }: PlanningSettingsPanelProps) {
  const toast = useToast();
  const [settings, setSettings] = useState<PlanningSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const next = await getPlanningSettings(projectId);
      setSettings(next);
      setDraft(draftOf(next));
      setLoadError(null);
      setConflict(false);
    } catch (error) {
      setLoadError(describeError(error));
    }
  }, [projectId]);

  useEffect(() => {
    setSettings(null);
    void reload();
  }, [reload]);

  const save = async (patch: PlanningSettingsPatch, title: string) => {
    if (!settings) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await updatePlanningSettings(projectId, patch, settings.version);
      setSettings(next);
      setDraft(draftOf(next));
      notifyPlanningSettingsChanged(projectId);
      toast({ title, appearance: "success" });
    } catch (error) {
      if (errorStatus(error) === 409) setConflict(true);
      else setSaveError(describeError(error));
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="project-settings">
        <div className="triage-error" role="alert">
          <p>계획 설정을 불러오지 못했습니다 — {loadError}</p>
          <Button variant="secondary" iconBefore={<RotateCw size={14} />} onClick={() => void reload()}>
            다시 시도
          </Button>
        </div>
      </div>
    );
  }
  if (!settings || !draft) {
    return (
      <div className="project-settings">
        <SkeletonText lines={4} label="계획 설정 불러오는 중" />
      </div>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  const readOnly = !canManage || saving;

  const saveAutomation = () => {
    const lengthDays = Number(draft.lengthDays);
    const cooldownDays = Number(draft.cooldownDays);
    if (!Number.isInteger(lengthDays) || lengthDays < 1 || lengthDays > 90) return setSaveError("스프린트 길이는 1~90일이어야 합니다");
    if (!Number.isInteger(cooldownDays) || cooldownDays < 0 || cooldownDays > 30) return setSaveError("쿨다운은 0~30일이어야 합니다");
    void save(
      { sprintAutomation: { autoCreateNext: draft.autoCreateNext, lengthDays, cooldownDays, defaultCarryOver: draft.defaultCarryOver } },
      "스프린트 자동화를 저장했습니다",
    );
  };

  const saveScale = () => {
    const patch: PlanningSettingsPatch = { estimationScale: draft.estimationScale };
    if (draft.estimationScale === "custom") {
      const values = parseValues(draft.customValues);
      if (!values || values.length === 0) return setSaveError("직접 정의 척도 값을 쉼표로 구분해 1개 이상 적으세요");
      patch.customValues = values;
    }
    if (draft.estimationScale === "tshirt") {
      const points = Object.fromEntries(TSHIRT_SIZES.map((size) => [size, Number(draft.tshirt[size])])) as Record<TshirtSize, number>;
      if (TSHIRT_SIZES.some((size) => Number.isNaN(points[size]))) return setSaveError("T셔츠 포인트는 숫자로 적으세요");
      patch.tshirtPoints = points;
    }
    void save(patch, `추정 척도를 ${ESTIMATION_SCALE_LABELS[draft.estimationScale]}(으)로 저장했습니다`);
  };

  const automationDirty =
    draft.autoCreateNext !== settings.sprintAutomation.autoCreateNext ||
    draft.lengthDays !== String(settings.sprintAutomation.lengthDays) ||
    draft.cooldownDays !== String(settings.sprintAutomation.cooldownDays) ||
    draft.defaultCarryOver !== settings.sprintAutomation.defaultCarryOver;
  const scaleDirty =
    draft.estimationScale !== settings.estimationScale ||
    (draft.estimationScale === "custom" && draft.customValues !== settings.customValues.join(", ")) ||
    (draft.estimationScale === "tshirt" && TSHIRT_SIZES.some((size) => draft.tshirt[size] !== String(settings.tshirtPoints[size])));

  return (
    <div className="project-settings planning-settings">
      {!canManage ? (
        <Banner variant="info">프로젝트 관리자만 계획 설정을 바꿀 수 있습니다. 지금 값을 볼 수만 있습니다.</Banner>
      ) : null}
      {conflict ? (
        <Banner variant="warning">
          <div className="issue-conflict">
            <p className="issue-conflict-text">다른 사용자가 먼저 계획 설정을 저장했습니다. 최신 값을 불러온 뒤 다시 바꾸세요.</p>
            <Button size="small" variant="secondary" onClick={() => void reload()}>
              최신 값 불러오기
            </Button>
          </div>
        </Banner>
      ) : null}
      {saveError ? (
        <p className="planning-settings-error" role="alert">
          {saveError}
        </p>
      ) : null}

      <Card padding="lg" title="스프린트 자동화">
        <p className="settings-help">
          스프린트를 완료할 때 예정 스프린트가 없으면 다음 스프린트를 자동으로 만듭니다. 이름은 끝 숫자를 하나 올리고(Sprint 3 →
          Sprint 4), 예정 기간은 완료일 + 쿨다운부터 길이만큼입니다. 완료 창의 미완료 이슈 행선지 기본값도 여기서 정합니다.
        </p>
        <div className="planning-settings-grid">
          <Switch
            label="완료하면 다음 스프린트 자동 생성"
            checked={draft.autoCreateNext}
            disabled={readOnly}
            onCheckedChange={(checked) => set({ autoCreateNext: checked })}
          />
          <TextField
            label="스프린트 길이(일)"
            type="number"
            min={1}
            max={90}
            value={draft.lengthDays}
            disabled={readOnly}
            onChange={(e) => set({ lengthDays: e.target.value })}
          />
          <TextField
            label="쿨다운(일)"
            type="number"
            min={0}
            max={30}
            value={draft.cooldownDays}
            disabled={readOnly}
            onChange={(e) => set({ cooldownDays: e.target.value })}
          />
          <fieldset className="planning-settings-fieldset">
            <legend>미완료 이슈 기본 행선지</legend>
            <RadioGroup
              value={draft.defaultCarryOver}
              onValueChange={(value) => set({ defaultCarryOver: value === "next" ? "next" : "backlog" })}
              aria-label="미완료 이슈 기본 행선지"
            >
              <Radio value="next" label="다음 스프린트로" disabled={readOnly} />
              <Radio value="backlog" label="백로그로" disabled={readOnly} />
            </RadioGroup>
          </fieldset>
        </div>
        <div className="project-form-actions">
          <Button disabled={readOnly || !automationDirty} loading={saving} onClick={saveAutomation}>
            스프린트 자동화 저장
          </Button>
        </div>
      </Card>

      <Card padding="lg" title="추정 척도">
        <p className="settings-help">
          스토리 포인트를 어떤 값으로 고를지 정합니다. 저장값은 늘 숫자라 합계·속도는 숫자로 셉니다(T셔츠는 크기마다 정한 포인트).
          척도를 바꿔도 이미 저장된 값은 그대로 남고, 포인트를 새로 고를 때만 척도를 따릅니다.
        </p>
        <div className="planning-settings-grid">
          <Select
            label="척도"
            value={draft.estimationScale}
            disabled={readOnly}
            onValueChange={(value) => set({ estimationScale: value as EstimationScale })}
            options={SCALES.map((scale) => ({ value: scale, label: ESTIMATION_SCALE_LABELS[scale] }))}
          />
          {draft.estimationScale === "fibonacci" ? (
            <p className="settings-help">{`허용 값: ${FIBONACCI_POINTS.join(", ")}`}</p>
          ) : null}
          {draft.estimationScale === "linear" ? (
            <p className="settings-help">0~9999, 소수 첫째 자리까지 자유롭게 적습니다.</p>
          ) : null}
          {draft.estimationScale === "custom" ? (
            <TextField
              label="척도 값(쉼표로 구분, 1~20개)"
              value={draft.customValues}
              placeholder="예: 1, 2, 4, 8"
              disabled={readOnly}
              onChange={(e) => set({ customValues: e.target.value })}
            />
          ) : null}
          {draft.estimationScale === "tshirt" ? (
            <div className="planning-tshirt">
              {TSHIRT_SIZES.map((size) => (
                <TextField
                  key={size}
                  label={`${size} 포인트`}
                  type="number"
                  min={0}
                  step={0.5}
                  value={draft.tshirt[size]}
                  disabled={readOnly}
                  onChange={(e) => set({ tshirt: { ...draft.tshirt, [size]: e.target.value } })}
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className="project-form-actions">
          <Button disabled={readOnly || !scaleDirty} loading={saving} onClick={saveScale}>
            추정 척도 저장
          </Button>
        </div>
      </Card>
    </div>
  );
}
