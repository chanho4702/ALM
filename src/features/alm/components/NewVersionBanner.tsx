import { useSyncExternalStore } from "react";
import { Banner, Button } from "@chanho/react";
import {
  dismissNewVersion,
  getNewVersionState,
  reloadForNewVersion,
  subscribeNewVersion,
} from "./newVersion";

export function useNewVersionState() {
  return useSyncExternalStore(subscribeNewVersion, getNewVersionState, getNewVersionState);
}

/**
 * 새 배포 안내 — 화면 파일을 못 받았을 때만 뜬다. 자동으로 새로고침하지 않는다(저장 안 한 입력 보호).
 * 사용자가 "새로고침"을 누르거나 닫는다.
 */
export function NewVersionBanner() {
  const state = useNewVersionState();
  if (state === "none") return null;
  return (
    <div className="new-version-banner">
      <Banner variant={state === "persisting" ? "danger" : "info"} onDismiss={dismissNewVersion}>
        <div className="issue-conflict">
          <p className="issue-conflict-text">
            {state === "persisting"
              ? "새로고침한 뒤에도 화면 파일을 받지 못했습니다. 배포가 끝나지 않았을 수 있으니 잠시 후 다시 시도하세요."
              : "새 버전이 배포되었습니다 — 새로고침하면 최신 화면을 받습니다. 저장하지 않은 입력이 있으면 먼저 저장하세요."}
          </p>
          {state === "available" ? (
            <div className="issue-conflict-actions">
              <Button size="small" variant="primary" onClick={() => reloadForNewVersion()}>
                새로고침
              </Button>
            </div>
          ) : null}
        </div>
      </Banner>
    </div>
  );
}
