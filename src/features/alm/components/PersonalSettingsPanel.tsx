import { useEffect, useRef, useState } from "react";
import { Button, Card, Select, Switch, useToast } from "@chanho/react";
import type { StartPage, User, UserPreferences } from "../store/types";
import {
  AVATAR_MAX_BYTES,
  DEFAULT_PREFERENCES,
  getCurrentUser,
  getMyPreferences,
  removeMyAvatar,
  saveMyPreferences,
  uploadMyAvatar, formatAvatarLimit } from "../store/jiraStore";
import { UserAvatar } from "./UserAvatar";

const START_PAGE_OPTIONS: { value: StartPage; label: string }[] = [
  { value: "home", label: "홈(For you)" },
  { value: "projects", label: "프로젝트 목록" },
  { value: "last-project", label: "마지막으로 본 프로젝트" },
];

/**
 * 개인 설정 — 지라 "개인 설정 > 일반·알림"의 축약판. 알림은 이벤트별 제품 내 수신 on/off,
 * 자동 관찰은 내가 만든/댓글 단/수정한 이슈를 워처로 붙일지, 시작 화면은 로고 클릭·첫 진입 위치.
 * 이메일은 서버 메일 설정(ALM_MAIL_HOST)이 있을 때만 실제로 발송되며, 없으면 안내를 띄운다.
 */
export interface PersonalSettingsPanelProps {
  /** general = 시작 화면·자동 관찰(지라 개인 설정 > 일반), notifications = 알림 수신(지라 > 알림) */
  part: "general" | "notifications";
}

export function PersonalSettingsPanel({ part }: PersonalSettingsPanelProps) {
  const toast = useToast();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [me, setMe] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        setMe(user);
        setAvatarUrl((current) => current ?? user.avatarUrl ?? null);
      })
      .catch(() => {
        // 프로필 카드만 못 그릴 뿐 나머지 설정은 살아 있어야 한다
      });
    void getMyPreferences()
      .then((value) => {
        if (cancelled) return;
        setPrefs(value);
        setSaved(value);
        if (value.avatarUrl) setAvatarUrl(value.avatarUrl);
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

  /** 사진은 "저장" 버튼과 무관하게 즉시 반영한다(지라와 같은 동작) */
  const runAvatar = async (failTitle: string, action: () => Promise<void>) => {
    setAvatarBusy(true);
    try {
      await action();
    } catch (error) {
      toast({
        title: failTitle,
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarPick = (files: FileList | null) => {
    const file = files?.[0];
    if (avatarInput.current) avatarInput.current.value = ""; // 같은 파일 재선택도 발화하게
    if (!file) return;
    void runAvatar("사진 올리기 실패", async () => {
      setAvatarUrl(await uploadMyAvatar(file));
      toast({ title: "프로필 사진을 변경했습니다", appearance: "success" });
    });
  };

  const handleAvatarRemove = () =>
    void runAvatar("사진 제거 실패", async () => {
      await removeMyAvatar();
      setAvatarUrl(null);
      toast({ title: "프로필 사진을 제거했습니다", appearance: "success" });
    });

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
      {part === "notifications" ? (
        <>
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
          <Switch
            label="코멘트나 설명에서 나를 멘션할 때"
            checked={prefs.notifications.mentioned}
            onCheckedChange={(v) => setNotification("mentioned", v)}
          />
        </div>
      </Card>
      <Card padding="lg" title="이메일">
        <p className="settings-help">
          위에서 켠 알림이 알림함에 생길 때 같은 내용을 이메일로도 받습니다. 주소는 로그인 계정의 이메일입니다.
        </p>
        <div className="settings-toggle-list">
          <Switch
            label="이메일로도 받기"
            checked={prefs.emailEnabled}
            onCheckedChange={(v) => setPrefs((p) => ({ ...p, emailEnabled: v }))}
          />
        </div>
        {!loading && prefs.mailConfigured === false ? (
          <p className="settings-help settings-help-warning" role="status">
            메일 서버가 구성되지 않아 지금은 발송되지 않습니다. 관리자가 <code>ALM_MAIL_HOST</code>를 설정하면
            이 설정대로 보내집니다.
          </p>
        ) : null}
      </Card>
        </>
      ) : null}
      {part === "general" ? (
        <>
      <Card padding="lg" title="프로필" role="region" aria-label="프로필">
        <div className="profile-card">
          <UserAvatar
            user={me ? { ...me, avatarUrl } : null}
            name={me?.name ?? ""}
            size="large"
            className="profile-card-avatar"
          />
          <div className="profile-card-body">
            <p className="profile-card-name">{me?.name ?? "사용자"}</p>
            <p className="settings-help">
              이슈·코멘트·보드에 보이는 프로필 사진입니다. PNG·JPG·WebP,{" "}
              {formatAvatarLimit(AVATAR_MAX_BYTES)} 이하.
            </p>
            <div className="profile-card-actions">
              {/* 실제 input은 시각적으로 숨기고 라벨이 버튼 역할 — 첨부 올리기와 같은 패턴 */}
              <label className="issue-attachments-upload">
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="사진 올리기"
                  disabled={avatarBusy}
                  onChange={(e) => handleAvatarPick(e.target.files)}
                />
                <span className="issue-attachments-upload-text">사진 올리기</span>
              </label>
              <Button
                variant="subtle"
                size="small"
                disabled={avatarBusy || !avatarUrl}
                onClick={handleAvatarRemove}
              >
                제거
              </Button>
            </div>
          </div>
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
        </>
      ) : null}
      <div className="project-form-actions">
        <Button onClick={() => void handleSave()} disabled={!dirty || saving || loading}>
          저장
        </Button>
      </div>
    </div>
  );
}
