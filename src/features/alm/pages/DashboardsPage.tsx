import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button, EmptyState, Lozenge, PageHeader, Switch, TextField, useToast } from "@chanho/react";
import type { Dashboard, User } from "../store/types";
import { createDashboard, deleteDashboard, getCurrentUser, listDashboards } from "../store/jiraStore";

/** 대시보드 목록(지라 Dashboards) — 내 것과 공유된 것. 만들면 바로 열린다 */
export function DashboardsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  const reload = useCallback(async () => {
    const [list, user] = await Promise.all([listDashboards(), getCurrentUser()]);
    setDashboards(list);
    setMe(user);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const created = await createDashboard({ name, shared });
      toast({ title: "대시보드를 만들었습니다", appearance: "success" });
      navigate(`/dashboards/${created.id}`);
    } catch (error) {
      toast({
        title: "대시보드 만들기 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleDelete = async (dashboard: Dashboard) => {
    try {
      await deleteDashboard(dashboard.id);
      toast({ title: `${dashboard.name}을(를) 삭제했습니다`, appearance: "success" });
      await reload();
    } catch (error) {
      toast({
        title: "삭제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <main className="project-list-content">
      <PageHeader title="대시보드" />
      <form className="dashboard-create" onSubmit={handleCreate}>
        <TextField label="새 대시보드 이름" placeholder="예: 팀 현황" value={name} onChange={(e) => setName(e.target.value)} />
        <Switch label="모두에게 공유" checked={shared} onCheckedChange={setShared} />
        <Button type="submit" disabled={!name.trim()}>
          대시보드 만들기
        </Button>
      </form>
      {dashboards && dashboards.length === 0 ? (
        <EmptyState title="아직 대시보드가 없습니다" description="이름을 정하고 만들면 가젯을 배치할 수 있습니다." />
      ) : (
        <ul className="dashboard-list" aria-label="대시보드 목록">
          {(dashboards ?? []).map((dashboard) => (
            <li key={dashboard.id} className="dashboard-list-row">
              <button type="button" className="dashboard-list-name" onClick={() => navigate(`/dashboards/${dashboard.id}`)}>
                {dashboard.name}
              </button>
              <span className="dashboard-list-meta">가젯 {dashboard.gadgets.length}개</span>
              {dashboard.shared ? <Lozenge appearance="info">공유됨</Lozenge> : <Lozenge appearance="neutral">비공개</Lozenge>}
              {me && dashboard.ownerId === me.id ? (
                <Button size="small" variant="ghost" aria-label={`${dashboard.name} 삭제`} onClick={() => void handleDelete(dashboard)}>
                  삭제
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
