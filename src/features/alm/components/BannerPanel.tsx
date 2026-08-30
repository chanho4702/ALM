import { useEffect, useState } from "react";
import { Button, Card, Select, Switch, TextArea, useToast } from "@chanho/react";
import type { AnnouncementBanner } from "../store/types";
import { getBanner, saveBanner } from "../store/jiraStore";
import { ANNOUNCEMENT_CHANGED_EVENT } from "./AnnouncementBanner";

const LEVEL_OPTIONS: { value: AnnouncementBanner["level"]; label: string }[] = [
  { value: "info", label: "안내" },
  { value: "warning", label: "경고" },
];

const OFF: AnnouncementBanner = { enabled: false, level: "info", message: "" };

/** 공지 배너(지라 시스템 > 사용자 인터페이스 > 공지 배너) — 켜면 모든 화면 상단에 뜬다. 관리자 전용 */
export function BannerPanel() {
  const toast = useToast();
  const [banner, setBanner] = useState<AnnouncementBanner>(OFF);
  const [saved, setSaved] = useState<AnnouncementBanner>(OFF);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getBanner().then((value) => {
      if (cancelled) return;
      setBanner(value);
      setSaved(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = JSON.stringify(banner) !== JSON.stringify(saved);

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = await saveBanner(banner);
      setBanner(next);
      setSaved(next);
      window.dispatchEvent(new Event(ANNOUNCEMENT_CHANGED_EVENT));
      toast({ title: next.enabled ? "공지 배너를 켰습니다" : "공지 배너를 저장했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "저장 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="project-settings">
      <Card padding="lg" title="공지 배너">
        <p className="settings-help">
          점검 안내처럼 모든 사용자에게 보여야 하는 문장을 화면 상단에 띄웁니다. 켜려면 내용이 필요합니다.
        </p>
        <div className="settings-toggle-list">
          <Switch
            label="배너 표시"
            checked={banner.enabled}
            onCheckedChange={(enabled) => setBanner((b) => ({ ...b, enabled }))}
          />
        </div>
        <Select
          label="수준"
          value={banner.level}
          options={LEVEL_OPTIONS}
          onValueChange={(level) => setBanner((b) => ({ ...b, level: level as AnnouncementBanner["level"] }))}
        />
        <TextArea
          label="내용"
          rows={3}
          placeholder="예: 오늘 22시부터 30분간 점검이 있습니다"
          value={banner.message}
          onChange={(e) => setBanner((b) => ({ ...b, message: e.target.value }))}
        />
        <div className="project-form-actions">
          <Button onClick={() => void handleSave()} disabled={!dirty || saving}>
            저장
          </Button>
        </div>
      </Card>
    </div>
  );
}
