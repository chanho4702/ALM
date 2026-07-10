import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Button, Spinner } from "@chanho/react";
import type { Issue, Sprint, User } from "../store/types";
import { listIssues, listSprints, listUsers } from "../store/jiraStore";
import { BoardColumn } from "../components/BoardColumn";
import { BOARD_STATUSES } from "../components/labels";

export function BoardPage() {
  const { projectId } = useParams();
  /** undefined = 로딩 중, null = 활성 스프린트 없음 */
  const [sprint, setSprint] = useState<Sprint | null | undefined>(undefined);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const sprints = await listSprints(projectId);
    const active = sprints.find((s) => s.state === "active") ?? null;
    const all = active ? await listIssues(projectId) : [];
    setIssues(active ? all.filter((i) => i.sprintId === active.id) : []);
    setSprint(active);
  }, [projectId]);

  useEffect(() => {
    void listUsers().then(setUsers);
    void reload();
  }, [reload]);

  const userNames = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.name])),
    [users],
  );

  if (sprint === undefined) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="보드 불러오는 중" />
      </div>
    );
  }

  if (sprint === null) {
    return (
      <section className="board-empty">
        <h2>진행 중인 스프린트가 없습니다</h2>
        <p>백로그에서 스프린트를 만들고 시작하면 보드가 열립니다.</p>
        <Link to="../backlog">
          <Button variant="subtle" tabIndex={-1}>
            백로그로 이동
          </Button>
        </Link>
      </section>
    );
  }

  return (
    <section>
      <h2 className="board-title">{sprint.name}</h2>
      <div className="board-columns">
        {BOARD_STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            issues={issues.filter((i) => i.status === status)}
            userNames={userNames}
          />
        ))}
      </div>
    </section>
  );
}
