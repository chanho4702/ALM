import { Component, Suspense } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { EmptyState, Modal, Spinner } from "@chanho/react";

interface LoadErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: string;
}

/** React.lazy는 실패한 import를 기억하므로 새로고침으로 최신 배포의 청크를 다시 받는다. */
class LoadErrorBoundary extends Component<
  LoadErrorBoundaryProps,
  { failed: boolean; resetKey: string }
> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: LoadErrorBoundaryProps, state: LoadErrorBoundary["state"]) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function LoadFailure() {
  return (
    <div role="alert">
      <EmptyState
        title="화면을 불러오지 못했습니다"
        description="연결 상태를 확인한 뒤 새로고침해 주세요."
        primaryAction={{ label: "새로고침", onClick: () => window.location.reload() }}
      />
    </div>
  );
}

/** 요청한 화면만 기다려 전역 내비게이션과 프로젝트 탭을 계속 사용할 수 있다. */
export function LazyPage({ children, label }: { children: ReactNode; label: string }) {
  const { pathname } = useLocation();
  return (
    <LoadErrorBoundary resetKey={pathname} fallback={<LoadFailure />}>
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
    <LoadErrorBoundary resetKey={title} fallback={modal(<LoadFailure />, "불러오기 실패")}>
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
