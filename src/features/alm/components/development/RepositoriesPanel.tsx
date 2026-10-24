import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Banner, Button, Card, TextField, useToast } from "@chanho/react";
import { FormSkeleton } from "../Skeletons";
import { ExternalLink, GitBranch, Plus, RotateCw, Trash2 } from "lucide-react";
import type { DevRepository } from "../../store/types";
import { MAX_PROJECT_REPOSITORIES } from "../../store/types";
import { listProjectRepositories, saveProjectRepositories } from "../../store/jiraStore";
import { describeDevelopmentError } from "./IssueDevelopmentPanel";
import "./development.css";

export interface RepositoriesPanelProps {
  projectId: string;
  projectKey: string;
  /** 프로젝트 관리자만 편집 */
  canManage: boolean;
}

interface DraftRow {
  key: string;
  name: string;
  url: string;
  defaultBranch: string;
}

let draftSeq = 0;
const toDraft = (repo?: DevRepository): DraftRow => ({
  key: `r${draftSeq++}`,
  name: repo?.name ?? "",
  url: repo?.url ?? "",
  defaultBranch: repo?.defaultBranch ?? "",
});

const sameRows = (rows: DraftRow[], saved: DevRepository[]) =>
  rows.length === saved.length &&
  rows.every(
    (row, i) =>
      row.name.trim() === saved[i].name &&
      row.url.trim() === saved[i].url &&
      (row.defaultBranch.trim() || "main") === saved[i].defaultBranch,
  );

/**
 * 프로젝트 설정 › 저장소(alm-backend V41) — 커밋을 모을 git 저장소. 보낸 목록이 곧 등록 상태다(통째 교체, 최대 20).
 * URL은 서버가 정규화해 돌려준다(끝 `/`·`.git` 제거, SSH → https) — 저장 뒤 목록은 서버 값으로 다시 그린다.
 * 편집은 프로젝트 관리자만, 나머지는 읽기 전용 목록.
 */
export function RepositoriesPanel({ projectId, projectKey, canManage }: RepositoriesPanelProps) {
  const toast = useToast();
  const [saved, setSaved] = useState<DevRepository[] | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await listProjectRepositories(projectId);
      setSaved(list);
      setRows(list.map(toDraft));
      setLoadError(null);
      setSaveError(null);
      setSubmitted(false);
    } catch (error) {
      setLoadError(describeDevelopmentError(error));
    }
  }, [projectId]);

  useEffect(() => {
    setSaved(null);
    void reload();
  }, [reload]);

  const update = (key: string, patch: Partial<DraftRow>) =>
    setRows((list) => list.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const full = rows.length >= MAX_PROJECT_REPOSITORIES;
  const dirty = saved !== null && !sameRows(rows, saved);
  const missingUrl = rows.some((row) => !row.url.trim());

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (missingUrl) return;
    setSaving(true);
    try {
      const next = await saveProjectRepositories(
        projectId,
        rows.map((row) => ({ name: row.name, url: row.url, defaultBranch: row.defaultBranch })),
      );
      setSaved(next);
      setRows(next.map(toDraft));
      setSaveError(null);
      setSubmitted(false);
      toast({ title: "저장소를 저장했습니다", appearance: "success" });
    } catch (error) {
      const message = describeDevelopmentError(error);
      setSaveError(message);
      toast({ title: "저장소를 저장하지 못했습니다", description: message, appearance: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const usage = `git commit -m "feat: 로그인 개선 [${projectKey}-12]"`;

  return (
    <div className="project-settings">
      <Card padding="lg" title="저장소">
        <p className="settings-help">
          커밋을 모을 git 저장소입니다. 커밋 메시지에 <code className="dev-key">{projectKey}-12</code> 같은 이슈 키가 있으면
          그 이슈의 개발 패널과 프로젝트 "커밋" 탭에 연결됩니다. 등록한 저장소의 커밋은 이슈 키가 없어도 커밋 탭에 보입니다.
          커밋 메시지로 상태를 바꾸지는 않습니다.
        </p>
        <pre className="repo-usage" aria-label="커밋 메시지 예">{usage}</pre>

        {loadError ? (
          <Banner variant="danger" action={{ label: "다시 시도", onClick: () => void reload() }}>
            저장소를 불러오지 못했습니다 — {loadError}
          </Banner>
        ) : saved === null ? (
          <FormSkeleton label="저장소 불러오는 중" fields={3} />
        ) : canManage ? (
          <form className="repo-settings" onSubmit={(e) => void handleSubmit(e)} noValidate aria-label="저장소 편집">
            {saveError ? <Banner variant="danger">{saveError}</Banner> : null}
            {rows.length === 0 ? <p className="settings-empty">등록한 저장소가 없습니다.</p> : null}
            {rows.map((row, index) => (
              <div key={row.key} className="repo-row" data-testid="repo-row">
                <TextField
                  label={`이름 ${index + 1}`}
                  value={row.name}
                  maxLength={100}
                  placeholder="비우면 owner/repo"
                  onChange={(e) => update(row.key, { name: e.target.value })}
                />
                <TextField
                  label={`URL ${index + 1} *`}
                  value={row.url}
                  type="url"
                  placeholder="https://github.com/owner/repo"
                  error={submitted && !row.url.trim() ? "저장소 URL을 입력하세요" : undefined}
                  onChange={(e) => update(row.key, { url: e.target.value })}
                />
                <TextField
                  label={`기본 브랜치 ${index + 1}`}
                  value={row.defaultBranch}
                  maxLength={100}
                  placeholder="main"
                  onChange={(e) => update(row.key, { defaultBranch: e.target.value })}
                />
                <div className="repo-row-remove">
                  <Button
                    type="button"
                    variant="ghost"
                    iconOnly
                    aria-label={`저장소 ${index + 1} 제거`}
                    iconBefore={<Trash2 size={16} />}
                    onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                  />
                </div>
              </div>
            ))}
            <div className="repo-actions">
              <Button
                type="button"
                variant="secondary"
                iconBefore={<Plus size={14} />}
                disabled={full}
                onClick={() => setRows((list) => [...list, toDraft()])}
              >
                저장소 추가
              </Button>
              <span className="repo-count">
                {rows.length}/{MAX_PROJECT_REPOSITORIES}
                {full ? " — 더 등록할 수 없습니다" : ""}
              </span>
              <span className="repo-actions-spacer" />
              <Button type="button" variant="ghost" iconBefore={<RotateCw size={14} />} disabled={!dirty || saving} onClick={() => void reload()}>
                되돌리기
              </Button>
              <Button type="submit" loading={saving} disabled={!dirty || saving}>
                저장
              </Button>
            </div>
          </form>
        ) : saved.length === 0 ? (
          <p className="settings-empty">등록한 저장소가 없습니다. 프로젝트 관리자만 등록할 수 있습니다.</p>
        ) : (
          <>
            <ul className="repo-readonly" aria-label="등록한 저장소">
              {saved.map((repo) => (
                <li key={repo.id}>
                  <strong>{repo.name}</strong>
                  <a className="repo-url" href={repo.url} target="_blank" rel="noreferrer noopener">
                    {repo.url} <ExternalLink size={12} aria-hidden />
                  </a>
                  <span className="repo-count">
                    <GitBranch size={12} aria-hidden /> {repo.defaultBranch}
                  </span>
                </li>
              ))}
            </ul>
            <p className="settings-help">프로젝트 관리자만 바꿀 수 있습니다.</p>
          </>
        )}
      </Card>
    </div>
  );
}
