import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Banner, Button, Card, ConfirmDialog, Lozenge, Select, useToast } from "@chanho/react";
import {
  Ban,
  CircleCheck,
  CircleSlash,
  CircleX,
  Copy,
  GitBranch,
  GitMerge,
  KeyRound,
  Radio,
  ShieldAlert,
  Trash2,
  Webhook,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DevRepository, DevWebhook, DevWebhookList, DevWebhookOutcome, DevWebhookProvider } from "../../store/types";
import { deleteRepositoryWebhook, issueRepositoryWebhook, listRepositoryWebhooks } from "../../store/jiraStore";
import { FormSkeleton } from "../Skeletons";
import { formatDateTime, relTime } from "../time";
import { describeDevelopmentError } from "./IssueDevelopmentPanel";
import "./development.css";

export interface WebhooksPanelProps {
  projectId: string;
  /** 등록된 저장소(서버 값) — 웹훅은 등록된 저장소에만 만든다. 바뀌면 다시 읽는다(빠진 저장소의 웹훅은 서버가 지운다) */
  repositories: DevRepository[];
}

const PROVIDER_LABELS: Record<DevWebhookProvider, string> = { GITHUB: "GitHub", GITLAB: "GitLab" };
const PROVIDER_ICONS: Record<DevWebhookProvider, LucideIcon> = { GITHUB: GitBranch, GITLAB: GitMerge };

export const WEBHOOK_OUTCOME_LABELS: Record<DevWebhookOutcome, string> = {
  PROCESSED: "처리함",
  IGNORED: "무시함",
  PING: "연결 확인",
  REJECTED: "거부함",
  FAILED: "실패",
};
const OUTCOME_ICONS: Record<DevWebhookOutcome, LucideIcon> = {
  PROCESSED: CircleCheck,
  IGNORED: CircleSlash,
  PING: Radio,
  REJECTED: Ban,
  FAILED: CircleX,
};
const OUTCOME_APPEARANCE: Record<DevWebhookOutcome, "success" | "neutral" | "info" | "warning" | "danger"> = {
  PROCESSED: "success",
  IGNORED: "neutral",
  PING: "info",
  REJECTED: "warning",
  FAILED: "danger",
};

function ProviderLabel({ provider }: { provider: DevWebhookProvider }) {
  const Icon = PROVIDER_ICONS[provider];
  return (
    <span className="webhook-provider">
      <Icon size={14} aria-hidden /> {PROVIDER_LABELS[provider]}
    </span>
  );
}

export function WebhookOutcomeLozenge({ outcome }: { outcome: DevWebhookOutcome }) {
  const Icon = OUTCOME_ICONS[outcome];
  return (
    <Lozenge appearance={OUTCOME_APPEARANCE[outcome]}>
      <Icon size={12} aria-hidden /> {WEBHOOK_OUTCOME_LABELS[outcome]}
    </Lozenge>
  );
}

/** 서버가 공개 주소를 모르면(payloadUrl null) 지금 보고 있는 오리진 + 경로 — 운영에서 ALM_WEBHOOK_PUBLIC_URL을 주면 그 값이 이긴다 */
export function payloadUrlOf(hook: DevWebhook): string {
  return hook.payloadUrl ?? `${window.location.origin}${hook.payloadPath}`;
}

function CopyField({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string) => void }) {
  return (
    <div className="webhook-field">
      <span className="webhook-field-label">{label}</span>
      <code className="webhook-field-value">{value}</code>
      <Button
        type="button"
        variant="ghost"
        iconOnly
        aria-label={`${label} 복사`}
        iconBefore={<Copy size={14} />}
        onClick={() => onCopy(value)}
      />
    </div>
  );
}

/**
 * 프로젝트 설정 › 저장소 › 웹훅(alm-backend V44) — GitHub push·pull_request / GitLab Push·Merge Request를 받아 커밋·PR을
 * 이슈에 잇는다(커밋 메시지·PR 제목·브랜치의 이슈 키). 프로젝트 관리자만 보인다(목록에도 저장소 활동이 보인다).
 * 시크릿 원문은 발급·재발급 직후 한 번만 보여 주고, 다시 볼 수 없다 — 잃으면 재발급한다.
 */
