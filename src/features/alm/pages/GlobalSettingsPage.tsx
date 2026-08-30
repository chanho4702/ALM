import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useParams } from "react-router";
import { Badge, Button, Card, Checkbox, Lozenge, Modal, PageHeader, TextField, useToast } from "@chanho/react";
import type {
  IssueType,
  SettingsScheme,
  WorkflowStatus,
  WorkflowTransition,
  WorkflowLayout,
} from "../store/types";
import {
  createScheme,
  deleteScheme,
  listSchemes,
  setDefaultScheme,
  updateScheme,
} from "../store/jiraStore";
import { StatusEditor } from "../components/StatusEditor";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import {
  typeName,
} from "../components/labels";
import { GLOBAL_SETTINGS_SECTIONS, isGlobalSettingsSection } from "../components/SettingsSideNav";
import { StatusCategoriesPanel } from "../components/StatusCategoriesPanel";
import { StatusRegistryPanel } from "../components/StatusRegistryPanel";
import { IssueTypesPanel } from "../components/IssueTypesPanel";
import { useIssueTypes } from "../components/useIssueTypes";

type Aspect = "workflow" | "types";

/**
 * 전역 관리(⚙ /settings/:section) — 지라 관리자 화면 모방.
 * 스킴을 정의하고 프로젝트가 배정받는다. 이슈 타입·워크플로 상태 모두 여기서 편집한다.
 * 구획 메뉴는 설정 사이드바(SettingsSideNav)가 그리고, 여기서는 URL의 구획만 읽는다.
 */
export function GlobalSettingsPage() {
  const toast = useToast();
  const { section = "types" } = useParams();
  const issueTypes = useIssueTypes();
  const aspect: Aspect = section === "workflows" ? "workflow" : "types";
  const [schemes, setSchemes] = useState<SettingsScheme[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<SettingsScheme | null>(null);
  const [editTypes, setEditTypes] = useState<IssueType[]>([]);
  const [editingWf, setEditingWf] = useState<SettingsScheme | null>(null);
  const [editStatuses, setEditStatuses] = useState<WorkflowStatus[]>([]);
  const [editTransitions, setEditTransitions] = useState<WorkflowTransition[]>([]);
  const [editLayout, setEditLayout] = useState<WorkflowLayout>({});

  const reload = useCallback(async () => {
    const list = await listSchemes();
    setSchemes(list);
    const { countSchemeProjects } = await import("../store/jiraStore");
    const entries = await Promise.all(
      list.map(async (s) => [s.id, await countSchemeProjects(s.id)] as const),
    );
    setCounts(Object.fromEntries(entries));
  }, []);

  // 구획을 오가도 컴포넌트는 유지된다 — 레지스트리 편집 뒤 스킴 미리보기가 낡지 않게 다시 읽는다
  useEffect(() => {
    void reload();
  }, [reload, section]);

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
    setEditTransitions(scheme.body.transitions ?? []);
    setEditLayout(scheme.body.layout ?? {});
  };

  const handleStatusesSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingWf) return;
    await run("저장 실패", async () => {
      await updateScheme(editingWf.id, {
        body: {
          ...editingWf.body,
          statuses: editStatuses,
          transitions: editTransitions,
          layout: editLayout,
        },
      });
      toast({ title: "워크플로 상태를 저장했습니다", appearance: "success" });
      setEditingWf(null);
    });
  };

  if (!isGlobalSettingsSection(section)) return <Navigate to="/settings/types" replace />;

  return (
    <main className="project-list-content">
      <PageHeader
        title="전역 관리"
        bottom={
          <span className="settings-header-sub">
            {GLOBAL_SETTINGS_SECTIONS.find((s) => s.id === section)?.label}
          </span>
        }
      />
      {section === "categories" ? (
        <StatusCategoriesPanel />
      ) : section === "statuses" ? (
        <StatusRegistryPanel />
      ) : section === "issue-types" ? (
        <IssueTypesPanel />
      ) : (
      <div className="admin-layout">
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
                            {typeName(issueTypes, type)}
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
                            <Lozenge key={status.id} appearance={status.color ?? "neutral"}>
                              {status.name}
                            </Lozenge>
                          ))}
                      </div>
                      <div className="admin-scheme-actions">
                        <Button
                          size="small"
                          variant="secondary"
                          aria-label={`${scheme.name} 워크플로 편집`}
                          onClick={() => openStatusEditor(scheme)}
                        >
                          워크플로 편집
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
      )}

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
              {issueTypes.map(({ id: type, name }) => (
                <Checkbox
                  key={type}
                  label={name}
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
            {/* 스킴 전이도 여기서 고친다 — 스킴을 쓰는 프로젝트는 설정 화면이 읽기 전용이라
                여기 없으면 전이를 바꾸려고 프로젝트마다 커스텀으로 돌려야 한다 */}
            <WorkflowCanvas
              statuses={editStatuses}
              transitions={editTransitions}
              layout={editLayout}
              onChange={setEditTransitions}
              onLayoutChange={setEditLayout}
            />
            <Button type="submit">저장</Button>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}
