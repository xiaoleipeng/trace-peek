import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { GroupDimension } from "../core/types";
import { buildGroupedChart, type MetricSpec } from "../core/groupCompare";
import type { CaseMetrics } from "../core/caseAnalysis";

interface Props {
  title: string;
  cases: CaseMetrics[];
  seriesDim: GroupDimension;
  metric: MetricSpec;
  onBarClick?: (fileId: string) => void;
}

/**
 * 一张分组柱状图：seriesDim 的每个取值是一个系列(图例)，其余维度组合为 X 轴。
 * 一次性展示所有文件，每根柱为单个文件真实值（不平均）。
 */
export function GroupCompareChart({ title, cases, seriesDim, metric, onBarClick }: Props) {
  const chart = useMemo(
    () => buildGroupedChart(cases, seriesDim, metric),
    [cases, seriesDim, metric],
  );

  const onEvents = {
    click: (params: { seriesIndex?: number; dataIndex?: number }) => {
      if (!onBarClick) return;
      const si = params.seriesIndex ?? -1;
      const ci = params.dataIndex ?? -1;
      const fileId = chart.series[si]?.fileIds[ci];
      if (fileId) onBarClick(fileId);
    },
  };

  const option = {
    title: { text: title, subtext: `指标：${chart.metricLabel}（${chart.unit}，${chart.higherIsBetter ? "越高越好" : "越低越好"}）` },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
    },
    legend: { top: 40, type: "scroll" },
    grid: { top: 90, bottom: 90, left: 60, right: 20 },
    xAxis: {
      type: "category",
      data: chart.categories,
      axisLabel: { rotate: chart.categories.length > 6 ? 30 : 0, interval: 0, fontSize: 10 },
      name: chart.categoryDims.join(" · "),
      nameLocation: "middle",
      nameGap: 70,
    },
    yAxis: { type: "value", name: chart.unit },
    series: chart.series.map((s) => ({
      name: s.name,
      type: "bar",
      data: s.data,
      emphasis: { focus: "series" },
    })),
  };

  const height = Math.max(340, chart.categories.length * 8 + 300);
  return <ReactECharts option={option} style={{ height }} notMerge onEvents={onEvents} />;
}
