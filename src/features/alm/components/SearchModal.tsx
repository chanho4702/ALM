import { useEffect, useState } from "react";
import { Button, EmptyState, Lozenge, Modal, TextField } from "@chanho/react";
import type { Issue, Project, WorkflowStatus } from "../store/types";
import { searchIssues, statusMetaByProject } from "../store/jiraStore";
import { statusAppearance, statusName } from "./labels";

export interface SearchModalProps {
  projects: Project[];
  /** TopBar 인풋에서 넘어온 초기 검색어 */
  initialQuery: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 결과 클릭 — 셸이 해당 이슈 상세로 이동시킨다 */
  onNavigate: (issue: Issue) => void;
  /** "고급 검색으로" — 셸이 /search?q= 로 이동시킨다 */
  onAdvanced: (query: string) => void;
}

/** 지라의 전역 검색 — 전 프로젝트 이슈를 키/제목/설명으로 찾는다 */
export function SearchModal({
  projects,
  initialQuery,
  open,
  onOpenChange,
  onNavigate,
  onAdvanced,
}: SearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Issue[]>([]);
  const [statusMeta, setStatusMeta] = useState<Record<string, Record<string, WorkflowStatus>>>({});

  // 프로젝트별 상태 메타 — 결과 행 Lozenge 이름/색의 원천
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void statusMetaByProject().then((meta) => {
      if (!cancelled) setStatusMeta(meta);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // TopBar에서 새 검색어로 다시 열리면 이어받는다
  useEffect(() => {
    if (open) setQuery(initialQuery);
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void searchIssues(query).then((found) => {
      if (!cancelled) setResults(found);
    });
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "알 수 없음";

  return (
    <Modal
      trigger={<span hidden />}
      title="이슈 검색"
      open={open}
      onOpenChange={onOpenChange}
      className="search-modal"
    >
      <div className="search-modal-body">
        <TextField
          label="검색어"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="키·제목·설명으로 전 프로젝트 검색"
          autoFocus
        />
        {query.trim() === "" ? null : results.length === 0 ? (
          <EmptyState
            title="결과가 없습니다"
            description="다른 검색어를 시도해 보세요."
          />
        ) : (
          <ul className="search-results" data-testid="search-results">
            {results.map((issue) => {
              const ws = statusMeta[issue.projectId]?.[issue.status];
              const statusList = ws ? [ws] : undefined;
              return (
                <li key={issue.id}>
                  <button
                    type="button"
                    className="search-result-row"
                    onClick={() => onNavigate(issue)}
                  >
                    <span className="issue-key-cell">{issue.key}</span>
                    <span className="search-result-title">{issue.title}</span>
                    <span className="search-result-project">{projectName(issue.projectId)}</span>
                    <Lozenge appearance={statusAppearance(statusList, issue.status)}>
                      {statusName(statusList, issue.status)}
                    </Lozenge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="search-modal-footer">
          <Button variant="ghost" size="small" onClick={() => onAdvanced(query)}>
            고급 검색으로 — 상태·담당·타입 조건까지
          </Button>
        </div>
      </div>
    </Modal>
  );
}
