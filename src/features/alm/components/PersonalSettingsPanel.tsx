import { useEffect, useState } from "react";
import { Button, Card, Select, Switch, useToast } from "@chanho/react";
import type { StartPage, UserPreferences } from "../store/types";
import { DEFAULT_PREFERENCES, getMyPreferences, saveMyPreferences } from "../store/jiraStore";

const START_PAGE_OPTIONS: { value: StartPage; label: string }[] = [
  { value: "home", label: "홈(For you)" },
  { value: "projects", label: "프로젝트 목록" },
  { value: "last-project", label: "마지막으로 본 프로젝트" },
];

/**
 * 개인 설정 — 지라 "개인 설정 > 일반·알림"의 축약판. 알림은 이벤트별 제품 내 수신 on/off,
 * 자동 관찰은 내가 만든/댓글 단/수정한 이슈를 워처로 붙일지, 시작 화면은 로고 클릭·첫 진입 위치.
 * 이메일은 메일 서버 연동 전이라 없다.
 */
export function PersonalSettingsPanel() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getMyPreferences()
      .then((value) => {
        if (cancelled) return;
        setPrefs(value);
        setSaved(value);
      })
      .catch((error: unknown) => {
        toast({
          title: "개인 설정을 불러오지 못했습니다",
          description: error instanceof Error ? error.message : String(error),
          appearance: "danger",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const dirty = JSON.stringify(prefs) !== JSON.stringify(saved);

  const setNotification = (key: keyof UserPreferences["notifications"], value: boolean) =>
    setPrefs((p) => ({ ...p, notifications: { ...p.notifications, [key]: value } }));
  const setAutoWatch = (key: keyof UserPreferences["autoWatch"], value: boolean) =>
    setPrefs((p) => ({ ...p, autoWatch: { ...p.autoWatch, [key]: value } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = await saveMyPreferences(prefs);
      setPrefs(next);
      setSaved(next);
      toast({ title: "개인 설정을 저장했습니다", appearance: "success" });
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
    <div className="project-settings personal-settings" aria-busy={loading}>
      <Card padding="lg" title="알림">
        <p className="settings-help">
          어떤 일이 있을 때 앱 안 알림을 받을지 정합니다. 본인이 한 행동은 알리지 않습니다.
        </p>
        <div className="settings-toggle-list">
          <Switch
            label="이슈가 나에게 배정될 때"
            checked={prefs.notifications.assigned}
            onCheckedChange={(v) => setNotification("assigned", v)}
          />
          <Switch
            label="관찰 중인 이슈의 상태가 바뀔 때"
            checked={prefs.notifications.statusChanged}
            onCheckedChange={(v) => setNotification("statusChanged", v)}
          />
          <Switch
            label="관찰 중인 이슈에 코멘트가 달릴 때"
            checked={prefs.notifications.commented}
            onCheckedChange={(v) => setNotification("commented", v)}
          />
        </div>
      </Card>
      <Card padding="lg" title="자동 관찰">
        <p className="settings-help">
          내가 상호작용한 이슈를 자동으로 관찰(워처 등록)합니다. 관찰 중인 이슈의 변화가 알림으로 옵니다.
        </p>
        <div className="settings-toggle-list">
          <Switch
            label="내가 만든 이슈"
            checked={prefs.autoWatch.created}
            onCheckedChange={(v) => setAutoWatch("created", v)}
          />
          <Switch
            label="내가 코멘트를 남긴 이슈"
            checked={prefs.autoWatch.commented}
            onCheckedChange={(v) => setAutoWatch("commented", v)}
          />
          <Switch
            label="내가 수정한 이슈"
            checked={prefs.autoWatch.edited}
            onCheckedChange={(v) => setAutoWatch("edited", v)}
          />
        </div>
      </Card>
      <Card padding="lg" title="시작 화면">
        <p className="settings-help">로그인하거나 상단 ALM 로고를 누르면 여는 화면입니다.</p>
        <Select
          label="시작 화면"
          value={prefs.startPage}
          options={START_PAGE_OPTIONS}
          onValueChange={(next) => setPrefs((p) => ({ ...p, startPage: next as StartPage }))}
        />
      </Card>
      <div className="project-form-actions">
        <Button onClick={() => void handleSave()} disabled={!dirty || saving || loading}>
          저장
        </Button>
      </div>
    </div>
  );
}
