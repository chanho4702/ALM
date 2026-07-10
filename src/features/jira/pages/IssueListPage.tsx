import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Avatar, Lozenge, Select, Spinner, TextField } from "@chanho/react";
import type { Issue, IssuePriority, IssueStatus, User } from "../store/types";
import { listIssues, listUsers } from "../store/jiraStore";
import { useIssueModal } from "../components/useIssueModal";
import {
  BOARD_STATUSES,
  PRIORITY_APPEARANCE,
  PRIORITY_LABELS,
  STATUS_APPEARANCE,
  STATUS_LABELS,
} from "../components/labels";

// Radix Select는 option value에 빈 문자열을 허용하지 않는다 → "전체"는 센티널
const ALL = "all";
const PRIORITIES: IssuePriority[] = ["high", "medium", "low"];

export function IssueListPage() {
  const { projectId } = useParams();
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중
  const [users, setUsers] = useState<User[]>([]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [assigneeId, setAssigneeId] = useState(ALL);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const list = await listIssues(projectId, {
      text: text.trim() || undefined,
      status: status === ALL ? undefined : (status as IssueStatus),
      priority: priority === ALL ? undefined : (priority as IssuePriority),
      assigneeId: assigneeId === ALL ? undefined : assigneeId,
    });
    setIssues(list);
  }, [projectId, text, status, priority, assigneeId]);

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);

  // 필터가 바뀔 때마다 스토어 재조회 — 화면에서 직접 거르지 않는다 (스펙 §4)
  useEffect(() => {
    void reload();
  }, [reload]);

  const { openIssue, issueModal } = useIssueModal(reload);

  const userNames = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.name])), [users]);

  return (
    <>
      <section>
        <h2 className="board-title">이슈</h2>
        <div className="issue-filter-bar">
          <TextField
            label="검색"
            placeholder="제목·키 검색"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Select
            label="상태"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: ALL, label: "전체" },
              ...BOARD_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
            ]}
          />
          <Select
            label="우선순위"
            value={priority}
            onValueChange={setPriority}
            options={[
              { value: ALL, label: "전체" },
              ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
            ]}
          />
          <Select
            label="담당자"
            value={assigneeId}
            onValueChange={setAssigneeId}
            options={[
              { value: ALL, label: "전체" },
              ...users.map((u) => ({ value: u.id, label: u.name })),
            ]}
          />
        </div>
        {issues === null ? (
          <div className="board-loading">
            <Spinner size="large" label="이슈 불러오는 중" />
          </div>
        ) : (
          <table className="issue-table">
            <thead>
              <tr>
                <th>키</th>
                <th>제목</th>
                <th>상태</th>
                <th>우선순위</th>
                <th>담당자</th>
                <th>생성일</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id} onClick={() => openIssue(issue.key)}>
                  <td className="issue-table-key">{issue.key}</td>
                  <td>{issue.title}</td>
                  <td>
                    <Lozenge appearance={STATUS_APPEARANCE[issue.status]}>
                      {STATUS_LABELS[issue.status]}
                    </Lozenge>
                  </td>
                  <td>
                    <Lozenge appearance={PRIORITY_APPEARANCE[issue.priority]}>
                      {PRIORITY_LABELS[issue.priority]}
                    </Lozenge>
                  </td>
                  <td>
                    {issue.assigneeId ? (
                      <span className="issue-table-assignee">
                        <Avatar name={userNames[issue.assigneeId] ?? ""} size="small" />
                        {userNames[issue.assigneeId]}
                      </span>
                    ) : (
                      "미지정"
                    )}
                  </td>
                  <td>{new Date(issue.createdAt).toLocaleDateString("ko-KR")}</td>
                </tr>
              ))}
              {issues.length === 0 ? (
                <tr>
                  <td colSpan={6} className="issue-table-empty">
                    조건에 맞는 이슈가 없습니다
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </section>
      {issueModal}
    </>
  );
}
