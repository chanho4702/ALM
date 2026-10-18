import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router";
import {
  Button,
  Card,
  Dropdown,
  EmptyState,
  Lozenge,
  ProgressBar,
  Spinner,
  TextField,
  useToast,
} from "@chanho/react";
import { MoreHorizontal, Plus } from "lucide-react";
import type { Issue, ProjectVersion, VersionStatus, WorkflowStatus } from "../store/types";

interface VersionProgress {
  total: number;
  done: number;
}

/** 버전 진행률 — 이슈 본문을 받지 않고 서버 집계로 센다(전체·미완료 건수). 완료 판정은 상태 분류(서버) */
async function versionProgressOf(version: ProjectVersion): Promise<VersionProgress> {
  const [all, open] = await Promise.all([
    aggregateIssues({ fixVersionId: version.id }, "statusCategory"),
    aggregateIssues({ fixVersionId: version.id, openOnly: true }, "statusCategory"),
  ]);
  return { total: all.total, done: all.total - open.total };
}
import {
  aggregateIssues,
  archiveVersion,
  createVersion,
  deleteVersion,
  findIssues,
  listProjectStatuses,
  listVersions,
  releaseVersion,
  updateVersion,
} from "../store/jiraStore";
import { errorStatus } from "../store/mapping";
import { settleWithConcurrency } from "../store/concurrency";
import { formatPlannedRange } from "../components/labels";
import { VersionReleaseModal } from "../components/VersionReleaseModal";
import { VersionEditModal, type VersionDraft } from "../components/VersionEditModal";

const STATUS_LABELS: Record<VersionStatus, string> = {
  unreleased: "미릴리스",
  released: "릴리스됨",
  archived: "보관됨",
};

const STATUS_APPEARANCE: Record<VersionStatus, "neutral" | "success" | "info"> = {
  unreleased: "info",
  released: "success",
  archived: "neutral",
};

/**
 * 릴리스 허브 — 지라의 Releases. 버전별 진행률을 보고 릴리스·보관·삭제한다.
 * 완료 판정은 상태 카테고리이며 계산은 화면이 스토어 데이터로 한다(요약과 같은 자리).
 */
