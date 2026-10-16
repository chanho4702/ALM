import { Component, Suspense } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { EmptyState, Modal, Spinner } from "@chanho/react";
import { isStaleChunkError, reloadForNewVersion, reportStaleAsset } from "./newVersion";
import { useNewVersionState } from "./NewVersionBanner";

interface LoadErrorBoundaryProps {
  children: ReactNode;
  fallback: (stale: boolean) => ReactNode;
  resetKey: string;
}

/** React.lazy는 실패한 import를 기억하므로 새로고침으로 최신 배포의 청크를 다시 받는다. */
class LoadErrorBoundary extends Component<
  LoadErrorBoundaryProps,
  { failed: boolean; stale: boolean; resetKey: string }
> {
  state = { failed: false, stale: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, stale: isStaleChunkError(error) };
  }

  static getDerivedStateFromProps(props: LoadErrorBoundaryProps, state: LoadErrorBoundary["state"]) {
    return props.resetKey === state.resetKey ? null : { failed: false, stale: false, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown) {
    // 배포로 사라진 청크면 전역 새 버전 안내도 함께 띄운다(다른 화면으로 옮겨도 남는다)
    if (isStaleChunkError(error)) reportStaleAsset();
  }

  render() {
    return this.state.failed ? this.props.fallback(this.state.stale) : this.props.children;
  }
}

/**
 * 지연 로딩 실패 — 배포로 파일이 바뀐 경우면 새 버전 안내와 같은 선택지(새로고침)를 준다.
 * 자동으로 새로고침하지 않는다: 다른 화면(모달 등)에 저장하지 않은 입력이 있을 수 있다.
 */
function LoadFailure({ stale }: { stale: boolean }) {
  const versionState = useNewVersionState();
  if (stale && versionState === "persisting") {
    return (
      <div role="alert">
        <EmptyState
          title="화면을 불러오지 못했습니다"
          description="새로고침한 뒤에도 화면 파일을 받지 못했습니다. 배포가 끝나지 않았을 수 있으니 잠시 후 다시 시도하세요."
        />
      </div>
    );
  }
  return (
    <div role="alert">
      <EmptyState
        title={stale ? "새 버전이 배포되었습니다" : "화면을 불러오지 못했습니다"}
        description={
          stale
            ? "이 화면의 파일이 새 버전으로 바뀌었습니다. 새로고침하면 최신 화면을 받습니다 — 저장하지 않은 입력이 있으면 먼저 저장하세요."
            : "연결 상태를 확인한 뒤 새로고침해 주세요."
        }
        primaryAction={{ label: "새로고침", onClick: () => reloadForNewVersion() }}
      />
    </div>
  );
}

/** 요청한 화면만 기다려 전역 내비게이션과 프로젝트 탭을 계속 사용할 수 있다. */
export function LazyPage({ children, label }: { children: ReactNode; label: string }) {
  const { pathname } = useLocation();
  return (
    <LoadErrorBoundary resetKey={pathname} fallback={(stale) => <LoadFailure stale={stale} />}>
      <Suspense
        fallback={
          <div className="board-loading">
            <Spinner size="large" label={`${label} 불러오는 중`} />
          </div>
        }
      >
        {children}
      </Suspense>
    </LoadErrorBoundary>
  );
}

/** 느린 네트워크에서도 로딩 중인 모달을 Escape·닫기 버튼으로 취소할 수 있다. */
export function LazyModal({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  const modal = (content: ReactNode, suffix: string) => (
    <Modal
      trigger={<span hidden />}
      title={`${title} ${suffix}`}
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {content}
    </Modal>
  );

  return (
    <LoadErrorBoundary resetKey={title} fallback={(stale) => modal(<LoadFailure stale={stale} />, "불러오기 실패")}>
      <Suspense
        fallback={modal(
          <div className="board-loading"><Spinner size="large" label="불러오는 중" /></div>,
          "불러오는 중",
        )}
      >
        {children}
      </Suspense>
    </LoadErrorBoundary>
  );
}