export function WebhooksPanel({ projectId, repositories }: WebhooksPanelProps) {
  const toast = useToast();
  const [list, setList] = useState<DevWebhookList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<string, DevWebhookProvider>>({});
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ repositoryUrl: string; secret: string } | null>(null);
  const [deleting, setDeleting] = useState<DevWebhook | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setList(await listRepositoryWebhooks(projectId));
      setLoadError(null);
    } catch (error) {
      setLoadError(describeDevelopmentError(error));
    }
  }, [projectId]);

  useEffect(() => {
    setList(null);
    void reload();
  }, [reload, repositories]);

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).then(
      () => toast({ title: "복사했습니다", appearance: "success" }),
      () => toast({ title: "복사하지 못했습니다 — 직접 선택해 복사하세요", appearance: "danger" }),
    );
  };

  const issue = async (repositoryUrl: string, provider: DevWebhookProvider, rotating: boolean) => {
    setBusyUrl(repositoryUrl);
    try {
      const result = await issueRepositoryWebhook(projectId, { repositoryUrl, provider });
      setIssued({ repositoryUrl, secret: result.secret });
      setList((current) =>
        current
          ? {
              ...current,
              webhooks: [...current.webhooks.filter((w) => w.repositoryUrl !== repositoryUrl), result.webhook],
            }
          : current,
      );
      toast({ title: rotating ? "시크릿을 재발급했습니다" : "웹훅을 만들었습니다", appearance: "success" });
    } catch (error) {
      toast({ title: "웹훅을 만들지 못했습니다", description: describeDevelopmentError(error), appearance: "danger" });
    } finally {
      setBusyUrl(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteRepositoryWebhook(projectId, deleting.id);
      if (issued?.repositoryUrl === deleting.repositoryUrl) setIssued(null);
      setDeleting(null);
      toast({ title: "웹훅을 삭제했습니다", appearance: "success" });
      await reload();
    } catch (error) {
      toast({ title: "웹훅을 삭제하지 못했습니다", description: describeDevelopmentError(error), appearance: "danger" });
    } finally {
      setDeleteBusy(false);
    }
  };

  let body: ReactNode;
  if (loadError) {
    body = (
      <Banner variant="danger" action={{ label: "다시 시도", onClick: () => void reload() }}>
        웹훅을 불러오지 못했습니다 — {loadError}
      </Banner>
    );
  } else if (list === null) {
    body = <FormSkeleton label="웹훅 불러오는 중" fields={2} />;
  } else if (repositories.length === 0) {
    body = <p className="settings-empty">먼저 위에서 저장소를 등록하세요.</p>;
  } else {
    body = (
      <>
        {!list.webhooksEnabled ? (
          <Banner variant="info">
            이 설치는 웹훅 수신을 쓰지 않습니다(ALM_SCM_SYNC=polling) — 아래 폴링 동기화로 커밋·PR을 가져옵니다. 이미 만든 웹훅으로 오는
            이벤트는 거부됩니다.
          </Banner>
        ) : null}
        {list.webhooksEnabled && !list.encryptionConfigured ? (
          <Banner variant="warning">
            서버에 시크릿 암호화 키(ALM_SETTINGS_ENC_KEY)가 없어 웹훅을 만들 수 없습니다. 운영자에게 설정을 요청하세요.
          </Banner>
        ) : null}
        <ul className="webhook-list" aria-label="저장소 웹훅">
          {repositories.map((repo) => {
            const hook = list.webhooks.find((w) => w.repositoryUrl === repo.url) ?? null;
            const provider = providers[repo.url] ?? hook?.provider ?? "GITHUB";
            const busy = busyUrl === repo.url;
            const secret = issued?.repositoryUrl === repo.url ? issued.secret : null;
            return (
              <li key={repo.id} className="webhook-item" data-testid="webhook-item">
                <div className="webhook-item-head">
                  <strong>{repo.name}</strong>
                  <span className="repo-url">{repo.url}</span>
                  {hook ? <ProviderLabel provider={hook.provider} /> : null}
                </div>
                {hook ? (
                  <>
                    <CopyField label="Payload URL" value={payloadUrlOf(hook)} onCopy={copy} />
                    {secret ? (
                      <Banner variant="warning">
                        <span className="webhook-secret-note">
                          <KeyRound size={14} aria-hidden /> 시크릿은 지금만 보입니다. 저장소 웹훅 설정의{" "}
                          {hook.provider === "GITHUB" ? "Secret" : "Secret token"}에 붙여 넣으세요.
                        </span>
                        <CopyField label="시크릿" value={secret} onCopy={copy} />
                      </Banner>
                    ) : null}
                    <div className="webhook-status">
                      {hook.lastOutcome ? (
                        <>
                          <WebhookOutcomeLozenge outcome={hook.lastOutcome} />
                          <span className="webhook-status-text">
                            {hook.lastEvent ? <code>{hook.lastEvent}</code> : null} {hook.lastMessage}
                          </span>
                          {hook.lastDeliveryAt ? (
                            <time dateTime={hook.lastDeliveryAt} title={formatDateTime(hook.lastDeliveryAt)} className="repo-count">
                              {relTime(hook.lastDeliveryAt)}
                            </time>
                          ) : null}
                        </>
                      ) : (
                        <span className="settings-help">
                          <Webhook size={14} aria-hidden /> 아직 받은 이벤트가 없습니다.
                        </span>
                      )}
                    </div>
                    {hook.recentDeliveries.length > 0 ? (
                      <details className="webhook-deliveries">
                        <summary>최근 수신 {hook.recentDeliveries.length}건</summary>
                        <ul>
                          {hook.recentDeliveries.map((d) => (
                            <li key={d.deliveryId}>
                              <WebhookOutcomeLozenge outcome={d.outcome} />
                              <code>{d.event}</code>
                              <span className="webhook-status-text">{d.message}</span>
                              <time dateTime={d.receivedAt} title={formatDateTime(d.receivedAt)} className="repo-count">
                                {relTime(d.receivedAt)}
                              </time>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    <div className="repo-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        iconBefore={<KeyRound size={14} />}
                        loading={busy}
                        disabled={busy || !list.encryptionConfigured || !list.webhooksEnabled}
                        onClick={() => void issue(repo.url, hook.provider, true)}
                      >
                        시크릿 재발급
                      </Button>
                      <span className="repo-actions-spacer" />
                      <Button
                        type="button"
                        variant="ghost"
                        iconBefore={<Trash2 size={14} />}
                        onClick={() => setDeleting(hook)}
                      >
                        웹훅 삭제
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="repo-actions">
                    <Select
                      label="제공자"
                      value={provider}
                      options={(["GITHUB", "GITLAB"] as const).map((p) => {
                        const Icon = PROVIDER_ICONS[p];
                        return { value: p, label: PROVIDER_LABELS[p], icon: <Icon size={14} aria-hidden /> };
                      })}
                      onValueChange={(v) => setProviders((map) => ({ ...map, [repo.url]: v as DevWebhookProvider }))}
                    />
                    <Button
                      type="button"
                      iconBefore={<Webhook size={14} />}
                      loading={busy}
                      disabled={busy || !list.encryptionConfigured || !list.webhooksEnabled}
                      onClick={() => void issue(repo.url, provider, false)}
                    >
                      웹훅 만들기
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
    <Card padding="lg" title="웹훅">
      <p className="settings-help">
        GitHub·GitLab이 push와 PR(MR)을 보내면 커밋 메시지·PR 제목·브랜치 이름의 이슈 키로 바로 연결합니다 — 스크립트를 돌리지
        않아도 됩니다. 저장소 쪽 웹훅 설정에 아래 Payload URL과 시크릿을 넣고, Content type은 <code>application/json</code>,
        이벤트는 push·pull request(merge request)를 고르세요. 이벤트는 시크릿을 마지막으로 발급한 관리자의 권한으로 연결됩니다.
      </p>
      <p className="settings-help">
        <ShieldAlert size={14} aria-hidden /> GitHub·GitLab이 이 주소에 닿을 수 있어야 합니다(사내망 전용이면 프록시·터널 필요).
      </p>
      {body}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null);
        }}
        title="웹훅 삭제"
        description={deleting ? `${deleting.repositoryUrl}의 웹훅을 지웁니다. 이후 오는 이벤트는 404로 거부됩니다.` : undefined}
        confirmLabel="삭제"
        danger
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
      />
    </Card>
  );
}
