import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useParams } from "react-router";
import { Badge, Button, Card, Checkbox, Lozenge, Modal, PageHeader, Select, TextField, useToast } from "@chanho/react";
import type {
  IssueFieldConfig,
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
import { StatusGlyph } from "../components/StatusGlyph";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";
import { PriorityGlyph } from "../components/PriorityGlyph";
import { ValueWithIcon } from "../components/ValueWithIcon";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { FieldConfigEditor } from "../components/FieldConfigEditor";
import {
  normalizeFields,
  normalizeFieldsByType,
  sameFields,
  sameFieldsByType,
} from "../components/fieldConfig";
import {
  typeName,
} from "../components/labels";
import {
  GLOBAL_SETTINGS_SECTIONS,
  isAdminOnlyGlobalSection,
  isGlobalSettingsSection,
} from "../components/SettingsSideNav";
import { useOrgProfile } from "../components/OrgAccountGate";
import { StatusCategoriesPanel } from "../components/StatusCategoriesPanel";
import { StatusRegistryPanel } from "../components/StatusRegistryPanel";
import { IssueTypesPanel } from "../components/IssueTypesPanel";
import { PrioritiesPanel } from "../components/PrioritiesPanel";
import { LinkTypesPanel } from "../components/LinkTypesPanel";
import { usePriorities } from "../components/usePriorities";
import { priorityName } from "../components/labels";
import { AdminAuditPanel, SystemPanel } from "../components/AdminPanels";
import { PersonalSettingsPanel } from "../components/PersonalSettingsPanel";
import { BannerPanel } from "../components/BannerPanel";
import { useIssueTypes } from "../components/useIssueTypes";

type Aspect = "workflow" | "types" | "fields";

/**
 * 전역 관리(⚙ /settings/:section) — 지라 관리자 화면 모방.
 * 스킴을 정의하고 프로젝트가 배정받는다. 이슈 타입·워크플로 상태 모두 여기서 편집한다.
 * 구획 메뉴는 설정 사이드바(SettingsSideNav)가 그리고, 여기서는 URL의 구획만 읽는다.
 */
export function GlobalSettingsPage() {
  const toast = useToast();
  const { section = "types" } = useParams();
  const { isGlobalAdmin } = useOrgProfile();
  const issueTypes = useIssueTypes();
  const aspect: Aspect =
    section === "workflows" ? "workflow" : section === "fields" ? "fields" : "types";
  const [schemes, setSchemes] = useState<SettingsScheme[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  /** 스킴 id → 필드 구성 초안 (필드 구성 구획은 카드 안에서 바로 편집한다) */
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, IssueFieldConfig[]>>({});
  /** 스킴 id → 이슈 타입별 덮어쓰기 초안 (키가 없는 타입은 기본 구성을 따른다) */
  const [fieldTypeDrafts, setFieldTypeDrafts] = useState<
    Record<string, Record<string, IssueFieldConfig[]>>
  >({});
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<SettingsScheme | null>(null);
  const [editTypes, setEditTypes] = useState<IssueType[]>([]);
  const [editPriorities, setEditPriorities] = useState<string[]>([]);
  const [editDefaultPriority, setEditDefaultPriority] = useState("medium");
  const priorities = usePriorities();
  const [editingWf, setEditingWf] = useState<SettingsScheme | null>(null);
  const [editStatuses, setEditStatuses] = useState<WorkflowStatus[]>([]);
  const [editTransitions, setEditTransitions] = useState<WorkflowTransition[]>([]);
  const [editLayout, setEditLayout] = useState<WorkflowLayout>({});

  const reload = useCallback(async () => {
    const list = await listSchemes();
    setSchemes(list);
    setFieldDrafts(Object.fromEntries(list.map((s) => [s.id, normalizeFields(s.body)])));
    setFieldTypeDrafts(
      Object.fromEntries(list.map((s) => [s.id, normalizeFieldsByType(s.body)])),
    );
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

  /** 필드 구성 탭에 세울 이슈 타입 — 스킴의 활성 타입을 레지스트리 순서로(하위 작업 포함) */
  const tabTypesOf = (scheme: SettingsScheme) =>
    issueTypes.filter((type) => scheme.body.enabledTypes.includes(type.id));

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
    setEditPriorities([...scheme.body.enabledPriorities]);
    setEditDefaultPriority(scheme.body.defaultPriority);
  };

  const handleTypesSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    await run("저장 실패", async () => {
      await updateScheme(editing.id, {
        body: { ...editing.body, enabledTypes: editTypes, enabledPriorities: editPriorities, defaultPriority: editDefaultPriority },
      });
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

  // 관리 구획은 사이드바·⚙ 메뉴에서 이미 감춰지지만, URL을 직접 친 경우가 남는다. 서버 403을
  // 화면에 흘리는 대신 여기서 막는다 — 관리자 여부의 판정은 `/api/org/me` 하나다.
  if (isAdminOnlyGlobalSection(section) && !isGlobalAdmin) {
    return (
      <main className="project-list-content settings-page">
        <PageHeader title="ALM 관리" />
        <Card padding="lg" title="전역 관리자만 볼 수 있습니다">
          <p className="dash-empty">
            이 설정은 전역 관리자 권한이 필요합니다. 접근이 필요하면 관리자에게 요청하세요.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="project-list-content settings-page">
      <PageHeader
        title={section === "personal" || section === "notifications" ? "개인 설정" : "ALM 관리"}
        bottom={
          section === "personal" ? (
            <span className="settings-header-sub">시작 화면 · 자동 관찰</span>
          ) : section === "notifications" ? (
            <span className="settings-header-sub">앱 내 알림 수신</span>
          ) : (
            <span className="settings-header-sub">
              {GLOBAL_SETTINGS_SECTIONS.find((s) => s.id === section)?.label}
            </span>
          )
        }
      />
      {section === "personal" ? (
        <PersonalSettingsPanel part="general" />
      ) : section === "notifications" ? (
        <PersonalSettingsPanel part="notifications" />
      ) : section === "banner" ? (
        <BannerPanel />
      ) : section === "categories" ? (
        <StatusCategoriesPanel />
      ) : section === "statuses" ? (
        <StatusRegistryPanel />
      ) : section === "issue-types" ? (
        <IssueTypesPanel />
      ) : section === "priorities" ? (
        <PrioritiesPanel />
      ) : section === "link-types" ? (
        <LinkTypesPanel />
      ) : section === "audit" ? (
        <AdminAuditPanel />
      ) : section === "system" ? (
        <SystemPanel />
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

          {aspect === "fields" ? (
            <p className="admin-scheme-note">
              끈 필드는 이슈 만들기·상세 속성 패널·대량 변경에서 사라집니다(데이터는 남습니다).
              필수 필드는 만들기에서 값이 없으면 저장되지 않습니다. 해결과 상위 항목은 필수로 지정할 수
              없고, 첨부·링크는 만든 뒤에 붙는 값이라 필수로 켜도 만들기를 막지 않습니다.
              이슈 타입 탭에서 그 타입만 다르게 구성할 수 있습니다 — 대량 변경은 언제나 기본 구성을 씁니다.
            </p>
          ) : null}

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
                          <ValueWithIcon
                            key={type}
                            icon={<IssueTypeGlyph type={type} types={issueTypes} variant="icon" />}
                          >
                            <Lozenge appearance="neutral">{typeName(issueTypes, type)}</Lozenge>
                          </ValueWithIcon>
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
                  ) : aspect === "fields" ? (
                    <form
                      className="admin-scheme-fields"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void run("저장 실패", async () => {
                          await updateScheme(scheme.id, {
                            // 빈 배열은 서버가 "기본값으로 되돌리기"로 읽는다 — 항상 13개를 보낸다.
                            // 타입별 덮어쓰기는 "기본 구성 따름"인 타입의 키를 아예 빼서 보낸다
                            body: {
                              ...scheme.body,
                              fields: fieldDrafts[scheme.id] ?? normalizeFields(scheme.body),
                              fieldsByType:
                                fieldTypeDrafts[scheme.id] ??
                                normalizeFieldsByType(scheme.body),
                            },
                          });
                          toast({ title: "필드 구성을 저장했습니다", appearance: "success" });
                        });
                      }}
                    >
                      <FieldConfigEditor
                        value={fieldDrafts[scheme.id] ?? normalizeFields(scheme.body)}
                        labelPrefix={scheme.name}
                        onChange={(next) =>
                          setFieldDrafts((prev) => ({ ...prev, [scheme.id]: next }))
                        }
                        byType={
                          fieldTypeDrafts[scheme.id] ??
                          normalizeFieldsByType(scheme.body)
                        }
                        onByTypeChange={(next) =>
                          setFieldTypeDrafts((prev) => ({ ...prev, [scheme.id]: next }))
                        }
                        types={tabTypesOf(scheme)}
                      />
                      <div className="admin-scheme-actions">
                        <Button
                          type="submit"
                          size="small"
                          disabled={
                            sameFields(
                              fieldDrafts[scheme.id] ?? normalizeFields(scheme.body),
                              normalizeFields(scheme.body),
                            ) &&
                            sameFieldsByType(
                              fieldTypeDrafts[scheme.id] ??
                                normalizeFieldsByType(scheme.body),
                              normalizeFieldsByType(scheme.body),
                            )
                          }
                        >
                          저장
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="admin-scheme-preview">
                        {[...scheme.body.statuses]
                          .sort((a, b) => a.order - b.order)
                          .map((status) => (
                            <span key={status.id} className="status-cell">
                              <StatusGlyph status={status.id} statuses={scheme.body.statuses} variant="icon" />
                              <Lozenge appearance={status.color ?? "neutral"}>{status.name}</Lozenge>
                            </span>
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
                  // 노드 라벨(react 0.11.0) — 글리프는 장식이라 접근 이름은 이름 텍스트가 갖는다
                  label={
                    <ValueWithIcon
                      icon={<IssueTypeGlyph type={type} types={issueTypes} variant="icon" />}
                    >
                      {name}
                    </ValueWithIcon>
                  }
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
            <div className="board-settings-checks" role="group" aria-label="우선순위">
              {priorities.map(({ id, name }) => (
                <Checkbox
                  key={id}
                  label={
                    <ValueWithIcon
                      icon={<PriorityGlyph defs={priorities} priority={id} size={14} variant="icon" />}
                    >
                      {name}
                    </ValueWithIcon>
                  }
                  checked={editPriorities.includes(id)}
                  onCheckedChange={() =>
                    setEditPriorities((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
                  }
                />
              ))}
            </div>
            <Select
              label="기본 우선순위"
              value={editDefaultPriority}
              options={editPriorities.map((id) => ({
                value: id,
                label: priorityName(priorities, id),
                icon: <PriorityGlyph defs={priorities} priority={id} size={14} variant="icon" />,
              }))}
              onValueChange={setEditDefaultPriority}
            />
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
