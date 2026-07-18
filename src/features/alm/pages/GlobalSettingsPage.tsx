import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Badge, Button, Card, Checkbox, Lozenge, Modal, PageHeader, TextField, useToast } from "@chanho/react";
import type { IssueType, SettingsScheme, WorkflowStatus } from "../store/types";
import {
  createScheme,
  deleteScheme,
  listSchemes,
  setDefaultScheme,
  updateScheme,
} from "../store/jiraStore";
import { StatusEditor } from "../components/StatusEditor";
import { ISSUE_TYPES, STATUS_APPEARANCE, TYPE_LABELS } from "../components/labels";

type Aspect = "workflow" | "types";

/**
 * 전역 관리(⚙ /settings) — 지라 관리자 화면 모방.
 * 스킴을 정의하고 프로젝트가 배정받는다. 이슈 타입·워크플로 상태 모두 여기서 편집한다.
 */
export function GlobalSettingsPage() {
  const toast = useToast();
  const [aspect, setAspect] = useState<Aspect>("types");
  const [schemes, setSchemes] = useState<SettingsScheme[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<SettingsScheme | null>(null);
  const [editTypes, setEditTypes] = useState<IssueType[]>([]);
  const [editingWf, setEditingWf] = useState<SettingsScheme | null>(null);
  const [editStatuses, setEditStatuses] = useState<WorkflowStatus[]>([]);

  const reload = useCallback(async () => {
    const list = await listSchemes();
    setSchemes(list);
    const { countSchemeProjects } = await import("../store/jiraStore");
    const entries = await Promise.all(
      list.map(async (s) => [s.id, await countSchemeProjects(s.id)] as const),
    );
    setCounts(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (failTitle: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast({
        title: failTitle,
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reload();
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run("스킴 생성 실패", async () => {
      await createScheme(newName);
      setNewName("");
      toast({ title: "스킴을 만들었습니다", appearance: "success" });
    });
  };

  const openTypeEditor = (scheme: SettingsScheme) => {
    setEditing(scheme);
    setEditTypes([...scheme.body.enabledTypes]);
  };

  const handleTypesSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    await run("저장 실패", async () => {
      await updateScheme(editing.id, { body: { ...editing.body, enabledTypes: editTypes } });
      toast({ title: "이슈 타입 구성을 저장했습니다", appearance: "success" });
      setEditing(null);
    });
  };

  const openStatusEditor = (scheme: SettingsScheme) => {
    setEditingWf(scheme);
    setEditStatuses([...scheme.body.statuses].sort((a, b) => a.order - b.order));
  };

  const handleStatusesSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingWf) return;
    await run("저장 실패", async () => {
      await updateScheme(editingWf.id, { body: { ...editingWf.body, statuses: editStatuses } });
      toast({ title: "워크플로 상태를 저장했습니다", appearance: "success" });
      setEditingWf(null);
    });
  };

  return (
    <main className="project-list-content">
      <PageHeader title="전역 관리" />
      <div className="admin-layout">
        {/* 지라 관리자 화면식 좌측 메뉴 — 같은 스킴의 두 측면 */}
        <nav className="admin-menu" aria-label="설정 메뉴">
          <button
            type="button"
            className={aspect === "types" ? "admin-menu-item is-active" : "admin-menu-item"}
            onClick={() => setAspect("types")}
          >
            이슈 타입 스킴
          </button>
          <button
            type="button"
            className={aspect === "workflow" ? "admin-menu-item is-active" : "admin-menu-item"}
            onClick={() => setAspect("workflow")}
          >
            워크플로 스킴
          </button>
        </nav>

        <div className="admin-content">
          <form className="admin-create-form" onSubmit={handleCreate}>
            <TextField
              label="새 스킴 이름"
              placeholder="예: 개발팀 스킴 (디폴트 구성 복사로 시작)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button type="submit" disabled={!newName.trim()}>
              스킴 만들기
            </Button>
          </form>

          <ul className="admin-scheme-list" data-testid="scheme-list">
            {schemes.map((scheme) => (
              <li key={scheme.id}>
                <Card padding="md" className="admin-scheme-card">
                  <div className="admin-scheme-head">
                    <strong>{scheme.name}</strong>
                    {scheme.isDefault ? <Badge appearance="brand">디폴트</Badge> : null}
                    <span className="admin-scheme-count">
                      배정 {counts[scheme.id] ?? 0}개 프로젝트
                    </span>
                  </div>
                  {aspect === "types" ? (
                    <>
                      <div className="admin-scheme-preview">
                        {scheme.body.enabledTypes.map((type) => (
                          <Lozenge key={type} appearance="neutral">
                            {TYPE_LABELS[type]}
                          </Lozenge>
                        ))}
                      </div>
                      <div className="admin-scheme-actions">
                        <Button size="small" variant="secondary" onClick={() => openTypeEditor(scheme)}>
                          이슈 타입 편집
                        </Button>
                        {!scheme.isDefault ? (
                          <>
                            <Button
                              size="small"
                              variant="ghost"
                              onClick={() =>
                                void run("디폴트 지정 실패", () => setDefaultScheme(scheme.id))
                              }
                            >
                              디폴트로 지정
                            </Button>
                            <Button
                              size="small"
                              variant="ghost"
                              aria-label={`스킴 ${scheme.name} 삭제`}
                              onClick={() => void run("스킴 삭제 실패", () => deleteScheme(scheme.id))}
                            >
                              삭제
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="admin-scheme-preview">
                        {[...scheme.body.statuses]
                          .sort((a, b) => a.order - b.order)
                          .map((status) => (
                            <Lozenge key={status.id} appearance={STATUS_APPEARANCE[status.category]}>
                              {status.name}
                            </Lozenge>
                          ))}
                      </div>
                      <div className="admin-scheme-actions">
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => openStatusEditor(scheme)}
                        >
                          상태 편집
                        </Button>
                        {!scheme.isDefault ? (
                          <>
                            <Button
                              size="small"
                              variant="ghost"
                              onClick={() =>
                                void run("디폴트 지정 실패", () => setDefaultScheme(scheme.id))
                              }
                            >
                              디폴트로 지정
                            </Button>
                            <Button
                              size="small"
                              variant="ghost"
                              aria-label={`스킴 ${scheme.name} 삭제`}
                              onClick={() => void run("스킴 삭제 실패", () => deleteScheme(scheme.id))}
                            >
                              삭제
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {editing ? (
        <Modal
          trigger={<span hidden />}
          title={`이슈 타입 — ${editing.name}`}
          description="비활성화한 타입은 새 이슈에서 선택할 수 없습니다. 기존 이슈는 유지됩니다."
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
        >
          <form className="project-create-form" onSubmit={handleTypesSave}>
            <div className="board-settings-checks" role="group" aria-label="이슈 타입">
              {ISSUE_TYPES.map((type) => (
                <Checkbox
                  key={type}
                  label={TYPE_LABELS[type]}
                  checked={editTypes.includes(type)}
                  disabled={type === "subtask"} // 계층 기능 의존 — 항상 활성
                  onCheckedChange={() =>
                    setEditTypes((prev) =>
                      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
                    )
                  }
                />
              ))}
            </div>
            <Button type="submit">저장</Button>
          </form>
        </Modal>
      ) : null}

      {editingWf ? (
        <Modal
          trigger={<span hidden />}
          title={`워크플로 상태 — ${editingWf.name}`}
          description="저장하면 이 스킴을 쓰는 모든 프로젝트의 이슈가 새 구성으로 이관됩니다."
          open
          onOpenChange={(next) => {
            if (!next) setEditingWf(null);
          }}
          className="status-editor-modal"
        >
          <form className="project-create-form" onSubmit={handleStatusesSave}>
            <StatusEditor value={editStatuses} onChange={setEditStatuses} />
            <Button type="submit">저장</Button>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}
