import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Lozenge, SkeletonText, Switch, useToast } from "@chanho/react";
import { Inbox, RotateCw } from "lucide-react";
import type { TriageSettings } from "../store/types";
import { getTriageSettings, saveTriageSettings } from "../store/jiraStore";
import { errorStatus } from "../store/mapping";
import { notifyTriageChanged } from "./useTriageEnabled";
import "../pages/triage.css";

export interface TriageSettingsPanelProps {
  projectId: string;
  /** 프로젝트 관리자만 켜고 끈다 */
  canManage: boolean;
}

function describeError(error: unknown): string {
  if (errorStatus(error) === 503) return "ALM 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하세요.";
  return error instanceof Error ? error.message : String(error);
}

/**
 * 프로젝트 설정 › 트리아지(V35) — 리니어 Triage 대응. 켜면 열람자가 만든 이슈와 편집자가 직접 보낸 이슈가
 * 대기열로 들어가고, 프로젝트 뷰에 "트리아지" 탭이 붙는다. 꺼도 남은 대기열은 인박스에서 처리할 수 있다.
 */
export function TriageSettingsPanel({ projectId, canManage }: TriageSettingsPanelProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<TriageSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      setSettings(await getTriageSettings(projectId));
      setLoadError(null);
    } catch (error) {
      setLoadError(describeError(error));
    }
  }, [projectId]);

  useEffect(() => {
    setSettings(null);
    void reload();
  }, [reload]);

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      setSettings(await saveTriageSettings(projectId, enabled));
      notifyTriageChanged(projectId);
      toast({ title: enabled ? "트리아지를 켰습니다" : "트리아지를 껐습니다", appearance: "success" });
    } catch (error) {
      toast({ title: "트리아지 설정을 저장하지 못했습니다", description: describeError(error), appearance: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="project-settings">
      <Card padding="lg" title="트리아지">
        <p className="settings-help">
          들어온 이슈를 백로그에 올리기 전에 한 곳에서 걸러 냅니다. 켜면 <strong>열람자가 만든 이슈</strong>와{" "}
          <strong>편집자가 직접 트리아지로 보낸 이슈</strong>가 대기열에 들어가고, 프로젝트 뷰에 "트리아지" 탭이
          생깁니다. 대기열 이슈는 보드·백로그·추정 합계에서 빠지고, 검색과 AQL <code>triage = true</code>에는
          나옵니다. 꺼도 남은 대기열은 계속 처리할 수 있습니다.
        </p>

        {loadError ? (
          <div className="triage-error" role="alert">
            <p>트리아지 설정을 불러오지 못했습니다 — {loadError}</p>
            <Button variant="secondary" iconBefore={<RotateCw size={14} />} onClick={() => void reload()}>
              다시 시도
            </Button>
          </div>
        ) : settings === null ? (
          <SkeletonText lines={2} label="트리아지 설정 불러오는 중" />
        ) : (
          <div className="triage-settings">
            {canManage ? (
              <Switch
                label="트리아지 사용"
                checked={settings.enabled}
                disabled={saving}
                onCheckedChange={(checked) => void toggle(checked)}
              />
            ) : (
              // 비활성 Switch는 켜져 있어도 꺼진 것처럼 보인다 — 읽기 전용은 글자로
              <p className="triage-settings-readonly" data-testid="triage-readonly">
                트리아지 사용:{" "}
                <Lozenge appearance={settings.enabled ? "success" : "neutral"}>
                  {settings.enabled ? "켜짐" : "꺼짐"}
                </Lozenge>
                <span className="triage-settings-note">프로젝트 관리자만 바꿀 수 있습니다.</span>
              </p>
            )}
            <div className="triage-settings-counts">
              <span>
                대기 {settings.pending}건 · 보류 {settings.snoozed}건
              </span>
              {settings.enabled || settings.pending + settings.snoozed > 0 ? (
                <Button
                  variant="secondary"
                  iconBefore={<Inbox size={14} />}
                  onClick={() => navigate(`/projects/${projectId}/triage`)}
                >
                  트리아지 인박스 열기
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
