import { Card } from "@chanho/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BurndownUnit } from "../pages/reportMetrics";
import type {
  BurnupSeries,
  ControlChart,
  FlowPoint,
  VelocityRow,
} from "../pages/reportMetricsExt";
import { useTokenColors } from "./useTokenColors";

const TOOLTIP_STYLE = {
  background: "var(--chanho-color-background-surface-overlay)",
  border: "1px solid var(--chanho-color-border-default)",
  borderRadius: "var(--chanho-radius-medium)",
  color: "var(--chanho-color-text-default)",
};
const LEGEND_STYLE = { fontSize: 12, color: "var(--chanho-color-text-subtle)" };
const unitSuffix = (unit: BurndownUnit) => (unit === "hours" ? "h" : "건");
const shortDate = (value: string) => value.slice(5);

/** SVG 속성은 var()를 못 읽는다 — 토큰을 실제 색으로 풀어 Recharts에 넘긴다 */
function useChartColors() {
  return useTokenColors([
    "color-border-default",
    "color-text-subtle",
    "color-background-brand",
    "color-background-success",
    "color-background-info",
    "color-background-warning",
    "color-background-neutral",
  ] as const);
}

/**
 * 리포트 카드 4종 — 집계는 reportMetricsExt, 여기서는 배치·표기만 한다.
 * 모든 차트는 `details` 표를 함께 둔다(그래픽 없이도 값에 닿는다). 그리기 애니메이션은 끈다 —
 * rAF가 멈춘 백그라운드 탭에서 선이 영영 투명하게 남는다.
 */

