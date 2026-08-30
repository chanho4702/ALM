import { useCallback, useEffect, useState } from "react";
import { Button, Card, Lozenge, Select, Table } from "@chanho/react";
import type { TableColumn } from "@chanho/react";
import type { AuditEntry, SystemStats, User } from "../store/types";
import { listAuditLog, listUsers, systemStats } from "../store/jiraStore";

const ALL = "all";
const PAGE_SIZE = 50;

/** 이벤트 종류 한국어 — 서버 봉투(payloadCase) 이름이 그대로 온다 */
export const AUDIT_TYPE_LABELS: Record<string, string> = {
  PROJECT_CREATED: "프로젝트 생성",
  PROJECT_UPDATED: "프로젝트 수정",
  PROJECT_DELETED: "프로젝트 삭제",
  ISSUE_CREATED: "이슈 생성",
  ISSUE_UPDATED: "이슈 수정",
  ISSUE_DELETED: "이슈 삭제",
};
const AUDIT_TYPES = Object.keys(AUDIT_TYPE_LABELS);

/**
 * 전역 관리 → 감사 로그. 누가 무엇을 언제 — 온프렘에서는 규정 대응 요소라 필터(종류·기간)와
 * 페이지를 갖춘 표로 본다. 관리자 역할이 아니면 서버가 403을 주고 화면은 그 사유를 그대로 보인다.
 */
export function AdminAuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [type, setType] = useState(ALL);
  const [days, setDays] = useState("7");
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const since =
        days === ALL ? undefined : new Date(Date.now() - Number(days) * 86_400_000).toISOString();
      const result = await listAuditLog(
        { type: type === ALL ? undefined : type, since },
        { page, size: PAGE_SIZE },
      );
      setEntries(result.items);
      setTotal(result.total);
    } catch (e) {
      setEntries([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [type, days, page]);

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    setPage(0);
  }, [type, days]);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? `사용자 ${id}`;

  const columns: TableColumn<AuditEntry>[] = [
    {
      key: "at",
      header: "시각",
      width: "160px",
      render: (row) => new Date(row.at).toLocaleString("ko-KR"),
    },
    {
      key: "eventType",
      header: "종류",
      width: "130px",
      render: (row) => <Lozenge appearance="neutral">{AUDIT_TYPE_LABELS[row.eventType] ?? row.eventType}</Lozenge>,
    },
    { key: "actor", header: "누가", width: "120px", render: (row) => userName(row.actorId) },
    {
      key: "targetKey",
      header: "대상",
      width: "110px",
      render: (row) => (row.targetKey ? <span className="issue-key-cell">{row.targetKey}</span> : "—"),
    },
    { key: "summary", header: "내용", render: (row) => row.summary ?? "" },
  ];

  return (
    <Card padding="lg" title="감사 로그">
      <div className="issue-filter-bar">
        <Select
          label="종류"
          value={type}
          onValueChange={setType}
          options={[
            { value: ALL, label: "전체" },
            ...AUDIT_TYPES.map((t) => ({ value: t, label: AUDIT_TYPE_LABELS[t] })),
          ]}
        />
        <Select
          label="기간"
          value={days}
          onValueChange={setDays}
          options={[
            { value: "1", label: "오늘" },
            { value: "7", label: "최근 7일" },
            { value: "30", label: "최근 30일" },
            { value: ALL, label: "전체" },
          ]}
        />
        <Button size="small" variant="ghost" onClick={() => void reload()}>
          새로고침
        </Button>
      </div>
      {error ? (
        <p className="reports-warning">{`감사 로그를 읽을 수 없습니다 — ${error}`}</p>
      ) : entries === null ? (
        <p className="dash-empty">불러오는 중</p>
      ) : entries.length === 0 ? (
        <p className="dash-empty">조건에 맞는 기록이 없습니다.</p>
      ) : (
        <>
          <div className="issue-pager" role="navigation" aria-label="감사 로그 페이지">
            <span className="issue-pager-range">
              {`${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} / ${total}건`}
            </span>
            <Button size="small" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              이전
            </Button>
            <Button
              size="small"
              variant="ghost"
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
          <div className="issue-table-scroll">
            <Table aria-label="감사 로그" columns={columns} rows={entries} />
          </div>
        </>
      )}
    </Card>
  );
}

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** 전역 관리 → 시스템: 용량 가시성과 백업 절차 — 운영이 손에 쥐어야 할 최소치 */
export function SystemPanel() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void systemStats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="project-settings">
      <Card padding="lg" title="시스템 현황">
        {error ? (
          <p className="reports-warning">{`현황을 읽을 수 없습니다 — ${error}`}</p>
        ) : stats ? (
          <dl className="system-stats" aria-label="시스템 현황">
            <div>
              <dt>프로젝트</dt>
              <dd>{stats.projects}</dd>
            </div>
            <div>
              <dt>이슈</dt>
              <dd>{stats.issues}</dd>
            </div>
            <div>
              <dt>첨부</dt>
              <dd>{`${stats.attachments}개 · ${formatBytes(stats.attachmentBytes)}`}</dd>
            </div>
            <div>
              <dt>감사 로그</dt>
              <dd>{stats.auditEntries}</dd>
            </div>
          </dl>
        ) : (
          <p className="dash-empty">불러오는 중</p>
        )}
      </Card>
      <Card padding="lg" title="백업·복구">
        <p className="admin-scheme-note">
          매일 <code>scripts/backup-alm.ps1</code>이 PostgreSQL 덤프와 첨부(MinIO) 미러를 같은 시각의 짝으로
          남깁니다. 복구 절차는 <code>infra/README.md</code> "백업·복구" 절을 따르세요 — 덤프와 첨부는 반드시
          같은 시각의 짝으로 되돌립니다.
        </p>
      </Card>
    </div>
  );
}
