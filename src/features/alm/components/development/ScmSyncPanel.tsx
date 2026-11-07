import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Banner, Button, Card, ConfirmDialog, Lozenge, Select, Switch, TextField, useToast } from "@chanho/react";
import { CircleCheck, CircleX, GitBranch, GitMerge, Hourglass, KeyRound, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DevRepository, DevWebhookProvider, ScmSync, ScmSyncList, ScmSyncMode, ScmSyncOutcome } from "../../store/types";
import { deleteScmSync, listScmSyncs, runScmSync, saveScmSync } from "../../store/jiraStore";
import { FormSkeleton } from "../Skeletons";
import { formatDateTime, relTime } from "../time";
import { describeDevelopmentError } from "./IssueDevelopmentPanel";
import "./development.css";

export interface ScmSyncPanelProps {
  projectId: string;
  /** 등록된 저장소(서버 값) — 폴링은 등록된 저장소에만. 바뀌면 다시 읽는다(빠진 저장소의 동기화는 서버가 지운다) */
  repositories: DevRepository[];
}

const PROVIDER_LABELS: Record<DevWebhookProvider, string> = { GITHUB: "GitHub", GITLAB: "GitLab" };
const PROVIDER_ICONS: Record<DevWebhookProvider, LucideIcon> = { GITHUB: GitBranch, GITLAB: GitMerge };
/** 동기화 중일 때 상태를 다시 읽는 간격 */
export const SCM_RUNNING_REFRESH_MS = 5000;

const MODE_LABELS: Record<ScmSyncMode, string> = { both: "웹훅 + 폴링", webhook: "웹훅만", polling: "폴링만" };

export const SCM_OUTCOME_LABELS: Record<ScmSyncOutcome, string> = { OK: "성공", RATE_LIMITED: "레이트 리밋 대기", FAILED: "실패" };
const OUTCOME_ICONS: Record<ScmSyncOutcome, LucideIcon> = { OK: CircleCheck, RATE_LIMITED: Hourglass, FAILED: CircleX };
const OUTCOME_APPEARANCE: Record<ScmSyncOutcome, "success" | "warning" | "danger"> = {
  OK: "success",
  RATE_LIMITED: "warning",
  FAILED: "danger",
};

function OutcomeLozenge({ outcome }: { outcome: ScmSyncOutcome }) {
  const Icon = OUTCOME_ICONS[outcome];
  return (
    <Lozenge appearance={OUTCOME_APPEARANCE[outcome]}>
      <Icon size={12} aria-hidden /> {SCM_OUTCOME_LABELS[outcome]}
    </Lozenge>
  );
}

function providerOptions() {
  return (["GITHUB", "GITLAB"] as const).map((p) => {
    const Icon = PROVIDER_ICONS[p];
    return { value: p, label: PROVIDER_LABELS[p], icon: <Icon size={14} aria-hidden /> };
  });
}

/** github.com·gitlab.com만 짐작한다(서버 ScmEndpoints.guessProvider와 같다) — 나머지는 GitHub로 두고 관리자가 고른다 */
function guessProvider(url: string): DevWebhookProvider {
  try {
    return new URL(url).hostname === "gitlab.com" ? "GITLAB" : "GITHUB";
  } catch {
    return "GITHUB";
  }
}

const Time = ({ at }: { at: string }) => (
  <time dateTime={at} title={formatDateTime(at)}>
    {relTime(at)}
  </time>
);

interface Draft {
  provider: DevWebhookProvider;
  apiBaseUrl: string;
  token: string;
}

/**
 * 프로젝트 설정 › 저장소 › 폴링 동기화(alm-backend V45) — 들어오는 연결이 막힌 설치(폐쇄망)에서 ALM이 GitHub·GitLab API를 주기적으로
 * 읽어 커밋·PR/MR을 이슈에 잇는다. 웹훅이 놓친 이벤트도 메운다(같은 커밋·PR은 한 번만). 프로젝트 관리자만 보인다.
 * 읽기 토큰은 넣을 때만 보내고 화면은 다시 보여 주지 않는다 — 입력칸은 저장 뒤 비운다.
 */
