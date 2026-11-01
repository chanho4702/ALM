import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Banner, Button, Card, TextField, useToast } from "@chanho/react";
import { FormSkeleton } from "../Skeletons";
import type { DevSettings } from "../../store/types";
import { BRANCH_PREFIX_MAX, branchPrefixError, trimBranchPrefix } from "../../store/types";
import { getDevSettings, updateDevSettings } from "../../store/jiraStore";
import { branchName } from "../branchName";
import { describeDevelopmentError } from "./IssueDevelopmentPanel";
import "./development.css";

export interface BranchPrefixPanelProps {
  projectId: string;
  projectKey: string;
  /** 프로젝트 관리자만 편집 */
  canManage: boolean;
}

/**
 * 프로젝트 설정 › 저장소 › 브랜치 이름(alm-backend V43) — "브랜치 이름 복사"(Ctrl+Shift+.)가 붙이는 접두.
 * 형식은 `[<접두>/]<키 소문자>-<슬러그>`. 접두 규칙(git 참조 규칙)은 서버와 같은 함수로 저장 전에 미리 보여 준다.
 * 저장은 expectedVersion — 다른 관리자가 먼저 바꿨으면 409 문구가 그대로 뜬다.
 */
export function BranchPrefixPanel({ projectId, projectKey, canManage }: BranchPrefixPanelProps) {
  const toast = useToast();
  const [saved, setSaved] = useState<DevSettings | null>(null);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const settings = await getDevSettings(projectId);
      setSaved(settings);
      setDraft(settings.branchPrefix);
      setLoadError(null);
      setSaveError(null);
    } catch (error) {
      setLoadError(describeDevelopmentError(error));
    }
  }, [projectId]);

  useEffect(() => {
    setSaved(null);
    void reload();
  }, [reload]);

  const invalid = branchPrefixError(draft);
  const dirty = saved !== null && trimBranchPrefix(draft) !== saved.branchPrefix;
  const example = branchName({ key: `${projectKey}-12`, title: "Fix login redirect" }, invalid ? "" : draft);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!saved || invalid) return;
    setSaving(true);
    try {
      const next = await updateDevSettings(projectId, { branchPrefix: draft, expectedVersion: saved.version });
      setSaved(next);
      setDraft(next.branchPrefix);
      setSaveError(null);
      toast({ title: "브랜치 접두를 저장했습니다", appearance: "success" });
    } catch (error) {
      const message = describeDevelopmentError(error);
      setSaveError(message);
      toast({ title: "브랜치 접두를 저장하지 못했습니다", description: message, appearance: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="project-settings">
      <Card padding="lg" title="브랜치 이름">
        <p className="settings-help">
          이슈의 "브랜치 이름 복사"(Ctrl+Shift+.)가 앞에 붙이는 접두입니다. 비우면 접두 없이 키와 제목만 씁니다.
        </p>
        {loadError ? (
          <Banner variant="danger" action={{ label: "다시 시도", onClick: () => void reload() }}>
            브랜치 접두를 불러오지 못했습니다 — {loadError}
          </Banner>
        ) : saved === null ? (
          <FormSkeleton label="브랜치 접두 불러오는 중" fields={1} />
        ) : canManage ? (
          <form className="repo-settings" onSubmit={(e) => void handleSubmit(e)} noValidate aria-label="브랜치 접두 편집">
            {saveError ? <Banner variant="danger">{saveError}</Banner> : null}
            <TextField
              label="브랜치 접두"
              value={draft}
              maxLength={BRANCH_PREFIX_MAX + 10}
              placeholder="예: feature"
              error={invalid ?? undefined}
              onChange={(e) => setDraft(e.target.value)}
            />
            <pre className="repo-usage" aria-label="브랜치 이름 예">{example}</pre>
            <div className="repo-actions">
              <span className="repo-actions-spacer" />
              <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(saved.branchPrefix)}>
                되돌리기
              </Button>
              <Button type="submit" loading={saving} disabled={!dirty || saving || invalid !== null}>
                저장
              </Button>
            </div>
          </form>
        ) : (
          <>
            <pre className="repo-usage" aria-label="브랜치 이름 예">{example}</pre>
            <p className="settings-help">
              {saved.branchPrefix ? `접두: ${saved.branchPrefix}` : "접두가 없습니다."} 프로젝트 관리자만 바꿀 수 있습니다.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
