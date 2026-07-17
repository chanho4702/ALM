import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { EmptyState, Spinner } from "@chanho/react";
import type { Issue } from "../store/types";
import { listIssues } from "../store/jiraStore";
import { useIssueModal } from "../components/useIssueModal";
import { IssueTypeGlyph } from "../components/IssueTypeGlyph";

const DAY_WIDTH = 28;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" → UTC 자정 타임스탬프 (일 단위 계산용) */
const dayStamp = (isoDate: string) => Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
const addDays = (stamp: number, days: number) => stamp + days * MS_PER_DAY;
const toIsoDay = (stamp: number) => new Date(stamp).toISOString().slice(0, 10);

/**
 * 지라의 타임라인(간트) — 이슈별 막대(생성일 → 마감일).
 * 마감일이 없는 이슈는 생성일 하루짜리 점 막대로 표시한다.
 */
export function TimelinePage() {
  const { projectId } = useParams();
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = 로딩 중

  const reload = useCallback(async () => {
    if (!projectId) return;
    setIssues(await listIssues(projectId));
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const { openIssue, issueModal } = useIssueModal(reload);

  const model = useMemo(() => {
    if (!issues || issues.length === 0) return null;
    const todayStamp = dayStamp(new Date().toISOString());
    const startStamps = issues.map((i) => dayStamp(i.createdAt));
    const endStamps = issues.map((i) => (i.dueDate ? dayStamp(i.dueDate) : dayStamp(i.createdAt)));
    // 범위: 가장 이른 시작 -3일 ~ 가장 늦은 끝(오늘 포함) +7일
    const rangeStart = addDays(Math.min(...startStamps, todayStamp), -3);
    const rangeEnd = addDays(Math.max(...endStamps, todayStamp), 7);
    const totalDays = Math.round((rangeEnd - rangeStart) / MS_PER_DAY) + 1;

    const dayIndex = (stamp: number) => Math.round((stamp - rangeStart) / MS_PER_DAY);

    // 월 헤더: 범위를 월 단위로 끊어 [라벨, 시작 인덱스, 일수]
    const months: { label: string; startIndex: number; days: number }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(addDays(rangeStart, i));
      const label = `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월`;
      const last = months[months.length - 1];
      if (last && last.label === label) last.days += 1;
      else months.push({ label, startIndex: i, days: 1 });
    }

    // 주 눈금: 월요일마다 날짜 숫자
    const weekTicks: { index: number; label: string }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(addDays(rangeStart, i));
      if (date.getUTCDay() === 1) weekTicks.push({ index: i, label: String(date.getUTCDate()) });
    }

    const rows = [...issues]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((issue) => {
        const startIndex = dayIndex(dayStamp(issue.createdAt));
        const endIndex = issue.dueDate ? dayIndex(dayStamp(issue.dueDate)) : startIndex;
        return {
          issue,
          startIndex,
          // 마감일이 생성일보다 앞서도 최소 1일 폭을 보장한다
          spanDays: Math.max(endIndex - startIndex + 1, 1),
          hasDue: issue.dueDate !== null,
        };
      });

    return { totalDays, months, weekTicks, todayIndex: dayIndex(todayStamp), rows, rangeStart };
  }, [issues]);

  if (issues === null) {
    return (
      <div className="board-loading">
        <Spinner size="large" label="타임라인 불러오는 중" />
      </div>
    );
  }

  return (
    <>
      {model === null ? (
        <EmptyState
          title="아직 이슈가 없습니다"
          description="이슈를 만들면 생성일부터 마감일까지의 막대가 여기에 그려집니다."
        />
      ) : (
        <div className="timeline" data-testid="timeline">
          {/* 좌측 고정: 이슈 목록 */}
          <div className="timeline-side">
            <div className="timeline-side-header">이슈</div>
            {model.rows.map(({ issue }) => (
              <button
                key={issue.id}
                type="button"
                className="timeline-issue"
                onClick={() => openIssue(issue.key)}
              >
                <IssueTypeGlyph type={issue.type} />
                <span className="issue-key-cell">{issue.key}</span>
                <span className="timeline-issue-title">{issue.title}</span>
              </button>
            ))}
          </div>
          {/* 우측 스크롤: 날짜 축 + 막대 */}
          <div className="timeline-scroll">
            <div className="timeline-grid" style={{ width: model.totalDays * DAY_WIDTH }}>
              <div className="timeline-months">
                {model.months.map((month) => (
                  <span
                    key={month.label}
                    className="timeline-month"
                    style={{ left: month.startIndex * DAY_WIDTH, width: month.days * DAY_WIDTH }}
                  >
                    {month.label}
                  </span>
                ))}
              </div>
              <div className="timeline-ticks">
                {model.weekTicks.map((tick) => (
                  <span
                    key={tick.index}
                    className="timeline-tick"
                    style={{ left: tick.index * DAY_WIDTH }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
              {/* 오늘 세로선 */}
              <span
                className="timeline-today"
                style={{ left: model.todayIndex * DAY_WIDTH + DAY_WIDTH / 2 }}
                title={`오늘 (${toIsoDay(addDays(model.rangeStart, model.todayIndex))})`}
              />
              {model.rows.map(({ issue, startIndex, spanDays, hasDue }) => (
                <div key={issue.id} className="timeline-row">
                  <button
                    type="button"
                    className={[
                      "timeline-bar",
                      `is-${issue.status}`,
                      hasDue ? null : "no-due",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ left: startIndex * DAY_WIDTH, width: spanDays * DAY_WIDTH - 4 }}
                    title={`${issue.key} ${issue.title}${issue.dueDate ? ` (마감 ${issue.dueDate})` : ""}`}
                    aria-label={`${issue.key} ${issue.title} 타임라인 막대`}
                    onClick={() => openIssue(issue.key)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {issueModal}
    </>
  );
}
