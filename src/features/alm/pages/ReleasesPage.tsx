import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { MoreHorizontal } from "lucide-react";
import type { Issue, ProjectVersion, VersionStatus, WorkflowStatus } from "../store/types";
import {
  archiveVersion,
  createVersion,
  deleteVersion,
  listIssues,
  listProjectStatuses,
  listVersions,
  releaseVersion,
} from "../store/jiraStore";
import { formatPlannedRange, statusCategory } from "../components/labels";
import { VersionReleaseModal } from "../components/VersionReleaseModal";

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
  const [issues, setIssues] = useState<Issue[]>([]);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [name, setName] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [releasing, setReleasing] = useState<ProjectVersion | null>(null);
  const toast = useToast();

  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!projectId) return;
    const mine = ++generation.current;
    const [versionList, issueList, statusList] = await Promise.all([
      listVersions(projectId),
      listIssues(projectId),
      listProjectStatuses(projectId),
    ]);
    if (mine !== generation.current) return;
    setVersions(versionList);
    setIssues(issueList);
    setStatuses(statusList);
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
    });
  };

  const progressOf = useMemo(() => {
    const byVersion = new Map<string, { total: number; done: number }>();
    for (const issue of issues) {
      if (!issue.fixVersionId) continue;
      const entry = byVersion.get(issue.fixVersionId) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (statusCategory(statuses, issue.status) === "done") entry.done += 1;
      byVersion.set(issue.fixVersionId, entry);
    }
    return (id: string) => byVersion.get(id) ?? { total: 0, done: 0 };
  }, [issues, statuses]);

  if (versions === null) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="릴리스 불러오는 중" />
      </div>
    );
  }

  // 최신이 위 — 릴리스 허브는 "다음에 나갈 것"을 먼저 본다
  const ordered = [...versions].reverse();
  const unresolvedOf = (version: ProjectVersion) =>
    issues.filter(
      (issue) =>
        issue.fixVersionId === version.id && statusCategory(statuses, issue.status) !== "done",
    );

  return (
    <>
      <div className="dashboard">
        <Card padding="md" title="버전 만들기">
          <form className="member-add" onSubmit={handleCreate}>
            <TextField
              label="버전 이름"
              placeholder="예: 1.0"
              value={name}
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
          </form>
        </Card>

        {ordered.length === 0 ? (
          <EmptyState
            title="아직 버전이 없습니다"
            description="버전을 만들고 이슈의 수정 버전으로 지정하면 진행률이 여기에 모입니다."
          />
        ) : (
          <ul className="release-list" aria-label="버전 목록">
            {ordered.map((version) => {
              const progress = progressOf(version.id);
              const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
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
                        onClick={() => setReleasing(version)}
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
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <VersionReleaseModal
        version={releasing}
        unresolved={releasing ? unresolvedOf(releasing) : []}
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