export function ScmSyncPanel({ projectId, repositories }: ScmSyncPanelProps) {
  const toast = useToast();
  const [list, setList] = useState<ScmSyncList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ScmSync | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setList(await listScmSyncs(projectId));
      setLoadError(null);
    } catch (error) {
      setLoadError(describeDevelopmentError(error));
    }
  }, [projectId]);

  useEffect(() => {
    setList(null);
    void reload();
  }, [reload, repositories]);

  // 어느 저장소든 동기화 중이면(다른 인스턴스의 주기 실행 포함) 끝날 때까지 주기적으로 다시 읽는다 — 버튼이 꺼진 채 굳지 않게
  const anyRunning = list?.repositories.some((s) => s.running) ?? false;
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => void reload(), SCM_RUNNING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [anyRunning, reload]);

  const draftOf = (repo: DevRepository, sync: ScmSync | null): Draft =>
    drafts[repo.url] ?? { provider: sync?.provider ?? guessProvider(repo.url), apiBaseUrl: "", token: "" };
  const patchDraft = (repo: DevRepository, sync: ScmSync | null, patch: Partial<Draft>) =>
    setDrafts((map) => ({ ...map, [repo.url]: { ...draftOf(repo, sync), ...patch } }));

  const replace = (next: ScmSync) =>
    setList((current) =>
      current ? { ...current, repositories: [...current.repositories.filter((s) => s.id !== next.id), next] } : current,
    );

  const act = async (repo: DevRepository, work: () => Promise<ScmSync>, success: string, failure: string) => {
    setBusyUrl(repo.url);
    try {
      const next = await work();
      replace(next);
      setDrafts((map) => ({ ...map, [repo.url]: { ...draftOf(repo, next), token: "" } }));
      toast({ title: success, appearance: "success" });
    } catch (error) {
      toast({ title: failure, description: describeDevelopmentError(error), appearance: "danger" });
    } finally {
      setBusyUrl(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteScmSync(projectId, deleting.id);
      setDeleting(null);
      toast({ title: "폴링 동기화를 지웠습니다", appearance: "success" });
      await reload();
    } catch (error) {
      toast({ title: "폴링 동기화를 지우지 못했습니다", description: describeDevelopmentError(error), appearance: "danger" });
    } finally {
      setDeleteBusy(false);
    }
  };

  let body: ReactNode;
  if (loadError) {
    body = (
      <Banner variant="danger" action={{ label: "다시 시도", onClick: () => void reload() }}>
        동기화 설정을 불러오지 못했습니다 — {loadError}
      </Banner>
    );
  } else if (list === null) {
    body = <FormSkeleton label="동기화 설정 불러오는 중" fields={2} />;
  } else if (!list.pollingEnabled) {
    body = (
      <Banner variant="info">
        이 설치는 폴링 동기화를 쓰지 않습니다(ALM_SCM_SYNC=webhook) — 위 웹훅으로 커밋·PR을 받습니다.
      </Banner>
    );
  } else if (repositories.length === 0) {
    body = <p className="settings-empty">먼저 위에서 저장소를 등록하세요.</p>;
  } else {
    body = (
      <>
        {!list.encryptionConfigured ? (
          <Banner variant="warning">
            서버에 토큰 암호화 키(ALM_SETTINGS_ENC_KEY)가 없어 토큰을 저장할 수 없습니다. 운영자에게 설정을 요청하세요.
          </Banner>
        ) : null}
        {!list.schedulerActive ? (
          <Banner variant="info">이 서버는 주기 실행이 꺼져 있습니다 — "지금 동기화"로만 가져옵니다.</Banner>
        ) : null}
        <ul className="webhook-list" aria-label="저장소 폴링 동기화">
          {repositories.map((repo) => {
            const sync = list.repositories.find((s) => s.repositoryUrl === repo.url) ?? null;
            const draft = draftOf(repo, sync);
            const busy = busyUrl === repo.url;
            const ProviderIcon = PROVIDER_ICONS[sync?.provider ?? draft.provider];
            return (
              <li key={repo.id} className="webhook-item" data-testid="scm-sync-item">
                <div className="webhook-item-head">
                  <strong>{repo.name}</strong>
                  <span className="repo-url">{repo.url}</span>
                  {sync ? (
                    <span className="webhook-provider">
                      <ProviderIcon size={14} aria-hidden /> {PROVIDER_LABELS[sync.provider]}
                    </span>
                  ) : null}
                </div>
                {sync ? (
                  <>
                    <div className="webhook-field">
                      <span className="webhook-field-label">API 주소</span>
                      <code className="webhook-field-value">{sync.apiBaseUrl}</code>
                    </div>
                    <div className="webhook-status">
                      {sync.running ? (
                        <Lozenge appearance="info">
                          <RefreshCw size={12} aria-hidden /> 동기화 중
                        </Lozenge>
                      ) : sync.lastOutcome ? (
                        <OutcomeLozenge outcome={sync.lastOutcome} />
                      ) : null}
                      <span className="webhook-status-text">{sync.lastMessage ?? "아직 동기화하지 않았습니다."}</span>
                      {sync.lastRunAt ? (
                        <span className="repo-count">
                          마지막 <Time at={sync.lastRunAt} />
                        </span>
                      ) : null}
                      {sync.enabled && list.schedulerActive && sync.nextRunAt ? (
                        <span className="repo-count">
                          다음 <Time at={sync.rateLimitedUntil ?? sync.nextRunAt} />
                        </span>
                      ) : null}
                    </div>
                    <Switch
                      label="이 저장소 폴링"
                      checked={sync.enabled}
                      disabled={busy}
                      onCheckedChange={(checked) =>
                        void act(
                          repo,
                          // 저장된 API 주소를 함께 보낸다 — 빠뜨리면 옛 서버가 기본값으로 덮는다(GHES·사내 GitLab, Codex P2)
                          () =>
                            saveScmSync(projectId, {
                              repositoryUrl: repo.url,
                              provider: sync.provider,
                              apiBaseUrl: sync.apiBaseUrl,
                              enabled: checked,
                            }),
                          checked ? "폴링을 켰습니다" : "폴링을 껐습니다",
                          "설정을 바꾸지 못했습니다",
                        )
                      }
                    />
                    <div className="repo-actions">
                      <TextField
                        label="새 읽기 토큰"
                        type="password"
                        autoComplete="off"
                        value={draft.token}
                        placeholder="바꿀 때만 — 저장한 토큰은 다시 보이지 않습니다"
                        onChange={(e) => patchDraft(repo, sync, { token: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        iconBefore={<KeyRound size={14} />}
                        disabled={busy || !draft.token.trim() || !list.encryptionConfigured}
                        onClick={() =>
                          void act(
                            repo,
                            // 꺼 둔 저장소의 토큰을 바꿔도 다시 켜지지 않게 enabled·API 주소를 그대로 보낸다(Codex P2)
                            () =>
                              saveScmSync(projectId, {
                                repositoryUrl: repo.url,
                                provider: sync.provider,
                                apiBaseUrl: sync.apiBaseUrl,
                                enabled: sync.enabled,
                                token: draft.token,
                              }),
                            "토큰을 바꿨습니다",
                            "토큰을 바꾸지 못했습니다",
                          )
                        }
                      >
                        토큰 바꾸기
                      </Button>
                      <span className="repo-actions-spacer" />
                      <Button
                        type="button"
                        iconBefore={<RefreshCw size={14} />}
                        loading={busy}
                        disabled={busy || sync.running}
                        onClick={() =>
                          void act(repo, () => runScmSync(projectId, sync.id), "동기화했습니다", "동기화하지 못했습니다")
                        }
                      >
                        지금 동기화
                      </Button>
                      <Button type="button" variant="ghost" iconBefore={<Trash2 size={14} />} onClick={() => setDeleting(sync)}>
                        삭제
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="repo-actions">
                    <Select
                      label="제공자"
                      value={draft.provider}
                      options={providerOptions()}
                      onValueChange={(v) => patchDraft(repo, sync, { provider: v as DevWebhookProvider })}
                    />
                    <TextField
                      label="API 주소"
                      value={draft.apiBaseUrl}
                      placeholder="비우면 기본값(GitHub Enterprise는 /api/v3, GitLab은 /api/v4)"
                      onChange={(e) => patchDraft(repo, sync, { apiBaseUrl: e.target.value })}
                    />
                    <TextField
                      label="읽기 토큰"
                      type="password"
                      autoComplete="off"
                      value={draft.token}
                      placeholder="저장소 읽기 권한(GitHub contents·pull requests / GitLab read_api)"
                      onChange={(e) => patchDraft(repo, sync, { token: e.target.value })}
                    />
                    <Button
                      type="button"
                      iconBefore={<RefreshCw size={14} />}
                      loading={busy}
                      disabled={busy || !draft.token.trim() || !list.encryptionConfigured}
                      onClick={() =>
                        void act(
                          repo,
                          () =>
                            saveScmSync(projectId, {
                              repositoryUrl: repo.url,
                              provider: draft.provider,
                              apiBaseUrl: draft.apiBaseUrl,
                              token: draft.token,
                            }),
                          "폴링 동기화를 켰습니다",
                          "폴링 동기화를 켜지 못했습니다",
                        )
                      }
                    >
                      폴링 켜기
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <Card padding="lg" title="폴링 동기화">
      <p className="settings-help">
        ALM이 GitHub·GitLab API를 주기적으로 읽어 커밋·PR(MR)을 이슈 키로 연결합니다 — Git 서버가 ALM으로 웹훅을 보낼 수 없는 폐쇄망에서
        쓰고, 웹훅이 놓친 이벤트도 메웁니다(같은 커밋·PR은 한 번만 연결됩니다). 이벤트는 토큰을 마지막으로 넣은 관리자의 권한으로 연결됩니다.
      </p>
      {list ? (
        <p className="settings-help">
          설치 방식: <strong>{MODE_LABELS[list.syncMode]}</strong>
          {list.pollingEnabled ? ` · 주기 ${Math.round(list.pollIntervalSeconds / 60)}분` : ""}{" "}
          <Button type="button" variant="ghost" iconBefore={<RotateCw size={14} />} onClick={() => void reload()}>
            상태 새로고침
          </Button>
        </p>
      ) : null}
      {body}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null);
        }}
        title="폴링 동기화 삭제"
        description={deleting ? `${deleting.repositoryUrl}의 토큰과 동기화 상태를 지웁니다. 이미 연결된 커밋·PR은 남습니다.` : undefined}
        confirmLabel="삭제"
        danger
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
      />
    </Card>
  );
}
