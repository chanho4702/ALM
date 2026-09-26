import { useEffect, useState, type ReactNode } from "react";
import { Link, useOutletContext } from "react-router";
import { Banner, Button, ConfirmDialog, EmptyState, Spinner, useToast } from "@chanho/react";
import { ArrowLeft, Clock, RefreshCw } from "lucide-react";
import type { AgentPersona } from "../store/types";
import { fetchAgentPersonas } from "../store/jiraStore";
import { useAiTeamStatus } from "../components/useAiTeamActive";
import type { JiraOutletContext } from "../components/ProjectLayout";
import { relTimeFine } from "../components/time";
import type { PolledLoad } from "./usePolledLoad";

/**
 * run 목록·상세·게이트 인박스 공용 뼈대(P3a AGP-12/13). 사무실 밖 화면이라 DS 컴포넌트·토큰만 쓴다
 * (D-P3a-3 — 픽셀 스타일·갈무리11 폰트는 사무실 청크에만). ai-office.css를 가져오지 않는다.
 */

/** 사무실 페이지와 같은 진입 규칙 — 판정 전 스피너, 비활성 플랫폼이면 빈 상태 */
export function AiTeamGate({ loadingLabel, children }: { loadingLabel: string; children: ReactNode }) {
  const status = useAiTeamStatus();
  if (status === "unknown") {
    return (
      <div className="board-loading">
        <Spinner size="large" label={loadingLabel} />
      </div>
    );
  }
  if (status === "inactive") {
    return (
      <EmptyState title="AI 팀이 아직 없습니다" description="agent-service가 연결된 플랫폼에서만 쓸 수 있습니다" />
    );
  }
  return <>{children}</>;
}

/** 현재 프로젝트 키 — ProjectLayout 아웃렛 밖(직접 렌더)이면 null */
export function useProjectKey(projectId: string): string | null {
  const context = useOutletContext<JiraOutletContext | undefined>();
  return context?.projects.find((p) => p.id === projectId)?.key ?? null;
}

/**
 * 페르소나 id → 이름·이모지. `fetchAgentPersonas`는 실패를 빈 목록으로 접으므로(진입점 판정 계약)
 * 이름을 못 받으면 화면은 `페르소나 #id`로 떨어진다 — 목록 자체의 로드 실패는 run·게이트 조회가 드러낸다.
 */
export function usePersonaDirectory(): ReadonlyMap<string, AgentPersona> {
  const [map, setMap] = useState<ReadonlyMap<string, AgentPersona>>(new Map());
  useEffect(() => {
    let cancelled = false;
    void fetchAgentPersonas().then((list) => {
      if (!cancelled) setMap(new Map(list.map((p) => [String(p.id), p])));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return map;
}

/** 머리 — 사무실로 돌아가기 · 제목 · 마지막 갱신 + 새로 고침. 아래에 조회 실패 배너 */
export function SupervisionHeader({
  title,
  titleId,
  backHref,
  backLabel,
  load,
  children,
}: {
  title: string;
  titleId: string;
  backHref: string;
  backLabel: string;
  load: Pick<PolledLoad<unknown>, "lastUpdated" | "refreshing" | "refresh" | "stale">;
  /** 제목 줄 오른쪽(필터 등) */
  children?: ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <div className="agent-sup-head">
        <Link className="agent-sup-back" to={backHref}>
          <ArrowLeft size={14} aria-hidden />
          {backLabel}
        </Link>
        <div className="agent-sup-title-row">
          <h2 id={titleId} className="agent-sup-title">
            {title}
          </h2>
          <div className="agent-sup-tools">
            {children}
            <span className="agent-sup-updated status-cell">
              <Clock size={14} aria-hidden />
              {load.lastUpdated ? `${relTimeFine(new Date(load.lastUpdated).toISOString(), now)} 갱신` : "불러오는 중"}
            </span>
            <Button
              variant="ghost"
              size="small"
              iconOnly
              aria-label="지금 새로 고침"
              disabled={load.refreshing}
              onClick={() => void load.refresh()}
            >
              <RefreshCw size={14} aria-hidden />
            </Button>
          </div>
        </div>
      </div>
      {load.stale ? (
        <Banner variant="warning" action={{ label: "지금 다시 시도", onClick: () => void load.refresh() }}>
          새로 고치지 못했습니다. 마지막으로 받은 목록을 보여 주고 있습니다 (30초 뒤 다시 시도)
        </Banner>
      ) : null}
    </>
  );
}

/** 첫 조회 상태(로딩·오류) — 준비되면 children */
export function SupervisionBody({
  load,
  loadingLabel,
  errorTitle,
  children,
}: {
  load: Pick<PolledLoad<unknown>, "status" | "error" | "refresh">;
  loadingLabel: string;
  errorTitle: string;
  children: ReactNode;
}) {
  if (load.status === "loading") {
    return (
      <div className="board-loading">
        <Spinner size="large" label={loadingLabel} />
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <EmptyState
        title={errorTitle}
        description={load.error ? `agent-service 연결을 확인하세요 — ${load.error}` : "agent-service 연결을 확인하세요"}
        primaryAction={{ label: "다시 시도", onClick: () => void load.refresh() }}
      />
    );
  }
  return <>{children}</>;
}

export interface PendingAction {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  successMessage: string;
  failureTitle: string;
  run: () => Promise<void>;
}

/**
 * 관리자 액션(취소·재개·승인·거절) 공용 — 확인 다이얼로그 → 실행 → 성공 토스트 + 재조회 /
 * 실패는 서버 `{"error"}` 문구(409 전이 거부·403 권한 등)를 그대로 토스트로.
 */
export function useConfirmedAction(onDone: () => Promise<void> | void) {
  const toast = useToast();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.run();
      toast({ title: pending.successMessage, appearance: "success" });
      setPending(null);
      await onDone();
    } catch (e) {
      toast({
        title: pending.failureTitle,
        description: e instanceof Error ? e.message : String(e),
        appearance: "danger",
      });
      setPending(null);
      await onDone();
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open && !busy) setPending(null);
      }}
      title={pending?.title ?? ""}
      description={pending?.description}
      confirmLabel={pending?.confirmLabel}
      cancelLabel="닫기"
      danger={pending?.danger}
      loading={busy}
      onConfirm={() => void confirm()}
    />
  );

  return { request: setPending, dialog };
}
