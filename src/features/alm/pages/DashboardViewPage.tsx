import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button, EmptyState, PageHeader, Spinner, Switch, TextField, useToast } from "@chanho/react";
import type { Dashboard, DashboardGadget, Project, User } from "../store/types";
import { getCurrentUser, getDashboard, listProjects, updateDashboard } from "../store/jiraStore";
import { AddGadgetModal } from "../components/AddGadgetModal";
import { GADGET_LABELS, GadgetEmptyHint, renderGadget } from "../components/DashboardGadgets";

/**
 * 대시보드 보기 — 2열 그리드에 가젯을 놓고(소유자) 옮기고 지운다. 저장은 배치 전체를 서버에 보낸다.
 * 가젯 데이터는 각 가젯이 스토어에서 직접 읽는다.
 */
export function DashboardViewPage() {
  const { dashboardId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [dashboard, setDashboard] = useState<Dashboard | null | undefined>(undefined);
  const [projects, setProjects] = useState<Project[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [adding, setAdding] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const reload = useCallback(async () => {
    const [found, projectList, user] = await Promise.all([getDashboard(dashboardId), listProjects(), getCurrentUser()]);
    setDashboard(found);
    setNameDraft(found?.name ?? "");
    setProjects(projectList);
    setMe(user);
  }, [dashboardId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const isOwner = Boolean(dashboard && me && dashboard.ownerId === me.id);

  const save = async (patch: { name?: string; shared?: boolean; gadgets?: DashboardGadget[] }, done?: string) => {
    if (!dashboard) return;
    try {
      const next = await updateDashboard(dashboard.id, patch);
      setDashboard(next);
      setNameDraft(next.name);
      if (done) toast({ title: done, appearance: "success" });
    } catch (error) {
      toast({
        title: "저장 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  if (dashboard === undefined) {
    return (
      <div className="app-loading">
        <Spinner size="large" label="대시보드 불러오는 중" />
      </div>
    );
  }
  if (dashboard === null) {
    return (
      <main className="project-list-content">
        <EmptyState
          title="대시보드를 찾을 수 없습니다"
          description="삭제됐거나 공유되지 않은 대시보드입니다."
          primaryAction={{ label: "대시보드 목록", onClick: () => navigate("/dashboards") }}
        />
      </main>
    );
  }

  const gadgets = dashboard.gadgets;
  const columns: [DashboardGadget[], DashboardGadget[]] = [
    gadgets.filter((g) => g.column !== 1),
    gadgets.filter((g) => g.column === 1),
  ];

  const move = (gadget: DashboardGadget, direction: "up" | "down" | "left" | "right") => {
    const next = [...gadgets];
    const index = next.findIndex((g) => g.id === gadget.id);
    if (index === -1) return;
    if (direction === "left" || direction === "right") {
      next[index] = { ...gadget, column: direction === "left" ? 0 : 1 };
    } else {
      const sameColumn = next.filter((g) => g.column === gadget.column);
      const pos = sameColumn.findIndex((g) => g.id === gadget.id);
      const target = direction === "up" ? pos - 1 : pos + 1;
      if (target < 0 || target >= sameColumn.length) return;
      const otherIndex = next.findIndex((g) => g.id === sameColumn[target].id);
      [next[index], next[otherIndex]] = [next[otherIndex], next[index]];
    }
    void save({ gadgets: next });
  };

  const remove = (gadget: DashboardGadget) => {
    void save({ gadgets: gadgets.filter((g) => g.id !== gadget.id) }, "가젯을 뺐습니다");
  };

  const add = (gadget: Omit<DashboardGadget, "id">) => {
    const id = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    void save({ gadgets: [...gadgets, { ...gadget, id }] }, "가젯을 추가했습니다");
  };

  const renderColumn = (items: DashboardGadget[], columnIndex: 0 | 1) => (
    <div className="dashboard-column" data-testid={`dashboard-column-${columnIndex}`}>
      {items.map((gadget, index) => (
        <section key={gadget.id} className="gadget" aria-label={gadget.title ?? GADGET_LABELS[gadget.type]}>
          <header className="gadget-header">
            <h3 className="gadget-title">{gadget.title ?? GADGET_LABELS[gadget.type]}</h3>
            {gadget.config.projectId ? (
              <span className="gadget-scope">{projects.find((p) => p.id === gadget.config.projectId)?.key ?? ""}</span>
            ) : null}
            {isOwner ? (
              <div className="gadget-actions">
                <Button size="small" variant="ghost" iconOnly aria-label="왼쪽 열로" disabled={columnIndex === 0} onClick={() => move(gadget, "left")}>
                  ←
                </Button>
                <Button size="small" variant="ghost" iconOnly aria-label="오른쪽 열로" disabled={columnIndex === 1} onClick={() => move(gadget, "right")}>
                  →
                </Button>
                <Button size="small" variant="ghost" iconOnly aria-label="위로" disabled={index === 0} onClick={() => move(gadget, "up")}>
                  ↑
                </Button>
                <Button size="small" variant="ghost" iconOnly aria-label="아래로" disabled={index === items.length - 1} onClick={() => move(gadget, "down")}>
                  ↓
                </Button>
                <Button size="small" variant="ghost" iconOnly aria-label={`${gadget.title ?? GADGET_LABELS[gadget.type]} 제거`} onClick={() => remove(gadget)}>
                  ×
                </Button>
              </div>
            ) : null}
          </header>
          <div className="gadget-body">{renderGadget(gadget)}</div>
        </section>
      ))}
    </div>
  );

  return (
    <main className="project-list-content dashboard-view">
      <PageHeader
        title={dashboard.name}
        actions={
          <div className="dashboard-actions">
            {isOwner ? (
              <>
                <Switch label="공유" checked={dashboard.shared} onCheckedChange={(shared) => void save({ shared }, shared ? "공유했습니다" : "비공개로 바꿨습니다")} />
                <Button size="small" onClick={() => setAdding(true)}>
                  가젯 추가
                </Button>
              </>
            ) : null}
            <Button size="small" variant="ghost" onClick={() => navigate("/dashboards")}>
              목록
            </Button>
          </div>
        }
        bottom={
          isOwner ? (
            <TextField
              label="이름"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                if (nameDraft.trim() && nameDraft.trim() !== dashboard.name) void save({ name: nameDraft }, "이름을 바꿨습니다");
              }}
            />
          ) : undefined
        }
      />
      {gadgets.length === 0 ? (
        isOwner ? <GadgetEmptyHint onAdd={() => setAdding(true)} /> : <EmptyState title="가젯이 없습니다" description="소유자가 아직 가젯을 놓지 않았습니다." />
      ) : (
        <div className="dashboard-grid">
          {renderColumn(columns[0], 0)}
          {renderColumn(columns[1], 1)}
        </div>
      )}
      <AddGadgetModal open={adding} projects={projects} onClose={() => setAdding(false)} onAdd={add} />
    </main>
  );
}
