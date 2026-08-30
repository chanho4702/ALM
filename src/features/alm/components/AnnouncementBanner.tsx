import { useEffect, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { Button } from "@chanho/react";
import type { AnnouncementBanner as Banner } from "../store/types";
import { getBanner } from "../store/jiraStore";

/** 관리자가 배너를 저장하면 같은 탭의 셸이 바로 다시 읽도록 쏘는 이벤트 */
export const ANNOUNCEMENT_CHANGED_EVENT = "alm:announcement-changed";

const DISMISS_KEY = "alm.banner.dismissed";

/**
 * 전역 공지 배너 — 셸 상단, 모든 화면 공통. 닫기는 이 세션에서 같은 문장만 숨긴다(관리자가 문장을
 * 바꾸면 다시 보인다). 불러오기 실패는 조용히 없음으로 — 배너 때문에 앱이 막히면 안 된다.
 */
export function AnnouncementBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void getBanner()
        .then((value) => {
          if (!cancelled) setBanner(value);
        })
        .catch(() => {
          if (!cancelled) setBanner(null);
        });
    load();
    window.addEventListener(ANNOUNCEMENT_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(ANNOUNCEMENT_CHANGED_EVENT, load);
    };
  }, []);

  if (!banner || !banner.enabled || !banner.message || dismissed === banner.message) return null;

  const Icon = banner.level === "warning" ? AlertTriangle : Info;
  return (
    <div
      role="status"
      className={`announcement-banner announcement-banner-${banner.level}`}
      data-testid="announcement-banner"
    >
      <Icon size={16} aria-hidden />
      <span className="announcement-banner-text">{banner.message}</span>
      <Button
        size="small"
        variant="ghost"
        iconOnly
        aria-label="공지 닫기"
        onClick={() => {
          setDismissed(banner.message);
          try {
            sessionStorage.setItem(DISMISS_KEY, banner.message);
          } catch {
            /* 세션 저장 불가 환경 — 이번 렌더만 숨긴다 */
          }
        }}
      >
        <X size={14} />
      </Button>
    </div>
  );
}
