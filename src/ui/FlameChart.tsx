import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { Interval } from "../core/types";
import { buildCallTree, flattenFlame } from "../core/callTree";
import { fmtDuration } from "./format";

interface Props {
  intervals: Interval[];
}

// 简单的按深度取色
const COLORS = [
  "#5470c6",
  "#91cc75",
  "#fac858",
  "#ee6666",
  "#73c0de",
  "#3ba272",
  "#fc8452",
  "#9a60b4",
  "#ea7ccc",
];

/**
 * 火焰图（用 ECharts custom series 绘制）：
 *  - y = 调用深度（顶层在上）
 *  - x = 聚合后的 total 耗时布局（子节点落在父节点范围内）
 *  - 宽度 ∝ total 耗时；同名同路径调用已合并
 * 直观展示"时间花在哪条调用路径上"。
 */
export function FlameChart({ intervals }: Props) {
  const { rects, maxDepth, totalSpan } = useMemo(() => {
    const tree = buildCallTree(intervals);
    const rs = flattenFlame(tree);
    let md = 0;
    let span = 0n;
    for (const r of rs) {
      if (r.depth > md) md = r.depth;
      const end = r.startNs + r.totalNs;
      if (r.depth === 0 && end > span) span = end;
    }
    return { rects: rs, maxDepth: md, totalSpan: Number(span) || 1 };
  }, [intervals]);

  const data = rects.map((r) => ({
    value: [
      Number(r.startNs),
      r.depth,
      Number(r.startNs + r.totalNs),
      r.name,
      Number(r.totalNs),
      Number(r.selfNs),
      r.count,
    ],
    itemStyle: { color: COLORS[r.depth % COLORS.length] },
  }));

  const option = {
    title: { text: "调用火焰图（宽度 ∝ 总耗时，颜色按深度）" },
    tooltip: {
      formatter: (p: { value: (string | number)[] }) => {
        const v = p.value;
        return `${v[3]}<br/>total: ${fmtDuration(Number(v[4]))}<br/>self: ${fmtDuration(
          Number(v[5]),
        )}<br/>count: ${v[6]}`;
      },
    },
    grid: { top: 40, bottom: 30, left: 20, right: 20 },
    xAxis: { show: false, min: 0, max: totalSpan },
    yAxis: {
      inverse: true,
      min: 0,
      max: maxDepth + 1,
      name: "调用深度",
      splitLine: { show: false },
    },
    series: [
      {
        type: "custom",
        renderItem: (
          _params: unknown,
          api: {
            value: (i: number) => number;
            coord: (p: [number, number]) => [number, number];
            size: (p: [number, number]) => [number, number];
            style: (s: object) => object;
          },
        ) => {
          const start = api.value(0);
          const depth = api.value(1);
          const end = api.value(2);
          const name = String(api.value(3));
          const p0 = api.coord([start, depth]);
          const p1 = api.coord([end, depth + 1]);
          const width = p1[0] - p0[0];
          const height = p1[1] - p0[1];
          if (width < 0.5) return null;
          return {
            type: "rect",
            shape: { x: p0[0], y: p0[1], width: Math.max(width - 1, 0), height: Math.max(height - 1, 0) },
            style: api.style({
              text: width > 40 ? name : "",
              textFill: "#111",
              fontSize: 10,
              textPosition: "insideLeft",
            }),
          };
        },
        encode: { x: [0, 2], y: 1 },
        data,
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: Math.max(220, (maxDepth + 2) * 26) }} />;
}