export function ReleasesPage() {
  const { projectId } = useParams();
  const [versions, setVersions] = useState<ProjectVersion[] | null>(null);
  /** 버전별 진행률 — null은 집계 실패(알 수 없음). 0건으로 보이게 하지 않는다 */
  const [progress, setProgress] = useState<Record<string, VersionProgress | null>>({});
  /** 릴리스 확인에 보일 미완료 이슈 — 모달을 열 때 그 버전 것만 읽는다 */
  const [unresolved, setUnresolved] = useState<Issue[]>([]);
  /** 미완료 이슈 전체 건수 — 목록은 한 페이지(200건)만 받아도 확인하면 서버는 전부 옮긴다 */
  const [unresolvedTotal, setUnresolvedTotal] = useState(0);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [name, setName] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  // 만들기 폼은 기본 접힘 — 상단 [버전 만들기] 버튼으로 편다(백로그 인라인 생성과 같은 패턴)
  const [creating, setCreating] = useState(false);
  const [releasing, setReleasing] = useState<ProjectVersion | null>(null);
  /** 편집 중인 버전 — 편집을 시작할 때 본 값(낙관적 락 기준). 충돌을 해소하면 최신 값으로 바꾼다 */
  const [editing, setEditing] = useState<ProjectVersion | null>(null);
  const [editConflict, setEditConflict] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editReloadToken, setEditReloadToken] = useState(0);
  const toast = useToast();

  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!projectId) return;
    const mine = ++generation.current;
    const [versionList, statusList] = await Promise.all([listVersions(projectId), listProjectStatuses(projectId)]);
    const counted = await settleWithConcurrency(versionList, versionProgressOf);
    if (mine !== generation.current) return;
    setVersions(versionList);
    setStatuses(statusList);
    setProgress(
      Object.fromEntries(
        versionList.map((version, index) => {
          const result = counted[index];
          return [version.id, result.status === "fulfilled" ? result.value : null];
        }),
      ),
    );
  }, [projectId]);

  useEffect(() => {
    setVersions(null);
    void reload();
  }, [reload]);

  /** 실패는 사유를 그대로 보여준다 — 이름 중복·상태 전이 규칙은 사용자가 알아야 한다 */
  const run = async (failTitle: string, successTitle: string, action: () => Promise<unknown>) => {
    try {
      await action();
      toast({ title: successTitle, appearance: "success" });
    } catch (error) {
      toast({
        title: failTitle,
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
    await reload();
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run("버전 만들기 실패", "버전을 만들었습니다", async () => {
      if (!projectId) throw new Error("프로젝트를 찾을 수 없습니다");
      await createVersion(projectId, { name, releaseDate: releaseDate || null });
      setName("");
      setReleaseDate("");
      setCreating(false);
    });
  };

  const closeEdit = () => {
    setEditing(null);
    setEditConflict(false);
  };

  /** 편집 저장 — 409면 모달을 연 채 초안을 지키고 해소 선택지를 띄운다. 그 밖의 실패는 사유를 토스트로 */
  const saveEdit = async (base: ProjectVersion, draft: VersionDraft) => {
    setEditSaving(true);
    try {
      await updateVersion(base, {
        name: draft.name,
        description: draft.description,
        startDate: draft.startDate || null,
        releaseDate: draft.releaseDate || null,
      });
      closeEdit();
      toast({ title: "버전을 수정했습니다", appearance: "success" });
      await reload();
    } catch (error) {
      if (errorStatus(error) === 409) {
        setEditConflict(true);
        return;
      }
      toast({
        title: "버전 수정 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setEditSaving(false);
    }
  };

  /** 충돌 해소 — 최신 값을 읽어 편집 기준을 바꾸고, "다시 적용"이면 그 기준으로 내 초안을 저장한다 */
  const resolveEditConflict = async (draft: VersionDraft, mode: "reload" | "reapply") => {
    if (!editing || !projectId) return;
    try {
      const latest = (await listVersions(projectId)).find((v) => v.id === editing.id);
      if (!latest) throw new Error("버전을 찾을 수 없습니다");
      setEditing(latest);
      setEditConflict(false);
      if (mode === "reload") setEditReloadToken((token) => token + 1);
      else await saveEdit(latest, draft);
    } catch (error) {
      toast({
        title: "최신 내용을 불러오지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const progressOf = (id: string): VersionProgress | null => (id in progress ? progress[id] : { total: 0, done: 0 });

  /** 릴리스 확인 — 그 버전의 미완료 이슈를 먼저 읽고 연다(빈 목록이 잠깐 보였다 바뀌지 않게) */
  const openRelease = async (version: ProjectVersion) => {
    try {
      const page = await findIssues(
        { fixVersionId: version.id, openOnly: true },
        { page: 0, size: 200 },
        { field: "key", dir: "asc" },
      );
      setUnresolved(page.items);
      setUnresolvedTotal(page.total);
      setReleasing(version);
    } catch (error) {
      toast({
        title: "미완료 이슈를 불러오지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  if (versions === null) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="릴리스 불러오는 중" />
      </div>
    );
  }

  // 최신이 위 — 릴리스 허브는 "다음에 나갈 것"을 먼저 본다
  const ordered = [...versions].reverse();

  return (
    <>
      <div className="dashboard">
        {creating ? null : (
          <div className="view-actions">
            <Button size="small" iconBefore={<Plus size={14} />} onClick={() => setCreating(true)}>
              버전 만들기
            </Button>
          </div>
        )}
        {creating ? (
          <Card padding="md" title="새 버전">
            <form
              className="member-add release-create-form"
              onSubmit={handleCreate}
              // Esc는 폼만 닫는다
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.stopPropagation();
                setCreating(false);
              }}
            >
              <TextField
                label="버전 이름"
                placeholder="예: 1.0"
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label="릴리스 예정일"
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
              />
              <Button type="submit" disabled={!name.trim()}>
                버전 만들기
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                취소
              </Button>
            </form>
          </Card>
        ) : null}

        {ordered.length === 0 ? (
          <EmptyState
            title="아직 버전이 없습니다"
            description="버전을 만들고 이슈의 수정 버전으로 지정하면 진행률이 여기에 모입니다."
          />
        ) : (
          <ul className="release-list" aria-label="버전 목록">
            {ordered.map((version) => {
              const progress = progressOf(version.id);
              const percent = !progress || progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
              return (
                <li key={version.id} className={`release-row is-${version.status}`}>
                  <div className="release-row-head">
                    <span className="release-name">{version.name}</span>
                    <Lozenge appearance={STATUS_APPEARANCE[version.status]}>
                      {STATUS_LABELS[version.status]}
                    </Lozenge>
                    <span className="dash-sprint-meta">
                      {formatPlannedRange(version.startDate, version.releaseDate) || "날짜 미정"}
                    </span>
                    <span className="release-row-spacer" />
                    {version.status === "unreleased" ? (
                      <Button
                        size="small"
                        aria-label={`${version.name} 릴리스`}
                        onClick={() => void openRelease(version)}
                      >
                        릴리스
                      </Button>
                    ) : null}
                    <Dropdown
                      trigger={
                        <Button variant="subtle" size="small" iconOnly aria-label={`${version.name} 메뉴`}>
                          <MoreHorizontal size={16} />
                        </Button>
                      }
                      items={[
                        { label: "편집", onSelect: () => setEditing(version) },
                        ...(version.status !== "archived"
                          ? [
                              {
                                label: "보관",
                                onSelect: () =>
                                  void run("보관 실패", "버전을 보관했습니다", () =>
                                    archiveVersion(version.id),
                                  ),
                              },
                            ]
                          : []),
                        {
                          label: "삭제",
                          danger: true,
                          onSelect: () =>
                            void run("삭제 실패", "버전을 삭제했습니다", () =>
                              deleteVersion(version.id),
                            ),
                        },
                      ]}
                    />
                  </div>
                  {version.description ? (
                    <p className="dash-sprint-goal">{version.description}</p>
                  ) : null}
                  {progress === null ? (
                    <div className="dash-sprint-progress" role="alert">
                      진행률을 불러오지 못했습니다{" "}
                      <Button size="small" variant="subtle" onClick={() => void reload()}>
                        다시 시도
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="dash-sprint-progress">
                        {progress.total === 0
                          ? "달린 이슈가 없습니다"
                          : `${progress.total}개 중 ${progress.done}개 완료`}
                      </p>
                      <ProgressBar
                        label={`${version.name} 완료율`}
                        value={percent}
                        variant={version.status === "released" ? "success" : "default"}
                      />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <VersionEditModal
        version={editing}
        conflict={editConflict}
        saving={editSaving}
        reloadToken={editReloadToken}
        onClose={closeEdit}
        onSave={(version, draft) => void saveEdit(version, draft)}
        onResolveConflict={(draft, mode) => void resolveEditConflict(draft, mode)}
      />

      <VersionReleaseModal
        version={releasing}
        unresolved={releasing ? unresolved : []}
        unresolvedTotal={releasing ? unresolvedTotal : 0}
        targets={versions.filter((v) => v.status === "unreleased" && v.id !== releasing?.id)}
        statuses={statuses}
        onClose={() => setReleasing(null)}
        onConfirm={(version, moveUnresolvedTo) => {
          void run("릴리스 실패", `${version.name}을(를) 릴리스했습니다`, async () => {
            await releaseVersion(version.id, { moveUnresolvedTo });
            setReleasing(null);
          });
        }}
      />
    </>
  );
}