export function BurnupCard({ series, sprintName }: { series: BurnupSeries; sprintName: string }) {
  const colors = useChartColors();
  const suffix = unitSuffix(series.unit);
  const last = [...series.points].reverse().find((p) => p.scope !== null);
  return (
    <Card padding="md" title="번업" role="region" aria-label="번업">
      {!series.started ? (
        <p className="dash-empty">시작하지 않은 스프린트입니다. 시작하면 번업이 그려집니다.</p>
      ) : (
        <>
          <div
            className="reports-chart"
            role="img"
            aria-label={`${sprintName} 번업. 범위 ${last?.scope ?? 0}${suffix}, 완료 ${last?.completed ?? 0}${suffix}`}
          >
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={series.points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={colors["color-border-default"]} vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} stroke={colors["color-text-subtle"]} fontSize={12} />
                <YAxis stroke={colors["color-text-subtle"]} fontSize={12} width={36} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend verticalAlign="top" height={24} wrapperStyle={LEGEND_STYLE} />
                <Line name="범위" type="stepAfter" dataKey="scope" stroke={colors["color-text-subtle"]} strokeDasharray="4 4" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                <Line name="완료" type="stepAfter" dataKey="completed" stroke={colors["color-background-success"]} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="reports-table">
            <summary>표로 보기</summary>
            <table aria-label="번업 값">
              <thead>
                <tr>
                  <th scope="col">날짜</th>
                  <th scope="col">범위</th>
                  <th scope="col">완료</th>
                </tr>
              </thead>
              <tbody>
                {series.points.map((point) => (
                  <tr key={point.date}>
                    <td>{point.date}</td>
                    <td>{point.scope === null ? "—" : `${point.scope}${suffix}`}</td>
                    <td>{point.completed === null ? "—" : `${point.completed}${suffix}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Card>
  );
}

export function VelocityCard({ rows, unit }: { rows: VelocityRow[]; unit: BurndownUnit }) {
  const colors = useChartColors();
  const suffix = unitSuffix(unit);
  const average =
    rows.length === 0 ? 0 : Math.round((rows.reduce((sum, r) => sum + r.completed, 0) / rows.length) * 10) / 10;
  return (
    <Card padding="md" title="벨로시티" role="region" aria-label="벨로시티">
      {rows.length === 0 ? (
        <p className="dash-empty">완료된 스프린트가 없습니다. 스프린트를 완료하면 약속 대비 완료량이 쌓입니다.</p>
      ) : (
        <>
          <p className="dash-sprint-meta">{`최근 ${rows.length}개 스프린트 평균 완료 ${average}${suffix}`}</p>
          <div className="reports-chart" role="img" aria-label={`벨로시티. 평균 완료 ${average}${suffix}`}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid stroke={colors["color-border-default"]} vertical={false} />
                <XAxis dataKey="name" stroke={colors["color-text-subtle"]} fontSize={12} />
                <YAxis stroke={colors["color-text-subtle"]} fontSize={12} width={36} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: colors["color-background-neutral"] }} />
                <Legend verticalAlign="top" height={24} wrapperStyle={LEGEND_STYLE} />
                <ReferenceLine y={average} stroke={colors["color-text-subtle"]} strokeDasharray="4 4" />
                <Bar name="약속" dataKey="committed" fill={colors["color-background-neutral"]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar name="완료" dataKey="completed" fill={colors["color-background-success"]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="reports-table">
            <summary>표로 보기</summary>
            <table aria-label="벨로시티 값">
              <thead>
                <tr>
                  <th scope="col">스프린트</th>
                  <th scope="col">약속</th>
                  <th scope="col">완료</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.sprintId}>
                    <td>{row.name}</td>
                    <td>{`${row.committed}${suffix}`}</td>
                    <td>{`${row.completed}${suffix}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Card>
  );
}

export function CumulativeFlowCard({ points }: { points: FlowPoint[] }) {
  const colors = useChartColors();
  const last = points.at(-1);
  return (
    <Card padding="md" title="누적 흐름도" role="region" aria-label="누적 흐름도">
      <p className="dash-sprint-meta">최근 30일, 날짜마다 할 일·진행 중·완료에 있는 이슈 수</p>
      <div
        className="reports-chart"
        role="img"
        aria-label={`누적 흐름도. 마지막 날 할 일 ${last?.new ?? 0}건, 진행 중 ${last?.active ?? 0}건, 완료 ${last?.complete ?? 0}건`}
      >
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={colors["color-border-default"]} vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} stroke={colors["color-text-subtle"]} fontSize={12} />
            <YAxis stroke={colors["color-text-subtle"]} fontSize={12} width={36} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend verticalAlign="top" height={24} wrapperStyle={LEGEND_STYLE} />
            <Area name="완료" type="stepAfter" dataKey="complete" stackId="flow" stroke={colors["color-background-success"]} fill={colors["color-background-success"]} fillOpacity={0.5} isAnimationActive={false} />
            <Area name="진행 중" type="stepAfter" dataKey="active" stackId="flow" stroke={colors["color-background-info"]} fill={colors["color-background-info"]} fillOpacity={0.5} isAnimationActive={false} />
            <Area name="할 일" type="stepAfter" dataKey="new" stackId="flow" stroke={colors["color-text-subtle"]} fill={colors["color-background-neutral"]} fillOpacity={0.6} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="reports-table">
        <summary>표로 보기</summary>
        <table aria-label="누적 흐름 값">
          <thead>
            <tr>
              <th scope="col">날짜</th>
              <th scope="col">할 일</th>
              <th scope="col">진행 중</th>
              <th scope="col">완료</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.date}>
                <td>{point.date}</td>
                <td>{point.new}</td>
                <td>{point.active}</td>
                <td>{point.complete}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}

export function ControlChartCard({
  chart,
  onOpen,
}: {
  chart: ControlChart;
  onOpen: (key: string) => void;
}) {
  const colors = useChartColors();
  return (
    <Card padding="md" title="컨트롤 차트" role="region" aria-label="컨트롤 차트">
      {chart.points.length === 0 ? (
        <p className="dash-empty">최근 30일에 완료된 이슈가 없습니다. 완료가 쌓이면 사이클 타임이 점으로 찍힙니다.</p>
      ) : (
        <>
          <p className="dash-sprint-meta">{`최근 30일 완료 ${chart.points.length}건, 평균 사이클 타임 ${chart.averageDays}일 (진행 시작 → 완료)`}</p>
          <div className="reports-chart" role="img" aria-label={`컨트롤 차트. 평균 사이클 타임 ${chart.averageDays}일`}>
            <ResponsiveContainer width="100%" height={240}>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={colors["color-border-default"]} />
                <XAxis dataKey="completedDate" type="category" tickFormatter={shortDate} stroke={colors["color-text-subtle"]} fontSize={12} allowDuplicatedCategory={false} />
                <YAxis dataKey="cycleDays" stroke={colors["color-text-subtle"]} fontSize={12} width={36} unit="일" />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: "3 3" }} />
                <ReferenceLine y={chart.averageDays ?? 0} stroke={colors["color-text-subtle"]} strokeDasharray="4 4" label={{ value: "평균", fontSize: 12, fill: colors["color-text-subtle"] }} />
                <Scatter name="사이클 타임" data={chart.points} fill={colors["color-background-brand"]} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <details className="reports-table">
            <summary>표로 보기</summary>
            <table aria-label="사이클 타임">
              <thead>
                <tr>
                  <th scope="col">이슈</th>
                  <th scope="col">완료일</th>
                  <th scope="col">사이클 타임</th>
                </tr>
              </thead>
              <tbody>
                {chart.points.map((point) => (
                  <tr key={point.issueId}>
                    <td>
                      <button type="button" className="dash-issue-row" onClick={() => onOpen(point.key)}>
                        <span className="dash-issue-key">{point.key}</span>
                      </button>
                    </td>
                    <td>{point.completedDate}</td>
                    <td>{`${point.cycleDays}일`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Card>
  );
}
